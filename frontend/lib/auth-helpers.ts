/**
 * Authentication Helper Functions
 * Utilities to handle auth responses and requests
 */

import { AuthResponse, SignupResponse, SignupRequest } from "@/types/auth";

/**
 * Normalize signup response to match login response format
 * Backend returns tokens in session object for signup, but flat for login
 */
export function normalizeAuthResponse(
  response: SignupResponse | AuthResponse
): AuthResponse {
  // If it's a signup response with session object
  if ("session" in response && response.session) {
    return {
      success: response.success,
      message: response.message,
      user: response.user,
      access_token: response.session.access_token,
      refresh_token: response.session.refresh_token,
    };
  }

  // Already in the correct format (login response)
  return response as AuthResponse;
}

/**
 * Create signup request payload
 * Handles fullName by placing it in metadata
 */
export function createSignupRequest(
  email: string,
  password: string,
  fullName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalMetadata?: Record<string, any>
): SignupRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata: Record<string, any> = {
    ...additionalMetadata,
  };

  if (fullName) {
    metadata.full_name = fullName;
  }

  return {
    email,
    password,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/**
 * Get authorization header for authenticated requests
 */
export function getAuthHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}
