/**
 * Authentication Middleware
 * Verifies access tokens using Supabase
 */

import { Request, Response, NextFunction } from "express";
import { supabase, supabaseAdmin } from "../services/supabase.js";
import { AuthenticatedRequest } from "../types/auth.types.js";

// Configure logging
const log = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warning: (message: string) => console.warn(`[WARNING] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

/**
 * Middleware to verify JWT access token
 * Extracts token from Authorization header and validates with Supabase
 */
export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: "No authorization header provided",
      });
      return;
    }

    // Check if it's a Bearer token
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message:
          "Invalid authorization header format. Expected: Bearer <token>",
      });
      return;
    }

    // Extract the token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      res.status(401).json({
        success: false,
        message: "No token provided",
      });
      return;
    }

    // Verify token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      log.warning(
        `[AuthMiddleware] Invalid token: ${error?.message || "No user found"}`
      );
      res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
      return;
    }

    // Attach user to request object
    (req as AuthenticatedRequest).user = data.user;

    // Continue to next middleware/route handler
    next();
  } catch (error: any) {
    log.error(`[AuthMiddleware] Error verifying token: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error verifying authentication",
    });
  }
}

/**
 * Optional middleware - verifies token if present but doesn't fail if missing
 * Useful for endpoints that have different behavior for authenticated users
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);

    if (token) {
      const { data } = await supabase.auth.getUser(token);
      if (data.user) {
        (req as AuthenticatedRequest).user = data.user;
      }
    }

    next();
  } catch (error: any) {
    // Log error but don't fail the request
    log.warning(`[AuthMiddleware] Optional auth error: ${error.message}`);
    next();
  }
}

/**
 * MCP-specific authentication middleware
 * Validates OAuth tokens for MCP connections
 * Returns MCP-compliant 401 responses with WWW-Authenticate header
 */
export async function verifyMCPToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const baseUrl = process.env.BASE_URL || "http://localhost:3000";

    // DEBUG: Log incoming MCP request
    console.log("\n=== MCP AUTH REQUEST ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Path:", req.path);
    console.log("Method:", req.method);
    console.log("Authorization header:", authHeader ? "Present" : "Missing");
    console.log("User-Agent:", req.headers["user-agent"]);
    console.log("Origin:", req.headers["origin"]);
    console.log("Mcp-Session-Id:", req.headers["mcp-session-id"]);
    console.log("========================\n");

    if (!authHeader) {
      // Return MCP-compliant 401 response
      const wwwAuth = `Bearer realm="mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`;
      console.log("↳ Returning 401 Unauthorized");
      console.log("↳ WWW-Authenticate:", wwwAuth);

      res.status(401).header("WWW-Authenticate", wwwAuth).json({
        error: "unauthorized",
        error_description: "Authorization required for MCP access",
      });
      return;
    }

    if (!authHeader.startsWith("Bearer ")) {
      res
        .status(401)
        .header(
          "WWW-Authenticate",
          `Bearer realm="mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
        )
        .json({
          error: "invalid_token",
          error_description: "Invalid authorization header format",
        });
      return;
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const { verifyAccessToken, hasRequiredScopes } = await import(
      "../utils/jwtUtils.js"
    );

    const decoded = verifyAccessToken(token);

    if (!decoded) {
      console.log("↳ Token verification failed");
      res
        .status(401)
        .header("WWW-Authenticate", `Bearer realm="mcp", error="invalid_token"`)
        .json({
          error: "invalid_token",
          error_description: "Token validation failed",
        });
      return;
    }

    console.log("↳ Token verified successfully");
    console.log("↳ User ID:", decoded.sub);
    console.log("↳ Client ID:", decoded.client_id);
    console.log("↳ Scopes:", decoded.scope);

    // Check token expiration (already done by JWT verify, but double-check)
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      res
        .status(401)
        .header(
          "WWW-Authenticate",
          `Bearer realm="mcp", error="invalid_token", error_description="Token expired"`
        )
        .json({
          error: "invalid_token",
          error_description: "Token has expired",
        });
      return;
    }

    // Check if token has required MCP scopes
    if (!hasRequiredScopes(decoded.scope, ["mcp:tools"])) {
      res.status(403).json({
        error: "insufficient_scope",
        error_description: "Token lacks required mcp:tools scope",
        scope: "mcp:tools mcp:resources",
      });
      return;
    }

    // Fetch user from Supabase using the sub (user ID)
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(
      decoded.sub
    );

    if (error || !data.user) {
      log.warning(`[AuthMiddleware] Token user not found: ${decoded.sub}`);
      res.status(401).json({
        error: "invalid_token",
        error_description: "Token user not found",
      });
      return;
    }

    // Attach user and scopes to request
    (req as AuthenticatedRequest).user = data.user;
    (req as any).scopes = decoded.scope.split(" ");
    (req as any).clientId = decoded.client_id;

    next();
  } catch (error: any) {
    log.error(`[AuthMiddleware] MCP auth error: ${error.message}`);
    res.status(500).json({
      error: "server_error",
      error_description: "Error processing authentication",
    });
  }
}
