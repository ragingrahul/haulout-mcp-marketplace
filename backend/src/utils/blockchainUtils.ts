/**
 * Blockchain Utility Functions
 * Common utilities for blockchain operations
 */

import { IWalletService } from "../core/interfaces/IWalletService.js";
import {
  WalletServiceFactory,
  BlockchainType,
} from "../infrastructure/blockchain/index.js";

/**
 * Validate a blockchain address format
 */
export function isValidAddress(
  address: string,
  blockchain: "base" | "sui" | "ethereum"
): boolean {
  if (!address) return false;

  switch (blockchain) {
    case "base":
    case "ethereum":
      // Ethereum-style addresses: 0x followed by 40 hex characters
      return /^0x[a-fA-F0-9]{40}$/.test(address);

    case "sui":
      // Sui addresses: 0x followed by 64 hex characters
      return /^0x[a-fA-F0-9]{64}$/.test(address);

    default:
      return false;
  }
}

/**
 * Validate a private key format
 */
export function isValidPrivateKey(privateKey: string): boolean {
  if (!privateKey) return false;

  // Remove 0x prefix if present
  const cleanKey = privateKey.startsWith("0x")
    ? privateKey.slice(2)
    : privateKey;

  // Check if it's a valid hex string with correct length
  // Most private keys are 64 hex characters (32 bytes)
  return /^[a-fA-F0-9]{64}$/.test(cleanKey);
}

/**
 * Format blockchain address for display (truncated)
 */
export function formatAddress(
  address: string,
  prefixLength: number = 6,
  suffixLength: number = 4
): string {
  if (!address || address.length < prefixLength + suffixLength) {
    return address;
  }

  const prefix = address.slice(0, prefixLength);
  const suffix = address.slice(-suffixLength);
  return `${prefix}...${suffix}`;
}

/**
 * Convert amount from one unit to another
 */
export function convertAmount(
  amount: string,
  fromDecimals: number,
  toDecimals: number
): string {
  const amountBigInt = BigInt(amount);
  const decimalDiff = toDecimals - fromDecimals;

  if (decimalDiff > 0) {
    return (amountBigInt * BigInt(10 ** decimalDiff)).toString();
  } else if (decimalDiff < 0) {
    return (amountBigInt / BigInt(10 ** Math.abs(decimalDiff))).toString();
  }

  return amount;
}

/**
 * Calculate percentage of amount
 */
export function calculatePercentage(
  amount: bigint,
  percentage: number
): bigint {
  if (percentage < 0 || percentage > 100) {
    throw new Error("Percentage must be between 0 and 100");
  }

  return (amount * BigInt(Math.floor(percentage * 100))) / 10000n;
}

/**
 * Wait for multiple transactions with timeout
 */
export async function waitForTransactions(
  walletService: IWalletService,
  hashes: string[],
  timeoutMs: number = 60000
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  const promises = hashes.map(async (hash) => {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      );

      await Promise.race([
        walletService.waitForTransaction(hash),
        timeoutPromise,
      ]);

      results.set(hash, true);
    } catch (error) {
      results.set(hash, false);
    }
  });

  await Promise.allSettled(promises);
  return results;
}

/**
 * Retry a blockchain operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Operation failed after retries");
}

/**
 * Compare two addresses (case-insensitive)
 */
export function addressesEqual(address1: string, address2: string): boolean {
  if (!address1 || !address2) return false;
  return address1.toLowerCase() === address2.toLowerCase();
}

/**
 * Get blockchain explorer URL for address
 */
export function getExplorerUrl(
  blockchain: "base" | "sui" | "ethereum",
  address: string,
  network: "mainnet" | "testnet" = "testnet"
): string {
  switch (blockchain) {
    case "base":
      return network === "mainnet"
        ? `https://basescan.org/address/${address}`
        : `https://sepolia.basescan.org/address/${address}`;

    case "sui":
      return network === "mainnet"
        ? `https://suiscan.xyz/mainnet/account/${address}`
        : `https://suiscan.xyz/testnet/account/${address}`;

    case "ethereum":
      return network === "mainnet"
        ? `https://etherscan.io/address/${address}`
        : `https://sepolia.etherscan.io/address/${address}`;

    default:
      return "";
  }
}

/**
 * Get blockchain explorer URL for transaction
 */
export function getTransactionExplorerUrl(
  blockchain: "base" | "sui" | "ethereum",
  txHash: string,
  network: "mainnet" | "testnet" = "testnet"
): string {
  switch (blockchain) {
    case "base":
      return network === "mainnet"
        ? `https://basescan.org/tx/${txHash}`
        : `https://sepolia.basescan.org/tx/${txHash}`;

    case "sui":
      return network === "mainnet"
        ? `https://suiscan.xyz/mainnet/tx/${txHash}`
        : `https://suiscan.xyz/testnet/tx/${txHash}`;

    case "ethereum":
      return network === "mainnet"
        ? `https://etherscan.io/tx/${txHash}`
        : `https://sepolia.etherscan.io/tx/${txHash}`;

    default:
      return "";
  }
}

/**
 * Estimate transaction cost in USD (requires price feed)
 */
export async function estimateTransactionCostUSD(
  walletService: IWalletService,
  gasCost: bigint,
  tokenPriceUSD: number
): Promise<number> {
  const gasCostFormatted = walletService.formatAmount(gasCost);
  const gasCostNumber = parseFloat(gasCostFormatted);

  return gasCostNumber * tokenPriceUSD;
}

/**
 * Batch create wallets for multiple blockchains
 */
export function batchCreateWallets(
  blockchains: BlockchainType[]
): Map<BlockchainType, { address: string; privateKey: string }> {
  const wallets = new Map();

  for (const blockchain of blockchains) {
    const walletService = WalletServiceFactory.createWalletService(blockchain);
    const wallet = walletService.createWallet();
    wallets.set(blockchain, wallet);
  }

  return wallets;
}

/**
 * Check if amount is sufficient for transfer (including gas)
 */
export async function hasSufficientBalance(
  walletService: IWalletService,
  address: string,
  transferAmount: bigint,
  estimatedGas: bigint = 0n
): Promise<boolean> {
  try {
    const balance = await walletService.getBalanceRaw(address);
    const required = transferAmount + estimatedGas;

    return balance >= required;
  } catch (error) {
    return false;
  }
}

/**
 * Parse blockchain type from string
 */
export function parseBlockchainType(blockchain: string): BlockchainType {
  const normalized = blockchain.toLowerCase();

  switch (normalized) {
    case "sui":
      return BlockchainType.SUI;
    default:
      throw new Error(`Unknown blockchain: ${blockchain}`);
  }
}

/**
 * Safe big int parsing (handles errors)
 */
export function safeParseBigInt(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch (error) {
    return null;
  }
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Generate a deterministic address from a seed (for testing)
 * WARNING: Not cryptographically secure, only for testing!
 */
export function generateTestAddress(
  seed: string,
  blockchain: "base" | "sui" | "ethereum"
): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  const hexHash = Math.abs(hash).toString(16).padStart(8, "0");

  if (blockchain === "sui") {
    return "0x" + hexHash.repeat(8);
  } else {
    return "0x" + hexHash.repeat(5);
  }
}
