/**
 * OAuth Controller
 * Handles OAuth 2.1 authorization flow endpoints
 */

import { Request, Response } from "express";
import crypto from "crypto";
import {
  createOAuthClient,
  getUserOAuthClients,
  revokeOAuthClient,
  verifyOAuthClient,
  createAuthorizationCode,
  consumeAuthorizationCode,
  createRefreshToken,
  verifyRefreshToken,
  updateClientLastUsed,
} from "../services/oauthRepository.js";
import { createAccessToken } from "../utils/jwtUtils.js";
import {
  AuthenticatedRequest,
  CreateOAuthClientRequest,
  AuthorizeRequest,
  AuthorizeCallbackRequest,
  TokenRequest,
  ProtectedResourceMetadata,
  AuthorizationServerMetadata,
} from "../types/index.js";

// Configure logging
const log = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warning: (message: string) => console.warn(`[WARNING] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

// In-memory store for pending authorizations (in production, use Redis)
const pendingAuthorizations = new Map<
  string,
  {
    state: string;
    expiresAt: number;
  }
>();

// NOTE: DCR clients are now stored directly in the database (with user_id = null)
// instead of using an in-memory cache. This prevents loss on server restart.

/**
 * Generate embedded HTML authorization page
 */
function generateAuthorizationPage(params: {
  authId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  baseUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authorize MCP Access</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            max-width: 450px;
            width: 100%;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 24px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .info-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }
        .info-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 5px;
        }
        .info-value {
            color: #333;
            font-size: 14px;
            word-break: break-all;
        }
        .scope-list {
            margin-top: 15px;
        }
        .scope-item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            color: #333;
        }
        .scope-icon {
            color: #667eea;
            margin-right: 10px;
            font-size: 18px;
        }
        .login-form {
            margin: 20px 0;
        }
        input {
            width: 100%;
            padding: 12px;
            margin: 8px 0;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        button {
            flex: 1;
            padding: 14px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .approve {
            background: #667eea;
            color: white;
        }
        .approve:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .deny {
            background: #f0f0f0;
            color: #666;
        }
        .deny:hover {
            background: #e0e0e0;
        }
        .error {
            background: #fee;
            color: #c00;
            padding: 12px;
            border-radius: 8px;
            margin: 10px 0;
            display: none;
            font-size: 14px;
        }
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 Authorize Access</h1>
        <p class="subtitle">An application is requesting access to your MCP server</p>
        
        <div class="info-box">
            <div class="info-label">Client</div>
            <div class="info-value">${params.clientId}</div>
            
            <div class="scope-list">
                <div class="info-label">Requested Permissions</div>
                ${params.scope
                  .split(" ")
                  .map(
                    (s) => `
                    <div class="scope-item">
                        <span class="scope-icon">✓</span>
                        <span>${getScopeDescription(s)}</span>
                    </div>
                `
                  )
                  .join("")}
            </div>
        </div>

        <div class="login-form">
            <div class="info-label">Login to authorize</div>
            <input type="email" id="email" placeholder="Email" autofocus>
            <input type="password" id="password" placeholder="Password">
        </div>

        <div id="error" class="error"></div>
        
        <div id="loading" class="loading">
            <div class="spinner"></div>
            <p>Authorizing...</p>
        </div>

        <div id="buttons" class="button-group">
            <button class="approve" onclick="approve()">✓ Approve</button>
            <button class="deny" onclick="deny()">✗ Deny</button>
        </div>
    </div>

    <script>
        const params = ${JSON.stringify(params)};
        
        function getScopeDescription(scope) {
            const descriptions = {
                'mcp:tools': 'Access to call your MCP tools',
                'mcp:resources': 'Access to read your MCP resources'
            };
            return descriptions[scope] || scope;
        }

        async function approve() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (!email || !password) {
                showError('Please enter your email and password');
                return;
            }

            try {
                document.getElementById('loading').style.display = 'block';
                document.getElementById('buttons').style.display = 'none';
                
                // 1. Login to get access token
                const loginRes = await fetch(params.baseUrl + '/api/auth/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({email, password})
                });

                const loginData = await loginRes.json();
                
                if (!loginData.success) {
                    showError(loginData.message || 'Login failed');
                    return;
                }

                // 2. Approve authorization
                const authRes = await fetch(params.baseUrl + '/api/auth/oauth/authorize/callback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + loginData.access_token
                    },
                    body: JSON.stringify({
                        auth_id: params.authId,
                        client_id: params.clientId,
                        redirect_uri: params.redirectUri,
                        state: params.state,
                        code_challenge: params.codeChallenge,
                        code_challenge_method: params.codeChallengeMethod,
                        scope: params.scope,
                        approved: 'true'
                    })
                });

                const authData = await authRes.json();
                
                if (authData.redirect_url) {
                    window.location.href = authData.redirect_url;
                } else {
                    showError('Authorization failed: ' + (authData.message || 'Unknown error'));
                }
            } catch (error) {
                showError('Error: ' + error.message);
            }
        }

        function deny() {
            window.location.href = params.redirectUri + '?error=access_denied&state=' + encodeURIComponent(params.state);
        }

        function showError(message) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('buttons').style.display = 'flex';
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
        
        // Allow Enter key to submit
        document.getElementById('password').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') approve();
        });
    </script>
</body>
</html>`;
}

