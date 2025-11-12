/**
 * Transaction Service Interface
 * Abstraction for advanced blockchain transaction operations
 * Following the Interface Segregation Principle (ISP)
 */

/**
 * Transaction status enumeration
 */
export enum TransactionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SUCCESS = "success",
  FAILED = "failed",
  EXPIRED = "expired",
}

/**
 * Transaction details with comprehensive information
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
  data?: string;
  error?: string;
}

/**
 * Transaction history item
 */
export interface TransactionHistoryItem {
  hash: string;
  from: string;
  to: string;
  value: string; // Formatted value
  timestamp: number;
  status: TransactionStatus;
  blockNumber?: number;
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
 * Batch transfer result
 */
export interface BatchTransferResult {
  success: boolean;
  transactionHash?: string;
  transfers: Array<{
    to: string;
    value: bigint;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Gas estimation parameters
 */
export interface GasEstimationParams {
  from: string;
  to: string;
  value: bigint;
  data?: string;
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
 * Transaction filter for querying
 */
export interface TransactionFilter {
  address?: string; // Filter by from or to address
  fromAddress?: string;
  toAddress?: string;
  startBlock?: number;
  endBlock?: number;
  startTime?: number;
  endTime?: number;
  status?: TransactionStatus;
  limit?: number;
}

/**
 * Main Transaction Service Interface
 * Defines operations for advanced transaction management
 */
export interface ITransactionService {
  /**
   * Get detailed transaction information
   * @param hash - Transaction hash
   * @returns Detailed transaction information
   */
  getTransactionDetails(hash: string): Promise<TransactionDetails>;

  /**
   * Get transaction history for an address
   * @param address - Wallet address
   * @param filter - Optional filter criteria
   * @returns Array of transaction history items
   */
  getTransactionHistory(
    address: string,
    filter?: TransactionFilter
  ): Promise<TransactionHistoryItem[]>;

  /**
   * Get pending transactions for an address
   * @param address - Wallet address
   * @returns Array of pending transactions
   */
  getPendingTransactions(address: string): Promise<TransactionDetails[]>;

  /**
   * Estimate gas for a transaction
   * @param params - Gas estimation parameters
   * @returns Gas estimation details
   */
  estimateGas(params: GasEstimationParams): Promise<GasEstimation>;

  /**
   * Execute batch transfers in a single transaction
   * @param params - Batch transfer parameters
   * @returns Batch transfer result
   */
  batchTransfer(params: BatchTransferParams): Promise<BatchTransferResult>;

  /**
   * Cancel a pending transaction (if supported by blockchain)
   * @param hash - Transaction hash to cancel
   * @param privateKey - Private key of transaction sender
   * @returns New transaction hash (replacement transaction)
   */
  cancelTransaction(hash: string, privateKey: string): Promise<string>;

  /**
   * Speed up a pending transaction by increasing gas price
   * @param hash - Transaction hash to speed up
   * @param privateKey - Private key of transaction sender
   * @param newGasPrice - New gas price (optional, auto-calculated if not provided)
   * @returns New transaction hash (replacement transaction)
   */
  speedUpTransaction(
    hash: string,
    privateKey: string,
    newGasPrice?: bigint
  ): Promise<string>;

  /**
   * Verify transaction on blockchain
   * @param hash - Transaction hash
   * @returns true if transaction exists and is valid
   */
  verifyTransaction(hash: string): Promise<boolean>;

  /**
   * Get transaction count (nonce) for an address
   * @param address - Wallet address
   * @returns Transaction count
   */
  getTransactionCount(address: string): Promise<number>;

  /**
   * Decode transaction data (if applicable)
   * @param data - Transaction data to decode
   * @returns Decoded transaction data
   */
  decodeTransactionData(data: string): Promise<any>;

  /**
   * Get current gas price on the network
   * @returns Current gas price
   */
  getCurrentGasPrice(): Promise<bigint>;

  /**
   * Monitor a transaction until confirmed or timeout
   * @param hash - Transaction hash to monitor
   * @param timeoutMs - Timeout in milliseconds
   * @param onUpdate - Callback for status updates
   * @returns Final transaction details
   */
  monitorTransaction(
    hash: string,
    timeoutMs?: number,
    onUpdate?: (status: TransactionStatus) => void
  ): Promise<TransactionDetails>;

  /**
   * Get blockchain name
   * @returns Blockchain name
   */
  getBlockchainName(): string;

  /**
   * Get network name (mainnet, testnet, etc.)
   * @returns Network name
   */
  getNetworkName(): string;
}
