
import React from 'react';
import { AppTableDisplayMintData } from '../App'; 
import { APECHAIN_EXPLORER_URL, APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX } from '../constants';

interface MintsTableProps {
  mints: AppTableDisplayMintData[];
}

const MintsTable: React.FC<MintsTableProps> = ({ mints }) => {
  console.log("[MintsTable Component] Rendering. Received 'mints' prop. Length:", mints.length);
  if (mints.length > 0 && mints[0]) {
    console.log("[MintsTable Component] First mint item in prop (simplified for brevity):", { txHash: mints[0].txHash, contractAddress: mints[0].contractAddress, collectionName: mints[0].collectionName, analysisStatus: mints[0].analysis?.finalStatus });
  } else if (mints.length === 0) {
    console.log("[MintsTable Component] Received empty 'mints' array.");
  } else if (mints.length > 0 && !mints[0]) {
    console.warn("[MintsTable Component] First mint item in prop is null or undefined, but mints array is not empty.");
  }


  const formatTimestampToDateTime = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div 
      className="overflow-x-auto overflow-y-auto rounded-lg shadow-2xl custom-scrollbar border border-slate-700 backdrop-blur-sm flex-grow" 
      style={{ 
        backgroundColor: 'rgba(128, 0, 128, 0.3)', /* AGGRESSIVE Diagnostic: purple bg for wrapper */
        height: '600px', /* AGGRESSIVE Diagnostic: fixed height */
        padding: '10px', /* AGGRESSIVE Diagnostic: padding */
      }}
    >
      <table className="min-w-full divide-y divide-slate-700">
        {/* <thead className="bg-slate-700/60 sticky top-0 z-10 backdrop-blur-md"> // Temporarily remove sticky for debugging */}
        <thead className="bg-slate-700/60 z-10 backdrop-blur-md">
          <tr>
            <th scope="col" className="px-2 py-3 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">No.</th>
            <th scope="col" className="px-3 py-3.5 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Date/Time Minted</th>
            <th scope="col" className="px-3 py-3.5 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Collection</th>
            <th scope="col" className="px-2 py-3.5 text-center text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Price</th>
            <th scope="col" className="px-3 py-3.5 text-left text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">NFT Contract</th>
            <th scope="col" className="px-3 py-3.5 text-center text-xs sm:text-sm font-semibold text-slate-300 tracking-wider">Links</th>
          </tr>
        </thead>
        <tbody 
          className="divide-y divide-slate-700" 
          style={{ backgroundColor: 'rgba(255, 255, 0, 0.5)' }} /* AGGRESSIVE Diagnostic: more opaque yellow bg */
        >
          {mints.map((mint, index) => {
            if (!mint) {
              console.error(`[MintsTable Row ${index + 1}] Mint item is null or undefined! Skipping row.`);
              return null; 
            }
            console.log(`[MintsTable Row ${index + 1}] Processing mint: ${mint.contractAddress} - ${mint.tokenId}`);
            
            const explorerAddressUrl = `${APECHAIN_EXPLORER_URL}/address/${mint.contractAddress}`;
            const explorerTxUrl = `${APECHAIN_EXPLORER_URL}/tx/${mint.txHash}`;
            const magicEdenCollectionUrl = `${APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX}${mint.contractAddress}`;
            
            const collectionDisplayName = (mint.analysis?.collectionNameFromAnalyzer && mint.analysis.collectionNameFromAnalyzer !== "Unknown Collection" && mint.analysis.collectionNameFromAnalyzer !== "Unnamed Collection")
                                        ? mint.analysis.collectionNameFromAnalyzer
                                        : mint.collectionName;
            
            const rowKey = `${mint.txHash}-${mint.logIndex}-${mint.contractAddress}-${index}`;

            return (
              <tr 
                key={rowKey} 
                className="hover:bg-slate-700/70 transition-colors duration-150"
                style={{ border: '3px solid red' }} /* AGGRESSIVE Diagnostic: thicker red border */
              >
                <td 
                  className="whitespace-nowrap px-2 py-3 text-center" 
                  style={{ border: '3px solid blue', minHeight: '50px', height: 'auto', color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold' }} /* AGGRESSIVE: blue border, min-height, LIME text, LARGE & BOLD */
                >
                  {index + 1} {/* Simplest possible content */}
                </td>
                <td 
                  className="whitespace-nowrap px-3 py-3 text-xs sm:text-sm" 
                  style={{ border: '3px solid blue', minHeight: '50px', height: 'auto', color: '#00FF00', fontSize: '1.1rem' }}
                >
                  {formatTimestampToDateTime(mint.timestamp)}
                </td>
                <td 
                  className="px-3 py-3 text-xs sm:text-sm max-w-[150px] truncate" 
                  style={{ border: '3px solid blue', minHeight: '50px', height: 'auto', color: '#00FF00', fontSize: '1.1rem' }}
                  title={`${collectionDisplayName} (Rep. Token ID: ${mint.tokenId})`}
                >
                  {collectionDisplayName !== "Unnamed Collection" && collectionDisplayName !== "Unknown Collection" ? (
                    <span className="text-fuchsia-400 font-medium">{collectionDisplayName}</span>
                  ) : (
                    <span className="text-fuchsia-300 italic" title={mint.contractAddress}>{collectionDisplayName}</span>
                  )}
                </td>
                <td 
                  className={`whitespace-nowrap px-2 py-3 text-xs sm:text-sm text-center font-semibold ${mint.isFree ? 'text-green-300' : 'text-amber-300'}`}
                  style={{ border: '3px solid blue', minHeight: '50px', height: 'auto' }}
                >
                  {mint.isFree ? 'Free' : (mint.mintPriceApe ? `${mint.mintPriceApe} APE` : 'Paid')}
                </td>
                <td 
                  className="whitespace-nowrap px-3 py-3 text-xs sm:text-sm" 
                  style={{ border: '3px solid blue', minHeight: '50px', height: 'auto', color: '#00FF00', fontSize: '1.1rem' }}
                >
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
                <td 
                  className="whitespace-nowrap px-3 py-3 text-xs sm:text-sm text-center"
                  style={{ border: '3px solid blue', minHeight: '50px', height: 'auto' }}
                >
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
