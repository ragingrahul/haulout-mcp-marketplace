/**
 * Authentication Routes
 * Defines all authentication-related routes
 */

import express, { Router } from "express";
import {
  signup,
  login,
  logout,
  getProfile,
  refreshToken,
} from "../controllers/authController.js";
import {
  authorize,
  authorizeCallback,
  token,
  generateClientCredentials,
  getClients,
  revokeClient,
  registerClient,
} from "../controllers/oauthController.js";
import { verifyToken } from "../middleware/auth.middleware.js";

/**
 * Create and configure authentication routes
 *
 * @returns Configured Express Router
 */
export function createAuthRoutes(): Router {
  const router = express.Router();

  // Public routes (no authentication required)
  // POST /api/auth/signup - Register a new user
  router.post("/signup", signup);

  // POST /api/auth/login - Login user
  router.post("/login", login);

  // POST /api/auth/refresh - Refresh access token
  router.post("/refresh", refreshToken);

  // Protected routes (authentication required)
  // GET /api/auth/profile - Get current user profile
  router.get("/profile", verifyToken, getProfile);

  // POST /api/auth/logout - Logout user
  router.post("/logout", verifyToken, logout);

  // OAuth 2.1 routes
  // GET /api/auth/oauth/authorize - OAuth authorization endpoint
  router.get("/oauth/authorize", authorize);

  // POST /api/auth/oauth/authorize/callback - OAuth authorization callback
  router.post("/oauth/authorize/callback", verifyToken, authorizeCallback);

  // POST /api/auth/oauth/token - OAuth token endpoint
  router.post("/oauth/token", token);

  // POST /api/auth/oauth/register - Dynamic Client Registration (RFC 7591)
  router.post("/oauth/register", registerClient);

  // OAuth client management (protected)
  // POST /api/auth/oauth/clients - Create new OAuth client
  router.post("/oauth/clients", verifyToken, generateClientCredentials);

  // GET /api/auth/oauth/clients - Get user's OAuth clients
  router.get("/oauth/clients", verifyToken, getClients);

  // DELETE /api/auth/oauth/clients/:clientId - Revoke OAuth client
  router.delete("/oauth/clients/:clientId", verifyToken, revokeClient);

  return router;
}
