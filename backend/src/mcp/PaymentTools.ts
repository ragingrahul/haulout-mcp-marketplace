/**
 * Payment MCP Tools
 * Provides MCP tools for payment operations like approve_payment, get_wallet_balance, etc.
 * Refactored for Sui blockchain compatibility
 */

import { MCPTool } from "../types/mcp.types.js";
import { PLATFORM_WALLET_ADDRESS } from "../controllers/paymentController.js";
import {
  getOrCreateBalance,
  deductPayment,
} from "../services/balanceRepository.js";
import {
  getPaymentByPaymentId,
  markPaymentFailed,
} from "../services/paymentRepository.js";
import { PaymentStatus } from "../types/payment.types.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";
import {
  WalletServiceFactory,
  BlockchainType,
  IWalletService,
} from "../infrastructure/blockchain/index.js";

const log = LoggerFactory.getLogger("PaymentTools");

// Initialize wallet service using factory pattern
const walletService: IWalletService = WalletServiceFactory.createWalletService(
  BlockchainType.SUI
);

/**
 * Tool definitions for payment operations
 */
export const PAYMENT_TOOLS: Record<string, MCPTool> = {
  approve_payment: {
    name: "approve_payment",
    description:
      "Approve and execute a payment for a paid API tool. This signs and broadcasts the transaction from your managed wallet to pay for the tool usage on Sui blockchain.",
    inputSchema: {
      type: "object",
      properties: {
        payment_id: {
          type: "string",
          description: "Payment ID received from 402 Payment Required response",
        },
      },
      required: ["payment_id"],
    },
  },

  get_balance: {
    name: "get_balance",
    description:
      "Check your balance in the platform. Returns the current SUI balance available for paying for tools.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  check_payment_status: {
    name: "check_payment_status",
    description:
      "Check if a payment transaction has been confirmed on-chain. Use this to verify payment before retrying a paid tool call.",
    inputSchema: {
      type: "object",
      properties: {
        payment_id: {
          type: "string",
          description: "Payment ID to check status for",
        },
      },
      required: ["payment_id"],
    },
  },

  get_deposit_address: {
    name: "get_deposit_address",
    description:
      "Get your managed wallet address and deposit instructions. Use this to find where to send SUI to fund your wallet.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

/**
 * Execute the approve_payment tool
 * Deducts from user balance and sends actual blockchain transaction
 */
export async function executeApprovePayment(
  userId: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const { payment_id } = args;

    if (!payment_id) {
      throw new Error("payment_id is required");
    }

    log.info(
      `Executing approve_payment for user ${userId}, payment ${payment_id}`
    );

    // Get payment details
    const payment = await getPaymentByPaymentId(payment_id);

    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.user_id !== userId) {
      throw new Error("Unauthorized: This payment belongs to another user");
    }

    if (payment.status !== "pending") {
      throw new Error(
        `Payment cannot be processed. Current status: ${payment.status}`
      );
    }

    // Get user's balance
    const balance = await getOrCreateBalance(userId);

    const currentBalance = parseFloat(balance.balance_eth); // DB field name kept for compatibility
    const paymentAmount = parseFloat(payment.amount_eth); // DB field name kept for compatibility

    if (currentBalance < paymentAmount) {
      return {
        success: false,
        message: `Insufficient balance. Required: ${payment.amount_eth} SUI, Available: ${currentBalance} SUI`,
        required_amount: payment.amount_eth,
        current_balance: currentBalance.toString(),
        shortfall: (paymentAmount - currentBalance).toFixed(9),
        platform_wallet: PLATFORM_WALLET_ADDRESS,
        blockchain: walletService.getChainName(),
        instructions:
          "Please deposit more SUI to the platform wallet and try again.",
      };
    }

    // Deduct from user's balance (internal accounting)
    await deductPayment(userId, payment.amount_eth);
    log.info(`✓ Deducted ${payment.amount_eth} SUI from user balance`);

    // Send blockchain transaction
    log.info(`🔗 Initiating Sui blockchain transaction...`);
    const { updatePaymentTransaction } = await import(
      "../services/paymentRepository.js"
    );

    try {
      // Mark as processing
      await updatePaymentTransaction(payment_id, {
        status: PaymentStatus.PROCESSING,
      });

      // Get platform wallet private key from env
      const platformPrivateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY;
      if (!platformPrivateKey) {
        throw new Error("PLATFORM_WALLET_PRIVATE_KEY not configured");
      }

      // Parse amount to MIST (smallest unit)
      const amountMist = walletService.parseAmount(payment.amount_eth);

      // Send SUI transaction from platform wallet to developer wallet
      log.info(`Sending ${payment.amount_eth} SUI to ${payment.to_wallet}...`);
      const txHash = await walletService.transfer({
        privateKey: platformPrivateKey,
        to: payment.to_wallet,
        value: amountMist,
      });

      log.info(`✓ Transaction submitted: ${txHash}`);
      log.info(`⏳ Waiting for confirmation...`);

      // Wait for transaction confirmation
      await walletService.waitForTransaction(txHash);

      log.info(`✅ Transaction confirmed: ${txHash}`);

      // Mark payment as completed with blockchain tx hash
      await updatePaymentTransaction(payment_id, {
        status: PaymentStatus.COMPLETED,
        blockchain_tx_hash: txHash,
      });

      const newBalance = (currentBalance - paymentAmount).toFixed(9);

      // Get blockchain explorer URL
      const network = process.env.SUI_NETWORK || "testnet";
      const explorerUrl =
        network === "mainnet"
          ? `https://suiscan.xyz/mainnet/tx/${txHash}`
          : `https://suiscan.xyz/testnet/tx/${txHash}`;

      return {
        success: true,
        payment_id: payment_id,
        amount: payment.amount_eth,
        currency: "SUI",
        blockchain: walletService.getChainName(),
        status: "completed",
        blockchain_tx_hash: txHash,
        explorer_url: explorerUrl,
        message: `✅ Payment successful! Sui blockchain transaction confirmed.\n\nTransaction: ${txHash}\nExplorer: ${explorerUrl}\nBalance: ${newBalance} SUI\n\n🔑 CRITICAL: Include "_payment_id" in your next tool call:\n\n_payment_id: "${payment_id}"`,
        remaining_balance: newBalance,
        next_action: `Call the original tool again with _payment_id: "${payment_id}" as an additional parameter`,
        example: `get_weather(latitude: 51.5, longitude: -0.1, _payment_id: "${payment_id}")`,
      };
    } catch (blockchainError: any) {
      // Blockchain transaction failed - refund user's balance
      log.error(`Blockchain transaction failed: ${blockchainError.message}`);

      // Refund the deducted amount
      const { addDeposit } = await import("../services/balanceRepository.js");
      await addDeposit(userId, payment.amount_eth);
      log.info(`✓ Refunded ${payment.amount_eth} SUI to user balance`);

      // Mark payment as failed
      await markPaymentFailed(
        payment_id,
        `Blockchain transaction failed: ${blockchainError.message}`
      );

      return {
        success: false,
        message: `Payment failed: ${blockchainError.message}`,
        error: blockchainError.message,
        blockchain: walletService.getChainName(),
        refunded: true,
        refund_amount: payment.amount_eth,
        currency: "SUI",
        note: "Your balance has been refunded. Please try again or contact support.",
      };
    }
  } catch (error: any) {
    log.error(`Error executing approve_payment: ${error.message}`, error);

    // Try to mark payment as failed if we have payment_id
    if (args.payment_id) {
      try {
        await markPaymentFailed(args.payment_id, error.message);
      } catch (e) {
        // Ignore errors when updating payment status
      }
    }

    throw new Error(`Payment failed: ${error.message}`);
  }
}

