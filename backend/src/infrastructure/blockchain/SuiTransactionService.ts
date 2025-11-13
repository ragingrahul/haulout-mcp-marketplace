/**
 * Sui Transaction Service Implementation
 * Implements ITransactionService interface for Sui blockchain
 * Provides advanced transaction management capabilities
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { ILogger } from "../../core/interfaces/ILogger.js";
import { LoggerFactory } from "../logging/LoggerFactory.js";
import {
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

// Sui uses MIST as smallest unit (1 SUI = 1,000,000,000 MIST)
const MIST_PER_SUI = 1_000_000_000n;

/**
 * Sui Transaction Service Implementation
 */
export class SuiTransactionService implements ITransactionService {
  private logger: ILogger;
  private client: SuiClient;
  private network: "mainnet" | "testnet" | "devnet" | "localnet";
  private rpcUrl: string;

  constructor(logger?: ILogger) {
    this.logger = logger || LoggerFactory.getLogger("SuiTransactionService");

    // Determine network based on environment
    const networkEnv = process.env.SUI_NETWORK || "testnet";
    this.network = networkEnv as "mainnet" | "testnet" | "devnet" | "localnet";

    // Get RPC URL from environment or use default
    this.rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(this.network);

    // Create Sui client
    this.client = new SuiClient({ url: this.rpcUrl });

    this.logger.info(
      `Initialized SuiTransactionService on ${this.network} network`
    );
  }

