/**
 * Wallet Service
 * Handles wallet balance and payment-related API calls
 */

import { API_ENDPOINTS, HTTP_CONFIG } from "@/lib/api-config";

export interface UserBalance {
  balance_sui: string; // Backend uses SUI (Sui blockchain)
  total_deposited_sui: string;
  total_spent_sui: string;
}

export interface BalanceResponse {
  success: boolean;
  balance_sui: string; // Backend returns balance_sui (not balance_eth)
  total_deposited_sui: string;
  total_spent_sui: string;
  platform_wallet_address?: string;
  blockchain?: string; // Backend also sends blockchain info
  network?: string; // Backend also sends network info
}

export interface DepositResponse {
  success: boolean;
  message: string;
  balance?: UserBalance;
}

/**
 * Custom error class for API errors
 */
export class ApiWalletError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = "ApiWalletError";
  }
}

/**
 * Wallet Service
 * Provides methods for wallet-related API operations
 */
export class WalletService {
  /**
   * Make an authenticated API request
   */
  private static async makeRequest<T>(
    url: string,
    accessToken: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...HTTP_CONFIG.headers,
          Authorization: `Bearer ${accessToken}`,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiWalletError(
          data.message || "Request failed",
          response.status,
          data
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiWalletError) {
        throw error;
      }

      // Network or parsing error
      throw new ApiWalletError(
        error instanceof Error ? error.message : "Network error occurred"
      );
    }
  }

  /**
   * Get user's wallet balance
   * @param accessToken - Current access token
   * @returns User balance information
   */
  static async getBalance(accessToken: string): Promise<{
    success: boolean;
    balance: UserBalance;
    platformWalletAddress?: string;
    blockchain?: string;
    network?: string;
  }> {
    const response = await this.makeRequest<BalanceResponse>(
      API_ENDPOINTS.payment.balance,
      accessToken,
      {
        method: "GET",
      }
    );

    // Backend returns balance in SUI (Sui blockchain)
    return {
      success: response.success,
      balance: {
        balance_sui: response.balance_sui,
        total_deposited_sui: response.total_deposited_sui,
        total_spent_sui: response.total_spent_sui,
      },
      platformWalletAddress: response.platform_wallet_address,
      blockchain: response.blockchain,
      network: response.network,
    };
  }

  /**
   * Deposit funds to user's wallet (manual, for testing)
   * @param accessToken - Current access token
   * @param amountSui - Amount to deposit in SUI
   * @returns Deposit transaction information
   */
  static async depositFunds(
    accessToken: string,
    amountSui: string
  ): Promise<DepositResponse> {
    return this.makeRequest<DepositResponse>(
      API_ENDPOINTS.payment.depositManual,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ amount_sui: amountSui }), // Backend expects amount_sui
      }
    );
  }

  /**
   * Credit deposit after blockchain transaction
   * @param accessToken - Current access token
   * @param amountSui - Amount deposited in SUI
   * @param txHash - Blockchain transaction hash
   * @returns Updated balance information
   */
  static async creditDeposit(
    accessToken: string,
    amountSui: string,
    txHash: string
  ): Promise<DepositResponse> {
    return this.makeRequest<DepositResponse>(
      API_ENDPOINTS.payment.depositCredit, // Use proper endpoint from config
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ amount_sui: amountSui, tx_hash: txHash }), // Backend expects amount_sui
      }
    );
  }
}