function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    "mcp:tools": "Access to call your MCP tools",
    "mcp:resources": "Access to read your MCP resources",
  };
  return descriptions[scope] || scope;
}

/**
 * Protected Resource Metadata endpoint (/.well-known/oauth-protected-resource)
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 */
export async function getProtectedResourceMetadata(
  req: Request,
  res: Response
): Promise<void> {
  console.log("\n=== DISCOVERY: Protected Resource Metadata ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("User-Agent:", req.headers["user-agent"]);
  console.log("Origin:", req.headers["origin"]);

  const baseUrl =
    process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  const metadata: ProtectedResourceMetadata = {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [`${baseUrl}`],
    scopes_supported: ["mcp:tools", "mcp:resources"],
    bearer_methods_supported: ["header"],
  };

  console.log("Response:", JSON.stringify(metadata, null, 2));
  console.log("===========================================\n");

  res.json(metadata);
}

/**
 * Authorization Server Metadata endpoint (/.well-known/oauth-authorization-server)
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 */
export async function getAuthorizationServerMetadata(
  req: Request,
  res: Response
): Promise<void> {
  console.log("\n=== DISCOVERY: Authorization Server Metadata ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("User-Agent:", req.headers["user-agent"]);
  console.log("Origin:", req.headers["origin"]);

  const baseUrl =
    process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  const metadata: AuthorizationServerMetadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/auth/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/auth/oauth/token`,
    registration_endpoint: `${baseUrl}/api/auth/oauth/register`,
    revocation_endpoint: `${baseUrl}/api/auth/oauth/revoke`,
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    scopes_supported: ["mcp:tools", "mcp:resources"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    code_challenge_methods_supported: ["S256"],
  };

  console.log("Response:", JSON.stringify(metadata, null, 2));
  console.log("===============================================\n");

  res.json(metadata);
}

/**
 * OAuth 2.1 Authorization Endpoint
 * Initiates the authorization code flow
 */
export async function authorize(req: Request, res: Response): Promise<void> {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      scope,
    } = req.query as unknown as AuthorizeRequest;

    // Validate required parameters
    if (response_type !== "code") {
      res.status(400).json({
        error: "unsupported_response_type",
        error_description: "Only 'code' response type is supported",
      });
      return;
    }

    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Missing required parameters",
      });
      return;
    }

    if (code_challenge_method !== "S256") {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Only S256 code_challenge_method is supported",
      });
      return;
    }

    // Store pending authorization (expires in 10 minutes)
    const authId = crypto.randomBytes(16).toString("hex");
    pendingAuthorizations.set(authId, {
      state: state || "",
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    console.log("\n=== AUTHORIZE REQUEST ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Client ID:", client_id);
    console.log("Redirect URI:", redirect_uri);
    console.log("State:", state);
    console.log("Code Challenge:", code_challenge);
    console.log("Code Challenge Method:", code_challenge_method);
    console.log("Scope:", scope);
    console.log("User-Agent:", req.headers["user-agent"]);
    console.log("========================\n");

    log.info(`[OAuth] Authorization request from client: ${client_id}`);

    // Get base URL for authorization page
    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    // Serve embedded authorization page (no external frontend needed)
    res.send(
      generateAuthorizationPage({
        authId,
        clientId: client_id,
        redirectUri: redirect_uri,
        state: state || "",
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        scope: scope || "mcp:tools mcp:resources",
        baseUrl: baseUrl,
      })
    );
  } catch (error: any) {
    log.error(`[OAuth] Authorization error: ${error.message}`);
    res.status(500).json({
      error: "server_error",
      error_description: "Internal server error",
    });
  }
}

/**
 * OAuth Authorization Callback
 * Called after user approves/denies authorization
 */
export async function authorizeCallback(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const {
      auth_id,
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      scope,
      approved,
    } = req.body as AuthorizeCallbackRequest & { auth_id: string };

    if (!authReq.user) {
      res.status(401).json({
        error: "unauthorized",
        error_description: "User not authenticated",
      });
      return;
    }

    // Verify auth_id
    const pendingAuth = pendingAuthorizations.get(auth_id);
    if (!pendingAuth || Date.now() > pendingAuth.expiresAt) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Authorization request expired or invalid",
      });
      return;
    }

    pendingAuthorizations.delete(auth_id);

    if (approved !== "true") {
      // User denied access
      const redirectUrl = `${redirect_uri}?error=access_denied&state=${state || ""}`;
      res.json({ redirect_url: redirectUrl });
      return;
    }

    // Get client from database
    const { getOAuthClient, assignDCRClientToUser } = await import(
      "../services/oauthRepository.js"
    );

    log.info(`[OAuth] Looking up client: ${client_id}`);
    let client = await getOAuthClient(client_id);

    if (!client) {
      log.warning(`[OAuth] Client not found in database: ${client_id}`);
      log.warning(
        `[OAuth] Is this a DCR client? ${client_id.startsWith("dcr_")}`
      );
      res.status(403).json({
        error: "unauthorized_client",
        error_description: "Client not found",
      });
      return;
    }

    log.info(
      `[OAuth] Client found: ${client_id}, user_id: ${client.user_id || "NULL"}`
    );

    // If this is a DCR client without a user (user_id is null), assign it to this user
    const isDCRClient = client_id.startsWith("dcr_");
    if (isDCRClient && !client.user_id) {
      log.info(
        `[OAuth] First authorization for DCR client ${client_id}, assigning to user ${authReq.user.id}`
      );

      // Assign the DCR client to the authorizing user
      await assignDCRClientToUser(client_id, authReq.user.id);

      // Reload client to get updated record
      client = await getOAuthClient(client_id);

      if (!client) {
        res.status(500).json({
          error: "server_error",
          error_description: "Failed to assign client to user",
        });
        return;
      }
    }

    // Verify client belongs to this user
    if (client.user_id !== authReq.user.id) {
      res.status(403).json({
        error: "unauthorized_client",
        error_description: "Client does not belong to this user",
      });
      return;
    }

    // Create authorization code
    const scopes = (scope || "mcp:tools mcp:resources").split(" ");
    const code = await createAuthorizationCode(
      authReq.user.id,
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      scopes
    );

    log.info(
      `[OAuth] Authorization code issued for user: ${authReq.user.email}`
    );

    // Redirect back to client with authorization code
    const redirectUrl = `${redirect_uri}?code=${code}&state=${state || ""}`;
    res.json({ redirect_url: redirectUrl });
  } catch (error: any) {
    log.error(`[OAuth] Authorization callback error: ${error.message}`);
    res.status(500).json({
      error: "server_error",
      error_description: "Internal server error",
    });
  }
}

/**
 * OAuth 2.1 Token Endpoint
 * Exchange authorization code for access token
 */
export async function token(req: Request, res: Response): Promise<void> {
  try {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      client_secret,
      code_verifier,
      refresh_token,
    } = req.body as TokenRequest;

    console.log("\n=== TOKEN REQUEST ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Grant Type:", grant_type);
    console.log("Client ID:", client_id);
    console.log("Has Client Secret:", !!client_secret);
    console.log("Has Code:", !!code);
    console.log("Has Code Verifier:", !!code_verifier);
    console.log("Redirect URI:", redirect_uri);
    console.log("User-Agent:", req.headers["user-agent"]);
    console.log("====================\n");

    if (grant_type === "authorization_code") {
      // Validate required parameters
      if (
        !code ||
        !redirect_uri ||
        !client_id ||
        !client_secret ||
        !code_verifier
      ) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters",
        });
        return;
      }

      // Verify client credentials
      const client = await verifyOAuthClient(client_id, client_secret);
      if (!client) {
        res.status(401).json({
          error: "invalid_client",
          error_description: "Client authentication failed",
        });
        return;
      }

      // Consume authorization code
      const authCode = await consumeAuthorizationCode(code);
      if (!authCode) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code",
        });
        return;
      }

      // Verify the code was issued to this client
      if (authCode.client_id !== client_id) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Authorization code was not issued to this client",
        });
        return;
      }

      // Verify client belongs to the user who authorized
      if (client.user_id !== authCode.user_id) {
        res.status(403).json({
          error: "unauthorized_client",
          error_description: "Client does not belong to authorized user",
        });
        return;
      }

      // Verify redirect_uri matches
      if (authCode.redirect_uri !== redirect_uri) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Redirect URI mismatch",
        });
        return;
      }

      // Verify PKCE code_verifier
      const hash = crypto
        .createHash("sha256")
        .update(code_verifier)
        .digest("base64url");

      if (hash !== authCode.code_challenge) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid code_verifier",
        });
        return;
      }

      // Update client last used
      await updateClientLastUsed(client_id);

      // Create access token and refresh token
      const accessToken = createAccessToken(
        authCode.user_id,
        authCode.scopes,
        client_id,
        3600 // 1 hour
      );

      const refreshTokenValue = await createRefreshToken(
        authCode.user_id,
        client_id,
        authCode.scopes
      );

      log.info(`[OAuth] Access token issued for user: ${authCode.user_id}`);

      res.json({
        access_token: accessToken,
        refresh_token: refreshTokenValue,
        token_type: "Bearer",
        expires_in: 3600,
        scope: authCode.scopes.join(" "),
      });
    } else if (grant_type === "refresh_token") {
      // Handle refresh token flow
      if (!refresh_token || !client_id || !client_secret) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters",
        });
        return;
      }

      // Verify client credentials
      const client = await verifyOAuthClient(client_id, client_secret);
      if (!client) {
        res.status(401).json({
          error: "invalid_client",
          error_description: "Client authentication failed",
        });
        return;
      }

      // Verify refresh token
      const tokenData = await verifyRefreshToken(refresh_token);
      if (!tokenData) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired refresh token",
        });
        return;
      }

      // Verify token belongs to this client
      if (tokenData.client_id !== client_id) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Refresh token was not issued to this client",
        });
        return;
      }

      // Verify client belongs to the token user
      if (client.user_id !== tokenData.user_id) {
        res.status(403).json({
          error: "unauthorized_client",
          error_description: "Client does not belong to token user",
        });
        return;
      }

      // Update client last used
      await updateClientLastUsed(client_id);

      // Create new access token
      const accessToken = createAccessToken(
        tokenData.user_id,
        tokenData.scopes,
        client_id,
        3600
      );

      log.info(`[OAuth] Access token refreshed for user: ${tokenData.user_id}`);

      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: tokenData.scopes.join(" "),
      });
    } else {
      res.status(400).json({
        error: "unsupported_grant_type",
        error_description:
          "Only authorization_code and refresh_token are supported",
      });
    }
  } catch (error: any) {
    log.error(`[OAuth] Token error: ${error.message}`);
    res.status(500).json({
      error: "server_error",
      error_description: "Internal server error",
    });
  }
}

/**
 * Generate OAuth client credentials for a user
 */
export async function generateClientCredentials(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const { client_name, scopes, developer_id } =
      req.body as CreateOAuthClientRequest & {
        developer_id?: string;
      };

    // Create OAuth client
    const { clientId, clientSecret } = await createOAuthClient(
      userId,
      client_name,
      scopes
    );

    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    // Default to using own endpoints if no developer specified
    const developerId = developer_id || userId;
    const mcpUrl = `${baseUrl}/mcp/${developerId}`;

    log.info(`[OAuth] Created OAuth client for user: ${authReq.user?.email}`);

    res.status(201).json({
      success: true,
      message: "OAuth client created successfully",
      credentials: {
        client_id: clientId,
        client_secret: clientSecret,
        mcp_url: mcpUrl,
        developer_id: developerId,
        user_id: userId,
      },
      instructions: {
        claude_desktop: {
          name: client_name || "My MCP Server",
          url: mcpUrl,
          oauth_client_id: clientId,
          oauth_client_secret: clientSecret,
        },
      },
      notes: {
        developer: `Connecting to developer ${developerId}'s endpoints`,
        authentication: `OAuth token identifies you as user ${userId}`,
        url_format:
          "URL contains developer ID, OAuth token contains your user ID",
      },
    });
  } catch (error: any) {
    log.error(`[OAuth] Generate credentials error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error generating OAuth credentials",
    });
  }
}

/**
 * Get user's OAuth clients
 */
export async function getClients(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const clients = await getUserOAuthClients(userId);

    res.json({
      success: true,
      clients: clients,
    });
  } catch (error: any) {
    log.error(`[OAuth] Get clients error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error fetching OAuth clients",
    });
  }
}

