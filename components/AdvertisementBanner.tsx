
import React from 'react';
import { APP_MAIN_TITLE_HEIGHT_PX } from '../constants';

interface AdvertisementBannerProps {
  text: string;
  link: string;
}

const AdvertisementBanner: React.FC<AdvertisementBannerProps> = ({ text, link }) => {
  return (
    <a 
      href={link} 
      target="_blank" 
      rel="noopener noreferrer"
      className="fixed left-0 right-0 z-50 bg-gradient-to-r from-purple-600 via-pink-500 to-red-500 text-white p-3 shadow-2xl hover:shadow-[0_0_30px_10px_rgba(255,255,255,0.2)] transition-shadow duration-300 transform hover:scale-[1.01] origin-top"
      style={{
        top: `${APP_MAIN_TITLE_HEIGHT_PX}px`, // Position below the main app title
        perspective: '500px', 
        transformStyle: 'preserve-3d', 
      }}
      aria-label="Advertisement: Click to learn more"
    >
      <div 
        className="marquee-container text-center text-sm sm:text-base font-semibold"
      >
        <div className="marquee-content">
          {text} &nbsp; &nbsp; &nbsp; {text} &nbsp; &nbsp; &nbsp; {text} {/* Repeat for smooth scroll */}
        </div>
      </div>
    </a>
  );
};

export default AdvertisementBanner;