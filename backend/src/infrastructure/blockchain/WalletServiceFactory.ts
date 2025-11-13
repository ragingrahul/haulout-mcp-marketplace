/**
 * Wallet Service Factory
 * Implements Factory Design Pattern to create appropriate wallet service instances
 * Follows Open/Closed Principle - open for extension, closed for modification
 */

import { IWalletService } from "../../core/interfaces/IWalletService.js";
import { ILogger } from "../../core/interfaces/ILogger.js";
import { SuiWalletService } from "./SuiWalletService.js";
import { LoggerFactory } from "../logging/LoggerFactory.js";

/**
 * Supported blockchain types
 */
export enum BlockchainType {
  SUI = "sui",
}

/**
 * Factory for creating wallet service instances
 * Provides a centralized way to instantiate blockchain-specific wallet services
 */
export class WalletServiceFactory {
  private static instances: Map<BlockchainType, IWalletService> = new Map();
  private static logger: ILogger = LoggerFactory.getLogger(
    "WalletServiceFactory"
  );

  /**
   * Create a wallet service for the specified blockchain
   * Uses singleton pattern to reuse instances
   */
  static createWalletService(
    blockchain: BlockchainType,
    logger?: ILogger
  ): IWalletService {
    // Check if instance already exists
    if (this.instances.has(blockchain)) {
      this.logger.debug(`Returning existing ${blockchain} wallet service`);
      return this.instances.get(blockchain)!;
    }

    // Create new instance based on blockchain type
    let service: IWalletService;

    switch (blockchain) {
      case BlockchainType.SUI:
        this.logger.info("Creating Sui wallet service");
        service = new SuiWalletService(logger);
        break;

      default:
        throw new Error(`Unsupported blockchain type: ${blockchain}`);
    }

    // Cache the instance
    this.instances.set(blockchain, service);

    return service;
  }

  /**
   * Create a wallet service from string blockchain name
   */
  static createFromString(
    blockchainName: string,
    logger?: ILogger
  ): IWalletService {
    const normalizedName = blockchainName.toLowerCase();

    // Map string to BlockchainType enum
    let blockchainType: BlockchainType;

    switch (normalizedName) {
      case "sui":
        blockchainType = BlockchainType.SUI;
        break;
      default:
        throw new Error(`Unknown blockchain: ${blockchainName}`);
    }

    return this.createWalletService(blockchainType, logger);
  }

  /**
   * Clear cached instances (useful for testing)
   */
  static clearCache(): void {
    this.instances.clear();
    this.logger.debug("Cleared wallet service cache");
  }

  /**
   * Get all supported blockchains
   */
  static getSupportedBlockchains(): BlockchainType[] {
    return Object.values(BlockchainType);
  }

  /**
   * Check if a blockchain is supported
   */
  static isSupported(blockchain: string): boolean {
    const normalizedName = blockchain.toLowerCase();
    return normalizedName === "sui";
  }
}