/**
 * Revoke an OAuth client
 */
export async function revokeClient(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const clientId = req.params.clientId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    await revokeOAuthClient(userId, clientId);

    log.info(`[OAuth] Revoked OAuth client: ${clientId}`);

    res.json({
      success: true,
      message: "OAuth client revoked successfully",
    });
  } catch (error: any) {
    log.error(`[OAuth] Revoke client error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error revoking OAuth client",
    });
  }
}

/**
 * RFC 7591 - Dynamic Client Registration
 * Allows MCP clients to automatically register themselves
 */
export async function registerClient(
  req: Request,
  res: Response
): Promise<void> {
  try {
    log.info(`[OAuth DCR] Registration request received`);
    log.info(`[OAuth DCR] Request body: ${JSON.stringify(req.body, null, 2)}`);

    const registrationRequest = req.body as any;

    console.log("\n=== DYNAMIC CLIENT REGISTRATION ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Client Name:", registrationRequest.client_name);
    console.log("Redirect URIs:", registrationRequest.redirect_uris);
    console.log("Grant Types:", registrationRequest.grant_types);
    console.log("=======================================\n");

    // Generate client credentials
    const clientId = `dcr_${crypto.randomBytes(8).toString("hex")}`;
    const clientSecret = crypto.randomBytes(32).toString("base64url");

    // Extract registration parameters
    const clientName = registrationRequest.client_name || "Dynamic MCP Client";
    const redirectUris = registrationRequest.redirect_uris || [];
    const grantTypes = registrationRequest.grant_types || [
      "authorization_code",
      "refresh_token",
    ];
    const responseTypes = registrationRequest.response_types || ["code"];
    const scope = registrationRequest.scope || "mcp:tools mcp:resources";

    const issuedAt = Math.floor(Date.now() / 1000);

    const response = {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: issuedAt,
      client_secret_expires_at: 0, // 0 means never expires
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "client_secret_post",
      grant_types: grantTypes,
      response_types: responseTypes,
      scope: scope,
    };

    // Store DCR client in database immediately (without user assignment)
    const scopeArray = scope.split(" ");
    const { createDCRClient } = await import("../services/oauthRepository.js");

    await createDCRClient(clientId, clientSecret, clientName, scopeArray);

    log.info(
      `[OAuth DCR] Client registered in DB: ${clientId} (${clientName})`
    );

    res.status(201).json(response);
  } catch (error: any) {
    log.error(`[OAuth DCR] Registration error: ${error.message}`);
    res.status(500).json({
      error: "server_error",
      error_description: "Failed to register client",
    });
  }
}
