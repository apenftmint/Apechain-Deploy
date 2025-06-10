
import { JsonRpcProvider, Contract, getBigInt } from 'ethers';
import {
  CollectionAnalysisResult,
  TokenMetadata,
  MetadataStatus,
  NameSymbolStatus,
  FinalCollectionStatus,
} from '../types';
import {
  ERC721_METADATA_ABI, 
  RETRY_ATTEMPTS,
  RETRY_DELAY_MS,
} from '../constants';

// Standard retry for non-provider specific fetch calls (e.g. metadata URI)
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  retries = RETRY_ATTEMPTS,
  delayMs = RETRY_DELAY_MS,
  contextInfo: string = ''
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRateLimitError = err.code === 429 ||
                               (typeof err.code === 'string' && err.code.toUpperCase().includes('RATE_LIMIT')) ||
                               (err.error && err.error.code === -32005) ||
                               (err.message && err.message.toLowerCase().includes("rate limit"));
      const isAbortError = err.name === 'AbortError';
      const isTimeoutError = isAbortError ||
                             (typeof err.code === 'string' && err.code.toUpperCase().includes('TIMEOUT')) ||
                             (err.message && err.message.toLowerCase().includes('timeout'));
      const isNetworkError = (typeof err.code === 'string' && err.code.toUpperCase().includes('NETWORK_ERROR')) ||
                             (typeof err.code === 'string' && err.code.toUpperCase().includes('SERVER_ERROR')) ||
                             (err.message && err.message.toLowerCase().includes('failed to fetch')) ||
                             (err.message && err.message.toLowerCase().includes('network request failed'));
      const shouldRetry = (isRateLimitError || isTimeoutError || isNetworkError) && i < retries;

      if (shouldRetry) {
        const currentDelay = delayMs * Math.pow(2, i) + (Math.random() * delayMs * 0.5);
        let errorType = "Error";
        if (isRateLimitError) errorType = "Rate limit";
        else if (isAbortError) errorType = "Fetch abort/timeout";
        else if (isTimeoutError) errorType = "Timeout";
        else if (isNetworkError) errorType = "Network/Fetch error";
        
        console.warn(`[AnalyzerFetchRetry] ${errorType} for ${operationName} (${contextInfo}). Retrying attempt ${i + 1}/${retries + 1} after ${currentDelay.toFixed(0)}ms... Error: ${err.message}`);
        await new Promise(res => setTimeout(res, currentDelay));
      } else {
        let detailedError = err.message || String(err);
        if(err.error && err.error.message) detailedError += ` | Nested: ${err.error.message}`;
        if(err.info) {
            if (typeof err.info === 'object') detailedError += ` | Info: ${JSON.stringify(err.info)}`;
            else detailedError += ` | Info: ${err.info}`;
        }
        console.error(`[AnalyzerFetchRetry] Failed ${operationName} (${contextInfo}) on attempt ${i + 1} of ${retries + 1}. No further retries. Error:`, detailedError, err.code ? `Code: ${err.code}` : '', err.name ? `Name: ${err.name}` : '', err);
        if (isRateLimitError) err.isRateLimitError = true;
        throw err;
      }
    }
  }
  throw new Error(`${operationName} (${contextInfo}) failed after all retries were exhausted.`);
}


export class CollectionAnalyzerService {
  private httpRpcUrls: string[];
  private currentHttpRpcIndex: number = 0;

  constructor(httpRpcUrls: string[]) {
    this.httpRpcUrls = httpRpcUrls.filter(url => url && typeof url === 'string');
    if (this.httpRpcUrls.length === 0) {
        console.error("[AnalyzerService] No valid HTTP RPC URLs provided. Analysis will likely fail.");
    }
  }

  private rotateProvider(failedUrl?: string) {
    if (this.httpRpcUrls.length > 0) {
        const oldIndex = this.currentHttpRpcIndex;
        this.currentHttpRpcIndex = (this.currentHttpRpcIndex + 1) % this.httpRpcUrls.length;
        console.warn(`[AnalyzerService] Rotated RPC from ${failedUrl || this.httpRpcUrls[oldIndex]} to: ${this.httpRpcUrls[this.currentHttpRpcIndex]}`);
    }
  }

