/**
 * Transaction Service Factory
 * Implements Factory Design Pattern for transaction service creation
 * Follows Open/Closed Principle
 */

import { ITransactionService } from "../../core/interfaces/ITransactionService.js";
import { ILogger } from "../../core/interfaces/ILogger.js";
import { SuiTransactionService } from "./SuiTransactionService.js";
import { LoggerFactory } from "../logging/LoggerFactory.js";

/**
 * Supported blockchain types for transactions
 */
export enum TransactionBlockchainType {
  SUI = "sui",
}

/**
 * Factory for creating transaction service instances
 */
export class TransactionServiceFactory {
  private static instances: Map<
    TransactionBlockchainType,
    ITransactionService
  > = new Map();
  private static logger: ILogger = LoggerFactory.getLogger(
    "TransactionServiceFactory"
  );

  /**
   * Create a transaction service for the specified blockchain
   * Uses singleton pattern to reuse instances
   */
  static createTransactionService(
    blockchain: TransactionBlockchainType,
    logger?: ILogger
  ): ITransactionService {
    // Check if instance already exists
    if (this.instances.has(blockchain)) {
      this.logger.debug(`Returning existing ${blockchain} transaction service`);
      return this.instances.get(blockchain)!;
    }

    // Create new instance based on blockchain type
    let service: ITransactionService;

    switch (blockchain) {
      case TransactionBlockchainType.SUI:
        this.logger.info("Creating Sui transaction service");
        service = new SuiTransactionService(logger);
        break;

      default:
        throw new Error(`Unsupported blockchain type: ${blockchain}`);
    }

    // Cache the instance
    this.instances.set(blockchain, service);

    return service;
  }

  /**
   * Create a transaction service from string blockchain name
   */
  static createFromString(
    blockchainName: string,
    logger?: ILogger
  ): ITransactionService {
    const normalizedName = blockchainName.toLowerCase();

    let blockchainType: TransactionBlockchainType;

    switch (normalizedName) {
      case "sui":
        blockchainType = TransactionBlockchainType.SUI;
        break;
      default:
        throw new Error(`Unknown blockchain: ${blockchainName}`);
    }

    return this.createTransactionService(blockchainType, logger);
  }

  /**
   * Clear cached instances (useful for testing)
   */
  static clearCache(): void {
    this.instances.clear();
    this.logger.debug("Cleared transaction service cache");
  }

  /**
   * Get all supported blockchains
   */
  static getSupportedBlockchains(): TransactionBlockchainType[] {
    return Object.values(TransactionBlockchainType);
  }

  /**
   * Check if a blockchain is supported
   */
  static isSupported(blockchain: string): boolean {
    const normalizedName = blockchain.toLowerCase();
    return normalizedName === "sui";
  }
}
