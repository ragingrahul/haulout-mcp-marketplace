/**
 * Payment Controller
 * Handles payment-related operations using Sui blockchain
 */

/**
 * Payment Controller (Refactored for Non-Custodial Model)
 * Queries on-chain balances and provides blockchain transaction data.
 * No platform custody of user funds.
 */

import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/auth.types.js";
import {
  createPricing,
  updatePricing,
  getPricingByEndpointId,
  deletePricing,
} from "../services/pricingRepository.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";
import { SuiRegistryService } from "../services/suiRegistryService.js";
import { supabaseAdmin } from "../services/supabase.js";

const log = LoggerFactory.getLogger("PaymentController");
const suiRegistry = new SuiRegistryService();

/**
 * Get user's on-chain balance
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

    // Get user's wallet address
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error || !profile?.wallet_address) {
      res.status(400).json({
        success: false,
        message: "No wallet connected. Please connect a Sui wallet first.",
        action_required: "POST /api/wallet/connect",
      });
      return;
    }

    const walletAddress = profile.wallet_address;

    try {
      // Query for UserBalance object (it's a shared object, not owned)
      const client = suiRegistry.getClient();
      const packageId = suiRegistry.getPackageId();

      // UserBalance is now a shared object, so we query by dynamic field
      // We need to get all UserBalance objects and filter by owner field
      const response = await client.queryEvents({
        query: {
          MoveEventType: `${packageId}::payment_system::BalanceCreated`,
        },
        limit: 50,
      });

      // Find the BalanceCreated event for this user
      let userBalanceId: string | null = null;
      for (const event of response.data) {
        const eventData = event.parsedJson as any;
        if (eventData.user === walletAddress) {
          // Get the object created in this transaction
          const txDetails = await client.getTransactionBlock({
            digest: event.id.txDigest,
            options: {
              showObjectChanges: true,
            },
          });

          const createdObject = txDetails.objectChanges?.find(
            (change) =>
              change.type === "created" &&
              change.objectType.includes("::payment_system::UserBalance")
          );

          if (createdObject && "objectId" in createdObject) {
            userBalanceId = createdObject.objectId;
            break;
          }
        }
      }

      // If no UserBalance found via events, return no account
      if (!userBalanceId) {
        const nativeSuiBalanceMist =
          await suiRegistry.getSuiBalance(walletAddress);
        const nativeSuiBalance = (
          parseFloat(nativeSuiBalanceMist) / 1_000_000_000
        ).toFixed(9);

        res.json({
          success: true,
          has_balance_account: false,
          balance_sui: nativeSuiBalance,
          total_deposited_sui: "0.000000000",
          total_spent_sui: "0.000000000",
          wallet_address: walletAddress,
          native_sui_balance: nativeSuiBalance,
          message: "No balance tracking account. Using native SUI balance.",
          blockchain: "Sui",
          network: process.env.SUI_NETWORK || "testnet",
        });
        return;
      }

      // Get the UserBalance object details
      const balanceObjResponse = await client.getObject({
        id: userBalanceId,
        options: {
          showContent: true,
        },
      });

      if (
        !balanceObjResponse.data?.content ||
        balanceObjResponse.data.content.dataType !== "moveObject"
      ) {
        throw new Error("Invalid balance object");
      }

      const balanceObj = balanceObjResponse.data;

      if (!balanceObj.content || balanceObj.content.dataType !== "moveObject") {
        throw new Error("Invalid balance object content");
      }

      const fields = balanceObj.content.fields as any;

      // Get native SUI balance (in MIST) and convert to SUI with 9 decimals
      const nativeSuiBalanceMist =
        await suiRegistry.getSuiBalance(walletAddress);
      const nativeSuiBalance = (
        parseFloat(nativeSuiBalanceMist) / 1_000_000_000
      ).toFixed(9);
      const totalDepositedSui = (
        parseFloat(fields.total_deposited) / 1_000_000_000
      ).toFixed(9);
      const totalSpentSui = (
        parseFloat(fields.total_spent) / 1_000_000_000
      ).toFixed(9);
      const balanceSui = (
        parseFloat(totalDepositedSui) - parseFloat(totalSpentSui)
      ).toFixed(9);

      res.json({
        success: true,
        has_balance_account: true,
        balance_object_id: userBalanceId,
        wallet_address: walletAddress,
        balance_sui: balanceSui,
        total_deposited_mist: fields.total_deposited,
        total_spent_mist: fields.total_spent,
        total_deposited_sui: totalDepositedSui,
        total_spent_sui: totalSpentSui,
        native_sui_balance: nativeSuiBalance,
        blockchain: "Sui",
        network: process.env.SUI_NETWORK || "testnet",
      });
    } catch (error: any) {
      log.error(`Error querying on-chain balance: ${error.message}`, error);
      res.status(500).json({
        success: false,
        message: `Error querying balance: ${error.message}`,
      });
    }
  } catch (error: any) {
    log.error(`Error getting balance: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting balance: ${error.message}`,
    });
  }
}

/**
 * Get smart contract interaction instructions
 * REMOVED: No longer using custodial deposits
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

    // Get user's wallet address
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    const packageId = suiRegistry.getPackageId();
    const network = process.env.SUI_NETWORK || "testnet";

    res.json({
      success: true,
      model: "Non-custodial",
      message:
        "Payments go directly from your wallet to API developers via smart contract",
      blockchain: "Sui",
      network: network,
      your_wallet: profile?.wallet_address || "Not connected",
      smart_contract_package: packageId,
      payment_flow: {
        step1: "Connect your Sui wallet (Suiet, Sui Wallet, etc.)",
        step2: "When calling paid API, you'll get transaction data",
        step3: "Sign transaction with your wallet",
        step4: "Payment goes directly to developer - no intermediary!",
      },
      benefits: [
        "You control your funds (non-custodial)",
        "Direct peer-to-peer payments",
        "On-chain transparency",
        "No platform custody risk",
      ],
    });
  } catch (error: any) {
    log.error(`Error getting instructions: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting instructions: ${error.message}`,
    });
  }
}

/**
 * REMOVED: Credit deposit (custodial model)
 * Users now interact directly with smart contract
 */
