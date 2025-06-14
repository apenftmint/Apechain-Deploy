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

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    color: 'white', // Ensure text is visible
    backgroundColor: 'rgba(10, 20, 40, 0.7)', // Dark semi-transparent background
  };
  const thStyle: React.CSSProperties = {
    border: '1px solid #4A5568', // gray-600
    padding: '8px',
    textAlign: 'left',
    backgroundColor: 'rgba(30, 41, 59, 0.8)', // slate-800
    position: 'sticky', // Keep for usability
    top: 0,
    zIndex: 1,
  };
  const tdStyle: React.CSSProperties = {
    border: '1px solid #374151', // gray-700
    padding: '8px',
    color: '#E2E8F0', // slate-200
    verticalAlign: 'top', // Ensure content is visible if height is constrained
  };
   const linkStyle: React.CSSProperties = {
    color: '#60A5FA', // blue-400
    textDecoration: 'underline',
  };


  return (
    <div 
      style={{ 
        overflow: 'auto', // Keep scrollbar functionality
        minHeight: '550px', 
        maxHeight: 'calc(100vh - 280px)',
        border: '1px solid #4A5568', // gray-600 border for the container
        borderRadius: '8px', // Equivalent to rounded-lg
      }}
      className="custom-scrollbar" // Keep custom scrollbar class if defined globally
    >
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>No.</th>
            <th style={thStyle}>Date/Time Minted</th>
            <th style={thStyle}>Collection</th>
            <th style={{...thStyle, textAlign: 'center'}}>Price</th>
            <th style={thStyle}>NFT Contract</th>
            <th style={{...thStyle, textAlign: 'center'}}>Links</th>
          </tr>
        </thead>
        <tbody>
          {mints.map((mint, index) => {
            const explorerAddressUrl = `${APECHAIN_EXPLORER_URL}/address/${mint.contractAddress}`;
            const explorerTxUrl = `${APECHAIN_EXPLORER_URL}/tx/${mint.txHash}`;
            const magicEdenCollectionUrl = `${APECHAIN_MAGICKEDEN_COLLECTION_URL_PREFIX}${mint.contractAddress}`;
            
            const collectionDisplayName = (mint.analysis?.collectionNameFromAnalyzer && mint.analysis.collectionNameFromAnalyzer !== "Unknown Collection" && mint.analysis.collectionNameFromAnalyzer !== "Unnamed Collection")
                                        ? mint.analysis.collectionNameFromAnalyzer
                                        : mint.collectionName;

            return (
              <tr key={`${mint.txHash}-${mint.logIndex}-${mint.contractAddress}-${index}`} style={{ backgroundColor: index % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'rgba(20,30,50,0.1)'}}>
                <td style={{...tdStyle, textAlign: 'center'}}>{index + 1}</td>
                <td style={tdStyle}>{formatTimestampToDateTime(mint.timestamp)}</td>
                <td style={{...tdStyle, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={`${collectionDisplayName} (Rep. Token ID: ${mint.tokenId})`}>
                  {collectionDisplayName}
                </td>
                <td style={{...tdStyle, textAlign: 'center', color: mint.isFree ? '#4ADE80' : '#FACC15' }}> {/* green-400, amber-400 */}
                  {mint.isFree ? 'Free' : (mint.mintPriceApe ? `${mint.mintPriceApe} APE` : 'Paid')}
                </td>
                <td style={tdStyle}>
                   <a 
                    href={explorerAddressUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={linkStyle}
                    title={`View contract ${mint.contractAddress} on ApeChain Explorer`}
                  >
                    {truncateAddress(mint.contractAddress)}
                  </a>
                </td>
                <td style={{...tdStyle, textAlign: 'center'}}>
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'}}>
                    <a 
                      href={explorerTxUrl}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{...linkStyle, color: '#818CF8'}} // indigo-400
                      aria-label={`View mint transaction ${mint.txHash.substring(0,10)}... for representative token ${mint.tokenId} on ApeChain Explorer`}
                      title="View Transaction on Explorer"
                    >
                      Tx
                    </a>
                    <a 
                      href={magicEdenCollectionUrl}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{...linkStyle, color: '#34D399'}} // emerald-400
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