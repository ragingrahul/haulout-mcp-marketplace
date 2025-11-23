/**
 * Payment MCP Tools (Refactored for Direct Smart Contract Interaction)
 *
 * Non-custodial model: Users sign transactions themselves to pay directly to developers.
 * No platform wallet holds user funds.
 */

import { MCPTool } from "../types/mcp.types.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";
import { SuiRegistryService } from "../services/suiRegistryService.js";
import { supabaseAdmin } from "../services/supabase.js";

const log = LoggerFactory.getLogger("PaymentTools");
const suiRegistry = new SuiRegistryService();

/**
 * Tool definitions for payment operations
 */
export const PAYMENT_TOOLS: Record<string, MCPTool> = {
  get_balance: {
    name: "get_balance",
    description:
      "Check your SUI balance on-chain. Returns your UserBalance object showing deposits and spending tracked by the smart contract.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  create_balance_account: {
    name: "create_balance_account",
    description:
      "Create a UserBalance tracking object on Sui blockchain (one-time setup). Required before making payments. Returns transaction data for you to sign with your wallet.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  get_payment_transaction: {
    name: "get_payment_transaction",
    description:
      "Get the transaction data needed to pay for a tool. You must sign this transaction with your wallet to complete the payment. Payment goes directly from you to the API developer.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint_id: {
          type: "string",
          description: "The Sui object ID of the API endpoint",
        },
        payment_id: {
          type: "string",
          description: "Payment ID from 402 Payment Required response",
        },
      },
      required: ["endpoint_id", "payment_id"],
    },
  },

  verify_payment: {
    name: "verify_payment",
    description:
      "Verify that a payment transaction was successful on-chain. Call this after signing and submitting the payment transaction.",
    inputSchema: {
      type: "object",
      properties: {
        tx_hash: {
          type: "string",
          description: "Transaction hash/digest from your payment",
        },
        payment_id: {
          type: "string",
          description: "Payment ID to associate with this transaction",
        },
      },
      required: ["tx_hash", "payment_id"],
    },
  },
};

/**
 * Get user's on-chain balance
 */
export async function executeGetBalance(
  userId: string,
  _args: Record<string, any>
): Promise<any> {
  try {
    log.info(`Getting on-chain balance for user ${userId}`);

    // Get user's wallet address
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error || !profile?.wallet_address) {
      return {
        success: false,
        message: "No wallet connected. Please connect a Sui wallet first.",
        has_wallet: false,
        action_required: "Connect wallet via /api/wallet/connect",
      };
    }

    const walletAddress = profile.wallet_address;

    // Try to get UserBalance object
    try {
      // Query for UserBalance objects owned by this address
      const client = suiRegistry.getClient();
      const packageId = suiRegistry.getPackageId();

      const balanceObjects = await client.getOwnedObjects({
        owner: walletAddress,
        filter: {
          StructType: `${packageId}::payment_system::UserBalance`,
        },
        options: {
          showContent: true,
        },
      });

      if (balanceObjects.data.length === 0) {
        return {
          success: true,
          has_balance_account: false,
          message:
            "You don't have a balance tracking account yet. Create one with create_balance_account tool.",
          wallet_address: walletAddress,
          native_sui_balance: await suiRegistry.getSuiBalance(walletAddress),
        };
      }

      // Get the first balance object (users should only have one)
      const balanceObj = balanceObjects.data[0];
      if (
        !balanceObj.data?.content ||
        balanceObj.data.content.dataType !== "moveObject"
      ) {
        throw new Error("Invalid balance object");
      }

      const fields = balanceObj.data.content.fields as any;

      return {
        success: true,
        has_balance_account: true,
        balance_object_id: balanceObj.data.objectId,
        wallet_address: walletAddress,
        total_deposited_mist: fields.total_deposited,
        total_spent_mist: fields.total_spent,
        total_deposited_sui: (
          parseFloat(fields.total_deposited) / 1_000_000_000
        ).toFixed(9),
        total_spent_sui: (
          parseFloat(fields.total_spent) / 1_000_000_000
        ).toFixed(9),
        native_sui_balance: await suiRegistry.getSuiBalance(walletAddress),
        blockchain: "Sui",
        network: process.env.SUI_NETWORK || "testnet",
      };
    } catch (error: any) {
      log.error(`Error querying balance: ${error.message}`);

      // Fallback to just native balance
      return {
        success: true,
        has_balance_account: false,
        wallet_address: walletAddress,
        native_sui_balance: await suiRegistry.getSuiBalance(walletAddress),
        message:
          "No balance tracking object found. You can still make payments with your native SUI balance.",
      };
    }
  } catch (error: any) {
    log.error(`Error executing get_balance: ${error.message}`, error);
    throw new Error(`Failed to get balance: ${error.message}`);
  }
}

