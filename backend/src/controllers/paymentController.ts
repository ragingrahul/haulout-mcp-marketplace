/**
 * Payment Controller
 * Handles payment-related operations using Sui blockchain
 */

import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/auth.types.js";
import {
  WalletServiceFactory,
  BlockchainType,
  TransactionServiceFactory,
  TransactionBlockchainType,
  IWalletService,
  ITransactionService,
} from "../infrastructure/blockchain/index.js";
import {
  getOrCreateBalance,
  addDeposit,
} from "../services/balanceRepository.js";
import {
  createPricing,
  updatePricing,
  getPricingByEndpointId,
  deletePricing,
} from "../services/pricingRepository.js";
import {
  getPaymentByPaymentId,
  getPaymentsByUserId,
} from "../services/paymentRepository.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";

const log = LoggerFactory.getLogger("PaymentController");

// Initialize services using factory pattern (singleton instances)
const walletService: IWalletService = WalletServiceFactory.createWalletService(
  BlockchainType.SUI
);
const transactionService: ITransactionService =
  TransactionServiceFactory.createTransactionService(
    TransactionBlockchainType.SUI
  );

// Get platform wallet address from environment
const PLATFORM_WALLET_ADDRESS =
  process.env.PLATFORM_WALLET_ADDRESS ||
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Get user's balance (internal accounting)
 */
export async function getBalance(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");

    const balance = await getOrCreateBalance(userId, accessToken);

    res.json({
      success: true,
      balance_sui: balance.balance_eth, // Note: Field name kept as balance_eth for DB compatibility
      total_deposited_sui: balance.total_deposited_eth,
      total_spent_sui: balance.total_spent_eth,
      platform_wallet_address: PLATFORM_WALLET_ADDRESS,
      blockchain: walletService.getChainName(),
      network: transactionService.getNetworkName(),
    });
  } catch (error: any) {
    log.error(`Error getting balance: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting balance: ${error.message}`,
    });
  }
}

/**
 * Get deposit instructions
 */
export async function getDepositInstructions(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    res.json({
      success: true,
      platform_wallet_address: PLATFORM_WALLET_ADDRESS,
      blockchain: walletService.getChainName(),
      chain_id: walletService.getChainId(),
      network: transactionService.getNetworkName(),
      instructions: {
        step1: `Send SUI to platform wallet: ${PLATFORM_WALLET_ADDRESS}`,
        step2: "Include your user ID in transaction memo/data (optional)",
        step3:
          "Call POST /api/wallet/deposit with transaction hash to credit your balance",
        step4: "Wait for confirmation and check balance",
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
    });
  } catch (error: any) {
    log.error(`Error getting deposit instructions: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting deposit instructions: ${error.message}`,
    });
  }
}

/**
 * Credit user balance after deposit
 * User provides transaction hash, we verify and credit their account
 */