  private async _executeRpcOperationWithRetry<T>(
    operation: (provider: JsonRpcProvider) => Promise<T>,
    operationName: string,
    contextInfo: string = '',
    maxAttemptsPerRpc = 2,
    initialDelayMs = 500
  ): Promise<T> {
    if (this.httpRpcUrls.length === 0) {
      console.error(`[AnalyzerService] No RPC URLs available for ${operationName} (${contextInfo}).`);
      throw new Error(`No RPC URLs available for ${operationName}`);
    }

    let lastError: any = new Error(`All RPCs failed for ${operationName}`);
    const initialRpcIndex = this.currentHttpRpcIndex; 

    for (let cycle = 0; cycle < this.httpRpcUrls.length; cycle++) {
      const currentProviderUrl = this.httpRpcUrls[this.currentHttpRpcIndex];
      let provider: JsonRpcProvider;

      try {
        provider = new JsonRpcProvider(currentProviderUrl, undefined, { staticNetwork: true });
      } catch (providerInitError: any) {
        console.warn(`[AnalyzerService] Failed to initialize provider ${currentProviderUrl} for ${operationName}. Error: ${providerInitError.message}. Cycling RPC.`);
        lastError = providerInitError;
        this.rotateProvider(currentProviderUrl);
        if (this.currentHttpRpcIndex === initialRpcIndex && cycle > 0) break; 
        continue; 
      }
      
      for (let attempt = 0; attempt < maxAttemptsPerRpc; attempt++) {
        try {
          return await operation(provider);
        } catch (err: any) {
          lastError = err; 
          const isProviderRelatedError = err.code === 'NETWORK_ERROR' || err.code === 'SERVER_ERROR' || err.code === 'TIMEOUT' ||
                                     (err.code === 'UNSUPPORTED_OPERATION' && err.message?.includes("provider destroyed")) ||
                                     (err.message?.toLowerCase().includes("failed to fetch")) || 
                                     (err.error && (err.error.code === -32000 || err.error.code === -32005 || err.error.code === -32603 )) || 
                                     (err.code === -32701 && err.message?.includes("connection stuck")); 

          const isRateLimitError = err.code === 429 || (err.error && err.error.code === -32005) || err.message?.toLowerCase().includes("rate limit");
          const isCallException = err.code === 'CALL_EXCEPTION';

          if (isProviderRelatedError || isRateLimitError) {
            if (attempt < maxAttemptsPerRpc - 1) {
              const currentDelay = initialDelayMs * Math.pow(2, attempt) + (Math.random() * initialDelayMs * 0.5);
              console.warn(`[AnalyzerService] Attempt ${attempt + 1}/${maxAttemptsPerRpc} for ${operationName} on ${currentProviderUrl} failed. Retrying in ${currentDelay.toFixed(0)}ms. Error: ${err.message?.substring(0,100)}`);
              await new Promise(res => setTimeout(res, currentDelay));
            } else {
              console.warn(`[AnalyzerService] All ${maxAttemptsPerRpc} attempts failed for ${operationName} on ${currentProviderUrl}. Error: ${err.message?.substring(0,100)}. Cycling RPC.`);
              break; 
            }
          } else if (isCallException) {
              console.warn(`[AnalyzerService] Call exception for ${operationName} on ${currentProviderUrl} (${contextInfo}). Error: ${err.message?.substring(0,100)}. This is likely a contract issue. Cycling RPC.`);
              break; 
          } else { 
            console.error(`[AnalyzerService] Unknown/non-retryable error for ${operationName} on ${currentProviderUrl} (${contextInfo}). Error: ${err.message?.substring(0,100)}. Cycling RPC.`, err);
            break; 
          }
        }
      } 
      
      this.rotateProvider(currentProviderUrl);
      if (this.currentHttpRpcIndex === initialRpcIndex && cycle < this.httpRpcUrls.length -1) { 
      } else if (this.currentHttpRpcIndex === initialRpcIndex && cycle >= this.httpRpcUrls.length -1 ) { 
          break;
      }
    } 
    console.error(`[AnalyzerService] All RPCs/attempts failed for ${operationName} (${contextInfo}). Last error: ${lastError.message?.substring(0,150)}`);
    throw lastError;
  }

  private async fetchTokenURI(contractAddress: string, tokenId: string): Promise<string | null> {
    try {
      const uri = await this._executeRpcOperationWithRetry(
        provider => new Contract(contractAddress, ERC721_METADATA_ABI, provider).tokenURI(getBigInt(tokenId)),
        'fetchTokenURI',
        `${contractAddress}#${tokenId}`
      );
      return typeof uri === 'string' ? uri : null;
    } catch (error) {
      console.warn(`Failed to fetch tokenURI for ${contractAddress}#${tokenId} after all retries/RPC cycles.`);
      return null;
    }
  }