/**
 * Create balance tracking account (returns transaction builder)
 */
export async function executeCreateBalanceAccount(
  userId: string,
  _args: Record<string, any>
): Promise<any> {
  try {
    log.info(`Creating balance account instructions for user ${userId}`);

    // Get user's wallet address
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error || !profile?.wallet_address) {
      return {
        success: false,
        message: "No wallet connected. Please connect a Sui wallet first.",
      };
    }

    const packageId = suiRegistry.getPackageId();
    const network = process.env.SUI_NETWORK || "testnet";

    // Return instructions for building the transaction
    return {
      success: true,
      message:
        "Sign this transaction with your wallet to create your balance tracking account",
      transaction_type: "create_balance",
      requires_wallet_signature: true,
      transaction_builder: {
        target: `${packageId}::payment_system::create_balance`,
        arguments: [
          {
            type: "object",
            value: "0x6", // Clock object ID
            description: "System clock",
          },
        ],
      },
      frontend_code_example: `
// Using @mysten/sui SDK
const tx = new Transaction();
tx.moveCall({
  target: '${packageId}::payment_system::create_balance',
  arguments: [tx.object('0x6')]
});

// User signs with their wallet
const result = await wallet.signAndExecuteTransaction({ transaction: tx });
console.log('Balance account created:', result.digest);
`,
      network: network,
      note: "After creating, your balance tracking will be available on-chain.",
    };
  } catch (error: any) {
    log.error(
      `Error creating balance account instructions: ${error.message}`,
      error
    );
    throw new Error(`Failed to create balance account: ${error.message}`);
  }
}

/**
 * Get payment transaction data (returns transaction builder)
 */
export async function executeGetPaymentTransaction(
  userId: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const { endpoint_id, payment_id } = args;

    if (!endpoint_id || !payment_id) {
      throw new Error("endpoint_id and payment_id are required");
    }

    log.info(
      `Creating payment transaction for user ${userId}, endpoint ${endpoint_id}`
    );

    // Get endpoint details
    const endpoint = await suiRegistry.getEndpoint(endpoint_id);
    if (!endpoint) {
      throw new Error("Endpoint not found");
    }

    if (!endpoint.active) {
      throw new Error("Endpoint is inactive");
    }

    const priceInSui = (
      parseFloat(endpoint.pricePerCall) / 1_000_000_000
    ).toFixed(9);
    const packageId = suiRegistry.getPackageId();
    const network = process.env.SUI_NETWORK || "testnet";

    // Return transaction builder instructions
    return {
      success: true,
      message: `Sign this transaction to pay ${priceInSui} SUI directly to the API developer`,
      payment_details: {
        endpoint_id: endpoint_id,
        endpoint_owner: endpoint.owner,
        price_mist: endpoint.pricePerCall,
        price_sui: priceInSui,
        payment_id: payment_id,
      },
      transaction_type: "process_payment",
      requires_wallet_signature: true,
      transaction_builder: {
        target: `${packageId}::payment_system::process_payment`,
        arguments: [
          {
            type: "object",
            value: endpoint_id,
            description: "Endpoint object",
          },
          {
            type: "coin",
            value: endpoint.pricePerCall,
            description: "Payment coin (split from gas)",
          },
          {
            type: "object",
            value: "0x6",
            description: "Clock",
          },
        ],
      },
      frontend_code_example: `
// Using @mysten/sui SDK
const tx = new Transaction();

// Split coins for payment
const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(${endpoint.pricePerCall})]);

// Call process_payment
tx.moveCall({
  target: '${packageId}::payment_system::process_payment',
  arguments: [
    tx.object('${endpoint_id}'),
    paymentCoin,
    tx.object('0x6')
  ]
});

// User signs transaction
const result = await wallet.signAndExecuteTransaction({ transaction: tx });
console.log('Payment sent:', result.digest);

// Then call verify_payment with result.digest
`,
      network: network,
      note: "Payment goes directly from your wallet to the API developer. No intermediary.",
      next_step: "After signing, call verify_payment with the transaction hash",
    };
  } catch (error: any) {
    log.error(`Error creating payment transaction: ${error.message}`, error);
    throw new Error(`Failed to create payment transaction: ${error.message}`);
  }
}

