
import {
  JsonRpcProvider,
  WebSocketProvider,
  ZeroAddress,
  Contract,
  getBigInt,
  zeroPadValue,
  Filter,
  Log as EthersLog,
  Provider,
} from 'ethers';
import { MintData } from '../types';
import {
  PUBLIC_APECHAIN_HTTP_RPC_URLS, 
  PUBLIC_APECHAIN_WSS_RPC_URLS,  
  ERC721_TRANSFER_EVENT_SIGNATURE,
  ERC721_INTERFACE_ID,
  ERC165_ABI,
  MINIMAL_ERC721_ABI,
  // ERC721_OWNEROF_ABI, // Kept in constants, but not used here for general owner counting
  MAX_TOKEN_ID,
  RETRY_ATTEMPTS,
  RETRY_DELAY_MS,
} from '../constants';

const MIN_HTTP_POLLING_INTERVAL_MS = 5000; 
const MAX_HTTP_POLLING_INTERVAL_MS = 30000; 
const DEFAULT_HTTP_POLLING_INTERVAL_MS = 10000;
const INITIAL_POLL_DELAY_MS = 1000;
const WSS_RECONNECTION_CHECK_INTERVAL_MS = 60 * 1000; 
const RPC_HEALTH_COOLDOWN_MS = 2 * 60 * 1000; 
const MAX_CONSECUTIVE_FAILURES_FOR_COOLDOWN = 3;
const MIN_SCORE_FOR_ACTIVE_USAGE = 50;
const HTTP_RACE_CANDIDATES = 3; 

// Helper function to mimic Promise.any behavior
async function customPromiseAny<T>(promises: Iterable<Promise<T>>): Promise<T> {
  const MaybeAggregateError = (globalThis as any).AggregateError;

  return new Promise<T>((resolve, reject) => {
    const errors: any[] = [];
    let remaining = 0;
    const promisesArray = Array.from(promises);
    remaining = promisesArray.length;

    if (remaining === 0) {
      const message = "No promises were provided to customPromiseAny";
      if (typeof MaybeAggregateError === "function") {
        reject(new MaybeAggregateError([], message));
      } else {
        const err = new Error(message);
        (err as any).errors = [];
        reject(err);
      }
      return;
    }

    promisesArray.forEach((promise, index) => {
      Promise.resolve(promise)
        .then(resolve) 
        .catch((error) => {
          errors[index] = error;
          remaining--;
          if (remaining === 0) {
            const message = "All promises were rejected in customPromiseAny";
            if (typeof MaybeAggregateError === "function") {
              reject(new MaybeAggregateError(errors, message));
            } else {
              const err = new Error(message);
              (err as any).errors = errors;
              reject(err);
            }
          }
        });
    });
  });
}


interface RpcEndpoint {
  url: string;
  type: 'wss' | 'http';
  providerInstance?: WebSocketProvider | JsonRpcProvider;
  score: number; 
  status: 'active' | 'cooldown' | 'untested' | 'failed_primary_wss';
  totalFailures: number;
  consecutiveFailures: number;
  latencyHistory: number[]; 
  cooldownUntilTimestamp?: number;
  isCurrentWssConnection: boolean; 
}

// CollectionOwnerDetails removed as owner counting is removed from here

interface GetLogsRaceResult {
  logs: EthersLog[];
  provider: JsonRpcProvider;
  url: string;
}

class BlockchainService {
  private rpcEndpoints: RpcEndpoint[] = [];
  private eventFilter: Filter;
  private blockTimestampCache: Map<number, number> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;
  // private collectionOwnerDetailsCache: Map<string, CollectionOwnerDetails> = new Map(); // REMOVED


  private currentMode: 'wss' | 'http_racing' | 'initializing' | 'stopped' | 'switching' = 'stopped';
  private activeWssProvider: WebSocketProvider | null = null;
  
  private httpPollingTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private wssReconnectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastPolledBlock: number = -1;
  private currentHttpPollingIntervalMs = DEFAULT_HTTP_POLLING_INTERVAL_MS;
  private mintsFoundInLastHttpPoll: boolean = false;

