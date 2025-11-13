/**
 * Blockchain Infrastructure Module
 * Exports wallet services, transaction services, and related utilities
 */

// Export wallet service interfaces
export {
  IWalletService,
  WalletCreateResult,
  TransferParams,
  TransactionReceipt,
  ChainConfig,
} from "../../core/interfaces/IWalletService.js";

// Export transaction service interfaces
export {
  ITransactionService,
  TransactionDetails,
  TransactionHistoryItem,
  TransactionStatus,
  BatchTransferParams,
  BatchTransferResult,
  GasEstimationParams,
  GasEstimation,
  TransactionFilter,
} from "../../core/interfaces/ITransactionService.js";

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
