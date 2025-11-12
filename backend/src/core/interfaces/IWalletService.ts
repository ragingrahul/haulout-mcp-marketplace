/**
 * Wallet Service Interface
 * Abstraction for blockchain wallet operations to support multiple chains
 * Following the Interface Segregation Principle (ISP)
 */

/**
 * Result when creating a new wallet
 */
export interface WalletCreateResult {
  address: string;
  privateKey: string;
}

/**
 * Parameters for transferring native tokens
 */
export interface TransferParams {
  privateKey: string;
  to: string;
  value: bigint;
}

/**
 * Transaction receipt information
 */
export interface TransactionReceipt {
  hash: string;
  status: "success" | "failed" | "pending";
  blockNumber?: number;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
}

/**
 * Main wallet service interface
 * Defines operations for wallet management and transactions
 */
export interface IWalletService {
  /**
   * Create a new wallet on the blockchain
   * @returns WalletCreateResult containing address and private key
   */
  createWallet(): WalletCreateResult;

  /**
   * Get the native token balance of a wallet address
   * @param address - The wallet address
   * @returns Balance as a formatted string (e.g., "1.5" for 1.5 ETH/SUI)
   */
  getBalance(address: string): Promise<string>;

  /**
   * Get balance in the smallest unit (wei/MIST) as a bigint
   * @param address - The wallet address
   * @returns Balance as bigint
   */
  getBalanceRaw(address: string): Promise<bigint>;

  /**
   * Transfer native tokens from one address to another
   * @param params - Transfer parameters including privateKey, to, and value
   * @returns Transaction hash
   */
  transfer(params: TransferParams): Promise<string>;

  /**
   * Wait for transaction confirmation
   * @param hash - Transaction hash to wait for
   */
  waitForTransaction(hash: string): Promise<void>;

  /**
   * Get transaction receipt
   * @param hash - Transaction hash
   * @returns TransactionReceipt object
   */
  getTransactionReceipt(hash: string): Promise<TransactionReceipt>;

  /**
   * Check if a transaction is confirmed
   * @param hash - Transaction hash
   * @returns true if confirmed, false otherwise
   */
  isTransactionConfirmed(hash: string): Promise<boolean>;

  /**
   * Parse a formatted amount string to smallest unit (bigint)
   * @param amount - Amount as string (e.g., "1.5")
   * @returns Amount in smallest unit as bigint
   */
  parseAmount(amount: string): bigint;

  /**
   * Format smallest unit (bigint) to readable amount string
   * @param amount - Amount in smallest unit
   * @returns Formatted amount string
   */
  formatAmount(amount: bigint): string;

  /**
   * Get blockchain chain/network ID
   * @returns Chain ID
   */
  getChainId(): number | string;

  /**
   * Get blockchain chain/network name
   * @returns Chain name
   */
  getChainName(): string;
}

/**
 * Chain configuration interface
 * Allows for flexible chain configuration
 */
export interface ChainConfig {
  id: number | string;
  name: string;
  rpcUrl: string;
  isMainnet: boolean;
}
