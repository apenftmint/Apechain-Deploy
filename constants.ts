
export const APP_TITLE = "ApeChain Live NFT Mints";

// --- Public RPC Configuration for ApeChain Network ---
export const PUBLIC_APECHAIN_HTTP_RPC_URLS = [
  'https://rpc.apechain.com/http',
  'https://apechain.calderachain.xyz/http',
  'https://33139.rpc.thirdweb.com', 
  'https://apechain.drpc.org',
  'https://node.histori.xyz/apechain-mainnet/8ry9f6t9dct1se2hlagxnd9n2a',
  'https://apechain-mainnet.public.blastapi.io',
];

export const PUBLIC_APECHAIN_WSS_RPC_URLS = [
  'wss://rpc.apechain.com/ws',
  'wss://apechain.calderachain.xyz/ws',
  'wss://apechain.drpc.org',
  'wss://rpc.curtis.apechain.com/ws',
];

export const APECHAIN_EXPLORER_URL = "https://apechain.calderaexplorer.xyz";
export const APE_COIN_DECIMALS = 18;

// --- Marketplace URL Prefixes ---
export const APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX = "https://magiceden.io/collections/apechain/";


// Maximum block range for eth_getLogs requests
export const GETLOGS_MAX_BLOCK_RANGE = 499; 

// --- Retry Logic Configuration ---
export const RETRY_ATTEMPTS = 3; 
export const RETRY_DELAY_MS = 1000; 

// --- Blockchain & Contract Constants ---
export const ERC721_TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const ERC721_INTERFACE_ID = '0x80ac58cd';
export const ERC165_ABI = [
  "function supportsInterface(bytes4 interfaceId) external view returns (bool)"
];
export const MINIMAL_ERC721_ABI = [
  "function name() public view returns (string)",
  "function symbol() public view returns (string)",
];
export const ERC721_METADATA_ABI = [
  "function name() public view returns (string)",
  "function symbol() public view returns (string)",
  "function tokenURI(uint256 tokenId) external view returns (string)"
];


export const MAX_TOKEN_ID = 10000; 
export const MAX_DISPLAY_MINTS = 100; // Max items in the live mint arrays in state (liveFreeMints, livePaidMints)
export const MAX_DISPLAY_MINTS_FOR_LIVE_FEED = 50; // Max items to *show* in the UI for live feeds.
/** @deprecated The 30-second window concept for live feeds has been replaced by MAX_DISPLAY_MINTS_FOR_LIVE_FEED. */
export const LIVE_MINT_DISPLAY_WINDOW_SECONDS = 30; 

// --- Scan Duration Configuration ---
export const BLOCKS_PER_MINUTE_ESTIMATE = 30; 
export const SCAN_DURATION_MINUTES = 0; 

// --- Local Storage (for non-shared data) ---
export const LOCAL_STORAGE_KEY = 'apechainNftMintTrackerData_v4';
export const LIVE_FREE_MINTS_CACHE_KEY = 'apechainLiveFreeMintsCache_v1';
export const LIVE_PAID_MINTS_CACHE_KEY = 'apechainLivePaidMintsCache_v1';
export const ANALYSIS_RESULTS_CACHE_KEY = 'apechainAnalysisCache_v4'; 
export const TABLE_DATA_CACHE_KEY = 'apechainTableDataCache_v5'; 
export const SOUND_ENABLED_PREFERENCE_KEY = 'apechainSoundEnabledPreference_v3';
export const ADMIN_SESSION_KEY = 'apechainAdminSession_v1';


// --- Advertisement Settings ---
export const ADVERTISEMENT_TEXT = "Want to advertise your NFT project here? Click to contact our team on X (Twitter)! Promote your mint directly to active minters!";
export const DEFAULT_ADVERTISEMENT_TWITTER_USER_ID = "YourTwitterHandle"; // Default, admin can change
export const ADVERTISEMENT_TWITTER_DM_URL_BASE = `https://twitter.com/intent/dm?recipient_id=`;


export interface NftAdDetails {
  id: string; // Unique ID for the ad slot
  name: string; // Project name
  supply: string; // e.g., "Supply: 1000"
  price: string; // e.g., "Price: FREE" or "Price: 0.1 APE"
  imageUrl: string; // URL of the image, or "USE_PLACEHOLDER", or data:URL
  mintLink: string; // URL for the "Mint Now" button
  accentColor: 'sky' | 'fuchsia' | 'emerald' | 'amber' | 'rose';
  active: boolean; // Whether this ad slot is active
}

