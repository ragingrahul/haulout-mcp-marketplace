/**
 * Storage Service
 * Handles secure storage of authentication tokens
 * Follows Single Responsibility Principle - only handles token storage
 */

import type { User } from "@/types/auth";

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  ACCESS_TOKEN: "mcp_access_token",
  REFRESH_TOKEN: "mcp_refresh_token",
  USER: "mcp_user",
} as const;

/**
 * Storage Service
 * Provides methods for securely storing and retrieving auth data
 */
export class StorageService {
  /**
   * Check if we're in a browser environment
   */
  private static isBrowser(): boolean {
    return typeof window !== "undefined";
  }

  /**
   * Save access token
   */
  static saveAccessToken(token: string): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  }

  /**
   * Get access token
   */
  static getAccessToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Remove access token
   */
  static removeAccessToken(): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Save refresh token
   */
  static saveRefreshToken(token: string): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
  }

  /**
   * Get refresh token
   */
  static getRefreshToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Remove refresh token
   */
  static removeRefreshToken(): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Save user data
   */
  static saveUser(user: User): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  /**
   * Get user data
   */
  static getUser(): User | null {
    if (!this.isBrowser()) return null;
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  }

  /**
   * Remove user data
   */
  static removeUser(): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem(STORAGE_KEYS.USER);
  }

  /**
   * Clear all auth data
   */
  static clearAll(): void {
    this.removeAccessToken();
    this.removeRefreshToken();
    this.removeUser();
  }

  /**
   * Save complete auth session
   */
  static saveSession(
    accessToken: string,
    refreshToken: string,
    user: User
  ): void {
    this.saveAccessToken(accessToken);
    this.saveRefreshToken(refreshToken);
    this.saveUser(user);
  }
}
