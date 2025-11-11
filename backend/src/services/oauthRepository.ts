/**
 * OAuth Repository
 * Database operations for OAuth clients, authorization codes, and refresh tokens
 */

import { supabaseAdmin } from "./supabase.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {
  OAuthClient,
  OAuthClientResponse,
  AuthorizationCode,
  RefreshToken,
} from "../types/oauth.types.js";

const BCRYPT_ROUNDS = 10;

/**
 * Create a new OAuth client for a user
 */
export async function createOAuthClient(
  userId: string,
  clientName?: string,
  scopes: string[] = ["mcp:tools", "mcp:resources"]
): Promise<{ clientId: string; clientSecret: string }> {
  // Generate client credentials
  const clientId = `mcp_${userId.substring(0, 8)}_${crypto.randomBytes(8).toString("hex")}`;
  const clientSecret = crypto.randomBytes(32).toString("base64url");

  // Hash the client secret
  const clientSecretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

  // Insert into database
  const { error } = await supabaseAdmin.from("oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    user_id: userId,
    client_name: clientName || `MCP Client`,
    scopes: scopes,
    redirect_uris: [],
  });

  if (error) {
    throw new Error(`Failed to create OAuth client: ${error.message}`);
  }

  return { clientId, clientSecret };
}

/**
 * Create a DCR (dynamically registered) client in the database WITHOUT a user
 * This happens at registration time, before any user has authorized it
 */
export async function createDCRClient(
  clientId: string,
  clientSecret: string,
  clientName?: string,
  scopes: string[] = ["mcp:tools", "mcp:resources"]
): Promise<void> {
  // Hash the client secret
  const clientSecretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

  // Insert into database WITHOUT user_id (will be assigned on first authorization)
  const { error } = await supabaseAdmin.from("oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    user_id: null, // No user yet
    client_name: clientName || `Dynamic Client`,
    scopes: scopes,
    redirect_uris: [],
  });

  if (error) {
    throw new Error(`Failed to create DCR client: ${error.message}`);
  }
}

/**
 * Assign a DCR client to a user (called during first authorization)
 */
export async function assignDCRClientToUser(
  clientId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("oauth_clients")
    .update({ user_id: userId })
    .eq("client_id", clientId)
    .is("user_id", null); // Only update if not already assigned

  if (error) {
    throw new Error(`Failed to assign DCR client to user: ${error.message}`);
  }
}

/**
 * Get OAuth client by client_id
 */
export async function getOAuthClient(
  clientId: string
): Promise<OAuthClient | null> {
  const { data, error } = await supabaseAdmin
    .from("oauth_clients")
    .select("*")
    .eq("client_id", clientId)
    .eq("revoked", false)
    .single();

  if (error || !data) {
    return null;
  }

  return data as OAuthClient;
}

/**
 * Verify OAuth client credentials
 */
export async function verifyOAuthClient(
  clientId: string,
  clientSecret: string
): Promise<OAuthClient | null> {
  const client = await getOAuthClient(clientId);

  if (!client) {
    return null;
  }

  // Verify secret
  const secretValid = await bcrypt.compare(
    clientSecret,
    client.client_secret_hash
  );

  if (!secretValid) {
    return null;
  }

  return client;
}

/**
 * Update last_used_at timestamp for a client
 */
export async function updateClientLastUsed(clientId: string): Promise<void> {
  await supabaseAdmin
    .from("oauth_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("client_id", clientId);
}

/**
 * Get all OAuth clients for a user
 */
export async function getUserOAuthClients(
  userId: string
): Promise<OAuthClientResponse[]> {
  const { data, error } = await supabaseAdmin
    .from("oauth_clients")
    .select(
      "id, client_id, client_name, scopes, created_at, last_used_at, revoked"
    )
    .eq("user_id", userId)
    .eq("revoked", false)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch OAuth clients: ${error.message}`);
  }

  return (data || []) as OAuthClientResponse[];
}

/**
 * Revoke an OAuth client
 */
export async function revokeOAuthClient(
  userId: string,
  clientId: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("oauth_clients")
    .update({ revoked: true })
    .eq("client_id", clientId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to revoke OAuth client: ${error.message}`);
  }

  // Also revoke all refresh tokens for this client
  await supabaseAdmin
    .from("refresh_tokens")
    .update({ revoked: true })
    .eq("client_id", clientId)
    .eq("user_id", userId);

  return true;
}

/**
 * Create an authorization code
 */
export async function createAuthorizationCode(
  userId: string,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  codeChallengeMethod: string,
  scopes: string[]
): Promise<string> {
  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const { error } = await supabaseAdmin.from("authorization_codes").insert({
    code: code,
    user_id: userId,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scopes: scopes,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(`Failed to create authorization code: ${error.message}`);
  }

  return code;
}

/**
 * Get and consume an authorization code
 */
export async function consumeAuthorizationCode(
  code: string
): Promise<AuthorizationCode | null> {
  // Get the code
  const { data, error } = await supabaseAdmin
    .from("authorization_codes")
    .select("*")
    .eq("code", code)
    .eq("used", false)
    .single();

  if (error || !data) {
    return null;
  }

  const authCode = data as AuthorizationCode;

  // Check if expired
  if (new Date(authCode.expires_at) < new Date()) {
    return null;
  }

  // Mark as used
  await supabaseAdmin
    .from("authorization_codes")
    .update({ used: true })
    .eq("code", code);

  return authCode;
}

/**
 * Create a refresh token
 */
export async function createRefreshToken(
  userId: string,
  clientId: string,
  scopes: string[]
): Promise<string> {
  const refreshToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const { error } = await supabaseAdmin.from("refresh_tokens").insert({
    token_hash: tokenHash,
    user_id: userId,
    client_id: clientId,
    scopes: scopes,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(`Failed to create refresh token: ${error.message}`);
  }

  return refreshToken;
}

/**
 * Verify and get refresh token
 */
export async function verifyRefreshToken(
  refreshToken: string
): Promise<RefreshToken | null> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const { data, error } = await supabaseAdmin
    .from("refresh_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("revoked", false)
    .single();

  if (error || !data) {
    return null;
  }

  const token = data as RefreshToken;

  // Check if expired
  if (new Date(token.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at
  await supabaseAdmin
    .from("refresh_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  return token;
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  await supabaseAdmin
    .from("refresh_tokens")
    .update({ revoked: true })
    .eq("token_hash", tokenHash);
}

/**
 * Cleanup expired authorization codes (should be run periodically)
 */
export async function cleanupExpiredAuthCodes(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  await supabaseAdmin
    .from("authorization_codes")
    .delete()
    .lt("expires_at", oneHourAgo.toISOString());
}
