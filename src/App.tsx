
import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
// import { formatUnits } from 'ethers'; // formatUnits is used by collections-manager.ts if it calculates price there
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
    SETTINGS_API_ENDPOINT,
    SEEN_POPUPS_API_ENDPOINT,
    MARK_POPUP_SEEN_API_ENDPOINT,
    VALID_ACCENT_COLORS,
    UNIQUE_COLLECTIONS_API_ENDPOINT,
    LOCAL_STORAGE_KEY,
    LIVE_FREE_MINTS_CACHE_KEY,
    LIVE_PAID_MINTS_CACHE_KEY,
    SOUND_ENABLED_PREFERENCE_KEY
} from './constants';

const AdminLogin = lazy(() => import('./components/admin/AdminLogin'));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));

export interface AppTableDisplayMintData extends MintData {
  totalContractMints: number;
  analysis?: CollectionAnalysisResult;
  displayStatus: FinalCollectionStatus;
  mintPriceApe?: string;
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
  const [allTimeMints, setAllTimeMints] = useState<MintData[]>([]); // Still used for localStorage backup

  const [isLoadingBlockchain, setIsLoadingBlockchain] = useState<boolean>(true); // For blockchain service connection
  const [error, setError] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);
  const [providerOk, setProviderOk] = useState<boolean>(false);

  const [userInteracted, setUserInteracted] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  const [tableData, setTableData] = useState<AppTableDisplayMintData[]>([]);
  const [tableFilter, setTableFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [isFetchingTableData, setIsFetchingTableData] = useState<boolean>(true); // Initially true for API call
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [tableItemsPerPage, setTableItemsPerPage] = useState<number>(10);

  const [activePopups, setActivePopups] = useState<PopupMintData[]>([]);

  const isInitialLoadRef = useRef(true); // For popup logic to distinguish true initial load vs subsequent data changes
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const playedNotificationForContractsRef = useRef(new Set<string>());

  const [currentRoute, setCurrentRoute] = useState<string>(window.location.hash || '#/');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);

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
    console.log("loadAdminSettings: Starting...");
    try {
        const response = await fetch(SETTINGS_API_ENDPOINT);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn("Admin settings not found (404), using defaults.");
                setEffectiveTwitterId(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);
                setEffectiveAds(DEFAULT_NFT_ADVERTISEMENTS_LIST);
            } else {
                throw new Error(`Failed to fetch admin settings: ${response.status} ${response.statusText}`);
            }
        } else {
            const adminSettings: Partial<AdminSettings> = await response.json();
            setEffectiveTwitterId(adminSettings.twitterUserId || DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);

            if (adminSettings.ads && Array.isArray(adminSettings.ads) && adminSettings.ads.length > 0) {
                const sanitizedAds: NftAdDetails[] = adminSettings.ads.map((adFromBackend, index): NftAdDetails => {
                    const defaultAdForSlot = DEFAULT_NFT_ADVERTISEMENTS_LIST.find(
                        dAd => dAd.id === (adFromBackend.id || `ad_slot_${index + 1}`)
                    ) || DEFAULT_NFT_ADVERTISEMENTS_LIST[0];

                    let validatedAccentColor = defaultAdForSlot.accentColor;
                    if (adFromBackend.accentColor && VALID_ACCENT_COLORS.includes(adFromBackend.accentColor as any)) {
                        validatedAccentColor = adFromBackend.accentColor as NftAdDetails['accentColor'];
                    }

                    return {
                        id: adFromBackend.id || `admin_ad_slot_${index}`,
                        name: adFromBackend.name || defaultAdForSlot.name,
                        supply: adFromBackend.supply || defaultAdForSlot.supply,
                        price: adFromBackend.price || defaultAdForSlot.price,
                        imageUrl: adFromBackend.imageUrl || defaultAdForSlot.imageUrl,
                        mintLink: adFromBackend.mintLink || defaultAdForSlot.mintLink,
                        accentColor: validatedAccentColor,
                        active: typeof adFromBackend.active === 'boolean' ? adFromBackend.active : defaultAdForSlot.active,
                    };
                });
                setEffectiveAds(sanitizedAds);
            } else {
                setEffectiveAds(DEFAULT_NFT_ADVERTISEMENTS_LIST);
            }
        }
    } catch (e: any) {
        console.error("Failed to fetch admin settings:", e.message);
        setAdminSettingsError(`Could not load site configuration: ${e.message}. Using defaults.`);
        setEffectiveTwitterId(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);
        setEffectiveAds(DEFAULT_NFT_ADVERTISEMENTS_LIST);
    } finally {
        setIsAdminSettingsLoading(false); // Always set to false after attempt
        console.log("loadAdminSettings finished. isAdminSettingsLoading:", false);
    }
  }, []);

  const loadSeenPopups = useCallback(async () => {
    setIsSeenPopupsLoading(true);
    setSeenPopupsError(null);
    console.log("loadSeenPopups: Starting...");
    try {
        const response = await fetch(SEEN_POPUPS_API_ENDPOINT);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn("Seen popups list not found (404), starting fresh.");
                playedNotificationForContractsRef.current = new Set<string>();
            } else {
                throw new Error(`Failed to fetch seen popups: ${response.status} ${response.statusText}`);
            }
        } else {
            const seenContracts: string[] = await response.json();
            playedNotificationForContractsRef.current = new Set(seenContracts);
        }
    } catch (e: any) {
        console.error("Failed to fetch seen popups:", e.message);
        setSeenPopupsError(`Could not load popup history: ${e.message}. Popups may re-appear.`);
        playedNotificationForContractsRef.current = new Set<string>();
    } finally {
        setIsSeenPopupsLoading(false); // Always set to false
        console.log("loadSeenPopups finished. isSeenPopupsLoading:", false);
    }
  }, []);

  const fetchUniqueCollectionsTableData = useCallback(async () => {
    setIsFetchingTableData(true);
    setTableDataError(null);
    console.log("fetchUniqueCollectionsTableData: Starting (API)...");
    try {
        const response = await fetch(UNIQUE_COLLECTIONS_API_ENDPOINT);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch unique collections: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data: AppTableDisplayMintData[] = await response.json();
        console.log(`fetchUniqueCollectionsTableData: Received ${data.length} collections from API.`);
        setTableData(data.sort((a,b) => b.timestamp - a.timestamp));
    } catch (e: any) {
        console.error("Failed to fetch unique collections table data (from API endpoint):", e);
        setTableDataError(`Error loading collections: ${e.message}. Please try refreshing.`);
        setTableData([]);
    } finally {
        setIsFetchingTableData(false); // Always set to false
        console.log("fetchUniqueCollectionsTableData (API) finished. isFetchingTableData:", false);
    }
  }, []);

  // Effect for all initial data loading
  useEffect(() => {
    const initialHash = window.location.hash || '#/';
    setCurrentRoute(initialHash);
    
    console.log("Initial data loading effect: Kicking off all fetches.");
    loadAdminSettings();
    loadSeenPopups();
    fetchUniqueCollectionsTableData();

    const handleHashChange = () => {
      setCurrentRoute(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array: Run only on mount

  // Effect to determine when all initial setup is truly complete
  useEffect(() => {
    if (!isAdminSettingsLoading && !isSeenPopupsLoading && !isFetchingTableData && !isLoadingBlockchain) {
        if (!initialAppSetupComplete) {
            console.log("All critical initial loads complete. Setting initialAppSetupComplete to true.");
            setInitialAppSetupComplete(true);
        }
    }
  }, [isAdminSettingsLoading, isSeenPopupsLoading, isFetchingTableData, isLoadingBlockchain, initialAppSetupComplete]);


  useEffect(() => {
    document.body.style.paddingTop = `${calculateBodyPaddingTop(effectiveTwitterId, effectiveAds)}px`;
  }, [effectiveAds, effectiveTwitterId]);

  useEffect(() => { // Handle admin page redirects based on login state
    const pageId = getPageFromHash(currentRoute);
    let newHashTarget: string | null = null;

    if (initialAppSetupComplete) { // Only attempt redirects after initial setup is done
        if (pageId === CONFIG_LOGIN_PAGE_ID && isAdminLoggedIn) {
            newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_PANEL_PAGE_ID}`;
        } else if (pageId === CONFIG_PANEL_PAGE_ID && !isAdminLoggedIn) {
            newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`;
        }

        if (newHashTarget && newHashTarget !== window.location.hash) {
            console.log(`Redirecting from ${window.location.hash} to ${newHashTarget}`);
            window.location.hash = newHashTarget;
        }
    }
  }, [currentRoute, isAdminLoggedIn, initialAppSetupComplete]);

  useEffect(() => { // Load from localStorage for live feeds (client-side only cache)
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

    setAllTimeMints(prevAllMints => { // For localStorage backup of all detected mints
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

    try {
        const response = await fetch(UNIQUE_COLLECTIONS_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMint),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to POST new mint to collections API: ${response.status} ${response.statusText} - ${errorText}`);
        } else {
            const responseData = await response.json();
            console.log(`Successfully POSTed new mint ${newMint.txHash} to collections API. Server response: ${responseData.message}`);
            fetchUniqueCollectionsTableData(); 
        }
    } catch (e) {
        console.error("Error POSTing new mint to collections API:", e);
    }
    setError(null);
  }, [fetchUniqueCollectionsTableData]);

  const handleSetupCompleteBlockchain = useCallback(() => {
    setIsLoadingBlockchain(false); 
  }, []);

  useEffect(() => { // Blockchain service listener setup
    const initService = async () => {
      setIsLoadingBlockchain(true); setError(null); setRateLimitWarning(null);
      try {
        setProviderOk(true);
        await blockchainService.listenForMints(handleNewMint, handleError, handleSetupCompleteBlockchain);
      } catch (e) {
        handleError(`Initialization Error: ${e instanceof Error ? e.message : String(e)}`);
        setProviderOk(false); setIsLoadingBlockchain(false);
      }
    };
    initService();
    return () => {
      blockchainService.stopListeningForMints();
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    };
  }, [handleNewMint, handleError, handleSetupCompleteBlockchain]);

 useEffect(() => { // Popup and sound notification logic
    if (isInitialLoadRef.current && initialAppSetupComplete) {
      isInitialLoadRef.current = false; 
      console.log("Popup useEffect: Initial app setup is now considered fully complete for popups (isInitialLoadRef=false).");
    }

    if (isInitialLoadRef.current || !initialAppSetupComplete ) { // Simplified: if initial setup not complete OR it's still the "first pass" for popups
        if (!userInteracted && speechSynthesis.speaking) speechSynthesis.cancel();
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        return;
    }
    console.log("Popup useEffect: Proceeding with notifications. tableData length:", tableData.length);

    let notificationProcessed = false;
    for (const mint of tableData) {
        if (playedNotificationForContractsRef.current.has(mint.contractAddress) || notificationProcessed) continue;

        if (mint.isFree && mint.analysis && mint.analysis.finalStatus === 'OK') {
            console.log(`Popup useEffect: Triggering popup for ${mint.contractAddress}`);
            setActivePopups(prev => prev.some(p => p.txHash === mint.txHash && p.logIndex === mint.logIndex) ? prev : [...prev, { ...mint, popupId: `${mint.contractAddress}-${mint.tokenId}-${Date.now()}` }]);

            if (userInteracted && soundEnabled && tableFilter === 'free') {
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
            fetch(MARK_POPUP_SEEN_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contractAddress: mint.contractAddress })
            })
            .then(response => {
                if (!response.ok) console.error(`Failed to mark popup as seen for ${mint.contractAddress} on backend.`);
                else console.log(`Popup for ${mint.contractAddress} marked as seen on backend.`);
            })
            .catch(err => console.error(`Error marking popup as seen for ${mint.contractAddress} on backend:`, err));
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableData, userInteracted, soundEnabled, tableFilter, initialAppSetupComplete]);

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
    setIsAdminLoggedIn(true);
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
  };

  const handleAdminSettingsSave = () => {
    loadAdminSettings(true); // Reload settings from backend after save attempt
    alert("Admin settings save attempt sent to server! Changes will be reflected if successful.");
  }

  const displayedLiveFreeMints = liveFreeMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const displayedLivePaidMints = livePaidMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const activeBannerLink = `${ADVERTISEMENT_TWITTER_DM_URL_BASE}${effectiveTwitterId}`;
  const visibleAds = effectiveAds.filter(ad => ad.active);


  const renderMainContent = () => {
    const processedTableDataForDisplay = getFilteredAndPaginatedTableData();

    // Diagnostic logs for table rendering (already present, good for verification)
    // console.log('[renderMainContent] Table rendering check:');
    // console.log(`  - isFetchingTableData: ${isFetchingTableData}`);
    // console.log(`  - tableDataError: ${tableDataError}`);
    // console.log(`  - tableData.length: ${tableData.length}`);
    // console.log(`  - processedTableDataForDisplay.length: ${processedTableDataForDisplay.length}`);
    // console.log(`  - Current tableFilter: ${tableFilter}`);
    // console.log(`  - Current tableItemsPerPage: ${tableItemsPerPage}`);


    const tableLoadingIndicator = (
        <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow">
            <LoadingSpinner /><p className="mt-3">Refreshing collections data...</p>
        </div>
    );

    const tableErrorIndicator = (
        <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow bg-red-900/30 border border-red-700 rounded-md p-4">
            <p className="text-red-300 font-semibold text-lg">Failed to Load Collections</p>
            <p className="text-slate-300 text-sm mt-2">{tableDataError}</p>
        </div>
    );
    
    const tableNoDataIndicator = (
        <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow">
            {tableData.length === 0 && !tableDataError && !isFetchingTableData
                ? <p>No collections from the last 24 hours found (via API).</p>
                : <p>No collections match the current "{tableFilter}" filter.</p>
            }
        </div>
    );

    return (
      <>
        {/* These general loading/error states for settings/popups are shown on top of everything if they occur */}
        { isAdminSettingsLoading && !initialAppSetupComplete && ( /* Only show if initialAppSetup is false */
          <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[200]">
              <LoadingSpinner /><p className="ml-3 text-slate-300">Loading site configuration...</p>
          </div>
        )}
        { adminSettingsError && ( /* Show error anytime */
            <div className="w-full max-w-4xl mx-auto text-center p-3 bg-red-800/60 rounded-lg shadow-lg border border-red-600 my-2 backdrop-blur-sm text-sm z-[195] relative">
                <p className="text-slate-200">{adminSettingsError}</p>
            </div>
        )}
         { isSeenPopupsLoading && !initialAppSetupComplete && ( /* Only show if initialAppSetup is false */
          <div className="fixed inset-x-0 top-1/2 transform -translate-y-1/2 bg-slate-900/80 flex items-center justify-center z-[190] p-2 text-sm">
              <LoadingSpinner /><p className="ml-2 text-slate-300">Loading popup history...</p>
          </div>
        )}
        { seenPopupsError && ( /* Show error anytime */
            <div className="w-full max-w-4xl mx-auto text-center p-2 bg-yellow-800/60 rounded-lg shadow-lg border border-yellow-600 my-1 backdrop-blur-sm text-xs z-[185] relative">
                <p className="text-slate-200">{seenPopupsError}</p>
            </div>
        )}

        {(!isAdminSettingsLoading && ADVERTISEMENT_TEXT && effectiveTwitterId) && <AdvertisementBanner text={ADVERTISEMENT_TEXT} link={activeBannerLink} />}
        {(!isAdminSettingsLoading && visibleAds.length > 0) && <NftAdvertisementPoster adList={visibleAds} />}

        {activePopups.map(mint => (
          <NewMintPopup key={mint.popupId} mint={mint} onClose={() => handlePopupClose(mint.popupId)} />
        ))}

        <main className="w-full p-4 md:p-8 flex-grow">
          {!providerOk && !isLoadingBlockchain && (
            <div className="w-full max-w-4xl mx-auto text-center p-6 bg-red-800/50 rounded-xl shadow-2xl border border-red-600 mb-6 backdrop-blur-sm">
              <h2 className="text-2xl font-semibold text-red-300 mb-3">Connection Error</h2>
              <p className="text-slate-300">{error || "Could not connect to the ApeChain network."}</p>
            </div>
          )}
          {/* isLoadingBlockchain is for the live mints service, not the table data API */ }
          {isLoadingBlockchain && ( 
            <div className="flex flex-col items-center justify-center text-center p-6 w-full max-w-4xl mx-auto mb-6">
              <LoadingSpinner />
              <p className="mt-4 text-lg text-slate-300">{providerOk ? "Connecting to ApeChain for live mints..." : "Initializing blockchain connection..."}</p>
            </div>
          )}
          {!isLoadingBlockchain && error && (
            <div className="w-full max-w-4xl mx-auto text-center p-6 bg-red-800/50 rounded-xl shadow-2xl border border-red-600 mb-6 backdrop-blur-sm">
              <h2 className="text-2xl font-semibold text-red-300 mb-3">Error Listening for Mints</h2>
              <p className="text-slate-300">{error}</p>
            </div>
          )}
          {!isLoadingBlockchain && rateLimitWarning && !error && (
            <div className="w-full max-w-4xl mx-auto text-center p-4 bg-yellow-700/40 rounded-xl shadow-2xl border border-yellow-500 mb-6 backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-yellow-300 mb-2">Live Mint Network Status</h2>
              <p className="text-slate-300 text-sm">{rateLimitWarning}</p>
            </div>
          )}
          {!isLoadingBlockchain && !error && !rateLimitWarning && displayedLiveFreeMints.length === 0 && displayedLivePaidMints.length === 0 && providerOk && (
            <div className="w-full max-w-4xl mx-auto text-center p-6 bg-slate-800/70 rounded-xl shadow-2xl mb-6 border border-slate-700 backdrop-blur-sm">
              <h2 className="text-2xl font-semibold text-sky-400 mb-3">Listening for Live Mints</h2>
              <p className="text-slate-300">No live mints detected yet.</p>
            </div>
          )}
          { /* Main content layout for live feeds and unique collections table */ }
            <div className="w-full max-w-8xl mx-auto flex flex-col md:flex-row md:space-x-6 lg:space-x-8 mt-4">
              {/* Live Feeds Column */}
              <div className="w-full md:w-2/5 lg:w-1/3 flex flex-col space-y-8 mb-8 md:mb-0">
                {!isLoadingBlockchain && /* Show live feeds only if blockchain service isn't loading */ (
                  <>
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
                  </>
                )}
              </div>
              {/* Unique Collections Table Column */}
              <div className="w-full md:w-3/5 lg:w-2/3">
                <section className="p-4 sm:p-6 bg-slate-800/70 rounded-xl shadow-2xl h-full border border-slate-700 backdrop-blur-sm flex flex-col">
                  <div className="flex flex-col sm:flex-row justify-between items-start mb-4">
                    <h2 className="text-2xl sm:text-3xl font-semibold text-teal-400 mb-3 sm:mb-0">Unique Collections <span className="text-sm text-slate-400">(Last 24h, from API)</span></h2>
                    {tableFilter === 'free' && (
                        <button onClick={toggleSound} className={`px-3 py-2 text-xs sm:text-sm rounded-lg shadow-lg ${soundEnabled ? 'bg-red-500' : 'bg-sky-500'} text-white`}>
                            Sound Alerts: {soundEnabled ? 'ON' : 'OFF'}
                        </button>
                    )}
                  </div>
                  <div className="mb-4 flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
                      <div className="flex space-x-2">
                          {(['all', 'free', 'paid'] as const).map(f => (
                              <button key={f} onClick={() => setTableFilter(f)} className={`px-3 py-1.5 text-xs rounded-md ${tableFilter === f ? 'bg-fuchsia-600' : 'bg-slate-600'}`}>
                                  {f.charAt(0).toUpperCase() + f.slice(1)}
                              </button>
                          ))}
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                          <span className="text-slate-300">Show:</span>
                          {[10, 20, 100].map(s => (
                              <button key={s} onClick={() => setTableItemsPerPage(s)} className={`px-2.5 py-1 rounded-md ${tableItemsPerPage === s ? 'bg-sky-600' : 'bg-slate-600'}`}>{s}</button>
                          ))}
                      </div>
                  </div>
                  
                  {isFetchingTableData ? tableLoadingIndicator : 
                   tableDataError ? tableErrorIndicator : 
                   processedTableDataForDisplay.length > 0 ? <div className="flex-grow"><MintsTable mints={processedTableDataForDisplay} /></div> :
                   tableNoDataIndicator
                  }
                </section>
              </div>
            </div>
        </main>
        <footer className="mt-auto text-center text-slate-500 text-xs w-full max-w-7xl mx-auto py-6 border-t border-slate-700/50">
          <div className="flex justify-between items-center px-4 sm:px-0">
              <p>&copy; {new Date().getFullYear()} {APP_TITLE}</p>
              <LiveVisitorsCounter />
          </div>
        </footer>
      </>
    );
  }; // End of renderMainContent

  const currentPageId = getPageFromHash(currentRoute);
  let contentToRender;

  const showRedirectingMessage = (message = "Loading page...") => (
    <div className="flex-grow flex flex-col items-center justify-center text-slate-300 p-8">
      <LoadingSpinner />
      <p className="ml-3 text-lg">{message}</p>
    </div>
  );

  // This outer div wrapper for contentToRender ensures it can flex and grow.
  const contentWrapper = (content: React.ReactNode) => (
    <div className="flex-grow flex flex-col w-full items-center justify-center">
        {content}
    </div>
  );

  if (!initialAppSetupComplete && !(currentPageId === CONFIG_LOGIN_PAGE_ID || currentPageId === CONFIG_PANEL_PAGE_ID)) {
    contentToRender = contentWrapper(showRedirectingMessage("Initializing ApeChain Mint Tracker..."));
  } else if (isAdminLoggedIn) {
      if (currentPageId === CONFIG_PANEL_PAGE_ID) {
          contentToRender = contentWrapper(
            <Suspense fallback={showRedirectingMessage("Loading Admin Panel...")}>
              <AdminPanel
                  onLogout={handleAdminLogout}
                  onSettingsSave={handleAdminSettingsSave}
                  currentAds={effectiveAds}
                  currentTwitterId={effectiveTwitterId}
              />
            </Suspense>
          );
      } else if (currentPageId === CONFIG_LOGIN_PAGE_ID) {
          contentToRender = contentWrapper(showRedirectingMessage("Redirecting to Admin Panel..."));
      } else {
          contentToRender = renderMainContent(); // renderMainContent itself has flex-grow on main
      }
  } else {
      if (currentPageId === CONFIG_LOGIN_PAGE_ID) {
          contentToRender = contentWrapper(
            <Suspense fallback={showRedirectingMessage("Loading Admin Login...")}>
              <AdminLogin onLoginSuccess={handleAdminLoginSuccess} />
            </Suspense>
          );
      } else if (currentPageId === CONFIG_PANEL_PAGE_ID) {
          contentToRender = contentWrapper(showRedirectingMessage("Redirecting to Admin Login..."));
      } else {
          contentToRender = renderMainContent(); // renderMainContent itself has flex-grow on main
      }
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-slate-100 flex flex-col items-center selection:bg-fuchsia-500 selection:text-white flex-grow">
      <header className="app-main-header flex justify-between items-center px-4">
          <div></div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-fuchsia-500 to-indigo-600 pb-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
            {APP_TITLE}
          </h1>
          <a href={`#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`} className="text-sm text-slate-300 hover:text-sky-400 transition-colors">
            Site Config
          </a>
      </header>
      {/* Ensure the container for contentToRender allows it to grow */}
      <div className="flex-grow flex flex-col w-full">
         {contentToRender}
      </div>
    </div>
  );
};

export default App;