
import React, { useState, useEffect } from 'react';
import { NftAdDetails, NFT_AD_POSTER_HEIGHT_PX, APP_MAIN_TITLE_HEIGHT_PX, SCROLLING_BANNER_HEIGHT_PX, USE_PLACEHOLDER_IMAGE_URL, NFT_AD_POSTER_CONFETTI_INTERVAL_MS } from '../constants';
import ConfettiEffect from './ConfettiEffect';

interface NftAdvertisementPosterProps {
  adList: NftAdDetails[]; 
}

const NftAdvertisementPoster: React.FC<NftAdvertisementPosterProps> = ({ adList }) => {
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [showPosterConfetti, setShowPosterConfetti] = useState(false);
  const [isFading, setIsFading] = useState(false);

  const activeAds = adList.filter(ad => ad.active);

  useEffect(() => {
    if (activeAds.length <= 1) return;

    const slideshowInterval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentAdIndex((prevIndex) => (prevIndex + 1) % activeAds.length);
        setIsFading(false);
      }, 500); 
    }, 20000); // Changed to 20 seconds

    return () => clearInterval(slideshowInterval);
  }, [activeAds.length]);

  useEffect(() => {
    if (activeAds.length === 0) return;

    const confettiTimer = setInterval(() => {
      setShowPosterConfetti(true);
      setTimeout(() => setShowPosterConfetti(false), 7000); 
    }, NFT_AD_POSTER_CONFETTI_INTERVAL_MS); 

    return () => clearInterval(confettiTimer);
  }, [activeAds.length]);


  if (activeAds.length === 0) {
    return null;
  }

  const currentAd = activeAds[currentAdIndex];
  const displayImageUrl = (currentAd.imageUrl === USE_PLACEHOLDER_IMAGE_URL || !currentAd.imageUrl)
    ? `https://picsum.photos/seed/${currentAd.id || 'ad'}${currentAdIndex}/200`
    : currentAd.imageUrl;

  const accentColorClasses = {
    sky: { bgGradient: 'from-sky-500 to-cyan-600', buttonBg: 'bg-sky-500 hover:bg-sky-600', textColor: 'text-sky-300', shadow: 'shadow-sky-500/50' },
    fuchsia: { bgGradient: 'from-fuchsia-600 to-pink-600', buttonBg: 'bg-fuchsia-500 hover:bg-fuchsia-600', textColor: 'text-fuchsia-300', shadow: 'shadow-fuchsia-500/50' },
    emerald: { bgGradient: 'from-emerald-500 to-green-600', buttonBg: 'bg-emerald-500 hover:bg-emerald-600', textColor: 'text-emerald-300', shadow: 'shadow-emerald-500/50' },
    amber: { bgGradient: 'from-amber-500 to-yellow-600', buttonBg: 'bg-amber-500 hover:bg-amber-600', textColor: 'text-amber-300', shadow: 'shadow-amber-500/50' },
    rose: { bgGradient: 'from-rose-500 to-red-600', buttonBg: 'bg-rose-500 hover:bg-rose-600', textColor: 'text-rose-300', shadow: 'shadow-rose-500/50' },
  };

  const selectedTheme = accentColorClasses[currentAd.accentColor] || accentColorClasses.sky;
  const posterTopPosition = APP_MAIN_TITLE_HEIGHT_PX + SCROLLING_BANNER_HEIGHT_PX;

  return (
    <div 
      className={`nft-ad-poster fixed left-0 right-0 z-40 p-3 sm:p-4 bg-gradient-to-br ${selectedTheme.bgGradient} text-white shadow-2xl flex items-center justify-around transition-all duration-300 ease-in-out transform hover:shadow-[0_10px_40px_rgba(0,0,0,0.4)]`}
      style={{ 
        height: `${NFT_AD_POSTER_HEIGHT_PX}px`,
        top: `${posterTopPosition}px`,
        opacity: isFading ? 0 : 1,
        transition: 'opacity 0.5s ease-in-out',
      }} 
    >
      {showPosterConfetti && <ConfettiEffect count={80} />}
      
      <div className="flex-shrink-0 mb-2 sm:mb-0 sm:mr-4 transform transition-transform duration-300 ease-out">
        <img 
          src={displayImageUrl} 
          alt={`${currentAd.name} NFT Image`}
          className="nft-ad-image w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl object-cover border-2 border-white/40 shadow-lg transition-all duration-300 ease-out" 
          onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/error${currentAd.id}/200`; }} // Fallback for broken user-provided URLs
        />
      </div>
      <div className="text-center sm:text-left flex-grow mx-1 sm:mx-2 overflow-hidden relative">
        {activeAds.length > 1 && (
            <div className="absolute top-0 right-0 text-xs text-white/70 bg-black/30 px-1.5 py-0.5 rounded-bl-md z-10">
                Ad {currentAdIndex + 1} of {activeAds.length}
            </div>
        )}
        <h2 className={`text-lg sm:text-xl md:text-2xl font-extrabold mb-0.5 sm:mb-1 drop-shadow-md ${selectedTheme.textColor} brightness-125 truncate`} title={currentAd.name}>
          {currentAd.name}
        </h2>
        <p className="text-xs sm:text-sm text-slate-100 mb-0.5 truncate" title={currentAd.supply}>
          {currentAd.supply}
        </p>
        <p className={`text-sm sm:text-base md:text-lg font-bold mb-1 sm:mb-2 ${currentAd.price.toLowerCase().includes('free') ? 'text-green-300' : selectedTheme.textColor } truncate`} title={currentAd.price}>
          {currentAd.price}
        </p>
      </div>
      <div className="flex-shrink-0 mt-2 sm:mt-0 sm:ml-2 md:ml-4">
        <a
          href={currentAd.mintLink || '#'} // Fallback to '#' if mintLink is empty
          target="_blank"
          rel="noopener noreferrer"
          className={`nft-ad-button inline-block px-3 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-bold text-white ${selectedTheme.buttonBg} rounded-lg shadow-md hover:shadow-xl ${selectedTheme.shadow} transition-all duration-300 ease-out transform hover:-translate-y-0.5`}
          aria-label={`Mint ${currentAd.name} now`}
        >
          Mint Now!
        </a>
      </div>
    </div>
  );
};

export default NftAdvertisementPoster;