  private async fetchMetadataFromURI(uri: string): Promise<{ metadata: TokenMetadata | null; status: MetadataStatus }> {
    if (!uri || typeof uri !== 'string') return { metadata: null, status: 'no_uri_found' };
    const httpUri = uri.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/');

    try {
      const response = await fetchWithRetry(() => fetch(httpUri, { signal: AbortSignal.timeout(7000) }), 'fetchMetadataFromURI_fetch', 2, 1000, httpUri.slice(0,50));
      if (!response.ok) {
        console.warn(`Failed to fetch metadata from ${httpUri}, status: ${response.status} (after retries).`);
        return { metadata: null, status: 'broken_uri' };
      }
      const json = await response.json();
      if (typeof json === 'object' && json !== null) {
        // Basic check for essential metadata fields
        if (json.name || json.image || json.description) {
            return { metadata: json as TokenMetadata, status: 'ok' };
        } else {
            console.warn(`Metadata from ${httpUri} is valid JSON but lacks common fields (name, image, description).`);
            return { metadata: json as TokenMetadata, status: 'invalid_json' }; // Technically valid JSON but poor metadata
        }
      } else {
        return { metadata: null, status: 'invalid_json' };
      }
    } catch (error: any) {
        if (error.name === 'AbortError') { 
             console.warn(`Timeout fetching metadata from ${httpUri} (after retries).`);
             return { metadata: null, status: 'broken_uri' }; 
        }
        console.warn(`Error fetching or parsing metadata from ${httpUri} (after retries):`, error);
        return { metadata: null, status: 'fetch_error' };
    }
  }

  private async fetchNameAndSymbol(contractAddress: string): Promise<{ name: string; symbol: string; status: NameSymbolStatus }> {
    let name: string = "Unknown Collection";
    let symbol: string = "UNKNOWN";
    let nameStatus: NameSymbolStatus = 'not_fetched';
    let symbolStatus: NameSymbolStatus = 'not_fetched';

    try {
      name = await this._executeRpcOperationWithRetry(
        provider => new Contract(contractAddress, ERC721_METADATA_ABI, provider).name(),
        'fetchCollectionName',
        contractAddress
      ) as string;
      nameStatus = (name && name.trim() !== "") ? 'ok' : 'blank_name_or_symbol';
    } catch (error) {
      nameStatus = 'fetch_error';
      console.warn(`Failed to fetch name for ${contractAddress} after all retries/RPC cycles.`);
    }

    try {
      symbol = await this._executeRpcOperationWithRetry(
        provider => new Contract(contractAddress, ERC721_METADATA_ABI, provider).symbol(),
        'fetchCollectionSymbol',
        contractAddress
      ) as string;
      symbolStatus = (symbol && symbol.trim() !== "") ? 'ok' : 'blank_name_or_symbol';
    } catch (error) {
      symbolStatus = 'fetch_error';
      console.warn(`Failed to fetch symbol for ${contractAddress} after all retries/RPC cycles.`);
    }
    
    const overallStatus = (nameStatus === 'ok' && symbolStatus === 'ok') ? 'ok' : 
                          (nameStatus === 'fetch_error' || symbolStatus === 'fetch_error') ? 'fetch_error' : 'blank_name_or_symbol';

    return { name: name || "Unnamed", symbol: symbol || "No Symbol", status: overallStatus };
  }


  public async analyzeCollection(
    contractAddress: string,
    allTokenIdsForContract: string[], 
    representativeTokenId: string
  ): Promise<CollectionAnalysisResult> {
    const statusReasons: string[] = [];
    let finalStatus: FinalCollectionStatus = 'OK'; // Assume OK initially

    const tokenUri = await this.fetchTokenURI(contractAddress, representativeTokenId);
    let metadataFetchResult: { metadata: TokenMetadata | null; status: MetadataStatus } = { metadata: null, status: 'not_fetched' };
    
    if (tokenUri) {
      metadataFetchResult = await this.fetchMetadataFromURI(tokenUri);
      if (metadataFetchResult.status !== 'ok') {
        finalStatus = 'Issues Detected'; 
        statusReasons.push(`Metadata: ${metadataFetchResult.status.replace(/_/g, ' ')}.`);
      } else {
         statusReasons.push('Metadata: OK.');
      }
    } else {
      metadataFetchResult.status = 'no_uri_found';
      finalStatus = 'Issues Detected';
      statusReasons.push('Metadata: No tokenURI found.');
    }

    const nameSymbolResult = await this.fetchNameAndSymbol(contractAddress);
    if (nameSymbolResult.status !== 'ok') {
      finalStatus = 'Issues Detected'; 
      statusReasons.push(`Name/Symbol: ${nameSymbolResult.status.replace(/_/g, ' ')}.`);
    } else {
      statusReasons.push('Name/Symbol: OK.');
    }
    
    if (finalStatus === 'OK' && statusReasons.every(r => r.includes(': OK.'))) {
        statusReasons.splice(0, statusReasons.length, 'All basic checks passed.');
    } else if (finalStatus === 'Issues Detected' && statusReasons.length === 0) {
        statusReasons.push('General issues detected during analysis.');
    }


    return {
      contractAddress,
      metadataStatus: metadataFetchResult.status,
      fetchedMetadata: metadataFetchResult.metadata,
      nameSymbolStatus: nameSymbolResult.status,
      collectionNameFromAnalyzer: nameSymbolResult.name,
      collectionSymbolFromAnalyzer: nameSymbolResult.symbol,
      finalStatus,
      statusReasons,
    };
  }
}
