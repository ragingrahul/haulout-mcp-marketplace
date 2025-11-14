/**
 * Authentication Types
 * Type definitions for authentication-related data structures
 */

/**
 * User information
 */
export interface User {
  id: string;
  email: string;
  full_name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_metadata?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app_metadata?: Record<string, any>;
}

/**
 * Login request payload
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Signup request payload
 * Note: fullName should be passed in metadata object as metadata.full_name
 */
export interface SignupRequest {
  email: string;
  password: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

/**
 * Authentication response from API (Login)
 */
export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  access_token?: string;
  refresh_token?: string;
}

/**
 * Signup response from API
 * Note: Signup returns tokens in a nested session object
 */
export interface SignupResponse {
  success: boolean;
  message: string;
  user?: User;
  session?: {
    access_token?: string;
    refresh_token?: string;
  };
}

/**
 * API error response
 */
export interface ApiError {
  success: false;
  message: string;
  error?: string;
}

/**
 * Auth context state
 */
export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Auth context actions
 */
export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>
  ) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
}