export async function creditDeposit(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const { tx_hash, amount_sui } = req.body;

    if (!tx_hash || !amount_sui) {
      res.status(400).json({
        success: false,
        message: "tx_hash and amount_sui are required",
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");

    // Verify transaction on blockchain
    try {
      const txDetails = await transactionService.getTransactionDetails(tx_hash);

      // Verify the transaction is successful
      if (txDetails.status !== "success") {
        res.status(400).json({
          success: false,
          message: `Transaction verification failed: Transaction status is ${txDetails.status}`,
        });
        return;
      }

      // Verify recipient is the platform wallet
      if (
        txDetails.to.toLowerCase() !== PLATFORM_WALLET_ADDRESS.toLowerCase()
      ) {
        res.status(400).json({
          success: false,
          message: `Transaction verification failed: Recipient does not match platform wallet`,
        });
        return;
      }

      // Verify amount (convert to formatted string for comparison)
      const expectedAmount = walletService.parseAmount(amount_sui);
      const actualAmount = txDetails.value;

      if (actualAmount < expectedAmount) {
        res.status(400).json({
          success: false,
          message: `Transaction verification failed: Amount mismatch. Expected at least ${amount_sui} SUI, got ${walletService.formatAmount(actualAmount)} SUI`,
        });
        return;
      }

      // Credit user's balance (using actual amount from blockchain)
      const actualAmountFormatted = walletService.formatAmount(actualAmount);
      const updatedBalance = await addDeposit(
        userId,
        actualAmountFormatted,
        accessToken
      );

      log.info(
        `Credited ${actualAmountFormatted} SUI to user ${userId} from tx ${tx_hash}`
      );

      res.json({
        success: true,
        message: "Deposit credited successfully",
        balance: updatedBalance,
        verified_tx_hash: tx_hash,
        credited_amount: actualAmountFormatted,
        blockchain_status: txDetails.status,
      });
    } catch (error: any) {
      log.error(`Transaction verification failed: ${error.message}`, error);
      res.status(400).json({
        success: false,
        message: `Transaction verification failed: ${error.message}`,
      });
      return;
    }
  } catch (error: any) {
    log.error(`Error crediting deposit: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error crediting deposit: ${error.message}`,
    });
  }
}

/**
 * Manual credit (for admin/testing - should be protected)
 */
export async function manualCredit(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const { amount_sui } = req.body;

    if (!amount_sui) {
      res.status(400).json({
        success: false,
        message: "amount_sui is required",
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");

    const updatedBalance = await addDeposit(userId, amount_sui, accessToken);

    log.info(`Manual credit of ${amount_sui} SUI to user ${userId}`);

    res.json({
      success: true,
      message: "Balance credited successfully",
      balance: updatedBalance,
    });
  } catch (error: any) {
    log.error(`Error with manual credit: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error crediting balance: ${error.message}`,
    });
  }
}

/**
 * Set or update pricing for an endpoint (developer only)
 */
export async function setPricing(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const endpointId = req.params.endpointId;
    const { price_per_call_sui, developer_wallet_address } = req.body;

    if (!price_per_call_sui || !developer_wallet_address) {
      res.status(400).json({
        success: false,
        message: "price_per_call_sui and developer_wallet_address are required",
      });
      return;
    }

    // Validate Sui address format (64 hex characters)
    if (!/^0x[a-fA-F0-9]{64}$/.test(developer_wallet_address)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid Sui wallet address format. Expected 64 hex characters after 0x",
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");

    // Check if pricing already exists
    const existing = await getPricingByEndpointId(endpointId);

    let pricing;
    if (existing) {
      pricing = await updatePricing(
        endpointId,
        {
          price_per_call_eth: price_per_call_sui, // DB field name kept for compatibility
          developer_wallet_address,
        },
        accessToken
      );
    } else {
      pricing = await createPricing(
        {
          endpoint_id: endpointId,
          price_per_call_eth: price_per_call_sui, // DB field name kept for compatibility
          developer_wallet_address,
        },
        accessToken
      );
    }

    res.json({
      success: true,
      message: "Pricing set successfully",
      pricing: {
        ...pricing,
        price_per_call_sui: pricing.price_per_call_eth, // Return with SUI naming
      },
    });
  } catch (error: any) {
    log.error(`Error setting pricing: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error setting pricing: ${error.message}`,
    });
  }
}

/**
 * Get pricing for an endpoint (public)
 */
export async function getPricing(req: Request, res: Response): Promise<void> {
  try {
    const endpointId = req.params.endpointId;

    const pricing = await getPricingByEndpointId(endpointId);

    if (!pricing) {
      res.status(404).json({
        success: false,
        message: "No pricing set for this endpoint",
      });
      return;
    }

    res.json({
      success: true,
      pricing: {
        ...pricing,
        price_per_call_sui: pricing.price_per_call_eth, // Return with SUI naming
      },
    });
  } catch (error: any) {
    log.error(`Error getting pricing: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting pricing: ${error.message}`,
    });
  }
}

/**
 * Delete pricing for an endpoint (developer only)
 */
