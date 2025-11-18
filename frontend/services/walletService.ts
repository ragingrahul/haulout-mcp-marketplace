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
  balance_sui: string; // Calculated balance (deposits - spent)
  total_deposited_sui: string;
  total_spent_sui: string;
  wallet_address?: string; // User's connected wallet
  native_sui_balance?: string; // Native SUI balance in wallet
  has_balance_account?: boolean; // Whether on-chain balance tracking exists
  balance_object_id?: string; // Sui object ID of UserBalance object
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
   * Connect wallet to user account
   * @param accessToken - Current access token
   * @param walletAddress - Sui wallet address
   * @returns Connection confirmation
   */
  static async connectWallet(
    accessToken: string,
    walletAddress: string
  ): Promise<{
    success: boolean;
    message: string;
    wallet_address?: string;
  }> {
    return this.makeRequest<{
      success: boolean;
      message: string;
      wallet_address?: string;
    }>(API_ENDPOINTS.wallet.connect, accessToken, {
      method: "POST",
      body: JSON.stringify({ wallet_address: walletAddress }),
    });
  }

  /**
   * Disconnect wallet from user account
   * @param accessToken - Current access token
   * @returns Disconnection confirmation
   */
  static async disconnectWallet(accessToken: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.makeRequest<{
      success: boolean;
      message: string;
    }>(API_ENDPOINTS.wallet.disconnect, accessToken, {
      method: "POST",
    });
  }

  /**
   * Get connected wallet address
   * @param accessToken - Current access token
   * @returns Wallet connection status
   */
  static async getConnectedWallet(accessToken: string): Promise<{
    success: boolean;
    wallet_address: string | null;
    is_connected: boolean;
  }> {
    return this.makeRequest<{
      success: boolean;
      wallet_address: string | null;
      is_connected: boolean;
    }>(API_ENDPOINTS.wallet.get, accessToken, {
      method: "GET",
    });
  }

  /**
   * Get user's wallet balance
   * @param accessToken - Current access token
   * @returns User balance information
   */
  static async getBalance(accessToken: string): Promise<{
    success: boolean;
    balance: UserBalance;
    walletAddress?: string;
    nativeSuiBalance?: string;
    has_balance_account?: boolean;
    balance_object_id?: string;
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
      walletAddress: response.wallet_address,
      nativeSuiBalance: response.native_sui_balance,
      has_balance_account: response.has_balance_account,
      balance_object_id: response.balance_object_id,
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
