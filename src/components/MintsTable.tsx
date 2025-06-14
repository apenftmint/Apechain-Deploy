
import React from 'react';
import { AppTableDisplayMintData } from '../App';
import { APECHAIN_EXPLORER_URL, APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX } from '../constants';

interface MintsTableProps {
  mints: AppTableDisplayMintData[];
}

const MintsTable: React.FC<MintsTableProps> = ({ mints }) => {
  console.log("[MintsTable Component] Received 'mints' prop. Length:", mints.length);
  if (mints.length > 0) {
    console.log("[MintsTable Component] First mint item in prop:", JSON.stringify(mints[0], null, 2));
  } else {
    console.log("[MintsTable Component] Received an empty 'mints' array.");
  }

  const formatTimestampToDateTime = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  // CSS for debugging - making cells very obvious
  const cellDebugStyle: React.CSSProperties = {
    border: '1px solid red', // Bright border for visibility
    padding: '4px',
    display: 'table-cell', // Ensure correct display type
    color: 'white', // Ensure text is visible
    backgroundColor: 'rgba(0, 100, 0, 0.3)', // Slight background to check layering
  };

  return (
    <div
      className="overflow-auto custom-scrollbar border border-slate-600 rounded-lg" // Simplified classes, overflow-auto instead of x-auto
      style={{
        minHeight: '550px',
        maxHeight: 'calc(100vh - 280px)', // Keep a reasonable max height
        // Removed flex-grow from here, parent div in App.tsx has it.
        // Removed backdrop-blur and specific bg for this diagnostic step
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
        <tbody className="divide-y divide-slate-700 bg-slate-800/40"> {/* Added a slight bg to tbody for contrast */}
          {mints.map((mint, index) => {
            // console.log(`[MintsTable Map Loop] Processing item ${index + 1}/${mints.length}: Contract ${mint.contractAddress}, TokenID ${mint.tokenId}`);
            
            const explorerAddressUrl = `${APECHAIN_EXPLORER_URL}/address/${mint.contractAddress}`;
            const explorerTxUrl = `${APECHAIN_EXPLORER_URL}/tx/${mint.txHash}`;
            const magicEdenCollectionUrl = `${APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX}${mint.contractAddress}`;
            
            const collectionDisplayName = (mint.analysis?.collectionNameFromAnalyzer && mint.analysis.collectionNameFromAnalyzer !== "Unknown Collection" && mint.analysis.collectionNameFromAnalyzer !== "Unnamed Collection")
                                        ? mint.analysis.collectionNameFromAnalyzer
                                        : mint.collectionName;
            
            const rowKey = `${mint.txHash}-${mint.logIndex}-${mint.contractAddress}-${index}`; 
            // console.log(`[MintsTable Map Loop] Returning <tr> with key: ${rowKey}`);

            return (
              <tr key={rowKey} className="hover:bg-slate-700/70 transition-colors duration-150" style={{display: 'table-row'}}> {/* Explicit display style */}
                <td style={cellDebugStyle} className="whitespace-nowrap text-xs sm:text-sm text-center">{index + 1}</td>
                <td style={cellDebugStyle} className="whitespace-nowrap text-xs sm:text-sm">{formatTimestampToDateTime(mint.timestamp)}</td>
                <td style={cellDebugStyle} className="text-xs sm:text-sm max-w-[150px] truncate" title={`${collectionDisplayName} (Rep. Token ID: ${mint.tokenId})`}>
                  {collectionDisplayName !== "Unnamed Collection" && collectionDisplayName !== "Unknown Collection" ? (
                    <span className="font-medium">{collectionDisplayName}</span>
                  ) : (
                    <span className="italic" title={mint.contractAddress}>{collectionDisplayName}</span>
                  )}
                </td>
                <td style={cellDebugStyle} className={`whitespace-nowrap text-xs sm:text-sm text-center font-semibold ${mint.isFree ? '' : ''}`}> {/* Removed color classes for debug style */}
                  {mint.isFree ? 'Free' : (mint.mintPriceApe ? `${mint.mintPriceApe} APE` : 'Paid')}
                </td>
                <td style={cellDebugStyle} className="whitespace-nowrap text-xs sm:text-sm">
                   <a
                    href={explorerAddressUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline" // Simplified classes
                    title={`View contract ${mint.contractAddress} on ApeChain Explorer`}
                  >
                    {truncateAddress(mint.contractAddress)}
                  </a>
                </td>
                <td style={cellDebugStyle} className="whitespace-nowrap text-xs sm:text-sm text-center">
                  <div className="flex items-center justify-center space-x-2 sm:space-x-3">
                    <a
                      href={explorerTxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      aria-label={`View mint transaction ${mint.txHash.substring(0,10)}... for representative token ${mint.tokenId} on ApeChain Explorer`}
                      title="View Transaction on Explorer"
                    >
                      Tx
                    </a>
                    <a
                      href={magicEdenCollectionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
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
