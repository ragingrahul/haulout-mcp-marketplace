/**
 * Sui Blockchain Wallet Service
 * Implements IWalletService interface for Sui blockchain
 * Handles wallet creation, balance checking, and transaction signing for Sui
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { ILogger } from "../../core/interfaces/ILogger.js";
import { LoggerFactory } from "../logging/LoggerFactory.js";
import {
  IWalletService,
  WalletCreateResult,
  TransferParams,
  TransactionReceipt,
} from "../../core/interfaces/IWalletService.js";

// Sui uses MIST as smallest unit (1 SUI = 1,000,000,000 MIST)
const MIST_PER_SUI = 1_000_000_000n;

/**
 * Sui Wallet Service Implementation
 * Follows SOLID principles by implementing IWalletService interface
 */
export class SuiWalletService implements IWalletService {
  private logger: ILogger;
  private client: SuiClient;
  private network: "mainnet" | "testnet" | "devnet" | "localnet";
  private rpcUrl: string;

  constructor(logger?: ILogger) {
    this.logger = logger || LoggerFactory.getLogger("SuiWalletService");

    // Determine network based on environment
    const networkEnv = process.env.SUI_NETWORK || "testnet";
    this.network = networkEnv as "mainnet" | "testnet" | "devnet" | "localnet";

    // Get RPC URL from environment or use default
    this.rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(this.network);

    // Create Sui client
    this.client = new SuiClient({ url: this.rpcUrl });

    this.logger.info(
      `Initialized SuiWalletService on ${this.network} network (RPC: ${this.rpcUrl})`
    );
  }

  /**
   * Create a new Sui wallet
   * Returns the address and private key (to be encrypted before storage)
   */
  createWallet(): WalletCreateResult {
    try {
      // Generate new Ed25519 keypair for Sui
      const keypair = new Ed25519Keypair();

      // Get the address
      const address = keypair.getPublicKey().toSuiAddress();

      // Export private key in hex format
      const privateKey = keypair.getSecretKey();

      this.logger.info(`Created new Sui wallet: ${address}`);

      return {
        address,
        privateKey: Buffer.from(privateKey).toString("hex"),
      };
    } catch (error: any) {
      this.logger.error(`Failed to create Sui wallet: ${error.message}`, error);
      throw new Error(`Failed to create Sui wallet: ${error.message}`);
    }
  }

  /**
   * Get the SUI balance of a wallet address
   * Returns balance as a string in SUI (not MIST)
   */
  async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.client.getBalance({
        owner: address,
      });

      // Convert MIST to SUI
      const balanceSui = this.formatAmount(BigInt(balance.totalBalance));
      this.logger.info(`Balance for ${address}: ${balanceSui} SUI`);

