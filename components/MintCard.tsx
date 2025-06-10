
import React from 'react';
import { MintData } from '../types';
import { APECHAIN_EXPLORER_URL, APE_COIN_DECIMALS } from '../constants';
import { formatUnits } from 'ethers';

interface MintCardProps {
  mint: MintData;
}

const MintCard: React.FC<MintCardProps> = ({ mint }) => {
  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const explorerTxUrl = `${APECHAIN_EXPLORER_URL}/tx/${mint.txHash}`;
  const explorerAddressUrl = `${APECHAIN_EXPLORER_URL}/address/${mint.contractAddress}`;

  const mintPriceDisplay = mint.isFree || !mint.valueWei 
    ? "Free Mint"
    : `${parseFloat(formatUnits(mint.valueWei, APE_COIN_DECIMALS)).toFixed(4)} APE`;

  return (
    <div className={`shadow-2xl rounded-xl p-5 sm:p-6 transition-all duration-300 hover:shadow-[0_0_35px_8px_rgba(99,102,241,0.4)] hover:ring-2 transform hover:-translate-y-1.5 border ${mint.isFree ? 'bg-slate-800/80 border-slate-700 hover:ring-fuchsia-500' : 'bg-amber-900/50 border-amber-700 hover:ring-amber-500'}`}>
      <div className="flex items-start space-x-4">
        <img 
          src={mint.tokenImagePlaceholderUrl} 
          alt="NFT Placeholder" 
          className="w-16 h-16 rounded-lg object-cover border-2 border-slate-600 shadow-md transform group-hover:scale-105 transition-transform"
        />
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-semibold text-fuchsia-400 break-all hover:text-fuchsia-300 transition-colors">
                {mint.collectionName !== "Unnamed Collection" && mint.collectionName !== "Unknown Collection" ? mint.collectionName : (
                    <span title={mint.contractAddress} className="italic text-fuchsia-300">{mint.collectionName}</span>
                )}
              </h3>
              { (mint.collectionName === "Unnamed Collection" || mint.collectionName === "Unknown Collection") && (
                 <p className="text-xs text-slate-500 break-all mt-0.5">
                    Contract: <a href={explorerAddressUrl} target="_blank" rel="noopener noreferrer" className="hover:text-sky-400 underline">{mint.contractAddress}</a>
                </p>
              )}
            </div>
            <span className="text-xs text-slate-500 whitespace-nowrap ml-2 pt-1">
              Block: {mint.blockNumber}
            </span>
          </div>
          
          <p className="text-2xl font-bold text-slate-100 mt-1">
            Token ID: <span className="text-sky-400">{mint.tokenId}</span>
          </p>
          {!mint.isFree && (
            <p className="text-lg font-semibold text-amber-400 mt-1">
                Price: {mintPriceDisplay}
            </p>
          )}
          <p className="text-sm text-slate-400 mt-1">
            Minted: {formatTimestamp(mint.timestamp)}
          </p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-700/70 flex flex-col sm:flex-row sm:justify-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
        <a 
          href={explorerTxUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-sky-400 hover:text-sky-300 hover:underline text-sm font-medium transition-colors duration-150"
          aria-label={`View transaction ${mint.txHash.substring(0,10)}... on ApeChain Explorer`}
        >
          View Transaction
        </a>
      </div>
    </div>
  );
};

export default MintCard;