/**
 * Execute the get_balance tool
 */
export async function executeGetBalance(
  userId: string,
  _args: Record<string, any>
): Promise<any> {
  try {
    log.info(`Executing get_balance for user ${userId}`);

    const balance = await getOrCreateBalance(userId);

    return {
      success: true,
      balance_sui: balance.balance_eth, // DB field name kept for compatibility
      total_deposited_sui: balance.total_deposited_eth,
      total_spent_sui: balance.total_spent_eth,
      currency: "SUI",
      blockchain: walletService.getChainName(),
      chain_id: walletService.getChainId(),
      platform_wallet_address: PLATFORM_WALLET_ADDRESS,
      note: "This is your internal balance. Deposit SUI to the platform wallet to increase it.",
    };
  } catch (error: any) {
    log.error(`Error executing get_balance: ${error.message}`, error);
    throw new Error(`Failed to get balance: ${error.message}`);
  }
}

/**
 * Execute the check_payment_status tool
 */
export async function executeCheckPaymentStatus(
  userId: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const { payment_id } = args;

    if (!payment_id) {
      throw new Error("payment_id is required");
    }

    log.info(
      `Executing check_payment_status for user ${userId}, payment ${payment_id}`
    );

    const payment = await getPaymentByPaymentId(payment_id);

    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.user_id !== userId) {
      throw new Error("Unauthorized: This payment belongs to another user");
    }

    const isCompleted = payment.status === "completed";

    // If payment has a blockchain tx hash, get additional info
    let blockchainInfo;
    if (payment.blockchain_tx_hash && isCompleted) {
      const network = process.env.SUI_NETWORK || "testnet";
      const explorerUrl =
        network === "mainnet"
          ? `https://suiscan.xyz/mainnet/tx/${payment.blockchain_tx_hash}`
          : `https://suiscan.xyz/testnet/tx/${payment.blockchain_tx_hash}`;

      blockchainInfo = {
        tx_hash: payment.blockchain_tx_hash,
        explorer_url: explorerUrl,
        blockchain: walletService.getChainName(),
      };
    }

    return {
      success: true,
      payment_id: payment.payment_id,
      status: payment.status,
      amount_sui: payment.amount_eth, // DB field name kept for compatibility
      currency: "SUI",
      is_completed: isCompleted,
      can_retry_tool_call: isCompleted,
      blockchain_info: blockchainInfo,
      message: isCompleted
        ? "Payment completed! You can now retry your original tool call with this payment_id."
        : "Payment not yet completed. Call approve_payment first.",
    };
  } catch (error: any) {
    log.error(`Error executing check_payment_status: ${error.message}`, error);
    throw new Error(`Failed to check payment status: ${error.message}`);
  }
}

