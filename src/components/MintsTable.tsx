
import React from 'react';
import { AppTableDisplayMintData } from '../App'; 
import { APECHAIN_EXPLORER_URL, APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX } from '../constants';

interface MintsTableProps {
  mints: AppTableDisplayMintData[];
}

const MintsTable: React.FC<MintsTableProps> = ({ mints }) => {
  const formatTimestampToDateTime = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div 
      className="overflow-x-auto rounded-lg shadow-2xl custom-scrollbar border border-slate-700 backdrop-blur-sm bg-slate-800/30 flex-grow" 
      style={{ 
        minHeight: '550px', // Adjusted to show ~10 items + header
        maxHeight: 'calc(100vh - 280px)' // Keep a reasonable max height
      }}
    >
      <table className="min-w-full divide-y divide-slate-700">
        <thead className="bg-slate-700/60 sticky top-0 z-10 backdrop-blur-md">
          <tr>
            <th scope="col" className="px-2 py-3 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">No.</th>
            <th scope="col" className="px-3 py-3.5 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Date/Time Minted</th>
            <th scope="col" className="px-3 py-3.5 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Collection</th>
            <th scope="col" className="px-2 py-3.5 text-center text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Price</th>
            <th scope="col" className="px-3 py-3.5 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">NFT Contract</th>
            <th scope="col" className="px-3 py-3.5 text-center text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Links</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {mints.map((mint, index) => {
            const explorerAddressUrl = `${APECHAIN_EXPLORER_URL}/address/${mint.contractAddress}`;
            const explorerTxUrl = `${APECHAIN_EXPLORER_URL}/tx/${mint.txHash}`;
            const magicEdenCollectionUrl = `${APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX}${mint.contractAddress}`;
            
            const collectionDisplayName = (mint.analysis?.collectionNameFromAnalyzer && mint.analysis.collectionNameFromAnalyzer !== "Unknown Collection" && mint.analysis.collectionNameFromAnalyzer !== "Unnamed Collection")
                                        ? mint.analysis.collectionNameFromAnalyzer
                                        : mint.collectionName;

            return (
              <tr key={`${mint.txHash}-${mint.logIndex}-${mint.contractAddress}`} className="hover:bg-slate-700/70 transition-colors duration-150">
                <td className="whitespace-nowrap px-2 py-3 text-xs sm:text-sm text-slate-400 text-center">{index + 1}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs sm:text-sm text-slate-400">{formatTimestampToDateTime(mint.timestamp)}</td>
                <td className="px-3 py-3 text-xs sm:text-sm max-w-[150px] truncate" title={`${collectionDisplayName} (Rep. Token ID: ${mint.tokenId})`}>
                  {collectionDisplayName !== "Unnamed Collection" && collectionDisplayName !== "Unknown Collection" ? (
                    <span className="text-fuchsia-400 font-medium">{collectionDisplayName}</span>
                  ) : (
                    <span className="text-fuchsia-300 italic" title={mint.contractAddress}>{collectionDisplayName}</span>
                  )}
                </td>
                <td className={`whitespace-nowrap px-2 py-3 text-xs sm:text-sm text-center font-semibold ${mint.isFree ? 'text-green-400' : 'text-amber-400'}`}>
                  {mint.isFree ? 'Free' : (mint.mintPriceApe ? `${mint.mintPriceApe} APE` : 'Paid')}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs sm:text-sm text-slate-400">
                   <a 
                    href={explorerAddressUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-teal-400 hover:text-teal-300 hover:underline"
                    title={`View contract ${mint.contractAddress} on ApeChain Explorer`}
                  >
                    {truncateAddress(mint.contractAddress)}
                  </a>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs sm:text-sm text-center">
                  <div className="flex items-center justify-center space-x-2 sm:space-x-3">
                    <a 
                      href={explorerTxUrl}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-indigo-400 hover:text-indigo-300 hover:underline"
                      aria-label={`View mint transaction ${mint.txHash.substring(0,10)}... for representative token ${mint.tokenId} on ApeChain Explorer`}
                      title="View Transaction on Explorer"
                    >
                      Tx
                    </a>
                    <a 
                      href={magicEdenCollectionUrl}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-emerald-400 hover:text-emerald-300 hover:underline"
                      aria-label={`View collection ${collectionDisplayName} on MagicEden`}
                      title="View Collection on MagicEden"
                    >
                      ME
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MintsTable;