export async function removePricing(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const endpointId = req.params.endpointId;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");

    await deletePricing(endpointId, accessToken);

    res.json({
      success: true,
      message: "Pricing removed successfully",
    });
  } catch (error: any) {
    log.error(`Error removing pricing: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error removing pricing: ${error.message}`,
    });
  }
}

/**
 * Get payment transaction history for user
 */
export async function getPaymentHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");

    const payments = await getPaymentsByUserId(userId, accessToken);

    res.json({
      success: true,
      payments,
      count: payments.length,
      blockchain: walletService.getChainName(),
    });
  } catch (error: any) {
    log.error(`Error getting payment history: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting payment history: ${error.message}`,
    });
  }
}

/**
 * Check payment status
 */
export async function checkPaymentStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const paymentId = req.params.paymentId;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");

    const payment = await getPaymentByPaymentId(paymentId, accessToken);

    if (!payment) {
      res.status(404).json({
        success: false,
        message: "Payment not found",
      });
      return;
    }

    if (payment.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Unauthorized to view this payment",
      });
      return;
    }

    // If payment has a tx_hash, check blockchain status
    let blockchainStatus;
    if (payment.blockchain_tx_hash) {
      try {
        const txDetails = await transactionService.getTransactionDetails(
          payment.blockchain_tx_hash
        );
        blockchainStatus = {
          status: txDetails.status,
          confirmations: txDetails.confirmations,
          blockNumber: txDetails.blockNumber,
          timestamp: txDetails.timestamp,
          gasUsed: txDetails.gasUsed
            ? walletService.formatAmount(txDetails.gasUsed)
            : undefined,
        };
      } catch (error: any) {
        log.warning(
          `Could not get blockchain status for tx ${payment.blockchain_tx_hash}: ${error.message}`
        );
        blockchainStatus = {
          status: "unknown",
          error: error.message,
        };
      }
    }

    res.json({
      success: true,
      payment,
      blockchain_status: blockchainStatus,
      blockchain: walletService.getChainName(),
    });
  } catch (error: any) {
    log.error(`Error checking payment status: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error checking payment status: ${error.message}`,
    });
  }
}

/**
 * Get transaction details from blockchain
 */
export async function getTransactionDetails(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const { tx_hash } = req.params;

    if (!tx_hash) {
      res.status(400).json({
        success: false,
        message: "tx_hash is required",
      });
      return;
    }

    const details = await transactionService.getTransactionDetails(tx_hash);

    res.json({
      success: true,
      transaction: {
        hash: details.hash,
        from: details.from,
        to: details.to,
        value: walletService.formatAmount(details.value),
        status: details.status,
        blockNumber: details.blockNumber,
        timestamp: details.timestamp,
        gasUsed: details.gasUsed
          ? walletService.formatAmount(details.gasUsed)
          : undefined,
        confirmations: details.confirmations,
      },
      blockchain: walletService.getChainName(),
    });
  } catch (error: any) {
    log.error(`Error getting transaction details: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting transaction details: ${error.message}`,
    });
  }
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const { from, to, amount_sui } = req.body;

    if (!from || !to || !amount_sui) {
      res.status(400).json({
        success: false,
        message: "from, to, and amount_sui are required",
      });
      return;
    }

    const value = walletService.parseAmount(amount_sui);

    const estimate = await transactionService.estimateGas({
      from,
      to,
      value,
    });

    res.json({
      success: true,
      estimate: {
        gasLimit: estimate.gasLimit.toString(),
        gasPrice: estimate.gasPrice.toString(),
        estimatedCost: estimate.estimatedCostFormatted,
        totalCost: (
          parseFloat(amount_sui) + parseFloat(estimate.estimatedCostFormatted)
        ).toString(),
      },
      blockchain: walletService.getChainName(),
    });
  } catch (error: any) {
    log.error(`Error estimating gas: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error estimating gas: ${error.message}`,
    });
  }
}

// Export services for use in other modules
export { walletService, transactionService, PLATFORM_WALLET_ADDRESS };
