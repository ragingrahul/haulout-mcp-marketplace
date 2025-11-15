/**
 * Authentication Service
 * Handles all authentication-related API calls
 * Follows Single Responsibility Principle - only handles auth API communication
 */

import { API_ENDPOINTS, HTTP_CONFIG } from "@/lib/api-config";
import type {
  LoginRequest,
  SignupRequest,
  AuthResponse,
  SignupResponse,
  ApiError,
} from "@/types/auth";
import { normalizeAuthResponse } from "@/lib/auth-helpers";

/**
 * Custom error class for API errors
 */
export class ApiAuthError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: ApiError
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

/**
 * Authentication Service
 * Provides methods for all auth-related API operations
 */
export class AuthService {
  /**
   * Make an authenticated API request
   */
  private static async makeRequest<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...HTTP_CONFIG.headers,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiAuthError(
          data.message || "Request failed",
          response.status,
          data
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiAuthError) {
        throw error;
      }

      // Network or parsing error
      throw new ApiAuthError(
        error instanceof Error ? error.message : "Network error occurred"
      );
    }
  }

  /**
   * Login user
   * @param email - User email
   * @param password - User password
   * @returns Authentication response with tokens
   */
  static async login(email: string, password: string): Promise<AuthResponse> {
    const payload: LoginRequest = { email, password };

    return this.makeRequest<AuthResponse>(API_ENDPOINTS.auth.login, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Register new user
   * @param email - User email
   * @param password - User password
   * @param fullName - User's full name (optional)
   * @returns Authentication response with tokens (normalized)
   * @note Backend returns tokens in session object, this method normalizes to flat structure
   */
  static async signup(
    email: string,
    password: string,
    fullName?: string
  ): Promise<AuthResponse> {
    const payload: SignupRequest = {
      email,
      password,
      metadata: fullName ? { full_name: fullName } : undefined,
    };

    const response = await this.makeRequest<SignupResponse>(
      API_ENDPOINTS.auth.signup,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    // Normalize signup response (tokens in session object) to match login format
    return normalizeAuthResponse(response);
  }

  /**
   * Logout user
   * @param accessToken - Current access token
   */
  static async logout(accessToken: string): Promise<void> {
    await this.makeRequest(API_ENDPOINTS.auth.logout, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * Get user profile
   * @param accessToken - Current access token
   * @returns User profile data
   */
  static async getProfile(accessToken: string): Promise<AuthResponse> {
    return this.makeRequest<AuthResponse>(API_ENDPOINTS.auth.profile, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * Refresh access token
   * @param refreshToken - Current refresh token
   * @returns New authentication response with fresh tokens
   */
  static async refreshToken(refreshToken: string): Promise<AuthResponse> {
    return this.makeRequest<AuthResponse>(API_ENDPOINTS.auth.refresh, {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }
}
