/**
 * OAuth 2.1 Type Definitions
 * Types for OAuth authorization flow and client management
 */

export interface OAuthClient {
  id: string;
  client_id: string;
  client_secret_hash: string;
  user_id: string;
  client_name: string | null;
  scopes: string[];
  redirect_uris: string[];
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export interface OAuthClientResponse {
  id: string;
  client_id: string;
  client_name: string | null;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export interface CreateOAuthClientRequest {
  client_name?: string;
  scopes?: string[];
}

export interface CreateOAuthClientResponse {
  success: boolean;
  message: string;
  credentials?: {
    client_id: string;
    client_secret: string;
    mcp_url: string;
  };
  instructions?: {
    claude_desktop: {
      name: string;
      url: string;
      oauth_client_id: string;
      oauth_client_secret: string;
    };
  };
}

export interface AuthorizationCode {
  id: string;
  code: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scopes: string[];
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface RefreshToken {
  id: string;
  token_hash: string;
  user_id: string;
  client_id: string;
  scopes: string[];
  expires_at: string;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface AuthorizeRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
}

export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret: string;
  code_verifier?: string;
  refresh_token?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface TokenErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

export interface JWTPayload {
  sub: string; // user_id
  scope: string;
  client_id: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  type?: "access" | "refresh";
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  grant_types_supported: string[];
  response_types_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
}

export interface AuthorizeCallbackRequest {
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  approved: string;
}

// RFC 7591 - Dynamic Client Registration
export interface ClientRegistrationRequest {
  client_name?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  contacts?: string[];
  logo_uri?: string;
  client_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  client_name?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
}