/**
 * Execute the get_deposit_address tool
 */
export async function executeGetDepositAddress(
  userId: string,
  _args: Record<string, any>
): Promise<any> {
  try {
    log.info(`Executing get_deposit_address for user ${userId}`);

    const balance = await getOrCreateBalance(userId);
    const network = process.env.SUI_NETWORK || "testnet";

    return {
      success: true,
      platform_wallet_address: PLATFORM_WALLET_ADDRESS,
      your_current_balance_sui: balance.balance_eth, // DB field name kept for compatibility
      currency: "SUI",
      blockchain: walletService.getChainName(),
      chain_id: walletService.getChainId(),
      network: network,
      deposit_instructions: {
        step1: `Send SUI to platform wallet: ${PLATFORM_WALLET_ADDRESS}`,
        step2: "Copy the transaction hash after sending",
        step3:
          "Call POST /api/wallet/deposit with tx_hash and amount_sui to credit your balance",
        step4:
          "Or use POST /api/wallet/manual for testing (manual credit without verification)",
      },
      deposit_methods: [
        {
          method: "Direct Transfer",
          description: `Send SUI directly to ${PLATFORM_WALLET_ADDRESS} on ${walletService.getChainName()}`,
        },
        {
          method: "Sui Wallet",
          description: "Use Sui Wallet, Suiet, or Ethos Wallet to transfer SUI",
        },
        {
          method: "Exchange Withdrawal",
          description:
            "Withdraw SUI from supported exchanges directly to the platform wallet",
        },
      ],
      wallet_compatibility: [
        "Sui Wallet (Chrome Extension)",
        "Suiet Wallet",
        "Ethos Wallet",
        "Martian Wallet",
      ],
      note: "This is a shared platform wallet. Your balance is tracked internally via our accounting system.",
    };
  } catch (error: any) {
    log.error(`Error executing get_deposit_address: ${error.message}`, error);
    throw new Error(`Failed to get deposit address: ${error.message}`);
  }
}

/**
 * Execute a payment tool by name
 */
export async function executePaymentTool(
  toolName: string,
  userId: string,
  args: Record<string, any>
): Promise<any> {
  switch (toolName) {
    case "approve_payment":
      return executeApprovePayment(userId, args);
    case "get_balance":
      return executeGetBalance(userId, args);
    case "check_payment_status":
      return executeCheckPaymentStatus(userId, args);
    case "get_deposit_address":
      return executeGetDepositAddress(userId, args);
    default:
      throw new Error(`Unknown payment tool: ${toolName}`);
  }
}