/**
 * Verify payment was successful on-chain
 */
export async function executeVerifyPayment(
  userId: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const { tx_hash, payment_id } = args;

    if (!tx_hash || !payment_id) {
      throw new Error("tx_hash and payment_id are required");
    }

    log.info(`Verifying payment for user ${userId}, tx ${tx_hash}`);

    const client = suiRegistry.getClient();

    // Get transaction details
    const txDetails = await client.getTransactionBlock({
      digest: tx_hash,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    // Check if transaction succeeded
    if (txDetails.effects?.status?.status !== "success") {
      return {
        success: false,
        message: "Payment transaction failed on-chain",
        tx_hash: tx_hash,
        status: txDetails.effects?.status?.status || "unknown",
        error: txDetails.effects?.status?.error,
      };
    }

    // Look for PaymentProcessed event
    const paymentEvent = txDetails.events?.find((e) =>
      e.type.includes("PaymentProcessed")
    );

    if (!paymentEvent) {
      return {
        success: false,
        message: "Payment event not found in transaction",
        tx_hash: tx_hash,
      };
    }

    const eventData = paymentEvent.parsedJson as any;
    const network = process.env.SUI_NETWORK || "testnet";
    const explorerUrl =
      network === "mainnet"
        ? `https://suiscan.xyz/mainnet/tx/${tx_hash}`
        : `https://suiscan.xyz/testnet/tx/${tx_hash}`;

    return {
      success: true,
      message: "✅ Payment verified on-chain! You can now use the API.",
      payment_verified: true,
      tx_hash: tx_hash,
      explorer_url: explorerUrl,
      payment_details: {
        payment_id: payment_id,
        payer: eventData.payer,
        recipient: eventData.recipient,
        endpoint_id: eventData.endpoint_id,
        amount_mist: eventData.amount,
        amount_sui: (parseFloat(eventData.amount) / 1_000_000_000).toFixed(9),
        timestamp: eventData.timestamp,
      },
      blockchain: "Sui",
      network: network,
      next_action: `Call the original API tool again with _payment_id: "${payment_id}"`,
    };
  } catch (error: any) {
    log.error(`Error verifying payment: ${error.message}`, error);
    throw new Error(`Failed to verify payment: ${error.message}`);
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
    case "get_balance":
      return executeGetBalance(userId, args);
    case "create_balance_account":
      return executeCreateBalanceAccount(userId, args);
    case "get_payment_transaction":
      return executeGetPaymentTransaction(userId, args);
    case "verify_payment":
      return executeVerifyPayment(userId, args);
    default:
      throw new Error(`Unknown payment tool: ${toolName}`);
  }
}
