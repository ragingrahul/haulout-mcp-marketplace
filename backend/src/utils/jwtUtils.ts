/**
 * JWT Utilities
 * Token generation and verification for OAuth 2.1 flow
 */

import jwt from "jsonwebtoken";
import { JWTPayload } from "../types/oauth.types.js";

// JWT secret from environment
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_ISSUER = process.env.BASE_URL || "http://localhost:3000";

/**
 * Create an MCP access token
 */
export function createAccessToken(
  userId: string,
  scopes: string[],
  clientId: string,
  expiresIn: number = 3600 // 1 hour
): string {
  const payload: JWTPayload = {
    sub: userId,
    scope: scopes.join(" "),
    client_id: clientId,
    iss: JWT_ISSUER,
    aud: "mcp",
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iat: Math.floor(Date.now() / 1000),
    type: "access",
  };

  return jwt.sign(payload, JWT_SECRET);
}

/**
 * Verify and decode an access token
 * Validates audience (aud) claim to ensure token is for this MCP server
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: "mcp",
    }) as JWTPayload;

    // Ensure it's an access token
    if (decoded.type && decoded.type !== "access") {
      return null;
    }

    // Validate audience claim (RFC 8707 - Resource Indicators)
    if (!decoded.aud) {
      console.warn("[JWT] Token missing audience (aud) claim");
      return null;
    }

    // Audience must be "mcp" (we verify this in jwt.verify above)
    const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
    if (!audiences.includes("mcp")) {
      console.warn(
        `[JWT] Token audience mismatch. Expected 'mcp', got: ${audiences.join(", ")}`
      );
      return null;
    }

    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Check if a token has required scopes
 */
export function hasRequiredScopes(
  tokenScopes: string,
  requiredScopes: string[]
): boolean {
  const scopes = tokenScopes.split(" ");
  return requiredScopes.every((required) => scopes.includes(required));
}

/**
 * Extract user ID from token
 */
export function extractUserId(token: string): string | null {
  const decoded = verifyAccessToken(token);
  return decoded?.sub || null;
}

/**
 * Extract client ID from token
 */
export function extractClientId(token: string): string | null {
  const decoded = verifyAccessToken(token);
  return decoded?.client_id || null;
}
