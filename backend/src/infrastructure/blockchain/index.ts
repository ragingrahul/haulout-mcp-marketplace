/**
 * Blockchain Infrastructure Module
 * Exports wallet services, transaction services, and related utilities
 */

// Export wallet service interfaces
export type {
  IWalletService,
  WalletCreateResult,
  TransferParams,
  TransactionReceipt,
  ChainConfig,
} from "../../core/interfaces/IWalletService.js";

// Export transaction service interfaces
export type {
  ITransactionService,
  TransactionDetails,
  TransactionHistoryItem,
  BatchTransferParams,
  BatchTransferResult,
  GasEstimationParams,
  GasEstimation,
  TransactionFilter,
} from "../../core/interfaces/ITransactionService.js";

export { TransactionStatus } from "../../core/interfaces/ITransactionService.js";

// Export wallet service implementations
export { SuiWalletService } from "./SuiWalletService.js";

// Export transaction service implementations
export { SuiTransactionService } from "./SuiTransactionService.js";

// Export wallet service factory
export {
  WalletServiceFactory,
  BlockchainType,
} from "./WalletServiceFactory.js";

// Export transaction service factory
export {
  TransactionServiceFactory,
  TransactionBlockchainType,
} from "./TransactionServiceFactory.js";
