/**
 * Blockchain-related type definitions
 * Provides type safety for blockchain operations
 */

/**
 * Supported blockchain networks
 */
export type BlockchainNetwork = "sui";

/**
 * Network environment types
 */
export type NetworkEnvironment = "mainnet" | "testnet" | "devnet" | "localnet";

/**
 * Wallet creation result
 */
export interface WalletCreationResult {
  address: string;
  privateKey: string;
  blockchain: BlockchainNetwork;
  createdAt: Date;
}

/**
 * Encrypted wallet storage format
 */
export interface EncryptedWallet {
  address: string;
  encryptedPrivateKey: string;
  blockchain: BlockchainNetwork;
  encryptionMethod: string;
  iv?: string; // Initialization vector for encryption
}

/**
 * Transaction parameters
 */
export interface TransactionParams {
  from?: string; // Optional, derived from privateKey
  to: string;
  value: bigint;
  privateKey: string;
  gasLimit?: bigint;
  gasPrice?: bigint;
  data?: string;
}

/**
 * Transaction status
 */
export type TransactionStatus = "pending" | "success" | "failed" | "reverted";

/**
 * Transaction details
 */
export interface TransactionDetails {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  status: TransactionStatus;
  blockNumber?: number;
  timestamp?: number;
  gasUsed?: bigint;
  gasPrice?: bigint;
  confirmations?: number;
}

/**
 * Balance information
 */
export interface BalanceInfo {
  address: string;
  blockchain: BlockchainNetwork;
  balance: string; // Formatted balance
  balanceRaw: bigint; // Raw balance in smallest unit
  symbol: string; // Token symbol (ETH, SUI, etc.)
  decimals: number; // Number of decimals
  timestamp: Date;
}

/**
 * Wallet configuration
 */
export interface WalletConfig {
  blockchain: BlockchainNetwork;
  network: NetworkEnvironment;
  rpcUrl?: string;
  timeout?: number;
}

/**
 * Gas estimation result
 */
export interface GasEstimation {
  gasLimit: bigint;
  gasPrice: bigint;
  estimatedCost: bigint;
  estimatedCostFormatted: string;
}

/**
 * Multi-chain wallet
 */
export interface MultiChainWallet {
  userId: string;
  wallets: {
    [key in BlockchainNetwork]?: {
      address: string;
      encryptedPrivateKey: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Blockchain metadata
 */
export interface BlockchainMetadata {
  name: string;
  chainId: number | string;
  symbol: string;
  decimals: number;
  rpcUrls: string[];
  explorerUrls: string[];
  isEVM: boolean;
}

/**
 * Token transfer event
 */
export interface TokenTransferEvent {
  transactionHash: string;
  from: string;
  to: string;
  value: bigint;
  blockchain: BlockchainNetwork;
  timestamp: Date;
  blockNumber: number;
}

/**
 * Wallet operation result
 */
export interface WalletOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  transactionHash?: string;
}

/**
 * Batch transfer parameters
 */
export interface BatchTransferParams {
  privateKey: string;
  transfers: Array<{
    to: string;
    value: bigint;
  }>;
}

/**
 * Wallet service configuration
 */
export interface WalletServiceConfig {
  network: NetworkEnvironment;
  rpcUrl?: string;
  enableLogging?: boolean;
  timeout?: number;
  retryAttempts?: number;
  cacheEnabled?: boolean;
}

/**
 * Chain configuration
 */
export interface ChainConfiguration {
  blockchain: BlockchainNetwork;
  mainnet: {
    rpcUrl: string;
    chainId: number | string;
    explorerUrl: string;
  };
  testnet: {
    rpcUrl: string;
    chainId: number | string;
    explorerUrl: string;
  };
}

/**
 * Walrus blob metadata
 */
export interface WalrusBlob {
  blobId: string;
  size: number;
  uploadedAt: string;
}

/**
 * Sui endpoint object representation
 */
export interface SuiEndpoint {
  objectId: string;
  owner: string;
  walrusBlobId: string;
  pricePerCall: string; // MIST as string
  totalCalls: number;
  active: boolean;
  createdAt: number;
}

/**
 * Blockchain-aware endpoint (extends API endpoint)
 */
export interface BlockchainEndpoint {
  objectId?: string; // Sui object ID
  walrusBlobId?: string; // Walrus blob pointer
  onChain?: boolean; // Whether stored on blockchain
}
