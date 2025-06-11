
import React, { useEffect, useState } from 'react';
import { PopupMintData } from '../App'; 
import { APECHAIN_EXPLORER_URL, APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX } from '../constants';
// import { formatUnits } from 'ethers'; // Not needed as popups are for free mints
import ConfettiEffect from './ConfettiEffect';

interface NewMintPopupProps {
  mint: PopupMintData; 
  onClose: () => void;
}

const NewMintPopup: React.FC<NewMintPopupProps> = ({ mint, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    setShowConfetti(true); 
    
    const visibilityTimer = setTimeout(() => {
      handleClose(); 
    }, 60000); // Popup is visible for 60 seconds

    // ConfettiEffect's animation is set to ~55-60s, so it will naturally stop.
    // Parent unmount or CSS animation 'forwards' handles cleanup.

    return () => {
        clearTimeout(visibilityTimer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint.popupId]);

  const handleClose = () => {
    setIsVisible(false); 
    // Parent will remove from DOM after animation (triggered by onClose after timeout)
    setTimeout(onClose, 500); // Allow time for CSS exit animation (duration-500)
  };
  
  const collectionDisplayName = (mint.analysis?.collectionNameFromAnalyzer && mint.analysis.collectionNameFromAnalyzer !== "Unknown Collection" && mint.analysis.collectionNameFromAnalyzer !== "Unnamed Collection")
                                ? mint.analysis.collectionNameFromAnalyzer
                                : mint.collectionName;

  const explorerTxUrl = `${APECHAIN_EXPLORER_URL}/tx/${mint.txHash}`;
  const magicEdenCollectionUrl = `${APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX}${mint.contractAddress}`;

  return (
    <div 
      className={`fixed top-5 right-5 z-[100] transition-all duration-500 transform ${isVisible ? 'popup-top-right-enter-active' : 'popup-top-right-exit-active'}`} // Using defined exit animation class
      role="alert"
      aria-live="assertive"
      style={{ opacity: isVisible ? 1 : 0 }} 
    >
      <div 
        className="bg-gradient-to-br from-green-500 via-teal-500 to-sky-600 p-4 rounded-xl shadow-2xl border-2 border-yellow-400/80 text-white max-w-xs w-full relative overflow-hidden"
        style={{
            transformStyle: 'preserve-3d',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25), 0 0 0 2px rgba(250, 204, 21, 0.7)' 
        }}
      >
        {showConfetti && <ConfettiEffect count={50} />} 
        <button 
          onClick={handleClose}
          className="absolute top-1.5 right-2.5 text-yellow-200 hover:text-white transition-colors text-2xl z-20"
          aria-label="Close new free mint notification"
        >
          &times;
        </button>

        <div className="text-center mb-2">
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-white to-yellow-300">
            🎉 New Free Mint! 🎉
          </h2>
        </div>

        <div className="flex items-center space-x-3 mb-2">
            <img 
              src={mint.tokenImagePlaceholderUrl} 
              alt="NFT Placeholder" 
              className="w-12 h-12 rounded-md object-cover border border-slate-400 shadow-md"
            />
            <div>
                <h3 className="text-md font-semibold text-yellow-100 break-words">
                    {collectionDisplayName}
                </h3>
                <p className="text-lg font-bold text-white">
                    ID: {mint.tokenId}
                </p>
            </div>
        </div>
        
        <p className="text-sm text-slate-200 mb-1 text-xs">
          Minted: {new Date(mint.timestamp * 1000).toLocaleTimeString()}
        </p>
         <p className="text-xs text-slate-300 mb-3 truncate" title={mint.contractAddress}>
          Contract: {truncateAddress(mint.contractAddress)}
        </p>

        <div className="flex justify-around items-center mt-2 pt-2 border-t border-yellow-400/50">
          <a 
            href={explorerTxUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="px-3 py-1.5 bg-sky-400 hover:bg-sky-300 text-white text-xs font-semibold rounded-md shadow transition-all duration-200 transform hover:scale-105"
          >
            View Tx
          </a>
          <a 
            href={magicEdenCollectionUrl}
            target="_blank" 
            rel="noopener noreferrer" 
            className="px-3 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-white text-xs font-semibold rounded-md shadow transition-all duration-200 transform hover:scale-105"
          >
            View on ME
          </a>
        </div>
      </div>
    </div>
  );
};

const truncateAddress = (address: string) => `${address.slice(0, 5)}...${address.slice(-3)}`;

export default NewMintPopup;
