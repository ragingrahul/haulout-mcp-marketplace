/**
 * OAuth Service
 * Handles OAuth client management for MCP authentication
 */

import { API_BASE_URL } from "@/lib/api-config";

export interface OAuthClient {
  client_id: string;
  client_name: string;
  scopes: string[];
  created_at: string;
  last_used_at?: string;
}

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  mcp_url: string;
  developer_id: string;
  user_id: string;
}

export interface CreateOAuthClientResponse {
  success: boolean;
  message: string;
  credentials: OAuthCredentials;
  instructions: {
    claude_desktop: {
      name: string;
      url: string;
      oauth_client_id: string;
      oauth_client_secret: string;
    };
  };
  notes: {
    developer: string;
    authentication: string;
    url_format: string;
  };
}

export interface GetClientsResponse {
  success: boolean;
  clients: OAuthClient[];
}

export class OAuthService {
  /**
   * Create a new OAuth client
   */
  static async createClient(
    accessToken: string,
    clientName: string,
    developerId?: string
  ): Promise<CreateOAuthClientResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/oauth/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        client_name: clientName,
        scopes: ["mcp:tools", "mcp:resources"],
        developer_id: developerId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to create OAuth client");
    }

    return response.json();
  }

  /**
   * Get all OAuth clients for the authenticated user
   */
  static async getClients(accessToken: string): Promise<GetClientsResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/oauth/clients`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to fetch OAuth clients");
    }

    return response.json();
  }

  /**
   * Revoke an OAuth client
   */
  static async revokeClient(
    accessToken: string,
    clientId: string
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(
      `${API_BASE_URL}/api/auth/oauth/clients/${clientId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to revoke OAuth client");
    }

    return response.json();
  }
}