  /**
   * Get detailed transaction information
   */
  async getTransactionDetails(hash: string): Promise<TransactionDetails> {
    try {
      const tx = await this.client.getTransactionBlock({
        digest: hash,
        options: {
          showEffects: true,
          showInput: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
        },
      });

      // Extract sender and recipient
      const sender = tx.transaction?.data?.sender || "";

      // Get recipient from balance changes
      let recipient = "";
      let value = 0n;

      if (tx.balanceChanges && tx.balanceChanges.length > 0) {
        // Find the balance change that represents the transfer
        const recipientChange = tx.balanceChanges.find(
          (change) => change.owner !== sender && BigInt(change.amount) > 0
        );
        if (recipientChange) {
          recipient =
            typeof recipientChange.owner === "string"
              ? recipientChange.owner
              : (recipientChange.owner as any).AddressOwner || "";
          value = BigInt(Math.abs(Number(recipientChange.amount)));
        }
      }

      // Map status
      const status = this.mapSuiStatus(tx.effects?.status?.status);

      // Get gas used
      const gasUsed = tx.effects?.gasUsed?.computationCost
        ? BigInt(tx.effects.gasUsed.computationCost)
        : undefined;

      // Get timestamp
      const timestamp = tx.timestampMs ? Number(tx.timestampMs) : undefined;

      return {
        hash,
        from: sender,
        to: recipient,
        value,
        status,
        blockNumber: tx.checkpoint ? Number(tx.checkpoint) : undefined,
        timestamp,
        gasUsed,
        gasPrice: undefined, // Sui doesn't have variable gas prices
        confirmations: tx.checkpoint ? 1 : 0,
        error: tx.effects?.status?.error,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get transaction details for ${hash}: ${error.message}`,
        error
      );
      throw new Error(`Failed to get transaction details: ${error.message}`);
    }
  }

  /**
   * Get transaction history for an address
   */
  async getTransactionHistory(
    address: string,
    filter?: TransactionFilter
  ): Promise<TransactionHistoryItem[]> {
    try {
      const limit = filter?.limit || 50;

      // Query transactions from address
      const txs = await this.client.queryTransactionBlocks({
        filter: {
          FromAddress: address,
        },
        options: {
          showEffects: true,
          showInput: true,
          showBalanceChanges: true,
        },
        limit,
      });

      const history: TransactionHistoryItem[] = [];

      for (const tx of txs.data) {
        const sender = tx.transaction?.data?.sender || address;
        let recipient = "";
        let value = "0";

        // Extract recipient and value from balance changes
        if (tx.balanceChanges && tx.balanceChanges.length > 0) {
          const recipientChange = tx.balanceChanges.find(
            (change) => change.owner !== sender && BigInt(change.amount) > 0
          );
          if (recipientChange) {
            recipient =
              typeof recipientChange.owner === "string"
                ? recipientChange.owner
                : (recipientChange.owner as any).AddressOwner || "";
            value = this.formatAmount(
              BigInt(Math.abs(Number(recipientChange.amount)))
            );
          }
        }

        const timestamp = tx.timestampMs ? Number(tx.timestampMs) : Date.now();
        const status = this.mapSuiStatus(tx.effects?.status?.status);

        // Apply filters
        if (filter?.status && status !== filter.status) continue;
        if (filter?.startTime && timestamp < filter.startTime) continue;
        if (filter?.endTime && timestamp > filter.endTime) continue;

        history.push({
          hash: tx.digest,
          from: sender,
          to: recipient,
          value,
          timestamp,
          status,
          blockNumber: tx.checkpoint ? Number(tx.checkpoint) : undefined,
        });
      }

      return history;
    } catch (error: any) {
      this.logger.error(
        `Failed to get transaction history: ${error.message}`,
        error
      );
      throw new Error(`Failed to get transaction history: ${error.message}`);
    }
  }

  /**
   * Get pending transactions for an address
   * Note: Sui has immediate finality, so pending transactions are rare
   */
  async getPendingTransactions(address: string): Promise<TransactionDetails[]> {
    try {
      // Sui transactions are typically confirmed immediately
      // Return empty array as Sui doesn't have a mempool like Ethereum
      this.logger.info(
        `Sui has immediate finality. No pending transactions for ${address}`
      );
      return [];
    } catch (error: any) {
      this.logger.error(
        `Failed to get pending transactions: ${error.message}`,
        error
      );
      return [];
    }
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(params: GasEstimationParams): Promise<GasEstimation> {
    try {
      // Create a dummy transaction to estimate gas
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [params.value]);
      tx.transferObjects([coin], params.to);

      // Dry run to estimate gas
      const result = await this.client.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client: this.client }),
      });

      const gasUsed = result.effects.gasUsed;
      const computationCost = BigInt(gasUsed.computationCost);
      const storageCost = BigInt(gasUsed.storageCost);
      const storageRebate = BigInt(gasUsed.storageRebate);

      const totalCost = computationCost + storageCost - storageRebate;

      return {
        gasLimit: computationCost,
        gasPrice: 1n, // Sui uses fixed gas price
        estimatedCost: totalCost,
        estimatedCostFormatted: this.formatAmount(totalCost),
      };
    } catch (error: any) {
      this.logger.error(`Failed to estimate gas: ${error.message}`, error);
      throw new Error(`Failed to estimate gas: ${error.message}`);
    }
  }

  /**
   * Execute batch transfers in a single transaction
   */
  async batchTransfer(
    params: BatchTransferParams
  ): Promise<BatchTransferResult> {
    try {
      const keypair = this.createKeypair(params.privateKey);

      this.logger.info(
        `Executing batch transfer with ${params.transfers.length} recipients`
      );

      // Create transaction block
      const tx = new Transaction();

      // Add all transfers to the transaction
      for (const transfer of params.transfers) {
        const [coin] = tx.splitCoins(tx.gas, [transfer.value]);
        tx.transferObjects([coin], transfer.to);
      }

      // Sign and execute transaction
      const result = await this.client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      const success = result.effects?.status?.status === "success";
      const transactionHash = result.digest;

      this.logger.info(
        `Batch transfer ${success ? "succeeded" : "failed"}: ${transactionHash}`
      );

      // Create result with all transfers marked with same status
      const transfers = params.transfers.map((transfer) => ({
        to: transfer.to,
        value: transfer.value,
        success,
        error: success ? undefined : result.effects?.status?.error,
      }));

      return {
        success,
        transactionHash,
        transfers,
      };
    } catch (error: any) {
      this.logger.error(`Batch transfer failed: ${error.message}`, error);

      // Return failure result
      const transfers = params.transfers.map((transfer) => ({
        to: transfer.to,
        value: transfer.value,
        success: false,
        error: error.message,
      }));

      return {
        success: false,
        transfers,
      };
    }
  }

  /**
   * Cancel a pending transaction
   * Note: Not applicable for Sui as transactions are immediately final
   */
  async cancelTransaction(_hash: string, _privateKey: string): Promise<string> {
    throw new Error(
      "Transaction cancellation not supported on Sui (immediate finality)"
    );
  }

  /**
   * Speed up a pending transaction
   * Note: Not applicable for Sui as transactions are immediately final
   */
  async speedUpTransaction(
    _hash: string,
    _privateKey: string,
    _newGasPrice?: bigint
  ): Promise<string> {
    throw new Error(
      "Transaction speed-up not supported on Sui (immediate finality)"
    );
  }

  /**
   * Verify transaction on blockchain
   */
  async verifyTransaction(hash: string): Promise<boolean> {
    try {
      const tx = await this.client.getTransactionBlock({
        digest: hash,
        options: {
          showEffects: true,
        },
      });

      return tx.effects?.status?.status === "success";
    } catch (error: any) {
      this.logger.warning(`Transaction verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get transaction count (nonce) for an address
   * Note: Sui doesn't use nonces like Ethereum
   */
  async getTransactionCount(address: string): Promise<number> {
    try {
      // Get all transactions from this address
      const txs = await this.client.queryTransactionBlocks({
        filter: {
          FromAddress: address,
        },
        limit: 1000, // Max limit
      });

      return txs.data.length;
    } catch (error: any) {
      this.logger.error(
        `Failed to get transaction count: ${error.message}`,
        error
      );
      return 0;
    }
  }

  /**
   * Decode transaction data
   * Note: Sui uses Move bytecode, not standard transaction data
   */
  async decodeTransactionData(data: string): Promise<any> {
    try {
      // For Sui, we'd need to decode Move bytecode
      // This is a simplified version
      this.logger.warning(
        "Transaction data decoding not fully implemented for Sui"
      );
      return {
        raw: data,
        decoded: "Move bytecode decoding not implemented",
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to decode transaction data: ${error.message}`,
        error
      );
      throw new Error(`Failed to decode transaction data: ${error.message}`);
    }
  }

  /**
   * Get current gas price on the network
   */
  async getCurrentGasPrice(): Promise<bigint> {
    try {
      // Sui uses a reference gas price
      const gasPrice = await this.client.getReferenceGasPrice();
      return BigInt(gasPrice);
    } catch (error: any) {
      this.logger.error(`Failed to get gas price: ${error.message}`, error);
      return 1n; // Default to 1 MIST
    }
  }

  /**
   * Monitor a transaction until confirmed or timeout
   */
  async monitorTransaction(
    hash: string,
    timeoutMs: number = 60000,
    onUpdate?: (status: TransactionStatus) => void
  ): Promise<TransactionDetails> {
    try {
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        try {
          const details = await this.getTransactionDetails(hash);

          if (onUpdate) {
            onUpdate(details.status);
          }

          // Sui transactions are immediately final
          if (
            details.status === TransactionStatus.SUCCESS ||
            details.status === TransactionStatus.FAILED
          ) {
            return details;
          }

          // Wait before checking again
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          // Transaction might not be indexed yet, keep waiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      throw new Error(`Transaction monitoring timed out after ${timeoutMs}ms`);
    } catch (error: any) {
      this.logger.error(
        `Transaction monitoring failed: ${error.message}`,
        error
      );
      throw new Error(`Transaction monitoring failed: ${error.message}`);
    }
  }

  /**
   * Get blockchain name
   */
  getBlockchainName(): string {
    return "Sui";
  }

  /**
   * Get network name
   */
  getNetworkName(): string {
    return this.network;
  }

  // Helper methods

  /**
   * Create keypair from private key
   */
  private createKeypair(privateKey: string): Ed25519Keypair {
    try {
      const cleanKey = privateKey.startsWith("0x")
        ? privateKey.slice(2)
        : privateKey;
      const keyBytes = Buffer.from(cleanKey, "hex");
      return Ed25519Keypair.fromSecretKey(keyBytes);
    } catch (error: any) {
      throw new Error(`Invalid private key: ${error.message}`);
    }
  }

  /**
   * Map Sui transaction status to our standard status
   */
  private mapSuiStatus(suiStatus?: string): TransactionStatus {
    if (!suiStatus) return TransactionStatus.PENDING;

    switch (suiStatus) {
      case "success":
        return TransactionStatus.SUCCESS;
      case "failure":
        return TransactionStatus.FAILED;
      default:
        return TransactionStatus.PENDING;
    }
  }

  /**
   * Format MIST to SUI string
   */
  private formatAmount(mistAmount: bigint): string {
    try {
      const sui = mistAmount / MIST_PER_SUI;
      const remainder = mistAmount % MIST_PER_SUI;

      if (remainder === 0n) {
        return sui.toString();
      }

      const decimalStr = remainder.toString().padStart(9, "0");
      const trimmedDecimal = decimalStr.replace(/0+$/, "");

      return `${sui}.${trimmedDecimal}`;
    } catch (error: any) {
      return "0";
    }
  }
}
