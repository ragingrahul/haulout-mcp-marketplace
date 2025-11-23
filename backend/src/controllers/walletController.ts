/**
 * Wallet Controller
 * Handles wallet connection and management
 */

import { Request, Response } from "express";
import { supabaseAdmin } from "../services/supabase.js";
import { AuthenticatedRequest } from "../types/auth.types.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";

const log = LoggerFactory.getLogger("WalletController");

/**
 * Connect wallet to user account
 * User connects their browser wallet (Suiet, Ethos, etc.)
 */
export async function connectWallet(
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

    const { wallet_address } = req.body;

    if (!wallet_address) {
      res.status(400).json({
        success: false,
        message: "Wallet address is required",
      });
      return;
    }

    // Validate Sui address format (starts with 0x, 64 chars)
    if (!wallet_address.startsWith("0x") || wallet_address.length !== 66) {
      res.status(400).json({
        success: false,
        message: "Invalid Sui wallet address format",
      });
      return;
    }

    log.info(`Connecting wallet ${wallet_address} for user ${userId}`);

    // Check if wallet is already connected to another user
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("wallet_address", wallet_address)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine
      throw new Error(`Failed to check wallet: ${checkError.message}`);
    }

    if (existingProfile && existingProfile.id !== userId) {
      res.status(409).json({
        success: false,
        message: "This wallet is already connected to another account",
      });
      return;
    }

    // Update user's profile with wallet address
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ wallet_address })
      .eq("id", userId);

    if (updateError) {
      log.error(`Failed to update wallet address: ${updateError.message}`);
      throw new Error(`Failed to connect wallet: ${updateError.message}`);
    }

    log.info(
      `Successfully connected wallet ${wallet_address} to user ${userId}`
    );

    res.json({
      success: true,
      message: "Wallet connected successfully",
      wallet_address,
    });
  } catch (error: any) {
    log.error(`Error connecting wallet: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error connecting wallet: ${error.message}`,
    });
  }
}

/**
 * Disconnect wallet from user account
 */
export async function disconnectWallet(
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

    log.info(`Disconnecting wallet for user ${userId}`);

    // Remove wallet address from profile
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ wallet_address: null })
      .eq("id", userId);

    if (updateError) {
      log.error(`Failed to disconnect wallet: ${updateError.message}`);
      throw new Error(`Failed to disconnect wallet: ${updateError.message}`);
    }

    log.info(`Successfully disconnected wallet for user ${userId}`);

    res.json({
      success: true,
      message: "Wallet disconnected successfully",
    });
  } catch (error: any) {
    log.error(`Error disconnecting wallet: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error disconnecting wallet: ${error.message}`,
    });
  }
}

/**
 * Get connected wallet for authenticated user
 */
export async function getConnectedWallet(
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

    // Fetch wallet address from profile
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error) {
      throw new Error(`Failed to get wallet: ${error.message}`);
    }

    res.json({
      success: true,
      wallet_address: profile?.wallet_address || null,
      is_connected: !!profile?.wallet_address,
    });
  } catch (error: any) {
    log.error(`Error getting wallet: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error getting wallet: ${error.message}`,
    });
  }
}