export async function creditDeposit(_: Request, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    message: "Custodial deposits removed. Use smart contract directly.",
    model: "Non-custodial",
    instructions:
      "Interact with Sui smart contract for deposits. See GET /api/wallet/deposit for details.",
  });
}

/**
 * REMOVED: Manual credit (no longer needed with non-custodial model)
 */
export async function manualCredit(_: Request, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    message: "Manual credits removed. System is now non-custodial.",
    note: "Users manage their own funds via smart contract.",
  });
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
 * Get payment transaction history from blockchain
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

    // Get user's wallet address
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error || !profile?.wallet_address) {
      res.status(400).json({
        success: false,
        message: "No wallet connected",
      });
      return;
    }

    // Query on-chain PaymentRecord objects
    // TODO: Implement querying payment events from blockchain
    // For now, return placeholder
    res.json({
      success: true,
      message: "On-chain payment history query",
      wallet_address: profile.wallet_address,
      payments: [],
      note: "Query Sui events with type PaymentProcessed for full history",
      blockchain: "Sui",
      network: process.env.SUI_NETWORK || "testnet",
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
 * Check payment status on blockchain
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

    const txHash = req.params.paymentId; // Now expecting tx hash

    try {
      const client = suiRegistry.getClient();
      const txDetails = await client.getTransactionBlock({
        digest: txHash,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      const status = txDetails.effects?.status?.status;
      const paymentEvent = txDetails.events?.find((e) =>
        e.type.includes("PaymentProcessed")
      );

      const network = process.env.SUI_NETWORK || "testnet";
      const explorerUrl =
        network === "mainnet"
          ? `https://suiscan.xyz/mainnet/tx/${txHash}`
          : `https://suiscan.xyz/testnet/tx/${txHash}`;

      res.json({
        success: true,
        tx_hash: txHash,
        status: status,
        payment_event: paymentEvent?.parsedJson,
        explorer_url: explorerUrl,
        blockchain: "Sui",
        network: network,
      });
    } catch (error: any) {
      log.error(`Error checking tx ${txHash}: ${error.message}`, error);
      res.status(404).json({
        success: false,
        message: `Transaction not found: ${error.message}`,
      });
    }
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

    const client = suiRegistry.getClient();
    const details = await client.getTransactionBlock({
      digest: tx_hash,
      options: {
        showEffects: true,
        showEvents: true,
        showInput: true,
        showObjectChanges: true,
      },
    });

    const network = process.env.SUI_NETWORK || "testnet";
    const explorerUrl =
      network === "mainnet"
        ? `https://suiscan.xyz/mainnet/tx/${tx_hash}`
        : `https://suiscan.xyz/testnet/tx/${tx_hash}`;

    res.json({
      success: true,
      transaction: {
        digest: tx_hash,
        status: details.effects?.status?.status,
        timestamp: details.timestampMs,
        checkpoint: details.checkpoint,
        events: details.events,
        objectChanges: details.objectChanges,
        explorer_url: explorerUrl,
      },
      blockchain: "Sui",
      network: network,
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
 * Estimate gas for a transaction (not needed for Sui - uses gas budget)
 */
export async function estimateGas(_: Request, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    message: "Gas estimation not needed for Sui transactions",
    note: "Sui uses gas budget. Typical payment transaction: ~0.001 SUI",
  });
}
