
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
    LOCAL_STORAGE_KEY, // Still used for allTimeMints backup
    LIVE_FREE_MINTS_CACHE_KEY, // Used for live free mints feed
    LIVE_PAID_MINTS_CACHE_KEY,  // Used for live paid mints feed
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

  const [isLoading, setIsLoading] = useState<boolean>(true); // For blockchain service connection
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

  const isInitialLoadRef = useRef(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const playedNotificationForContractsRef = useRef(new Set<string>());

  const [currentRoute, setCurrentRoute] = useState<string>(window.location.hash || '#/');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false); // Initialize to false

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
        if (!isRefresh) setIsAdminSettingsLoading(false);
        console.log("loadAdminSettings finished. isAdminSettingsLoading (if not refresh):", isRefresh ? "N/A (refresh)" : false);
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
        setIsSeenPopupsLoading(false);
        console.log("loadSeenPopups finished. isSeenPopupsLoading:", false);
    }
  }, []);

  const fetchUniqueCollectionsTableData = useCallback(async () => {
    setIsFetchingTableData(true);
    setTableDataError(null); // Clear previous errors
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
        setTableData([]); // Ensure table data is cleared on error
    } finally {
        setIsFetchingTableData(false);
        console.log("fetchUniqueCollectionsTableData (API) finished. isFetchingTableData:", false);
    }
  }, []);

  useEffect(() => {
    const initialHash = window.location.hash || '#/';
    setCurrentRoute(initialHash);

    const loadAllInitialData = async () => {
        console.log("loadAllInitialData: Starting all initial fetches.");
        await Promise.allSettled([
            loadAdminSettings(),
            loadSeenPopups(),
            fetchUniqueCollectionsTableData()
        ]);
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
  }, []); 

  useEffect(() => {
    document.body.style.paddingTop = `${calculateBodyPaddingTop(effectiveTwitterId, effectiveAds)}px`;
  }, [effectiveAds, effectiveTwitterId, currentRoute]); // Re-calculate if route changes, as config pages have different padding

  useEffect(() => {
    const pageId = getPageFromHash(currentRoute);
    console.log(`[App Routing Check] Current Route: ${currentRoute}, Page ID: ${pageId}, IsAdminLoggedIn: ${isAdminLoggedIn}, InitialSetupComplete: ${initialAppSetupComplete}`);

    if (!initialAppSetupComplete) {
      console.log("[App Routing Check] Initial setup not complete. Skipping routing logic.");
      return; 
    }

    let newHashTarget: string | null = null;

    if (pageId === CONFIG_LOGIN_PAGE_ID && isAdminLoggedIn) {
        newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_PANEL_PAGE_ID}`;
        console.log(`[App Routing Logic] Admin logged in, on login page. Redirecting to panel: ${newHashTarget}`);
    } else if (pageId === CONFIG_PANEL_PAGE_ID && !isAdminLoggedIn) {
        newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`;
        console.log(`[App Routing Logic] Admin NOT logged in, on panel page. Redirecting to login: ${newHashTarget}`);
    }

    if (newHashTarget && newHashTarget !== window.location.hash) {
        console.log(`[App Routing Action] Changing hash to: ${newHashTarget}`);
        window.location.hash = newHashTarget;
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
    console.log("[handleAdminLoginSuccess] Called. Setting isAdminLoggedIn to true.");
    localStorage.setItem("isAdminLoggedInApeChain", "true"); // Persist login for refresh
    setIsAdminLoggedIn(true);
  };

  const handleAdminLogout = () => {
    console.log("[handleAdminLogout] Called. Setting isAdminLoggedIn to false.");
    localStorage.removeItem("isAdminLoggedInApeChain"); // Clear persisted login
    setIsAdminLoggedIn(false);
  };

  const handleAdminSettingsSave = () => {
    loadAdminSettings(true); 
    alert("Admin settings save attempt sent to server! Changes will be reflected if successful.");
  }

  const displayedLiveFreeMints = liveFreeMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const displayedLivePaidMints = livePaidMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const activeBannerLink = `${ADVERTISEMENT_TWITTER_DM_URL_BASE}${effectiveTwitterId}`;
  const visibleAds = effectiveAds.filter(ad => ad.active);


  const renderMainContent = () => {
    const currentTableDisplayData = getFilteredAndPaginatedTableData();
    const currentTableDisplayDataLength = currentTableDisplayData.length;

    console.log(`[App Render MainContent] Conditions: isFetchingTableData=${isFetchingTableData}, tableDataError=${!!tableDataError}, currentTableDisplayDataLength=${currentTableDisplayDataLength}, tableData.length=${tableData.length}, initialAppSetupComplete=${initialAppSetupComplete}`);

    let tableSectionContent;
    if (isFetchingTableData && (!initialAppSetupComplete || currentTableDisplayDataLength === 0)) {
        tableSectionContent = (
            <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow">
                <LoadingSpinner />
                <p className="mt-3 text-slate-300">
                    {initialAppSetupComplete ? "Refreshing collections data..." : "Loading unique collections..."}
                </p>
            </div>
        );
    } else if (tableDataError) {
        tableSectionContent = (
            <div className="w-full max-w-4xl mx-auto text-center p-4 bg-red-800/60 rounded-lg shadow-lg border border-red-600 my-2 backdrop-blur-sm text-sm">
                <h2 className="font-semibold text-red-200 mb-1">Failed to Load Collections</h2>
                <p className="text-slate-200">{tableDataError}</p>
            </div>
        );
    } else if (currentTableDisplayDataLength > 0) {
        tableSectionContent = <div className="flex-grow"><MintsTable mints={currentTableDisplayData} /></div>;
    } else { 
        tableSectionContent = (
            <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow">
                <p className="text-slate-300">
                {tableData.length === 0 
                    ? "No collections from the last 24 hours found (via API)."
                    : `No collections match the current "${tableFilter}" filter.`
                }
                </p>
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

      <main className="w-full p-4 md:p-8 flex-grow max-w-8xl mx-auto">
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
          <div className="w-full flex flex-col md:flex-row md:space-x-6 lg:space-x-8 mt-4">
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
            <div className="w-full md:w-3/5 lg:w-2/3">
              <section className="p-4 sm:p-6 bg-slate-800/70 rounded-xl shadow-2xl h-full border border-slate-700 backdrop-blur-sm flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-teal-400 mb-3 sm:mb-0">Unique Collections <span className="text-sm text-slate-400">(Last 24h, from API)</span></h2>
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
                    <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow"><p className="text-slate-400">Blockchain service not connected. Table data unavailable.</p></div>
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
    if (isAdminSettingsLoading && !isSeenPopupsLoading && !isFetchingTableData && !isLoading) loadingMessage = "Loading site configuration...";
    else if (isSeenPopupsLoading && !isFetchingTableData && !isLoading) loadingMessage = "Loading popup history...";
    else if (isFetchingTableData && !isLoading ) loadingMessage = "Loading unique collections data...";
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
      <header className="fixed top-0 left-0 right-0 z-[100] bg-slate-900/80 backdrop-blur-md flex justify-between items-center px-4 sm:px-6 py-3 shadow-lg" style={{height: '60px'}}> {/* Matches body padding-top */}
          <div></div> {/* Spacer for justify-content: space-between */}
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-fuchsia-500 to-indigo-600 pb-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
            {APP_TITLE}
          </h1>
          <a href={`#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`} className="text-xs sm:text-sm text-slate-300 hover:text-sky-400 transition-colors px-2 py-1 rounded hover:bg-slate-700/50">
            Site Config
          </a>
      </header>
      
      <div className="flex-grow w-full flex flex-col" style={{ paddingTop: '60px' }}> {/* This ensures content starts below fixed header */}
        {contentToRender}
      </div>

    </div>
  );
};

export default App;