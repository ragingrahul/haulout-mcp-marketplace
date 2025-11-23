/**
 * Balance Service - Manages user on-chain balances in smart contract
 */

import { SuiRegistryService } from "./suiRegistryService.js";
import { supabaseAdmin } from "./supabase.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";

const log = LoggerFactory.getLogger("BalanceService");

export interface UserBalanceInfo {
  has_balance_account: boolean;
  balance_object_id?: string;
  balance?: string;
  total_deposited?: string;
  total_spent?: string;
  wallet_address: string;
}

/**
 * Get user's on-chain balance from smart contract
 */
export async function getUserOnChainBalance(
  userId: string
): Promise<UserBalanceInfo | null> {
  try {
    // Get user's wallet address
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (!profile?.wallet_address) {
      log.info(`No wallet address found for user ${userId}`);
      return null;
    }

    const walletAddress = profile.wallet_address;
    const sui = new SuiRegistryService();
    const packageId = sui.getPackageId();
    const client = sui.getClient();

    log.info(`Checking on-chain balance for ${walletAddress}`);

    // UserBalance is now a shared object, query via BalanceCreated events
    const response = await client.queryEvents({
      query: {
        MoveEventType: `${packageId}::payment_system::BalanceCreated`,
      },
      limit: 50,
    });

    // Find the UserBalance object for this user
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

    if (!userBalanceId) {
      log.info(`No UserBalance object found for ${walletAddress}`);
      return {
        has_balance_account: false,
        wallet_address: walletAddress,
      };
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
      log.error(`Invalid UserBalance object structure`);
      return {
        has_balance_account: false,
        wallet_address: walletAddress,
      };
    }

    const fields = balanceObjResponse.data.content.fields as any;

    const totalDepositedMist = fields.total_deposited || "0";
    const totalSpentMist = fields.total_spent || "0";

    const totalDepositedSui = (
      parseInt(totalDepositedMist) / 1_000_000_000
    ).toFixed(9);
    const totalSpentSui = (parseInt(totalSpentMist) / 1_000_000_000).toFixed(9);

    // Calculate available balance (deposited - spent)
    const availableBalanceSui = (
      (parseInt(totalDepositedMist) - parseInt(totalSpentMist)) /
      1_000_000_000
    ).toFixed(9);

    const balanceInfo: UserBalanceInfo = {
      has_balance_account: true,
      balance_object_id: userBalanceId,
      balance: availableBalanceSui,
      total_deposited: totalDepositedSui,
      total_spent: totalSpentSui,
      wallet_address: walletAddress,
    };

    log.info(
      `User balance - Available: ${balanceInfo.balance} SUI (Total Deposited: ${balanceInfo.total_deposited}, Total Spent: ${balanceInfo.total_spent})`
    );

    return balanceInfo;
  } catch (error: any) {
    log.error(`Failed to get user on-chain balance: ${error.message}`, error);
    return null;
  }
}

/**
 * Execute automatic payment from user's balance to developer
 * This is called by the platform to deduct from user balance and pay developer
 */
export async function executeAutomaticPayment(
  userBalanceId: string,
  endpointId: string,
  amountSui: string,
  developerWallet: string
): Promise<string> {
  try {
    const sui = new SuiRegistryService();
    const { Transaction } = await import("@mysten/sui/transactions");

    log.info(
      `Executing automatic payment: ${amountSui} SUI from balance ${userBalanceId} to ${developerWallet} for endpoint ${endpointId}`
    );

    const tx = new Transaction();
    const packageId = sui.getPackageId();
    const amountMist = Math.floor(parseFloat(amountSui) * 1_000_000_000);

    // Split coin from gas to pay developer
    const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

    // Call smart contract to deduct from user balance and pay developer
    tx.moveCall({
      target: `${packageId}::payment_system::pay_for_endpoint`,
      arguments: [
        tx.object(userBalanceId), // UserBalance object
        tx.object(endpointId), // Endpoint object
        paymentCoin, // Payment coin
        tx.object("0x6"), // Sui Clock object
      ],
    });

    // Platform keypair executes the transaction (gas paid by platform)
    const keypair = sui.getServerKeypair();
    const client = sui.getClient();

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(
        `Transaction failed: ${result.effects?.status?.error || "Unknown error"}`
      );
    }

    log.info(`Payment transaction executed: ${result.digest}`);

    return result.digest;
  } catch (error: any) {
    log.error(`Failed to execute automatic payment: ${error.message}`, error);
    throw new Error(`Payment execution failed: ${error.message}`);
  }
}
