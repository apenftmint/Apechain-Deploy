
import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
// import { formatUnits } from 'ethers'; // Only needed if vaa.json price needs formatting here
import { MintData, CollectionAnalysisResult, FinalCollectionStatus } from './types';
import { blockchainService } from './services/blockchainService';
// Client-side CollectionAnalyzerService is no longer used for the main table data
import MintCard from './components/MintCard';
import LoadingSpinner from './components/LoadingSpinner';
import MintsTable from './components/MintsTable';
import AdvertisementBanner from './components/AdvertisementBanner';
import NftAdvertisementPoster from './components/NftAdvertisementPoster';
import NewMintPopup from './components/NewMintPopup';
import LiveVisitorsCounter from './components/LiveVisitorsCounter';
import {
    MAX_DISPLAY_MINTS,
    APP_TITLE,
    ADVERTISEMENT_TEXT,
    DEFAULT_ADVERTISEMENT_TWITTER_USER_ID,
    ADVERTISEMENT_TWITTER_DM_URL_BASE,
    DEFAULT_NFT_ADVERTISEMENTS_LIST,
    NftAdDetails,
    calculateBodyPaddingTop,
    MAX_DISPLAY_MINTS_FOR_LIVE_FEED,
    PAGE_QUERY_PARAM,
    CONFIG_LOGIN_PAGE_ID,
    CONFIG_PANEL_PAGE_ID,
    VALID_ACCENT_COLORS,
    GITHUB_VAA_JSON_URL, // Using this to fetch table data
    LOCAL_STORAGE_KEY, 
    LIVE_FREE_MINTS_CACHE_KEY, 
    LIVE_PAID_MINTS_CACHE_KEY,  
    SOUND_ENABLED_PREFERENCE_KEY,
    ADMIN_SESSION_KEY, 
    // ANALYSIS_RESULTS_CACHE_KEY, // Less relevant with direct vaa.json fetch
    // ANALYSIS_CACHE_DURATION_MS, // Less relevant
    // INITIAL_TABLE_COLLECTIONS_TO_PROCESS, // Less relevant
    PUBLIC_APECHAIN_HTTP_RPC_URLS 
} from './constants';
// import { CollectionAnalyzerService } from './services/collectionAnalyzerService'; // Not used for table data source

const AdminLogin = lazy(() => import('./components/admin/AdminLogin'));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));

// const USE_MOCK_TABLE_DATA = false; // This flag is now removed, we always fetch or try to.

export interface AppTableDisplayMintData extends MintData {
  totalContractMints: number; // May need to default this if not in vaa.json
  analysis?: CollectionAnalysisResult; // Will be defaulted if not in vaa.json
  displayStatus: FinalCollectionStatus; // Will be defaulted
  mintPriceApe?: string; // May need to calculate or get from vaa.json
}

export interface PopupMintData extends AppTableDisplayMintData {
    popupId: string;
}

export interface AdminSettings {
    twitterUserId: string;
    ads: NftAdDetails[];
}

const getPageFromHash = (hash: string): string | null => {
    const parts = hash.split('?');
    if (parts.length > 1) {
      const queryParams = new URLSearchParams(parts[1]);
      return queryParams.get(PAGE_QUERY_PARAM);
    }
    return null;
};