      return balanceSui;
    } catch (error: any) {
      this.logger.error(
        `Failed to get balance for ${address}: ${error.message}`,
        error
      );
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Get balance in MIST as a bigint
   */
  async getBalanceRaw(address: string): Promise<bigint> {
    try {
      const balance = await this.client.getBalance({
        owner: address,
      });

      return BigInt(balance.totalBalance);
    } catch (error: any) {
      this.logger.error(
        `Failed to get balance for ${address}: ${error.message}`,
        error
      );
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Create keypair from private key
   */
  private createKeypair(privateKey: string): Ed25519Keypair {
    try {
      // Remove '0x' prefix if present
      const cleanKey = privateKey.startsWith("0x")
        ? privateKey.slice(2)
        : privateKey;

      // Convert hex string to Uint8Array
      const keyBytes = Buffer.from(cleanKey, "hex");

      // Create keypair from secret key
      return Ed25519Keypair.fromSecretKey(keyBytes);
    } catch (error: any) {
      this.logger.error(
        `Failed to create keypair from private key: ${error.message}`,
        error
      );
      throw new Error(`Invalid private key: ${error.message}`);
    }
  }

  /**
   * Transfer SUI from one address to another
   * Signs and broadcasts the transaction
   */
  async transfer(params: TransferParams): Promise<string> {
    try {
      const keypair = this.createKeypair(params.privateKey);
      const senderAddress = keypair.getPublicKey().toSuiAddress();

      this.logger.info(
        `Transferring ${this.formatAmount(params.value)} SUI from ${senderAddress} to ${params.to}`
      );

      // Create transaction block
      const tx = new Transaction();

      // Split coins and transfer
      const [coin] = tx.splitCoins(tx.gas, [params.value]);
      tx.transferObjects([coin], params.to);

      // Sign and execute transaction
      const result = await this.client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      const digest = result.digest;
      this.logger.info(`Transaction submitted: ${digest}`);

      // Check if transaction was successful
      if (result.effects?.status?.status !== "success") {
        throw new Error(
          `Transaction failed: ${result.effects?.status?.error || "Unknown error"}`
        );
      }

      return digest;
    } catch (error: any) {
      this.logger.error(`Transfer failed: ${error.message}`, error);
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }

  /**
   * Wait for transaction confirmation
   * In Sui, transactions are confirmed immediately upon execution
   */
  async waitForTransaction(hash: string): Promise<void> {
    try {
      this.logger.info(`Waiting for transaction confirmation: ${hash}`);

      // Get transaction to verify it exists and is confirmed
      await this.client.waitForTransaction({
        digest: hash,
        options: {
          showEffects: true,
        },
      });

      this.logger.info(`Transaction confirmed: ${hash}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to wait for transaction: ${error.message}`,
        error
      );
      throw new Error(`Transaction wait failed: ${error.message}`);
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    try {
      const tx = await this.client.getTransactionBlock({
        digest: hash,
        options: {
          showEffects: true,
          showInput: true,
        },
      });

      const status = tx.effects?.status?.status;
      let mappedStatus: "success" | "failed" | "pending" = "pending";

      if (status === "success") {
        mappedStatus = "success";
      } else if (status === "failure") {
        mappedStatus = "failed";
      }

      // Extract gas used
      const gasUsed = tx.effects?.gasUsed?.computationCost
        ? BigInt(tx.effects.gasUsed.computationCost)
        : undefined;

      return {
        hash: tx.digest,
        status: mappedStatus,
        blockNumber: tx.checkpoint ? Number(tx.checkpoint) : undefined,
        gasUsed,
        effectiveGasPrice: undefined, // Sui doesn't have variable gas prices in the same way
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get transaction receipt: ${error.message}`,
        error
      );
      throw new Error(`Failed to get receipt: ${error.message}`);
    }
  }

  /**
   * Check if a transaction is confirmed
   */
  async isTransactionConfirmed(hash: string): Promise<boolean> {
    try {
      const tx = await this.client.getTransactionBlock({
        digest: hash,
        options: {
          showEffects: true,
        },
      });

      return tx.effects?.status?.status === "success";
    } catch (error: any) {
      // Transaction not found or not confirmed yet
      this.logger.warning(
        `Transaction not found or not confirmed: ${hash}`,
        error
      );
      return false;
    }
  }

  /**
   * Parse SUI amount string to MIST (bigint)
   */
  parseAmount(suiAmount: string): bigint {
    try {
      // Handle decimal amounts
      const [integerPart, decimalPart = ""] = suiAmount.split(".");

      // Pad or truncate decimal part to 9 digits (MIST precision)
      const normalizedDecimal = decimalPart.padEnd(9, "0").slice(0, 9);

      // Combine integer and decimal parts
      const mistAmount =
        BigInt(integerPart) * MIST_PER_SUI + BigInt(normalizedDecimal);

      return mistAmount;
    } catch (error: any) {
      this.logger.error(`Failed to parse amount: ${error.message}`, error);
      throw new Error(`Failed to parse amount: ${error.message}`);
    }
  }

  /**
   * Format MIST (bigint) to SUI string
   */
  formatAmount(mistAmount: bigint): string {
    try {
      const sui = mistAmount / MIST_PER_SUI;
      const remainder = mistAmount % MIST_PER_SUI;

      // Format with up to 9 decimal places, removing trailing zeros
      if (remainder === 0n) {
        return sui.toString();
      }

      const decimalStr = remainder.toString().padStart(9, "0");
      const trimmedDecimal = decimalStr.replace(/0+$/, "");

      return `${sui}.${trimmedDecimal}`;
    } catch (error: any) {
      this.logger.error(`Failed to format amount: ${error.message}`, error);
      throw new Error(`Failed to format amount: ${error.message}`);
    }
  }

  /**
   * Get chain ID - For Sui, we return the network name as string
   */
  getChainId(): string {
    return this.network;
  }

  /**
   * Get chain name
   */
  getChainName(): string {
    return `Sui ${this.network.charAt(0).toUpperCase() + this.network.slice(1)}`;
  }

  /**
   * Get current network
   */
  getNetwork(): string {
    return this.network;
  }

  /**
   * Get RPC URL
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }
}

