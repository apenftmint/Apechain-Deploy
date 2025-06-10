
import { LogDescription } from 'ethers'; 

export interface MintData {
  txHash: string;
  contractAddress: string;
  tokenId: string; 
  collectionName: string;
  timestamp: number; 
  blockNumber: number;
  logIndex: number; 
  tokenImagePlaceholderUrl: string;
  isFree: boolean;
  valueWei?: string; 
}

export interface DecodedLogData extends LogDescription {
  // LogDescription already has name, signature, topic, args
}

// --- Types for CollectionAnalyzerService ---
export interface TokenMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type?: string; value?: any }>;
  [key: string]: any; 
}

export type MetadataStatus = 'ok' | 'broken_uri' | 'invalid_json' | 'fetch_error' | 'not_fetched' | 'no_uri_found';
export type NameSymbolStatus = 'ok' | 'blank_name_or_symbol' | 'fetch_error' | 'not_fetched';
export type FinalCollectionStatus = 'OK' | 'Issues Detected' | 'Analyzing...' | 'ErrorAnalyzing';

export interface CollectionAnalysisResult {
  contractAddress: string;
  metadataStatus: MetadataStatus;
  fetchedMetadata?: TokenMetadata | null; 
  nameSymbolStatus: NameSymbolStatus;
  collectionNameFromAnalyzer: string; 
  collectionSymbolFromAnalyzer: string; 
  finalStatus: FinalCollectionStatus;
  statusReasons: string[];
}