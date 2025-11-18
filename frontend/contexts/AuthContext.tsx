"use client";

/**
 * Authentication Context
 * Provides authentication state and methods throughout the application
 * Follows Provider Pattern and Dependency Inversion Principle
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthService, ApiAuthError } from "@/services/authService";
import { StorageService } from "@/services/storageService";
import type { AuthContextType, User } from "@/types/auth";

/**
 * Auth Context
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Auth Provider Props
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication Provider Component
 * Manages authentication state and provides auth methods to children
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Initialize auth state from storage on mount
   */
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = StorageService.getAccessToken();
        const storedRefreshToken = StorageService.getRefreshToken();
        const storedUser = StorageService.getUser();

        if (storedToken && storedUser) {
          // Verify token is still valid
          try {
            const response = await AuthService.getProfile(storedToken);
            if (response.success && response.user) {
              setUser(response.user);
              setAccessToken(storedToken);
              setRefreshToken(storedRefreshToken);
            } else {
              // Token invalid, clear storage
              StorageService.clearAll();
            }
          } catch (profileError) {
            // Token expired or invalid, try to refresh
            console.log("ℹ️ Session expired, attempting to refresh...");
            if (storedRefreshToken) {
              try {
                const response = await AuthService.refreshToken(
                  storedRefreshToken
                );
                if (response.success && response.access_token) {
                  setAccessToken(response.access_token);
                  setRefreshToken(response.refresh_token || null);
                  if (response.user) {
                    setUser(response.user);
                  }
                  StorageService.saveAccessToken(response.access_token);
                  if (response.refresh_token) {
                    StorageService.saveRefreshToken(response.refresh_token);
                  }
                  if (response.user) {
                    StorageService.saveUser(response.user);
                  }
                  console.log("✅ Session refreshed successfully");
                } else {
                  console.log(
                    "ℹ️ Session could not be refreshed, clearing storage"
                  );
                  StorageService.clearAll();
                }
              } catch (refreshError) {
                console.log("ℹ️ Refresh token invalid, clearing storage");
                StorageService.clearAll();
              }
            } else {
              console.log("ℹ️ No refresh token available, clearing storage");
              StorageService.clearAll();
            }
          }
        }
      } catch (error) {
        console.warn("⚠️ Error initializing auth:", error);
        StorageService.clearAll();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  /**
   * Login user
   */
  const login = async (email: string, password: string): Promise<void> => {
    try {
      const response = await AuthService.login(email, password);

      if (!response.success || !response.user || !response.access_token) {
        throw new ApiAuthError(response.message || "Login failed");
      }

      // Save to state
      setUser(response.user);
      setAccessToken(response.access_token);
      setRefreshToken(response.refresh_token || null);

      // Save to storage
      if (response.refresh_token) {
        StorageService.saveSession(
          response.access_token,
          response.refresh_token,
          response.user
        );
      } else {
        StorageService.saveAccessToken(response.access_token);
        StorageService.saveUser(response.user);
      }

      // Redirect to dashboard or home
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof ApiAuthError) {
        throw error;
      }
      throw new ApiAuthError("Failed to login. Please try again.");
    }
  };

  /**
   * Sign up new user
   */
  const signup = async (
    email: string,
    password: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>
  ): Promise<void> => {
    try {
      // Extract fullName from metadata if provided
      const fullName = metadata?.full_name as string | undefined;
      const response = await AuthService.signup(email, password, fullName);

      if (!response.success || !response.user) {
        throw new ApiAuthError(response.message || "Signup failed");
      }

      // If tokens are provided (auto-login after signup)
      if (response.access_token) {
        setUser(response.user);
        setAccessToken(response.access_token);
        setRefreshToken(response.refresh_token || null);

        if (response.refresh_token) {
          StorageService.saveSession(
            response.access_token,
            response.refresh_token,
            response.user
          );
        } else {
          StorageService.saveAccessToken(response.access_token);
          StorageService.saveUser(response.user);
        }

        // Redirect to dashboard
        router.push("/dashboard");
      } else {
        // Email verification required - redirect to login
        router.push(
          "/login?message=Please check your email to verify your account"
        );
      }
    } catch (error) {
      if (error instanceof ApiAuthError) {
        throw error;
      }
      throw new ApiAuthError("Failed to sign up. Please try again.");
    }
  };

  /**
   * Logout user
   */
  const logout = (): void => {
    // Clear state
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);

    // Clear storage
    StorageService.clearAll();

    // Call logout endpoint if we have a token (fire and forget)
    if (accessToken) {
      AuthService.logout(accessToken).catch(() => {
        // Ignore errors on logout
      });
    }

    // Redirect to login
    router.push("/login");
  };

  /**
   * Refresh access token
   */
  const refreshAccessToken = async (): Promise<void> => {
    const currentRefreshToken =
      refreshToken || StorageService.getRefreshToken();

    if (!currentRefreshToken) {
      throw new ApiAuthError("No refresh token available");
    }

    try {
      const response = await AuthService.refreshToken(currentRefreshToken);

      if (!response.success || !response.access_token) {
        throw new ApiAuthError("Failed to refresh token");
      }

      // Update state
      setAccessToken(response.access_token);
      if (response.refresh_token) {
        setRefreshToken(response.refresh_token);
      }
      if (response.user) {
        setUser(response.user);
      }

      // Update storage
      StorageService.saveAccessToken(response.access_token);
      if (response.refresh_token) {
        StorageService.saveRefreshToken(response.refresh_token);
      }
      if (response.user) {
        StorageService.saveUser(response.user);
      }
    } catch (error) {
      // Refresh failed, logout user
      logout();
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    accessToken,
    refreshToken,
    isLoading,
    isAuthenticated: !!user && !!accessToken,
    login,
    signup,
    logout,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook to use auth context
 * Must be used within AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