const App: React.FC = () => {
  const [liveFreeMints, setLiveFreeMints] = useState<MintData[]>([]);
  const [livePaidMints, setLivePaidMints] = useState<MintData[]>([]);
  const [allTimeMints, setAllTimeMints] = useState<MintData[]>([]); 

  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [error, setError] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);
  const [providerOk, setProviderOk] = useState<boolean>(false);

  const [userInteracted, setUserInteracted] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  const [tableData, setTableData] = useState<AppTableDisplayMintData[]>([]);
  const [tableFilter, setTableFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [isFetchingTableData, setIsFetchingTableData] = useState<boolean>(true); 
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [tableItemsPerPage, setTableItemsPerPage] = useState<number>(10);

  const [activePopups, setActivePopups] = useState<PopupMintData[]>([]);

  const isInitialLoadRef = useRef(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const playedNotificationForContractsRef = useRef(new Set<string>());

  // const collectionAnalyzerRef = useRef<CollectionAnalyzerService | null>(null); // Not used for table
  const analysisCacheRef = useRef<Map<string, { result: CollectionAnalysisResult; timestamp: number; tokenIdsHash: string }>>(new Map());
  const [analysisStatusMap, setAnalysisStatusMap] = useState<Map<string, 'pending' | 'analyzing' | 'done' | 'error'>>(new Map());


  const [currentRoute, setCurrentRoute] = useState<string>(window.location.hash || '#/');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => localStorage.getItem(ADMIN_SESSION_KEY) === 'true');

  const [effectiveTwitterId, setEffectiveTwitterId] = useState<string>(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);
  const [effectiveAds, setEffectiveAds] = useState<NftAdDetails[]>(DEFAULT_NFT_ADVERTISEMENTS_LIST);
  const [isAdminSettingsLoading, setIsAdminSettingsLoading] = useState<boolean>(true); 
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(null);

  const [isSeenPopupsLoading, setIsSeenPopupsLoading] = useState<boolean>(true); 
  const [seenPopupsError, setSeenPopupsError] = useState<string | null>(null);

  const [initialAppSetupComplete, setInitialAppSetupComplete] = useState(false);


  const loadAdminSettings = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
        setIsAdminSettingsLoading(true);
        setAdminSettingsError(null);
    }
    console.log(`loadAdminSettings: Starting... (isRefresh: ${isRefresh}). Backend fetch is disabled.`);
    setEffectiveTwitterId(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);
    setEffectiveAds(DEFAULT_NFT_ADVERTISEMENTS_LIST);
    if (!isRefresh) setIsAdminSettingsLoading(false);
    console.log("loadAdminSettings finished (using defaults).");
  }, []);

  const loadSeenPopups = useCallback(async () => {
    setIsSeenPopupsLoading(true);
    setSeenPopupsError(null);
    console.log("loadSeenPopups: Starting... Backend fetch is disabled. Starting fresh.");
    playedNotificationForContractsRef.current = new Set<string>();
    setIsSeenPopupsLoading(false);
    console.log("loadSeenPopups finished (starting fresh).");
  }, []);

  const fetchUniqueCollectionsTableData = useCallback(async () => {
    setIsFetchingTableData(true);
    setTableDataError(null);
    console.log(`fetchUniqueCollectionsTableData: Fetching from GitHub: ${GITHUB_VAA_JSON_URL}`);

    try {
        const response = await fetch(GITHUB_VAA_JSON_URL, { cache: 'no-store' }); // Disable caching for fresh data
        if (!response.ok) {
            throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
        }
        const rawData: any[] = await response.json(); // Assuming vaa.json is an array
        
        // Transform rawData to AppTableDisplayMintData structure
        // This is a placeholder transformation; adjust based on actual vaa.json structure
        const transformedData: AppTableDisplayMintData[] = rawData.map((item: any) => {
            // Assuming item is somewhat similar to MintData or the enriched data from collections-manager
            const baseMintData: MintData = {
                txHash: item.txHash || `unknown-tx-${Math.random()}`,
                contractAddress: item.contractAddress || `unknown-contract-${Math.random()}`,
                tokenId: String(item.tokenId) || '0',
                collectionName: item.collectionName || item.analysis?.collectionNameFromAnalyzer || "Unknown Collection",
                timestamp: item.timestamp || Math.floor(Date.now() / 1000),
                blockNumber: item.blockNumber || 0,
                logIndex: item.logIndex || 0,
                tokenImagePlaceholderUrl: item.tokenImagePlaceholderUrl || `https://picsum.photos/seed/${item.contractAddress}${item.tokenId}/64`,
                isFree: typeof item.isFree === 'boolean' ? item.isFree : (item.valueWei === '0' || !item.valueWei),
                valueWei: item.valueWei,
            };

            return {
                ...baseMintData,
                totalContractMints: item.totalContractMints || 1, // Default if not present
                analysis: item.analysis || { // Provide default analysis if not present
                    contractAddress: baseMintData.contractAddress,
                    metadataStatus: 'not_fetched',
                    nameSymbolStatus: 'not_fetched',
                    collectionNameFromAnalyzer: baseMintData.collectionName,
                    collectionSymbolFromAnalyzer: baseMintData.collectionName.substring(0,3).toUpperCase(),
                    finalStatus: 'OK', // Default to OK or 'ErrorAnalyzing' if preferred
                    statusReasons: ['Analysis data from vaa.json or default.'],
                },
                displayStatus: item.analysis?.finalStatus || 'OK',
                mintPriceApe: item.mintPriceApe || (item.valueWei && parseFloat(item.valueWei) > 0 ? (parseFloat(item.valueWei) / 1e18).toFixed(4) : undefined),
            };
        }).sort((a, b) => b.timestamp - a.timestamp); // Sort by most recent

        setTableData(transformedData);
        console.log("[App.tsx] setTableData called with data from GitHub. Length:", transformedData.length);

    } catch (error: any) {
        console.error("fetchUniqueCollectionsTableData Error:", error);
        setTableDataError(`Failed to load collections from GitHub: ${error.message}. Check console for details.`);
        setTableData([]); // Clear table on error
    } finally {
        setIsFetchingTableData(false);
        console.log("fetchUniqueCollectionsTableData (GitHub fetch) finished.");
    }
  }, []);

  useEffect(() => {
    const initialHash = window.location.hash || '#/';
    setCurrentRoute(initialHash);

    const loadAllInitialData = async () => {
        console.log("loadAllInitialData: Starting all initial fetches.");
        await loadAdminSettings();
        await loadSeenPopups();
        await fetchUniqueCollectionsTableData(); // Now fetches from GitHub
        
        console.log("loadAllInitialData: All initial fetches settled.");
        setInitialAppSetupComplete(true);
        console.log("loadAllInitialData: initialAppSetupComplete SET TO TRUE.");
    };

    loadAllInitialData();

    const handleHashChange = () => {
      setCurrentRoute(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Keep deps minimal for initial load

  useEffect(() => {
    document.body.style.paddingTop = `${calculateBodyPaddingTop(effectiveTwitterId, effectiveAds)}px`;
  }, [effectiveAds, effectiveTwitterId, currentRoute]); 

  useEffect(() => {
    const pageId = getPageFromHash(currentRoute);
    console.log(`[App Routing Check Effect] Current Route: ${currentRoute}, Page ID: ${pageId}, IsAdminLoggedIn: ${isAdminLoggedIn}, InitialSetupComplete: ${initialAppSetupComplete}`);

    if (!initialAppSetupComplete) {
      console.log("[App Routing Decision] Initial setup not complete. Skipping routing logic.");
      return;
    }

    let newHashTarget: string | null = null;

    if (pageId === CONFIG_LOGIN_PAGE_ID && isAdminLoggedIn) {
        newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_PANEL_PAGE_ID}`;
    } else if (pageId === CONFIG_PANEL_PAGE_ID && !isAdminLoggedIn) {
        newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`;
    }

    if (newHashTarget && newHashTarget !== window.location.hash) {
        console.log(`[App Routing Action] Changing hash from ${window.location.hash} to: ${newHashTarget}`);
        window.location.hash = newHashTarget;
    } else {
        console.log(`[App Routing Decision] No redirect conditions met for current state. Page ID: ${pageId}, LoggedIn: ${isAdminLoggedIn}`);
    }
  }, [currentRoute, isAdminLoggedIn, initialAppSetupComplete]);

  useEffect(() => {
    try {
      const storedAllTimeMintsRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedAllTimeMintsRaw) setAllTimeMints(JSON.parse(storedAllTimeMintsRaw).sort((a:MintData,b:MintData) => b.timestamp - a.timestamp));

      const storedLiveFreeMintsRaw = localStorage.getItem(LIVE_FREE_MINTS_CACHE_KEY);
      if (storedLiveFreeMintsRaw) setLiveFreeMints(JSON.parse(storedLiveFreeMintsRaw).sort((a:MintData,b:MintData) => b.timestamp - a.timestamp).slice(0, MAX_DISPLAY_MINTS));

      const storedLivePaidMintsRaw = localStorage.getItem(LIVE_PAID_MINTS_CACHE_KEY);
      if (storedLivePaidMintsRaw) setLivePaidMints(JSON.parse(storedLivePaidMintsRaw).sort((a:MintData,b:MintData) => b.timestamp - a.timestamp).slice(0, MAX_DISPLAY_MINTS));

      const storedSoundPref = localStorage.getItem(SOUND_ENABLED_PREFERENCE_KEY);
      setSoundEnabled(storedSoundPref === 'true');

    } catch (e) {
      console.error("Failed to load or parse data from localStorage:", e);
    }
  }, []);

  const handleError = useCallback((errorMessage: string, isRateLimit: boolean = false) => {
    console.error("App Error:", errorMessage, "Is Rate Limit:", isRateLimit);
    if (isRateLimit) setRateLimitWarning(prev => (prev && prev.includes("Rate limit") ? prev : errorMessage));
    else setError(errorMessage);
    if (!isRateLimit) setRateLimitWarning(null);
  }, []);

 const handleNewMint = useCallback(async (newMint: MintData) => {
    const processMintsForLiveFeed = (prevMints: MintData[], storageKey: string): MintData[] => {
        const isDuplicateLive = prevMints.some(m => m.txHash === newMint.txHash && m.logIndex === newMint.logIndex);
        if (isDuplicateLive) return prevMints;
        let updated = [newMint, ...prevMints].sort((a,b) => b.timestamp - a.timestamp).slice(0, MAX_DISPLAY_MINTS);
        try { localStorage.setItem(storageKey, JSON.stringify(updated)); }
        catch (e) { console.error(`Error saving ${storageKey} to localStorage:`, e); }
        return updated;
    };

    if (newMint.isFree) {
        setLiveFreeMints(prevMints => processMintsForLiveFeed(prevMints, LIVE_FREE_MINTS_CACHE_KEY));
    } else {
        setLivePaidMints(prevMints => processMintsForLiveFeed(prevMints, LIVE_PAID_MINTS_CACHE_KEY));
    }

    setAllTimeMints(prevAllMints => {
      let updatedPersistedMints = [newMint, ...prevAllMints];
      const uniqueEventsMap = new Map<string, MintData>();
      updatedPersistedMints.forEach(mint => {
          const key = `${mint.txHash}-${mint.logIndex}`;
          if (!uniqueEventsMap.has(key) || newMint.timestamp > uniqueEventsMap.get(key)!.timestamp) {
              uniqueEventsMap.set(key, mint);
          }
      });
      updatedPersistedMints = Array.from(uniqueEventsMap.values()).sort((a, b) => b.timestamp - a.timestamp);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedPersistedMints));
      } catch (e: any) {
        console.error("Error saving allTimeMints to localStorage:", e);
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
            const mintsToKeep = updatedPersistedMints.slice(0, Math.floor(updatedPersistedMints.length * 0.8));
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mintsToKeep));
            return mintsToKeep;
        }
      }
      return updatedPersistedMints;
    });
    // No need to call fetchUniqueCollectionsTableData here as it's client-side and not based on POSTs
    setError(null);
  }, []); 

  const handleSetupComplete = useCallback(() => {
    setIsLoading(false);
    console.log("Blockchain service setup complete. isLoading set to false.");
  }, []);

  useEffect(() => {
    const initService = async () => {
      setIsLoading(true); setError(null); setRateLimitWarning(null);
      try {
        setProviderOk(true);
        await blockchainService.listenForMints(handleNewMint, handleError, handleSetupComplete);
      } catch (e) {
        handleError(`Initialization Error: ${e instanceof Error ? e.message : String(e)}`);
        setProviderOk(false); setIsLoading(false);
      }
    };
    if (initialAppSetupComplete) { 
        initService();
    }
    return () => {
      blockchainService.stopListeningForMints();
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    };
  }, [handleNewMint, handleError, handleSetupComplete, initialAppSetupComplete]);

  // This useEffect for client-side analysis is now largely bypassed if GITHUB_VAA_JSON_URL is the source
  // It might still run if vaa.json fetch fails and tableData remains empty from allTimeMints
  useEffect(() => {
    // console.log("[App.tsx prepareTableData Effect] Based on allTimeMints. Current source is GITHUB_VAA_JSON_URL.");
    // This effect is less relevant now that table data comes from vaa.json
    // It was for client-side analysis if the main table was populated from `allTimeMints`.
    // Keeping it minimal as it might still run if vaa.json fails to load initially
    // and `allTimeMints` is somehow populated (e.g. from older localStorage)
    // but the main data source is `fetchUniqueCollectionsTableData`.
    if (allTimeMints.length > 0 && tableData.length === 0 && !isFetchingTableData) {
        console.warn("[App.tsx prepareTableData Effect] `allTimeMints` has data, but `tableData` is empty. This effect is meant for client-side analysis which is secondary to GitHub vaa.json fetch. Displaying a message.");
        // setTableDataError("Could not load primary collection data. Displaying limited data from live mints if available.");
    }
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTimeMints, isLoading]); // Simplified dependencies


 useEffect(() => {
    // This effect updates display statuses based on analysisStatusMap.
    // Since analysis is now mostly pre-defined in vaa.json or defaulted, this might have less impact.
    setTableData(prevTableData => prevTableData.map((item): AppTableDisplayMintData => { 
        const status = analysisStatusMap.get(item.contractAddress);
        // const cachedAnalysisItem = analysisCacheRef.current.get(item.contractAddress); // analysisCache not actively populated now
        // const cachedAnalysis = cachedAnalysisItem?.result;
        let newDisplayStatus = item.displayStatus; // Keep existing from vaa.json/default
        let newAnalysis = item.analysis;     // Keep existing from vaa.json/default

        if (status === 'analyzing' && item.displayStatus !== 'Analyzing...') { newDisplayStatus = 'Analyzing...'; }
        // else if (status === 'done' && cachedAnalysis) { newDisplayStatus = cachedAnalysis.finalStatus; newAnalysis = cachedAnalysis; } // Less likely to hit
        else if (status === 'error' && item.displayStatus !== 'ErrorAnalyzing') { newDisplayStatus = 'ErrorAnalyzing'; }
        
        return { ...item, analysis: newAnalysis, displayStatus: newDisplayStatus };
    }).sort((a,b) => b.timestamp - a.timestamp));
 }, [analysisStatusMap]);

 useEffect(() => {
    if (isInitialLoadRef.current && initialAppSetupComplete && !isLoading && !isFetchingTableData && !isAdminSettingsLoading && !isSeenPopupsLoading) {
      isInitialLoadRef.current = false;
      console.log("Popup useEffect: Initial app setup is now considered fully complete for popups.");
    }

    const anyCriticalLoading = isLoading || isFetchingTableData || isAdminSettingsLoading || isSeenPopupsLoading;

    if (isInitialLoadRef.current || !initialAppSetupComplete || anyCriticalLoading) {
        if (!userInteracted && speechSynthesis.speaking) speechSynthesis.cancel();
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        return;
    }
    console.log("Popup useEffect: Proceeding with notifications. tableData length:", tableData.length);

    let notificationProcessed = false;
    for (const mint of tableData) {
        if (playedNotificationForContractsRef.current.has(mint.contractAddress) || notificationProcessed) continue;

        // Check if analysis exists and finalStatus is 'OK'
        if (mint.isFree && mint.analysis && mint.analysis.finalStatus === 'OK') {
            console.log(`Popup useEffect: Triggering popup for ${mint.contractAddress}`);
            setActivePopups(prev => prev.some(p => p.txHash === mint.txHash && p.logIndex === mint.logIndex) ? prev : [...prev, { ...mint, popupId: `${mint.contractAddress}-${mint.tokenId}-${Date.now()}` }]);

            if (userInteracted && soundEnabled && (tableFilter === 'free' || tableFilter === 'all')) {
                const name = (mint.analysis?.collectionNameFromAnalyzer?.replace(/unknown|unnamed/i,'').trim()) || mint.collectionName.replace(/unknown|unnamed/i,'').trim() || `collection ${mint.contractAddress.slice(0,6)}`;
                const text = `Hey, ${name} looks okay and is a free mint. Check it out!`;
                console.log(`Popup useEffect: Speaking: "${text}"`);
                if (speechSynthesis.speaking) speechSynthesis.cancel();
                if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
                utteranceRef.current = new SpeechSynthesisUtterance(text);
                utteranceRef.current.lang = 'en-US';
                utteranceRef.current.onend = () => { if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current); };
                utteranceRef.current.onerror = e => { if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current); console.error('Speech error:', e.error);};
                speechSynthesis.speak(utteranceRef.current);
                speechTimeoutRef.current = window.setTimeout(() => { if (speechSynthesis.speaking && utteranceRef.current?.text === text) speechSynthesis.cancel(); }, 10000);
                notificationProcessed = true;
            }
            playedNotificationForContractsRef.current.add(mint.contractAddress);
            console.log(`Popup for ${mint.contractAddress} marked as seen (session-local). Backend call disabled.`);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableData, userInteracted, soundEnabled, tableFilter, initialAppSetupComplete, isLoading, isFetchingTableData, isAdminSettingsLoading, isSeenPopupsLoading]);

  const handlePopupClose = (popupId: string) => setActivePopups(prev => prev.filter(p => p.popupId !== popupId));

  const toggleSound = () => {
    if (!userInteracted) {
        setUserInteracted(true);
        try {
            const primer = new SpeechSynthesisUtterance(' '); primer.volume = 0;
            speechSynthesis.speak(primer);
            setTimeout(() => { if (speechSynthesis.speaking && utteranceRef.current === primer) speechSynthesis.cancel();}, 200);
        } catch (e) { console.warn("Could not prime speech synthesis:", e); }
    }
    const newSoundEnabled = !soundEnabled;
    setSoundEnabled(newSoundEnabled);
    localStorage.setItem(SOUND_ENABLED_PREFERENCE_KEY, String(newSoundEnabled));
    if (!newSoundEnabled && speechSynthesis.speaking) speechSynthesis.cancel();
  };

  const getFilteredAndPaginatedTableData = useCallback(() => {
    let filteredData = tableData;
    if (tableFilter === 'free') {
        filteredData = tableData.filter(mint => mint.isFree);
    } else if (tableFilter === 'paid') {
        filteredData = tableData.filter(mint => !mint.isFree);
    }
    const paginatedData = filteredData.slice(0, tableItemsPerPage);
    return paginatedData;
  }, [tableData, tableFilter, tableItemsPerPage]);


  const handleAdminLoginSuccess = () => {
    console.log("[handleAdminLoginSuccess] Called. Setting isAdminLoggedIn to true and ADMIN_SESSION_KEY.");
    localStorage.setItem(ADMIN_SESSION_KEY, "true");
    setIsAdminLoggedIn(true);
    loadAdminSettings(true); 
  };

  const handleAdminLogout = () => {
    console.log("[handleAdminLogout] Called. Setting isAdminLoggedIn to false and removing ADMIN_SESSION_KEY.");
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setIsAdminLoggedIn(false);
    loadAdminSettings(true); 
  };

  const handleAdminSettingsSave = () => {
    console.log("Admin settings 'save' requested. Backend call disabled. Reloading defaults locally.");
    loadAdminSettings(true);
    alert("Admin settings save attempt logged! (Backend functionality removed). Defaults reloaded.");
  }

  const displayedLiveFreeMints = liveFreeMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const displayedLivePaidMints = livePaidMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const activeBannerLink = `${ADVERTISEMENT_TWITTER_DM_URL_BASE}${effectiveTwitterId}`;
  const visibleAds = effectiveAds.filter(ad => ad.active);


  const renderMainContent = () => {
    const currentTableDisplayData = getFilteredAndPaginatedTableData();
    const currentTableDisplayDataLength = currentTableDisplayData.length;

    console.log(`[App Render MainContent] Conditions: isFetchingTableData=${isFetchingTableData}, tableDataError=${!!tableDataError}, currentTableDisplayDataLength=${currentTableDisplayDataLength}, tableData.length=${tableData.length}, initialAppSetupComplete=${initialAppSetupComplete}`);
    // console.log("[App Render MainContent] Props to be passed to MintsTable:", currentTableDisplayData); // Can be too verbose


    let tableSectionContent;
    if (isFetchingTableData && (!initialAppSetupComplete || currentTableDisplayDataLength === 0)) {
        tableSectionContent = (
            <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow">
                <LoadingSpinner />
                <p className="mt-3 text-slate-300">
                    {initialAppSetupComplete ? "Refreshing collections data from GitHub..." : "Loading unique collections from GitHub..."}
                </p>
            </div>
        );
    } else if (tableDataError) {
        tableSectionContent = (
            <div className="w-full max-w-4xl mx-auto text-center p-4 bg-red-800/60 rounded-lg shadow-lg border border-red-600 my-2 backdrop-blur-sm text-sm flex-grow flex flex-col items-center justify-center">
                <h2 className="font-semibold text-red-200 mb-1 text-lg">Failed to Load Collections</h2>
                <p className="text-slate-200">{tableDataError}</p>
                <button 
                    onClick={fetchUniqueCollectionsTableData} 
                    className="mt-3 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm rounded-md"
                >
                    Retry Fetch
                </button>
            </div>
        );
    } else if (currentTableDisplayDataLength > 0) {
        tableSectionContent = <div className="flex-grow min-h-0"><MintsTable mints={currentTableDisplayData} /></div>;
    } else { 
        tableSectionContent = (
            <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow">
                <p className="text-slate-300">
                {tableData.length === 0 
                    ? "No collections found in vaa.json or data is empty."
                    : `No collections match the current "${tableFilter}" filter.`
                }
                </p>
                 <button 
                    onClick={fetchUniqueCollectionsTableData} 
                    className="mt-3 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm rounded-md"
                >
                    Refresh Data
                </button>
            </div>
        );
    }

    return (
    <>
      { adminSettingsError && (
          <div className="w-full max-w-4xl mx-auto text-center p-3 bg-red-800/60 rounded-lg shadow-lg border border-red-600 my-2 backdrop-blur-sm text-sm">
              <p className="text-slate-200">{adminSettingsError}</p>
          </div>
      )}
      { seenPopupsError && (
          <div className="w-full max-w-4xl mx-auto text-center p-2 bg-yellow-800/60 rounded-lg shadow-lg border border-yellow-600 my-1 backdrop-blur-sm text-xs">
              <p className="text-slate-200">{seenPopupsError}</p>
          </div>
      )}

      {(!isAdminSettingsLoading && ADVERTISEMENT_TEXT && effectiveTwitterId) && <AdvertisementBanner text={ADVERTISEMENT_TEXT} link={activeBannerLink} />}
      {(!isAdminSettingsLoading && visibleAds.length > 0) && <NftAdvertisementPoster adList={visibleAds} />}

      {activePopups.map(mint => (
        <NewMintPopup key={mint.popupId} mint={mint} onClose={() => handlePopupClose(mint.popupId)} />
      ))}

      <main className="w-full p-4 md:p-8 flex-grow max-w-8xl mx-auto flex flex-col"> 
        {!providerOk && !isLoading && (
          <div className="w-full max-w-4xl mx-auto text-center p-6 bg-red-800/50 rounded-xl shadow-2xl border border-red-600 mb-6 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold text-red-300 mb-3">Connection Error</h2>
            <p className="text-slate-300">{error || "Could not connect to the ApeChain network."}</p>
          </div>
        )}
        {isLoading && initialAppSetupComplete && ( 
          <div className="flex flex-col items-center justify-center text-center p-6 w-full max-w-4xl mx-auto mb-6">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-slate-300">{providerOk ? "Connecting to ApeChain for live mints..." : "Initializing blockchain connection..."}</p>
          </div>
        )}
        {!isLoading && error && (
          <div className="w-full max-w-4xl mx-auto text-center p-6 bg-red-800/50 rounded-xl shadow-2xl border border-red-600 mb-6 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold text-red-300 mb-3">Error Listening for Mints</h2>
            <p className="text-slate-300">{error}</p>
          </div>
        )}
        {!isLoading && rateLimitWarning && !error && (
          <div className="w-full max-w-4xl mx-auto text-center p-4 bg-yellow-700/40 rounded-xl shadow-2xl border border-yellow-500 mb-6 backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-yellow-300 mb-2">Live Mint Network Status</h2>
            <p className="text-slate-300 text-sm">{rateLimitWarning}</p>
          </div>
        )}
        {!isLoading && !error && !rateLimitWarning && displayedLiveFreeMints.length === 0 && displayedLivePaidMints.length === 0 && providerOk && (
           <div className="w-full max-w-4xl mx-auto text-center p-6 bg-slate-800/70 rounded-xl shadow-2xl mb-6 border border-slate-700 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold text-sky-400 mb-3">Listening for Live Mints</h2>
            <p className="text-slate-300">No live mints detected yet.</p>
          </div>
        )}
        {initialAppSetupComplete && !isLoading && ( 
          <div className="w-full flex flex-col md:flex-row md:space-x-6 lg:space-x-8 mt-4 flex-grow"> 
            <div className="w-full md:w-2/5 lg:w-1/3 flex flex-col space-y-8 mb-8 md:mb-0">
              <div className="bg-slate-800/50 p-4 rounded-xl shadow-xl border border-slate-700 backdrop-blur-sm">
                <h2 className="text-3xl font-semibold text-center md:text-left text-green-400 mb-4 drop-shadow-[0_1px_1px_rgba(0,255,0,0.3)]">
                  Live Free Mints <span className="text-sm text-slate-400">(Latest {MAX_DISPLAY_MINTS_FOR_LIVE_FEED})</span>
                </h2>
                {displayedLiveFreeMints.length > 0 ? (
                  <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar" style={{maxHeight: 'calc(70vh - 120px)'}}>
                    {displayedLiveFreeMints.map((mint) => <MintCard key={`${mint.txHash}-${mint.logIndex}-free`} mint={mint} />)}
                  </div>
                ) : providerOk && !error && (
                  <div className="p-6 h-40 flex items-center justify-center border border-slate-700 rounded-xl"> <p className="text-slate-400 text-sm">Listening for free mints...</p> </div>
                )}
              </div>
              <div className="bg-slate-800/50 p-4 rounded-xl shadow-xl border border-slate-700 backdrop-blur-sm">
                <h2 className="text-3xl font-semibold text-center md:text-left text-amber-400 mb-4 drop-shadow-[0_1px_1px_rgba(255,193,7,0.3)]">
                  Live Paid Mints <span className="text-sm text-slate-400">(Latest {MAX_DISPLAY_MINTS_FOR_LIVE_FEED})</span>
                </h2>
                {displayedLivePaidMints.length > 0 ? (
                  <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar" style={{maxHeight: 'calc(70vh - 120px)'}}>
                    {displayedLivePaidMints.map((mint) => <MintCard key={`${mint.txHash}-${mint.logIndex}-paid`} mint={mint} />)}
                  </div>
                ) : providerOk && !error && (
                  <div className="p-6 h-40 flex items-center justify-center border border-slate-700 rounded-xl"> <p className="text-slate-400 text-sm">Listening for paid mints...</p> </div>
                )}
              </div>
            </div>
            <div className="w-full md:w-3/5 lg:w-2/3 flex flex-col"> 
              <section 
                className="p-4 sm:p-6 bg-slate-800/70 rounded-xl shadow-2xl h-full border-2 border-pink-500 backdrop-blur-sm flex flex-col flex-grow" 
                style={{padding: '10px'}} 
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-teal-400 mb-3 sm:mb-0">Unique Collections <span className="text-sm text-slate-400">(Last 24h, from GitHub)</span></h2>
                  {(tableFilter === 'free' || tableFilter === 'all') && providerOk && (
                      <button onClick={toggleSound} className={`px-3 py-2 text-xs sm:text-sm rounded-lg shadow-lg transition-colors ${soundEnabled ? 'bg-red-500 hover:bg-red-600' : 'bg-sky-500 hover:bg-sky-600'} text-white`}>
                          Sound Alerts: {soundEnabled ? 'ON' : 'OFF'}
                      </button>
                  )}
                </div>
                {providerOk && ( 
                  <>
                    <div className="mb-4 flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
                        <div className="flex space-x-2">
                            {(['all', 'free', 'paid'] as const).map(f => (
                                <button key={f} onClick={() => setTableFilter(f)} className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tableFilter === f ? 'bg-fuchsia-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'}`}>
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center space-x-2 text-xs">
                            <span className="text-slate-300">Show:</span>
                            {[10, 20, 100].map(s => (
                                <button key={s} onClick={() => setTableItemsPerPage(s)} className={`px-2.5 py-1 rounded-md transition-colors ${tableItemsPerPage === s ? 'bg-sky-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'}`}>{s}</button>
                            ))}
                        </div>
                    </div>
                    {tableSectionContent}
                  </>
                )}
                 {!providerOk && !isLoading && ( 
                    <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow"><p className="text-slate-400">Blockchain service not connected. Table data may be unavailable or stale.</p></div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
      <footer className="mt-auto text-center text-slate-500 text-xs w-full max-w-7xl mx-auto py-6 border-t border-slate-700/50">
        <div className="flex justify-between items-center px-4 sm:px-0">
            <p>&copy; {new Date().getFullYear()} {APP_TITLE}</p>
            <LiveVisitorsCounter />
        </div>
      </footer>
    </>
    );
  };

  const currentPageId = getPageFromHash(currentRoute);
  let contentToRender;

  const showInitializingAppMessage = (message = "Initializing ApeChain Mint Tracker...") => (
    <div className="flex-grow flex flex-col items-center justify-center text-slate-300 p-8">
      <LoadingSpinner />
      <p className="ml-3 mt-4 text-lg">{message}</p>
    </div>
  );


  if (!initialAppSetupComplete) {
    let loadingMessage = "Initializing ApeChain Mint Tracker...";
    if (isAdminSettingsLoading && !isSeenPopupsLoading && !isFetchingTableData && !isLoading) loadingMessage = "Loading site configuration (defaults)...";
    else if (isSeenPopupsLoading && !isFetchingTableData && !isLoading) loadingMessage = "Loading popup history (session local)...";
    else if (isFetchingTableData && !isLoading ) loadingMessage = "Loading unique collections from GitHub...";
    else if (isLoading) loadingMessage = "Initializing blockchain connection...";
    contentToRender = showInitializingAppMessage(loadingMessage);
  } else if (isAdminLoggedIn) {
      if (currentPageId === CONFIG_PANEL_PAGE_ID) {
          contentToRender = (
            <Suspense fallback={showInitializingAppMessage("Loading Admin Panel...")}>
                <AdminPanel
                    onLogout={handleAdminLogout}
                    onSettingsSave={handleAdminSettingsSave}
                    currentAds={effectiveAds}
                    currentTwitterId={effectiveTwitterId}
                />
            </Suspense>
          );
      } else if (currentPageId === CONFIG_LOGIN_PAGE_ID) {
          contentToRender = showInitializingAppMessage("Redirecting to Admin Panel...");
      } else {
          contentToRender = renderMainContent();
      }
  } else {
      if (currentPageId === CONFIG_LOGIN_PAGE_ID) {
          contentToRender = (
            <Suspense fallback={showInitializingAppMessage("Loading Admin Login...")}>
                <AdminLogin onLoginSuccess={handleAdminLoginSuccess} />
            </Suspense>
          );
      } else if (currentPageId === CONFIG_PANEL_PAGE_ID) {
          contentToRender = showInitializingAppMessage("Redirecting to Admin Login...");
      } else {
          contentToRender = renderMainContent();
      }
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-slate-100 flex flex-col items-center selection:bg-fuchsia-500 selection:text-white">
      <header className="fixed top-0 left-0 right-0 z-[100] bg-slate-900/80 backdrop-blur-md flex justify-between items-center px-4 sm:px-6 py-3 shadow-lg w-full" style={{height: '60px'}}> 
          <div className="flex-1"></div> 
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-fuchsia-500 to-indigo-600 pb-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] text-center flex-shrink-0"> 
            {APP_TITLE}
          </h1>
          <div className="flex-1 flex justify-end"> 
            <a href={`#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`} className="text-xs sm:text-sm text-slate-300 hover:text-sky-400 transition-colors px-2 py-1 rounded hover:bg-slate-700/50">
              Site Config
            </a>
          </div>
      </header>
      
      <div className="flex-grow w-full flex flex-col" style={{ paddingTop: '60px' }}> 
        {contentToRender}
      </div>

    </div>
  );
};

export default App;