export const VALID_ACCENT_COLORS: ReadonlyArray<NftAdDetails['accentColor']> = ['sky', 'fuchsia', 'emerald', 'amber', 'rose'];

export const USE_PLACEHOLDER_IMAGE_URL = "USE_PLACEHOLDER"; // Special string to trigger placeholder image

export const DEFAULT_NFT_ADVERTISEMENTS_LIST: NftAdDetails[] = [
  { 
    id: 'ad_slot_1',
    name: "Galactic Gorillas", 
    supply: "Supply: 1000", 
    price: "Price: 0.05 APE", 
    imageUrl: "https://picsum.photos/seed/defaultgorillas/200", 
    mintLink: "#gorillas", 
    accentColor: 'fuchsia',
    active: true,
  },
  { 
    id: 'ad_slot_2',
    name: "Pixel Punks X", 
    supply: "Supply: 3333", 
    price: "Price: FREE", 
    imageUrl: USE_PLACEHOLDER_IMAGE_URL, 
    mintLink: "#pixelpunks", 
    accentColor: 'emerald',
    active: true,
  },
  { 
    id: 'ad_slot_3',
    name: "Cybernetic Samurai", 
    supply: "Supply: 500", 
    price: "Price: 0.1 APE", 
    imageUrl: "https://picsum.photos/seed/defaultsamurai/200", 
    mintLink: "#samurai", 
    accentColor: 'rose',
    active: true,
  },
  { 
    id: 'ad_slot_4',
    name: "Mystic Moons", 
    supply: "Supply: 777", 
    price: "Price: 0.02 APE", 
    imageUrl: "https://picsum.photos/seed/defaultmoons/200", 
    mintLink: "#moons", 
    accentColor: 'sky',
    active: false, 
  },
  { 
    id: 'ad_slot_5',
    name: "Ancient Artifacts", 
    supply: "Supply: 100", 
    price: "Price: 0.25 APE", 
    imageUrl: USE_PLACEHOLDER_IMAGE_URL, 
    mintLink: "#artifacts", 
    accentColor: 'amber',
    active: false, 
  }
];


// --- UI Sizing & Layout Constants ---
export const APP_MAIN_TITLE_HEIGHT_PX = 60; 
export const SCROLLING_BANNER_HEIGHT_PX = 50; 
export const NFT_AD_POSTER_HEIGHT_PX = 130; 
export const NFT_AD_POSTER_CONFETTI_INTERVAL_MS = 1 * 60 * 1000; 

export const calculateBodyPaddingTop = (effectiveTwitterId?: string | null, effectiveAds?: NftAdDetails[] | null): number => {
  let totalPadding = APP_MAIN_TITLE_HEIGHT_PX;
  
  const onConfigPage = typeof window !== 'undefined' && 
                       window.location.hash && // Ensure hash exists
                       (window.location.hash.includes(CONFIG_LOGIN_PAGE_ID) || 
                        window.location.hash.includes(CONFIG_PANEL_PAGE_ID));

  if (onConfigPage) { 
    return totalPadding; // Config pages only have the main title header
  }

  if (effectiveTwitterId && ADVERTISEMENT_TEXT) {
    totalPadding += SCROLLING_BANNER_HEIGHT_PX;
  }

  const adsAreActive = effectiveAds?.some(ad => ad.active);
  if (adsAreActive) {
    totalPadding += NFT_AD_POSTER_HEIGHT_PX;
  }
  return totalPadding;
};

export const INITIAL_TABLE_COLLECTIONS_TO_PROCESS = 30; 
export const ANALYSIS_CACHE_DURATION_MS = 6 * 60 * 60 * 1000; 

// --- Admin Settings ---
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "admin@123"; 

export const MAX_ADMIN_EDITABLE_ADS = 5; 

// Configuration Page Routing (using query parameters in hash)
export const PAGE_QUERY_PARAM = 'page';
export const CONFIG_LOGIN_PAGE_ID = 'config_login';
export const CONFIG_PANEL_PAGE_ID = 'config_panel';

// --- API Endpoints ---
export const API_BASE_URL = '/.netlify/functions'; // For Netlify deployment
export const SETTINGS_API_ENDPOINT = `${API_BASE_URL}/settings`;
export const SEEN_POPUPS_API_ENDPOINT = `${API_BASE_URL}/seen-popups`;
export const MARK_POPUP_SEEN_API_ENDPOINT = `${API_BASE_URL}/mark-popup-seen`;