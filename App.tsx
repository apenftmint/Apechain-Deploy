
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatUnits } from 'ethers';
import { MintData, CollectionAnalysisResult, FinalCollectionStatus } from './types';
import { blockchainService } from './services/blockchainService';
import { CollectionAnalyzerService } from './services/collectionAnalyzerService';
import MintCard from './components/MintCard';
import LoadingSpinner from './components/LoadingSpinner';
import MintsTable from './components/MintsTable';
import AdvertisementBanner from './components/AdvertisementBanner';
import NftAdvertisementPoster from './components/NftAdvertisementPoster';
import NewMintPopup from './components/NewMintPopup';
import LiveVisitorsCounter from './components/LiveVisitorsCounter';
import AdminLogin from './components/admin/AdminLogin';
import AdminPanel from './components/admin/AdminPanel';
import './index.css';
import { 
  MAX_DISPLAY_MINTS, 
  APP_TITLE, 
  LOCAL_STORAGE_KEY,
  PUBLIC_APECHAIN_HTTP_RPC_URLS, 
  ANALYSIS_CACHE_DURATION_MS,
  ANALYSIS_RESULTS_CACHE_KEY, 
  TABLE_DATA_CACHE_KEY, 
  APE_COIN_DECIMALS,
  LIVE_FREE_MINTS_CACHE_KEY,
  LIVE_PAID_MINTS_CACHE_KEY,
  ADVERTISEMENT_TEXT,
  DEFAULT_ADVERTISEMENT_TWITTER_USER_ID,
  ADVERTISEMENT_TWITTER_DM_URL_BASE,
  DEFAULT_NFT_ADVERTISEMENTS_LIST,
  NftAdDetails,
  calculateBodyPaddingTop,
  MAX_DISPLAY_MINTS_FOR_LIVE_FEED,
  INITIAL_TABLE_COLLECTIONS_TO_PROCESS,
  ADMIN_SESSION_KEY,
  PAGE_QUERY_PARAM,
  CONFIG_LOGIN_PAGE_ID,
  CONFIG_PANEL_PAGE_ID,
  SETTINGS_API_ENDPOINT,
  SEEN_POPUPS_API_ENDPOINT,
  MARK_POPUP_SEEN_API_ENDPOINT,
  VALID_ACCENT_COLORS,
  USE_PLACEHOLDER_IMAGE_URL
} from './constants';

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
  const [allTimeMints, setAllTimeMints] = useState<MintData[]>([]); 
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);
  const [providerOk, setProviderOk] = useState<boolean>(false);
  
  const [userInteracted, setUserInteracted] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false); 

  const [tableData, setTableData] = useState<AppTableDisplayMintData[]>([]);
  const [tableFilter, setTableFilter] = useState<'all' | 'free' | 'paid'>('all'); 
  const [isFetchingTableData, setIsFetchingTableData] = useState<boolean>(false);
  const [tableItemsPerPage, setTableItemsPerPage] = useState<number>(10);

  const [activePopups, setActivePopups] = useState<PopupMintData[]>([]);

  const isInitialLoadRef = useRef(true); 
  const firstDataLoadCompleteRef = useRef(false); 
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const playedNotificationForContractsRef = useRef(new Set<string>()); 

  const collectionAnalyzerRef = useRef<CollectionAnalyzerService | null>(null);
  const analysisCacheRef = useRef<Map<string, { result: CollectionAnalysisResult; timestamp: number; tokenIdsHash: string }>>(new Map());
  const [analysisStatusMap, setAnalysisStatusMap] = useState<Map<string, 'pending' | 'analyzing' | 'done' | 'error'>>(new Map());

  const [currentRoute, setCurrentRoute] = useState<string>(window.location.hash || '#/');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);
  
  const [effectiveTwitterId, setEffectiveTwitterId] = useState<string>(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);
  const [effectiveAds, setEffectiveAds] = useState<NftAdDetails[]>(DEFAULT_NFT_ADVERTISEMENTS_LIST);
  const [isAdminSettingsLoading, setIsAdminSettingsLoading] = useState<boolean>(true);
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(null);

  const [isSeenPopupsLoading, setIsSeenPopupsLoading] = useState<boolean>(true);
  const [seenPopupsError, setSeenPopupsError] = useState<string | null>(null);


  const loadAdminSettings = useCallback(async (isRetry = false) => {
    if (!isRetry) { 
        setIsAdminSettingsLoading(true);
        setAdminSettingsError(null);
    }
    try {
        const response = await fetch(SETTINGS_API_ENDPOINT);
        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`Admin settings API error: ${response.status} ${response.statusText}`, errorText);
            if (response.status === 404) { 
                setEffectiveTwitterId(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);
                setEffectiveAds(DEFAULT_NFT_ADVERTISEMENTS_LIST);
                // No error displayed to user for 404, just use defaults
            } else {
                 throw new Error(`Failed to fetch admin settings: ${response.status} ${response.statusText}. Response: ${errorText.substring(0,200)}`);
            }
        } else {
            const adminSettings: Partial<AdminSettings> = await response.json();
            setEffectiveTwitterId(adminSettings.twitterUserId || DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);

            if (adminSettings.ads && Array.isArray(adminSettings.ads) && adminSettings.ads.length > 0) {
                const sanitizedAds: NftAdDetails[] = adminSettings.ads.map((adFromBackend, index): NftAdDetails => {
                    const defaultAdForSlot = DEFAULT_NFT_ADVERTISEMENTS_LIST.find(
                        dAd => dAd.id === (adFromBackend.id || `ad_slot_${index + 1}`)
                    ) || DEFAULT_NFT_ADVERTISEMENTS_LIST[0] || {} as NftAdDetails;

                    let validatedAccentColor = defaultAdForSlot.accentColor || 'sky';
                    if (adFromBackend.accentColor && VALID_ACCENT_COLORS.includes(adFromBackend.accentColor as any)) {
                        validatedAccentColor = adFromBackend.accentColor as NftAdDetails['accentColor'];
                    }

                    return {
                        id: adFromBackend.id || defaultAdForSlot.id || `admin_ad_slot_${index}`, 
                        name: adFromBackend.name || defaultAdForSlot.name || 'Untitled Ad',
                        supply: adFromBackend.supply || defaultAdForSlot.supply || 'N/A',
                        price: adFromBackend.price || defaultAdForSlot.price || 'N/A',
                        imageUrl: adFromBackend.imageUrl || defaultAdForSlot.imageUrl || USE_PLACEHOLDER_IMAGE_URL,
                        mintLink: adFromBackend.mintLink || defaultAdForSlot.mintLink || '#',
                        accentColor: validatedAccentColor,
                        active: typeof adFromBackend.active === 'boolean' ? adFromBackend.active : (defaultAdForSlot.active !== undefined ? defaultAdForSlot.active : true),
                    };
                });
                setEffectiveAds(sanitizedAds);
            } else {
                setEffectiveAds(DEFAULT_NFT_ADVERTISEMENTS_LIST);
            }
        }
    } catch (e: any) {
        console.error("Failed to fetch or parse admin settings:", e.message);
        setAdminSettingsError(`Could not load site configuration: ${e.message.substring(0,150)}. Using defaults.`);
        setEffectiveTwitterId(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID); 
        setEffectiveAds(DEFAULT_NFT_ADVERTISEMENTS_LIST);
    } finally {
        if (!isRetry) setIsAdminSettingsLoading(false);
    }
  }, []);
  
  const loadSeenPopups = useCallback(async () => {
    setIsSeenPopupsLoading(true);
    setSeenPopupsError(null);
    try {
        const response = await fetch(SEEN_POPUPS_API_ENDPOINT);
        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`Seen popups API error: ${response.status} ${response.statusText}`, errorText);
            if (response.status === 404) { 
                playedNotificationForContractsRef.current = new Set<string>();
            } else {
                throw new Error(`Failed to fetch seen popups: ${response.status} ${response.statusText}. Response: ${errorText.substring(0,200)}`);
            }
        } else {
            const seenContracts: string[] = await response.json();
            playedNotificationForContractsRef.current = new Set(seenContracts);
        }
    } catch (e: any) {
        console.error("Failed to fetch or parse seen popups:", e.message);
        setSeenPopupsError(`Could not load popup history: ${e.message.substring(0,150)}. Popups may re-appear.`);
        playedNotificationForContractsRef.current = new Set<string>(); 
    } finally {
        setIsSeenPopupsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialHash = window.location.hash || '#/';
    setCurrentRoute(initialHash); 
    loadAdminSettings(); 
    loadSeenPopups();
    const loggedIn = localStorage.getItem(ADMIN_SESSION_KEY) === 'true';
    setIsAdminLoggedIn(loggedIn);

    const handleHashChange = () => {
      setCurrentRoute(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [loadAdminSettings, loadSeenPopups]); 

  useEffect(() => {
    const pageId = getPageFromHash(currentRoute);
    let newHashTarget: string | null = null;

    if (pageId === CONFIG_LOGIN_PAGE_ID && isAdminLoggedIn) {
        newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_PANEL_PAGE_ID}`;
    } else if (pageId === CONFIG_PANEL_PAGE_ID && !isAdminLoggedIn) {
        newHashTarget = `#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`;
    }

    if (newHashTarget && newHashTarget !== window.location.hash) {
        window.location.hash = newHashTarget;
    }

    document.body.style.paddingTop = `${calculateBodyPaddingTop(effectiveTwitterId, effectiveAds)}px`;

  }, [currentRoute, isAdminLoggedIn, effectiveAds, effectiveTwitterId]);

  useEffect(() => {
    if (!collectionAnalyzerRef.current) {
        collectionAnalyzerRef.current = new CollectionAnalyzerService(PUBLIC_APECHAIN_HTTP_RPC_URLS); 
    }

    try {
      const storedAllTimeMintsRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedAllTimeMintsRaw) setAllTimeMints(JSON.parse(storedAllTimeMintsRaw).sort((a:MintData,b:MintData) => b.timestamp - a.timestamp));
      
      const storedLiveFreeMintsRaw = localStorage.getItem(LIVE_FREE_MINTS_CACHE_KEY);
      if (storedLiveFreeMintsRaw) setLiveFreeMints(JSON.parse(storedLiveFreeMintsRaw).sort((a:MintData,b:MintData) => b.timestamp - a.timestamp).slice(0, MAX_DISPLAY_MINTS));

      const storedLivePaidMintsRaw = localStorage.getItem(LIVE_PAID_MINTS_CACHE_KEY);
      if (storedLivePaidMintsRaw) setLivePaidMints(JSON.parse(storedLivePaidMintsRaw).sort((a:MintData,b:MintData) => b.timestamp - a.timestamp).slice(0, MAX_DISPLAY_MINTS));
      
      const storedAnalysisCacheRaw = localStorage.getItem(ANALYSIS_RESULTS_CACHE_KEY);
      if (storedAnalysisCacheRaw) analysisCacheRef.current = new Map(JSON.parse(storedAnalysisCacheRaw));

      const storedTableDataRaw = localStorage.getItem(TABLE_DATA_CACHE_KEY);
      if (storedTableDataRaw) setTableData(JSON.parse(storedTableDataRaw));

      const storedSoundPref = localStorage.getItem('apechainSoundEnabledPreference_v3'); 
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

 const handleNewMint = useCallback((newMint: MintData) => {
    const processMints = (prevMints: MintData[], storageKey: string): MintData[] => {
        const isDuplicateLive = prevMints.some(m => m.txHash === newMint.txHash && m.logIndex === newMint.logIndex);
        if (isDuplicateLive) return prevMints;

        let updated = [newMint, ...prevMints]
            .sort((a,b) => b.timestamp - a.timestamp)
            .slice(0, MAX_DISPLAY_MINTS); 
        
        try { localStorage.setItem(storageKey, JSON.stringify(updated)); } 
        catch (e) { console.error(`Error saving ${storageKey} to localStorage:`, e); }
        return updated;
    };

    if (newMint.isFree) {
        setLiveFreeMints(prevMints => processMints(prevMints, LIVE_FREE_MINTS_CACHE_KEY));
    } else {
        setLivePaidMints(prevMints => processMints(prevMints, LIVE_PAID_MINTS_CACHE_KEY));
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
    setError(null); 
  }, []);

  const handleSetupComplete = useCallback(() => setIsLoading(false), []);

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
    initService();
    return () => {
      blockchainService.stopListeningForMints();
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    };
  }, [handleNewMint, handleError, handleSetupComplete]);

  const createTokenIdsHash = (tokenIds: string[]): string => tokenIds.sort().join(',');

 useEffect(() => {
    const prepareTableData = async () => {
        if (!collectionAnalyzerRef.current || (allTimeMints.length === 0 && tableData.length === 0 && !isLoading)) {
            if (allTimeMints.length === 0) setTableData([]);
            setIsFetchingTableData(false);
            if (isInitialLoadRef.current) firstDataLoadCompleteRef.current = true;
            return;
        }
        setIsFetchingTableData(true);
        const twentyFourHoursAgoUnix = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        const mintsByContract = new Map<string, MintData[]>(); 
        allTimeMints.forEach(mint => {
            if (!mintsByContract.has(mint.contractAddress)) mintsByContract.set(mint.contractAddress, []);
            mintsByContract.get(mint.contractAddress)!.push(mint);
        });
        const uniqueCollectionsMap = new Map<string, MintData>(); 
        mintsByContract.forEach((mintsInContract, contractAddress) => {
            const latestMint = mintsInContract.sort((a,b) => b.timestamp - a.timestamp)[0];
            if (latestMint.timestamp >= twentyFourHoursAgoUnix) uniqueCollectionsMap.set(contractAddress, latestMint);
        });
        
        let initialFilteredReps = Array.from(uniqueCollectionsMap.values())
            .sort((a,b) => b.timestamp - a.timestamp)
            .slice(0, INITIAL_TABLE_COLLECTIONS_TO_PROCESS);

        if (initialFilteredReps.length === 0 && tableData.length === 0) { 
            setTableData([]); setIsFetchingTableData(false);
            if (isInitialLoadRef.current) firstDataLoadCompleteRef.current = true;
            return;
        }
        
        const newAnalysisStatusMap = new Map(analysisStatusMap);
        const analysisPromises: Promise<AppTableDisplayMintData>[] = initialFilteredReps.map(mintRep => {
            const contractAddress = mintRep.contractAddress;
            const allTokenIdsForContract = (mintsByContract.get(contractAddress) || []).map(m => m.tokenId); 
            if (allTokenIdsForContract.length === 0) return Promise.resolve(null as unknown as AppTableDisplayMintData); 

            const currentTokenIdsHash = createTokenIdsHash(allTokenIdsForContract);
            const cached = analysisCacheRef.current.get(contractAddress);
            const mintPriceApe = mintRep.isFree || !mintRep.valueWei ? undefined : parseFloat(formatUnits(mintRep.valueWei, APE_COIN_DECIMALS)).toFixed(4);

            if (cached && (Date.now() - cached.timestamp < ANALYSIS_CACHE_DURATION_MS) && cached.tokenIdsHash === currentTokenIdsHash) {
                return Promise.resolve({ ...mintRep, totalContractMints: mintsByContract.get(contractAddress)?.length || 0, analysis: cached.result, displayStatus: cached.result.finalStatus, mintPriceApe });
            }
            newAnalysisStatusMap.set(contractAddress, 'analyzing');
            return collectionAnalyzerRef.current!.analyzeCollection(contractAddress, allTokenIdsForContract, mintRep.tokenId)
                .then(analysisResult => {
                    analysisCacheRef.current.set(contractAddress, { result: analysisResult, timestamp: Date.now(), tokenIdsHash: currentTokenIdsHash });
                    localStorage.setItem(ANALYSIS_RESULTS_CACHE_KEY, JSON.stringify(Array.from(analysisCacheRef.current.entries())));
                    newAnalysisStatusMap.set(contractAddress, 'done');
                    return { ...mintRep, totalContractMints: mintsByContract.get(contractAddress)?.length || 0, analysis: analysisResult, displayStatus: analysisResult.finalStatus, mintPriceApe };
                }).catch(err => {
                    console.error(`Error analyzing ${contractAddress}:`, err);
                    newAnalysisStatusMap.set(contractAddress, 'error');
                    return { ...mintRep, totalContractMints: mintsByContract.get(contractAddress)?.length || 0, analysis: undefined, displayStatus: 'ErrorAnalyzing' as FinalCollectionStatus, mintPriceApe };
                });
        }).filter(p => p !== null);
        
        setAnalysisStatusMap(newAnalysisStatusMap);
        const results = (await Promise.all(analysisPromises)).filter(r => r !== null);
        const finalData = results.sort((a,b) => b.timestamp - a.timestamp);
        setTableData(finalData);
        localStorage.setItem(TABLE_DATA_CACHE_KEY, JSON.stringify(finalData));
        setIsFetchingTableData(false); 
        if (isInitialLoadRef.current) firstDataLoadCompleteRef.current = true;
    };
    const timeoutId = setTimeout(prepareTableData, 500);
    return () => clearTimeout(timeoutId);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [allTimeMints, isLoading]);


 useEffect(() => {
    setTableData(prevTableData => prevTableData.map((item): AppTableDisplayMintData => { 
        const status = analysisStatusMap.get(item.contractAddress);
        const cachedAnalysisItem = analysisCacheRef.current.get(item.contractAddress);
        const cachedAnalysis = cachedAnalysisItem?.result;
        let newDisplayStatus = item.displayStatus, newAnalysis = item.analysis;
        if (status === 'analyzing' && item.displayStatus !== 'Analyzing...') { newDisplayStatus = 'Analyzing...'; newAnalysis = undefined; }
        else if (status === 'done' && cachedAnalysis) { newDisplayStatus = cachedAnalysis.finalStatus; newAnalysis = cachedAnalysis; }
        else if (status === 'error' && item.displayStatus !== 'ErrorAnalyzing') { newDisplayStatus = 'ErrorAnalyzing'; newAnalysis = undefined; }
        return { ...item, analysis: newAnalysis, displayStatus: newDisplayStatus };
    }).sort((a,b) => b.timestamp - a.timestamp));
 }, [analysisStatusMap]);

 useEffect(() => {
    if (isInitialLoadRef.current && firstDataLoadCompleteRef.current) isInitialLoadRef.current = false; 
    if (!firstDataLoadCompleteRef.current || isInitialLoadRef.current || isSeenPopupsLoading) { 
        if (!userInteracted && speechSynthesis.speaking) speechSynthesis.cancel(); 
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        return;
    }
    let notificationProcessed = false; 
    for (const mint of tableData) {
        if (playedNotificationForContractsRef.current.has(mint.contractAddress) || notificationProcessed) continue;
        if (mint.isFree && mint.analysis?.finalStatus === 'OK') { 
            setActivePopups(prev => prev.some(p => p.txHash === mint.txHash && p.logIndex === mint.logIndex) ? prev : [...prev, { ...mint, popupId: `${mint.contractAddress}-${mint.tokenId}-${Date.now()}` }]);
            if (userInteracted && soundEnabled && tableFilter === 'free') {
                const name = (mint.analysis?.collectionNameFromAnalyzer?.replace(/unknown|unnamed/i,'').trim()) || mint.collectionName.replace(/unknown|unnamed/i,'').trim() || `collection ${mint.contractAddress.slice(0,6)}`;
                const text = `Hey, ${name} looks okay and is a free mint. Check it out!`;
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
  }, [tableData, userInteracted, soundEnabled, tableFilter, isSeenPopupsLoading]); 

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
    localStorage.setItem('apechainSoundEnabledPreference_v3', String(newSoundEnabled)); 
    if (!newSoundEnabled && speechSynthesis.speaking) speechSynthesis.cancel(); 
  };

  const getFilteredAndPaginatedTableData = () => {
    let filteredData = tableData;
    if (tableFilter === 'free') filteredData = tableData.filter(mint => mint.isFree);
    else if (tableFilter === 'paid') filteredData = tableData.filter(mint => !mint.isFree);
    return filteredData.slice(0, tableItemsPerPage); 
  };
  
  const handleAdminLoginSuccess = () => {
    setIsAdminLoggedIn(true);
    loadAdminSettings(true); 
    if (getPageFromHash(window.location.hash) === CONFIG_LOGIN_PAGE_ID) {
      window.location.hash = `#/?${PAGE_QUERY_PARAM}=${CONFIG_PANEL_PAGE_ID}`;
    } else {
      setCurrentRoute(window.location.hash || '#/'); 
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setIsAdminLoggedIn(false);
    loadAdminSettings(true); 
    if (getPageFromHash(window.location.hash) === CONFIG_PANEL_PAGE_ID) {
      window.location.hash = `#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`;
    } else {
      window.location.hash = '#/'; 
    }
  };
  
  const handleAdminSettingsSave = () => {
    loadAdminSettings(true); 
    alert("Admin settings save attempt sent to server! Changes will be reflected if successful.");
  }

  const displayedLiveFreeMints = liveFreeMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const displayedLivePaidMints = livePaidMints.slice(0, MAX_DISPLAY_MINTS_FOR_LIVE_FEED);
  const activeBannerLink = `${ADVERTISEMENT_TWITTER_DM_URL_BASE}${effectiveTwitterId}`;
  const visibleAds = effectiveAds.filter(ad => ad.active);


  const renderMainContent = () => (
    <>
      { isAdminSettingsLoading && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[200]">
            <LoadingSpinner /><p className="ml-3 text-slate-300">Loading site configuration...</p>
        </div>
      )}
      { adminSettingsError && (
          <div className="w-full max-w-4xl mx-auto text-center p-3 bg-red-800/60 rounded-lg shadow-lg border border-red-600 my-2 backdrop-blur-sm text-sm">
              <p className="text-slate-200">{adminSettingsError}</p>
          </div>
      )}
       { isSeenPopupsLoading && (
        <div className="fixed inset-x-0 top-1/2 transform -translate-y-1/2 bg-slate-900/50 flex items-center justify-center z-[190] p-2 text-sm">
            <LoadingSpinner /><p className="ml-2 text-slate-300">Loading popup history...</p>
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

      <main className="w-full p-4 md:p-8 flex-grow">
        {!providerOk && !isLoading && (
          <div className="w-full max-w-4xl mx-auto text-center p-6 bg-red-800/50 rounded-xl shadow-2xl border border-red-600 mb-6 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold text-red-300 mb-3">Connection Error</h2>
            <p className="text-slate-300">{error || "Could not connect to the ApeChain network."}</p>
          </div>
        )}
        {isLoading && (
          <div className="flex flex-col items-center justify-center text-center p-6 w-full max-w-4xl mx-auto mb-6">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-slate-300">{providerOk ? "Connecting to ApeChain..." : "Initializing..."}</p>
          </div>
        )}
        {!isLoading && error && (
          <div className="w-full max-w-4xl mx-auto text-center p-6 bg-red-800/50 rounded-xl shadow-2xl border border-red-600 mb-6 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold text-red-300 mb-3">Error</h2>
            <p className="text-slate-300">{error}</p>
          </div>
        )}
        {!isLoading && rateLimitWarning && !error && (
          <div className="w-full max-w-4xl mx-auto text-center p-4 bg-yellow-700/40 rounded-xl shadow-2xl border border-yellow-500 mb-6 backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-yellow-300 mb-2">Network Status</h2>
            <p className="text-slate-300 text-sm">{rateLimitWarning}</p>
          </div>
        )}
        {!isLoading && !error && !rateLimitWarning && displayedLiveFreeMints.length === 0 && displayedLivePaidMints.length === 0 && providerOk && allTimeMints.length === 0 && (
          <div className="w-full max-w-4xl mx-auto text-center p-6 bg-slate-800/70 rounded-xl shadow-2xl mb-6 border border-slate-700 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold text-sky-400 mb-3">Listening for Mints</h2>
            <p className="text-slate-300">No mints detected yet.</p>
          </div>
        )}

        { !isLoading && (
          <div className="w-full max-w-8xl mx-auto flex flex-col md:flex-row md:space-x-6 lg:space-x-8 mt-4">
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
              {providerOk && (
                <section className="p-4 sm:p-6 bg-slate-800/70 rounded-xl shadow-2xl h-full border border-slate-700 backdrop-blur-sm flex flex-col">
                  <div className="flex flex-col sm:flex-row justify-between items-start mb-4">
                    <h2 className="text-2xl sm:text-3xl font-semibold text-teal-400 mb-3 sm:mb-0">Unique Collections <span className="text-sm text-slate-400">(Last 24h)</span></h2>
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
                  {isFetchingTableData && getFilteredAndPaginatedTableData().length === 0 && ( 
                      <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow"><LoadingSpinner /><p className="mt-3">Analyzing collections...</p></div>
                  )}
                  {(!isFetchingTableData || getFilteredAndPaginatedTableData().length > 0) && ( 
                    <div className="flex-grow"><MintsTable mints={getFilteredAndPaginatedTableData()} /></div>
                  )}
                  {!isFetchingTableData && getFilteredAndPaginatedTableData().length === 0 && (
                    <div className="text-center py-8 h-full flex flex-col items-center justify-center flex-grow">
                      <p>{allTimeMints.length > 0 ? `No collections for "${tableFilter}" filter.` : "No mints recorded."}</p>
                    </div>
                  )}
                </section>
              )}
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
  
  const currentPageId = getPageFromHash(currentRoute);
  let contentToRender;

  const showRedirectingMessage = () => (
    <div className="flex-grow flex items-center justify-center text-slate-300 p-8">
      <LoadingSpinner />
      <p className="ml-3 text-lg">Loading page...</p>
    </div>
  );

  if (isAdminLoggedIn) {
    if (currentPageId === CONFIG_PANEL_PAGE_ID) {
      contentToRender = <AdminPanel 
                          onLogout={handleAdminLogout} 
                          onSettingsSave={handleAdminSettingsSave}
                          currentAds={effectiveAds} 
                          currentTwitterId={effectiveTwitterId} 
                        />;
    } else if (currentPageId === CONFIG_LOGIN_PAGE_ID) {
      contentToRender = showRedirectingMessage();
    } else {
      contentToRender = renderMainContent();
    }
  } else { 
    if (currentPageId === CONFIG_LOGIN_PAGE_ID) {
      contentToRender = <AdminLogin onLoginSuccess={handleAdminLoginSuccess} />;
    } else if (currentPageId === CONFIG_PANEL_PAGE_ID) {
      contentToRender = showRedirectingMessage();
    } else {
      contentToRender = renderMainContent();
    }
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-slate-100 flex flex-col items-center selection:bg-fuchsia-500 selection:text-white flex-grow">
      <header className="app-main-header flex justify-between items-center px-4">
          <div></div> {/* Spacer */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-fuchsia-500 to-indigo-600 pb-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
            {APP_TITLE}
          </h1>
          <a href={`#/?${PAGE_QUERY_PARAM}=${CONFIG_LOGIN_PAGE_ID}`} className="text-sm text-slate-300 hover:text-sky-400 transition-colors">
            Site Config
          </a>
      </header>
      
      {contentToRender}

    </div>
  );
};

export default App;