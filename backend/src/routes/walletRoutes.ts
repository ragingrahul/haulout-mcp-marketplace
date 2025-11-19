/**
 * Wallet Routes
 * API routes for wallet connection management
 */

import { Router } from "express";
import {
  connectWallet,
  disconnectWallet,
  getConnectedWallet,
} from "../controllers/walletController.js";
import { verifyToken } from "../middleware/auth.middleware.js";

/**
 * Create wallet routes
 */
export function createWalletRoutes(): Router {
  const router = Router();

  // All wallet routes require authentication
  router.use(verifyToken);

  /**
   * POST /api/wallet/connect
   * Connect a browser wallet to user account
   * Body: { wallet_address: string }
   */
  router.post("/connect", connectWallet);

  /**
   * POST /api/wallet/disconnect
   * Disconnect wallet from user account
   */
  router.post("/disconnect", disconnectWallet);

  /**
   * GET /api/wallet
   * Get connected wallet for authenticated user
   */
  router.get("/", getConnectedWallet);

  return router;
}