  private onMintCallbackGlobal: ((mint: Omit<MintData, 'ownerCount'>) => void) | null = null; // Adjusted type
  private onErrorCallbackGlobal: ((error: string, isRateLimit?: boolean) => void) | null = null;
  private onSetupCompleteCallbackGlobal: (() => void) | null = null;

  constructor() {
    this.eventFilter = {
      topics: [
        ERC721_TRANSFER_EVENT_SIGNATURE,
        zeroPadValue(ZeroAddress, 32), 
      ],
    };
    this.initializeRpcEndpoints();
  }

  private initializeRpcEndpoints(): void {
    this.rpcEndpoints = [];
    PUBLIC_APECHAIN_WSS_RPC_URLS.forEach(url => { 
      this.rpcEndpoints.push({
        url,
        type: 'wss',
        score: 100,
        status: 'untested',
        totalFailures: 0,
        consecutiveFailures: 0,
        latencyHistory: [],
        isCurrentWssConnection: false,
      });
    });
    PUBLIC_APECHAIN_HTTP_RPC_URLS.forEach(url => { 
      this.rpcEndpoints.push({
        url,
        type: 'http',
        score: 100,
        status: 'untested',
        totalFailures: 0,
        consecutiveFailures: 0,
        latencyHistory: [],
        providerInstance: new JsonRpcProvider(url, undefined, { staticNetwork: true }),
        isCurrentWssConnection: false,
      });
    });
  }

  private getRpcEndpoint(url: string): RpcEndpoint | undefined {
    return this.rpcEndpoints.find(ep => ep.url === url);
  }

  private updateRpcHealth(url: string, success: boolean, isRateLimit: boolean = false, isTimeout: boolean = false): void {
    const endpoint = this.getRpcEndpoint(url);
    if (!endpoint) return;

    if (success) {
      endpoint.score = Math.min(150, endpoint.score + 5);
      endpoint.consecutiveFailures = 0;
      endpoint.status = 'active';
    } else {
      endpoint.score = Math.max(0, endpoint.score - (isRateLimit || isTimeout ? 20 : 10));
      endpoint.totalFailures++;
      endpoint.consecutiveFailures++;
      
      if (endpoint.score < MIN_SCORE_FOR_ACTIVE_USAGE || endpoint.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_FOR_COOLDOWN || isRateLimit) {
        endpoint.status = 'cooldown';
        endpoint.cooldownUntilTimestamp = Date.now() + RPC_HEALTH_COOLDOWN_MS;
        console.warn(`[RPC Health] ${endpoint.url} put into cooldown until ${new Date(endpoint.cooldownUntilTimestamp).toLocaleTimeString()}. Score: ${endpoint.score}, Consecutive Fails: ${endpoint.consecutiveFailures}`);
      } else {
        endpoint.status = 'active'; 
      }
    }
  }
  
