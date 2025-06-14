
import React, { useState, useEffect, useCallback } from 'react';
import { 
    DEFAULT_ADVERTISEMENT_TWITTER_USER_ID, 
    DEFAULT_NFT_ADVERTISEMENTS_LIST,
    NftAdDetails,
    MAX_ADMIN_EDITABLE_ADS,
    USE_PLACEHOLDER_IMAGE_URL,
    SETTINGS_API_ENDPOINT,
    VALID_ACCENT_COLORS
} from '../../constants';
import { AdminSettings } from '../../App'; 
import LoadingSpinner from '../LoadingSpinner'; 

interface AdminPanelProps {
  onLogout: () => void;
  onSettingsSave: () => void; 
  currentAds: NftAdDetails[]; 
  currentTwitterId: string;   
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout, onSettingsSave, currentAds, currentTwitterId }) => {
  const [twitterUserId, setTwitterUserId] = useState(DEFAULT_ADVERTISEMENT_TWITTER_USER_ID);
  const [ads, setAds] = useState<NftAdDetails[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<{[key: string]: string | null}>({});


  const initializeAds = useCallback(() => {
    const adSlotsToSet: NftAdDetails[] = [];
    const newImagePreviews: {[key: string]: string | null} = {};

    for (let index = 0; index < MAX_ADMIN_EDITABLE_ADS; index++) {
        const slotId = `ad_slot_${index + 1}`;
        const configFromCurrentAds = currentAds.find(ad => ad.id === slotId);
        const configFromDefaults = DEFAULT_NFT_ADVERTISEMENTS_LIST.find(dAd => dAd.id === slotId);

        let adData: NftAdDetails;

        if (configFromCurrentAds) {
            const validatedAccentColor = VALID_ACCENT_COLORS.includes(configFromCurrentAds.accentColor as any)
                ? configFromCurrentAds.accentColor
                : (configFromDefaults ? configFromDefaults.accentColor : 'sky');
            
            adData = {
                ...configFromCurrentAds,
                id: slotId, 
                accentColor: validatedAccentColor,
            };
        } else if (configFromDefaults) {
            adData = { 
                ...configFromDefaults,
                id: slotId 
            };
        } else {
            adData = {
                id: slotId,
                name: `Ad Slot ${index + 1} (New)`,
                supply: "Supply: ---",
                price: "Price: ---",
                imageUrl: USE_PLACEHOLDER_IMAGE_URL,
                mintLink: "#",
                accentColor: 'sky', 
                active: false,
            };
        }
        adSlotsToSet.push(adData);

        if (adData.imageUrl && adData.imageUrl.startsWith('data:image')) {
            newImagePreviews[adData.id] = adData.imageUrl;
        } else {
            newImagePreviews[adData.id] = null;
        }
    }
    
    setAds(adSlotsToSet);
    setImagePreviews(newImagePreviews);

  }, [currentAds]);


  useEffect(() => {
    setTwitterUserId(currentTwitterId);
    initializeAds();
  }, [currentTwitterId, initializeAds]);

  const handleImageFileChange = (index: number, file: File | null) => {
    const adId = ads[index].id;
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            handleAdChange(index, 'imageUrl', dataUrl);
            setImagePreviews(prev => ({ ...prev, [adId]: dataUrl }));
        };
        reader.onerror = () => {
            console.error("Error reading file for ad image.");
            alert("Error processing image. Please try another one.");
            setImagePreviews(prev => ({ ...prev, [adId]: null }));
        };
        reader.readAsDataURL(file);
    } else { 
        handleAdChange(index, 'imageUrl', USE_PLACEHOLDER_IMAGE_URL); 
        setImagePreviews(prev => ({ ...prev, [adId]: null }));
    }
  };

  const handleAdChange = (index: number, field: keyof NftAdDetails, value: any) => {
    const newAds = [...ads];
    if (field === 'active') {
        newAds[index] = { ...newAds[index], [field]: value as boolean };
    } else if (field === 'accentColor') {
        if (VALID_ACCENT_COLORS.includes(value as any)) {
            newAds[index] = { ...newAds[index], [field]: value as NftAdDetails['accentColor'] };
        } else {
            console.warn(`Invalid accent color "${value}" provided for ad slot ${index + 1}. Using default.`);
            newAds[index] = { ...newAds[index], [field]: 'sky' }; 
        }
    }
     else {
        newAds[index] = { ...newAds[index], [field]: value as string };
    }
    if (field === 'imageUrl' && typeof value === 'string' && !value.startsWith('data:image')) {
        setImagePreviews(prev => ({ ...prev, [newAds[index].id]: null }));
    }
    setAds(newAds);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    const settingsToSave: AdminSettings = {
      twitterUserId: twitterUserId,
      ads: ads.map(ad => ({...ad})) 
    };
    try {
        const response = await fetch(SETTINGS_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsToSave),
        });
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Failed to save settings: ${response.status} ${response.statusText}. ${errorData}`);
        }
        onSettingsSave(); 
    } catch (e: any) {
        console.error("Error saving admin settings:", e);
        setSaveError(`Failed to save settings: ${e.message}. Please try again.`);
    } finally {
        setIsSaving(false);
    }
  };

  const accentColorsForSelect: NftAdDetails['accentColor'][] = ['sky', 'fuchsia', 'emerald', 'amber', 'rose'];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8 my-8 bg-slate-800/70 rounded-xl shadow-2xl border border-slate-700 backdrop-blur-sm text-slate-100 flex flex-col flex-grow">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-600">
        <h2 className="text-3xl font-bold text-sky-400">Site Config</h2>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow transition-colors"
        >
          Logout
        </button>
      </div>
       <p className="text-xs text-yellow-400 mb-6 p-3 bg-yellow-900/50 rounded-md border border-yellow-700">
        <span className="font-bold">NOTE:</span> Settings are now sent to a (hypothetical) backend. If no backend is running, saving will fail.
      </p>

      <section className="mb-8">
        <h3 className="text-xl font-semibold text-teal-400 mb-3">Advertisement Banner Settings</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="twitterUserId" className="block text-sm font-medium text-slate-300 mb-1">
              Twitter User ID (for DM link)
            </label>
            <input
              type="text"
              id="twitterUserId"
              value={twitterUserId}
              onChange={(e) => setTwitterUserId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm text-white"
              placeholder="YourTwitterHandle"
            />
          </div>
        </div>
      </section>

      <section className="flex-grow">
        <h3 className="text-xl font-semibold text-teal-400 mb-4">NFT Advertisement Poster Slots ({MAX_ADMIN_EDITABLE_ADS} max)</h3>
        <div className="space-y-6">
          {ads.map((ad, index) => (
            <div key={ad.id || `ad-${index}`} className="p-4 bg-slate-700/50 rounded-lg border border-slate-600 space-y-3">
              <h4 className="text-lg font-medium text-fuchsia-400">Ad Slot {index + 1} (ID: {ad.id})</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`adName-${index}`} className="block text-xs font-medium text-slate-400">Name</label>
                  <input type="text" id={`adName-${index}`} value={ad.name} onChange={e => handleAdChange(index, 'name', e.target.value)} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor={`adSupply-${index}`} className="block text-xs font-medium text-slate-400">Supply Text</label>
                  <input type="text" id={`adSupply-${index}`} value={ad.supply} onChange={e => handleAdChange(index, 'supply', e.target.value)} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor={`adPrice-${index}`} className="block text-xs font-medium text-slate-400">Price Text</label>
                  <input type="text" id={`adPrice-${index}`} value={ad.price} onChange={e => handleAdChange(index, 'price', e.target.value)} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm" />
                </div>
                
                <div className="md:col-span-1">
                    <label htmlFor={`adImageFile-${index}`} className="block text-xs font-medium text-slate-400">Upload Image (or enter URL below)</label>
                    <input 
                        type="file" 
                        id={`adImageFile-${index}`} 
                        accept="image/*"
                        onChange={e => handleImageFileChange(index, e.target.files ? e.target.files[0] : null)} 
                        className="mt-1 block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700 cursor-pointer"
                    />
                    {imagePreviews[ad.id] && (
                        <img src={imagePreviews[ad.id]!} alt="Ad preview" className="mt-2 h-16 w-16 object-cover rounded-md border border-slate-500" />
                    )}
                    <p className="mt-1 text-xs text-yellow-500">Uploads are stored as Data URLs. Large images may impact performance/storage.</p>
                </div>
                 <div>
                  <label htmlFor={`adImageUrl-${index}`} className="block text-xs font-medium text-slate-400">Image URL (if not uploading, or "{USE_PLACEHOLDER_IMAGE_URL}")</label>
                  <input 
                    type="text" 
                    id={`adImageUrl-${index}`} 
                    value={ad.imageUrl.startsWith('data:image') ? '(Uploaded Image Data)' : ad.imageUrl} 
                    onChange={e => handleAdChange(index, 'imageUrl', e.target.value)} 
                    disabled={ad.imageUrl.startsWith('data:image')} 
                    className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:bg-slate-600 disabled:cursor-not-allowed" 
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor={`adMintLink-${index}`} className="block text-xs font-medium text-slate-400">Mint Now Link URL</label>
                  <input type="text" id={`adMintLink-${index}`} value={ad.mintLink} onChange={e => handleAdChange(index, 'mintLink', e.target.value)} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm" />
                </div>
                 <div>
                  <label htmlFor={`adAccent-${index}`} className="block text-xs font-medium text-slate-400">Accent Color</label>
                  <select id={`adAccent-${index}`} value={ad.accentColor} onChange={e => handleAdChange(index, 'accentColor', e.target.value as NftAdDetails['accentColor'])} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm">
                    {accentColorsForSelect.map(color => <option key={color} value={color}>{color.charAt(0).toUpperCase() + color.slice(1)}</option>)}
                  </select>
                </div>
                <div className="flex items-center pt-2">
                  <input type="checkbox" id={`adActive-${index}`} checked={ad.active} onChange={e => handleAdChange(index, 'active', e.target.checked)} className="h-4 w-4 text-sky-500 border-slate-500 rounded focus:ring-sky-400 bg-slate-600" />
                  <label htmlFor={`adActive-${index}`} className="ml-2 text-sm text-slate-300">Active</label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-auto pt-6 border-t border-slate-600 flex flex-col items-end"> {/* Changed mt-8 to mt-auto for flex-grow behavior */}
        {saveError && <p className="w-full text-center text-sm text-red-400 bg-red-900/50 p-2 rounded-md border border-red-700 mb-3">{saveError}</p>}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isSaving && <LoadingSpinner />}
          {isSaving ? 'Saving...' : 'Save All Settings to Server'}
        </button>
      </div>
       <a href="#/" className="mt-8 block text-center text-sm text-slate-400 hover:text-sky-300 transition-colors">
        &larr; Back to Main Site (without saving)
      </a>
    </div>
  );
};

export default AdminPanel;