  private getEligibleRpcEndpoints(type: 'wss' | 'http'): RpcEndpoint[] {
    const now = Date.now();
    return this.rpcEndpoints
      .filter(ep => ep.type === type)
      .filter(ep => {
        if (ep.status === 'cooldown') {
          if (ep.cooldownUntilTimestamp && now > ep.cooldownUntilTimestamp) {
            ep.status = 'active'; 
            ep.consecutiveFailures = 0; 
            console.log(`[RPC Health] ${ep.url} cooldown expired. Status set to active.`);
            return true;
          }
          return false;
        }
        return ep.status !== 'failed_primary_wss'; 
      })
      .sort((a, b) => b.score - a.score); 
  }


  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
    rpcUrlForLogging: string, 
    retries = RETRY_ATTEMPTS,
    delayMs = RETRY_DELAY_MS
  ): Promise<T> {
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await fn();
        this.updateRpcHealth(rpcUrlForLogging, true);
        return result;
      } catch (err: any) {
        const messageIncludesRateLimit = typeof err.message === 'string' && (
            err.message.toLowerCase().includes("rate limit") ||
            err.message.toLowerCase().includes("limit exceeded") ||
            err.message.toLowerCase().includes("too many requests") ||
            (err.error && typeof err.error.message === 'string' && err.error.message.toLowerCase().includes("rate limit"))
        );
        const isRateLimitError = err.code === 429 || err.code === 'RATE_LIMIT' || (err.error && err.error.code === -32005) || messageIncludesRateLimit;
        const isTimeoutError = typeof err.message === 'string' && err.message.toLowerCase().includes('timeout');
        const isNetworkError = err.code === 'NETWORK_ERROR' || err.event === 'network' || isTimeoutError;
        
        this.updateRpcHealth(rpcUrlForLogging, false, isRateLimitError, isTimeoutError);

        if ((isRateLimitError || isNetworkError) && i < retries) {
          const currentDelay = delayMs * Math.pow(2, i) + (Math.random() * delayMs * 0.5);
          console.warn(`[Retry] ${isRateLimitError ? 'Rate limit' : (isTimeoutError ? 'Timeout' : 'Network error')} for ${operationName} on ${rpcUrlForLogging}. Retrying attempt ${i + 1}/${retries} after ${currentDelay.toFixed(0)}ms...`);
          await new Promise(res => setTimeout(res, currentDelay));
        } else {
          let detailedError = err.message || String(err);
          if(err.error && err.error.message) detailedError += ` | Nested: ${err.error.message}`;
          if(err.info && err.info.method && err.info.signature) detailedError += ` | Method: ${err.info.method}, Sig: ${err.info.signature}`;
          console.error(`[Retry] Failed ${operationName} after ${i} retries on ${rpcUrlForLogging}. Error:`, detailedError, err.code ? `Code: ${err.code}` : '');
          if (isRateLimitError) err.isRateLimitError = true; 
          throw err;
        }
      }
    }
    throw new Error(`${operationName} on ${rpcUrlForLogging} failed after all retries.`);
  }

  private async connectToWss(): Promise<boolean> {
    if (this.activeWssProvider) {
        const activeEndpoint = this.rpcEndpoints.find(ep => ep.isCurrentWssConnection);
        if (activeEndpoint && activeEndpoint.providerInstance === this.activeWssProvider) {
            try {
                await this.activeWssProvider.getBlockNumber();
                console.log(`[WSS] Already connected to ${activeEndpoint.url}`);
                return true;
            } catch (e) {
                console.warn(`[WSS] Existing WSS provider ${activeEndpoint.url} unresponsive. Attempting to reconnect.`);
                await this.disconnectActiveWss(activeEndpoint.url); 
            }
        } else {
            if (this.activeWssProvider && typeof (this.activeWssProvider as any).destroy === 'function') {
                (this.activeWssProvider as any).destroy();
            }
            this.activeWssProvider = null;
            this.rpcEndpoints.forEach(ep => ep.isCurrentWssConnection = false);
        }
    }
    
    const eligibleWssEndpoints = this.getEligibleRpcEndpoints('wss');
    for (const endpoint of eligibleWssEndpoints) {
      console.log(`[WSS] Attempting to connect to ${endpoint.url} (Score: ${endpoint.score})`);
      try {
        const wsProvider = new WebSocketProvider(endpoint.url);
        await this.withRetry(() => wsProvider.getBlockNumber(), `WSS Connect Check`, endpoint.url, 1, 2000);

        this.activeWssProvider = wsProvider;
        endpoint.providerInstance = wsProvider;
        endpoint.isCurrentWssConnection = true;
        endpoint.status = 'active';
        this.currentMode = 'wss';
        console.log(`[WSS] Successfully connected to ${endpoint.url}. Listening for events.`);
        
        this.activeWssProvider.on(this.eventFilter, (log: EthersLog) => {
            if (this.currentMode === 'wss' && this.activeWssProvider === wsProvider) { 
                this.processLog(log, this.activeWssProvider!, this.onMintCallbackGlobal!, this.onErrorCallbackGlobal!);
            }
        });
        this.activeWssProvider.on('error', (error) => {
          console.error(`[WSS Error] Error on ${endpoint.url}:`, error);
          this.updateRpcHealth(endpoint.url, false, false, true); 
          if (this.activeWssProvider === wsProvider) { 
            this.handleWssFailure(endpoint.url);
          }
        });
        this.stopHttpPolling();
        this.clearWssReconnectionTimer(); 
        return true;
      } catch (error: any) {
        console.warn(`[WSS] Failed to connect to ${endpoint.url}: ${error.message}`);
        this.updateRpcHealth(endpoint.url, false);
        if (endpoint.providerInstance && typeof (endpoint.providerInstance as any).destroy === 'function') {
            (endpoint.providerInstance as any).destroy();
        }
        endpoint.providerInstance = undefined;
      }
    }
    console.log("[WSS] All WSS connection attempts failed.");
    return false;
  }

  private async disconnectActiveWss(failedUrl?: string) {
    if (this.activeWssProvider) {
        const url = failedUrl || this.rpcEndpoints.find(e => e.isCurrentWssConnection)?.url || "unknown WSS";
        console.log(`[WSS] Disconnecting from ${url}`);
        try {
            if (typeof (this.activeWssProvider as any).removeAllListeners === 'function') {
                 (this.activeWssProvider as any).removeAllListeners();
            }
            if (typeof (this.activeWssProvider as any).destroy === 'function') {
                 (this.activeWssProvider as any).destroy();
            }
        } catch (e) {
            console.warn(`[WSS] Error during WSS destroy for ${url}:`, e);
        }
        this.activeWssProvider = null;
    }
    this.rpcEndpoints.forEach(ep => {
        if (ep.type === 'wss') {
            ep.isCurrentWssConnection = false;
            if (ep.url === failedUrl) ep.status = 'failed_primary_wss'; 
            if (ep.providerInstance && ep.providerInstance !== this.activeWssProvider) { 
                 if (typeof (ep.providerInstance as any).destroy === 'function') {
                    (ep.providerInstance as any).destroy();
                }
                ep.providerInstance = undefined;
            }
        }
    });
  }

  private async handleWssFailure(failedUrl: string) {
    if (this.currentMode !== 'wss' && this.currentMode !== 'switching') return; 
    
    console.warn(`[WSS] Connection failed or errored for ${failedUrl}. Attempting to switch.`);
    this.currentMode = 'switching';
    await this.disconnectActiveWss(failedUrl);

    if (await this.connectToWss()) {
      console.log("[WSS] Successfully switched to a new WSS provider.");
      this.currentMode = 'wss'; 
    } else {
      console.log("[WSS] Failed to switch to another WSS provider. Falling back to HTTP racing.");
      this.currentMode = 'http_racing';
      this.startHttpPolling();
      this.scheduleWssReconnectionCheck(); 
    }
  }
  
  private startHttpPolling(): void {
    if (this.currentMode !== 'http_racing') {
        console.log("[HTTP Poll] Not in http_racing mode, aborting poll start.");
        return;
    }
    if (this.httpPollingTimeoutId) clearTimeout(this.httpPollingTimeoutId);
    
    this.mintsFoundInLastHttpPoll = false; 
    console.log(`[HTTP Poll] Starting HTTP polling. Interval: ${this.currentHttpPollingIntervalMs}ms. Last polled block: ${this.lastPolledBlock}`);
    this.httpPollingTimeoutId = setTimeout(() => this.httpPollLoop(), INITIAL_POLL_DELAY_MS);
  }

  private stopHttpPolling(): void {
    if (this.httpPollingTimeoutId) {
      clearTimeout(this.httpPollingTimeoutId);
      this.httpPollingTimeoutId = null;
      console.log("[HTTP Poll] Stopped.");
    }
  }
  
  private adjustPollingInterval(): void {
    if (this.mintsFoundInLastHttpPoll) {
        this.currentHttpPollingIntervalMs = Math.max(MIN_HTTP_POLLING_INTERVAL_MS, Math.floor(this.currentHttpPollingIntervalMs / 1.2));
    } else {
        this.currentHttpPollingIntervalMs = Math.min(MAX_HTTP_POLLING_INTERVAL_MS, Math.floor(this.currentHttpPollingIntervalMs * 1.2));
    }
    console.debug(`[HTTP Poll] Adjusted interval to ${this.currentHttpPollingIntervalMs}ms.`);
    this.mintsFoundInLastHttpPoll = false; 
  }

  private async httpPollLoop(): Promise<void> {
    if (this.currentMode !== 'http_racing') {
      this.stopHttpPolling();
      return;
    }

    const eligibleHttpEndpoints = this.getEligibleRpcEndpoints('http').slice(0, HTTP_RACE_CANDIDATES);
    if (eligibleHttpEndpoints.length === 0) {
      console.warn("[HTTP Poll] No healthy HTTP RPCs available for polling. Retrying check later.");
      if (this.onErrorCallbackGlobal) this.onErrorCallbackGlobal("No healthy HTTP RPCs available for polling.", false);
      this.httpPollingTimeoutId = setTimeout(() => this.httpPollLoop(), this.currentHttpPollingIntervalMs);
      return;
    }
    
    let currentBlockNumber = -1;
    try {
        const blockNumberPromises = eligibleHttpEndpoints.map(ep => 
            this.withRetry(() => (ep.providerInstance as JsonRpcProvider).getBlockNumber(), `HTTPPoll:getBlockNumber`, ep.url, 1, 1000)
              .catch(e => { console.warn(`[HTTP Poll] getBlockNumber failed for ${ep.url}: ${e.message}`); return Promise.reject(e); })
        );
        currentBlockNumber = await customPromiseAny(blockNumberPromises);
    } catch (error) {
        console.error("[HTTP Poll] Failed to get block number from all raced HTTP providers:", error);
        if (this.onErrorCallbackGlobal) this.onErrorCallbackGlobal("Failed to determine current block number via HTTP polling.", true);
        this.adjustPollingInterval();
        this.httpPollingTimeoutId = setTimeout(() => this.httpPollLoop(), this.currentHttpPollingIntervalMs);
        return;
    }

    if (this.lastPolledBlock === -1) {
      this.lastPolledBlock = Math.max(0, currentBlockNumber - 5); 
      console.log(`[HTTP Poll] Initial poll: Starting from block ${this.lastPolledBlock + 1}`);
    }

    if (currentBlockNumber > this.lastPolledBlock) {
      const fromBlock = this.lastPolledBlock + 1;
      const toBlock = currentBlockNumber;
      console.debug(`[HTTP Poll] Racing getLogs from ${fromBlock} to ${toBlock} across ${eligibleHttpEndpoints.length} RPCs.`);

      const getLogsPromises: Promise<GetLogsRaceResult>[] = eligibleHttpEndpoints.map(ep =>
        this.withRetry(() => (ep.providerInstance as JsonRpcProvider).getLogs({
          ...this.eventFilter,
          fromBlock,
          toBlock,
        }), `HTTPPoll:getLogs`, ep.url, 1, 3000) 
        .then(logs => ({ logs, provider: ep.providerInstance as JsonRpcProvider, url: ep.url } as GetLogsRaceResult))
        .catch(e => { console.warn(`[HTTP Poll] getLogs failed for ${ep.url}: ${e.message}`); return Promise.reject(e);})
      );

      try {
        const raceResult: GetLogsRaceResult = await customPromiseAny<GetLogsRaceResult>(getLogsPromises);
        const { logs: successfulLogs, provider: winningProvider } = raceResult;

        console.debug(`[HTTP Poll] getLogs success from ${ (eligibleHttpEndpoints.find(ep => ep.providerInstance === winningProvider))?.url }. Logs count: ${successfulLogs.length}`);
        
        if (successfulLogs.length > 0) {
            this.mintsFoundInLastHttpPoll = true;
        }

        if (this.onMintCallbackGlobal && this.onErrorCallbackGlobal) {
          for (const log of successfulLogs) {
            if (this.currentMode !== 'http_racing') break; 
            await this.processLog(log, winningProvider, this.onMintCallbackGlobal, this.onErrorCallbackGlobal);
          }
        }
        this.lastPolledBlock = toBlock;
      } catch (error) {
        console.error("[HTTP Poll] All getLogs attempts failed in race:", error);
        if (this.onErrorCallbackGlobal) this.onErrorCallbackGlobal("Failed to fetch logs via HTTP polling.", true);
      }
    } else {
        console.debug(`[HTTP Poll] No new blocks since last poll (current: ${currentBlockNumber}, last: ${this.lastPolledBlock}).`);
    }
    
    this.adjustPollingInterval();
    this.httpPollingTimeoutId = setTimeout(() => this.httpPollLoop(), this.currentHttpPollingIntervalMs);
  }
  
  private scheduleWssReconnectionCheck(): void {
    this.clearWssReconnectionTimer();
    if (this.currentMode !== 'http_racing') return; 

    console.log(`[WSS Reconnect] Scheduling check in ${WSS_RECONNECTION_CHECK_INTERVAL_MS / 1000}s to attempt WSS switch.`);
    this.wssReconnectionTimeoutId = setTimeout(async () => {
      if (this.currentMode !== 'http_racing') return; 
      console.log("[WSS Reconnect] Attempting to switch back to WSS...");
      this.currentMode = 'switching'; 
      if (await this.connectToWss()) {
        console.log("[WSS Reconnect] Successfully switched back to WSS.");
      } else {
        console.log("[WSS Reconnect] Failed to switch back to WSS. Staying on HTTP racing.");
        this.currentMode = 'http_racing'; 
        this.scheduleWssReconnectionCheck(); 
      }
    }, WSS_RECONNECTION_CHECK_INTERVAL_MS);
  }

  private clearWssReconnectionTimer(): void {
    if (this.wssReconnectionTimeoutId) {
      clearTimeout(this.wssReconnectionTimeoutId);
      this.wssReconnectionTimeoutId = null;
    }
  }

  private async processLog(
    log: EthersLog,
    sourceProvider: Provider, 
    onMintCallback: (mint: Omit<MintData, 'ownerCount'>) => void, // Adjusted type
    onErrorCallback: (error: string, isRateLimit?: boolean) => void
  ): Promise<void> {
    const txHash = log.transactionHash;
    const contractAddress = log.address;
    const sourceProviderUrl = (sourceProvider instanceof JsonRpcProvider) ? 
        this.rpcEndpoints.find(ep => ep.providerInstance === sourceProvider)?.url || "Unknown HTTP Source" :
        this.rpcEndpoints.find(ep => ep.isCurrentWssConnection)?.url || "Unknown WSS Source";

    try {
      const tx = await this.withRetry(
        () => sourceProvider.getTransaction(txHash),
        `getTransaction ${txHash}`, sourceProviderUrl
      );
      if (!tx) {
        console.debug(`Transaction ${txHash} (from ${sourceProviderUrl}) not found or null. Skipping log.`);
        return;
      }
      
      if (log.topics.length < 4) return; 
      
      const tokenIdBN = getBigInt(log.topics[3]);
      if (tokenIdBN > BigInt(MAX_TOKEN_ID)) return;
      const tokenId = tokenIdBN.toString();

      const isFree = tx.value === 0n;
      const valueWei = isFree ? undefined : tx.value.toString();

      let isERC721 = false;
      try {
        const erc165Contract = new Contract(contractAddress, ERC165_ABI, sourceProvider);
        isERC721 = await this.withRetry(() => erc165Contract.supportsInterface(ERC721_INTERFACE_ID), `supportsInterface for ${contractAddress}`, sourceProviderUrl, 1, 1000);
      } catch (e: any) {
        if (e.code === 'BAD_DATA') {
             console.warn(`[ProcessLog] Contract ${contractAddress} (tx: ${txHash.slice(0,10)}) returned BAD_DATA for supportsInterface. Likely not ERC721 or misconfigured. Skipping mint.`);
        } else {
            console.debug(`[ProcessLog] supportsInterface check failed for ${contractAddress} on ${sourceProviderUrl} (tx: ${txHash.slice(0,10)}). Error: ${e.message}. Skipping mint.`);
        }
        return; 
      }

      if (!isERC721) {
          return;
      }

      let timestamp: number;
      if (this.blockTimestampCache.has(log.blockNumber)) {
        timestamp = this.blockTimestampCache.get(log.blockNumber)!;
      } else {
        const block = await this.withRetry(() => sourceProvider.getBlock(log.blockNumber), `getBlock ${log.blockNumber}`, sourceProviderUrl);
        if (!block) {
          console.error(`Could not fetch block for ${log.blockNumber} on ${sourceProviderUrl} (tx: ${txHash}). Skipping.`);
          return;
        }
        timestamp = block.timestamp;
        this.blockTimestampCache.set(log.blockNumber, timestamp);
        if (this.blockTimestampCache.size > this.MAX_CACHE_SIZE) {
          this.blockTimestampCache.delete(this.blockTimestampCache.keys().next().value);
        }
      }

      let collectionName = "Unknown Collection";
      try {
        const erc721Contract = new Contract(contractAddress, MINIMAL_ERC721_ABI, sourceProvider);
        const nameResult = await this.withRetry(() => erc721Contract.name(), `getCollectionName for ${contractAddress}`, sourceProviderUrl, 1, 1000);
        collectionName = (nameResult && typeof nameResult === 'string' && nameResult.trim() !== "") ? nameResult : "Unnamed Collection";
      } catch (e: any) {
        collectionName = "Unnamed Collection";
        console.debug(`Could not fetch collection name for ${contractAddress} on ${sourceProviderUrl} (tx: ${txHash}). Error: ${e.message}`);
      }
      
      // Owner counting logic removed entirely from here
      // const ownerCount = 0; // No longer needed

      onMintCallback({
        txHash, contractAddress, tokenId, collectionName, timestamp,
        blockNumber: log.blockNumber, logIndex: log.index,
        tokenImagePlaceholderUrl: `https://picsum.photos/seed/${contractAddress}${tokenId}/64`,
        // ownerCount, // REMOVED
        isFree, 
        valueWei, 
      });

    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const isRateLimit = !!error.isRateLimitError;
      onErrorCallback(`Error processing mint (tx: ${txHash.slice(0,10)}... on ${sourceProviderUrl}): ${errorMsg.substring(0,100)}`, isRateLimit);
    }
  }

  public async listenForMints(
    onMintCallback: (mint: Omit<MintData, 'ownerCount'>) => void, // Adjusted type
    onErrorCallback: (error: string, isRateLimit?: boolean) => void,
    onSetupComplete: () => void
  ): Promise<void> {
    this.onMintCallbackGlobal = onMintCallback;
    this.onErrorCallbackGlobal = onErrorCallback;
    this.onSetupCompleteCallbackGlobal = onSetupComplete; 

    this.currentMode = 'initializing';
    console.log("[Service] Initializing and attempting to connect to ApeChain..."); 

    if (await this.connectToWss()) {
      // Success
    } else {
      console.log("[Service] ApeChain WSS connection failed, falling back to HTTP racing mode."); 
      this.currentMode = 'http_racing';
      this.startHttpPolling();
      this.scheduleWssReconnectionCheck(); 
    }
    
    onSetupComplete();
  }

  public stopListeningForMints(clearGlobalCallbacks = true): void {
    console.log("[Service] Stopping listeners...");
    this.currentMode = 'stopped';
    
    this.stopHttpPolling();
    this.clearWssReconnectionTimer();
    this.disconnectActiveWss(); 

    this.rpcEndpoints.forEach(ep => { 
        if (ep.type === 'wss' && ep.providerInstance) {
             if (typeof (ep.providerInstance as any).destroy === 'function') {
                (ep.providerInstance as any).destroy();
            }
            ep.providerInstance = undefined;
        }
        ep.isCurrentWssConnection = false;
        ep.status = 'untested'; 
    });
    this.activeWssProvider = null;

    this.blockTimestampCache.clear();
    // this.collectionOwnerDetailsCache.clear(); // REMOVED
    this.lastPolledBlock = -1; 
    this.currentHttpPollingIntervalMs = DEFAULT_HTTP_POLLING_INTERVAL_MS;

    if (clearGlobalCallbacks) {
      this.onMintCallbackGlobal = null;
      this.onErrorCallbackGlobal = null;
      this.onSetupCompleteCallbackGlobal = null;
    }
  }
}

export const blockchainService = new BlockchainService();
