/**
 * Payment Types
 * Type definitions for payment-related data structures
 */

/**
 * Balance information
 */
export interface Balance {
  user_id: string;
  balance: number;
  currency: string;
  last_updated: string;
}

/**
 * Balance response
 */
export interface BalanceResponse {
  success: boolean;
  balance: Balance;
}

/**
 * Deposit instructions response
 */
export interface DepositInstructionsResponse {
  success: boolean;
  deposit_address: string;
  network: string;
  message: string;
}

/**
 * Credit deposit request
 */
export interface CreditDepositRequest {
  tx_hash: string;
  amount: number;
}

/**
 * Manual credit request (for testing/admin)
 */
export interface ManualCreditRequest {
  amount: number;
}

/**
 * Pricing configuration
 */
export interface PricingConfig {
  endpoint_id: string;
  price_per_call: number;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Set pricing request
 */
export interface SetPricingRequest {
  price_per_call: number;
  currency?: string;
}

/**
 * Pricing response
 */
export interface PricingResponse {
  success: boolean;
  pricing?: PricingConfig;
  message?: string;
}

/**
 * Payment transaction
 */
export interface PaymentTransaction {
  id: string;
  user_id: string;
  endpoint_id?: string;
  amount: number;
  currency: string;
  transaction_type: "deposit" | "payment" | "refund";
  status: "pending" | "completed" | "failed";
  tx_hash?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Payment history response
 */
export interface PaymentHistoryResponse {
  success: boolean;
  transactions: PaymentTransaction[];
  total: number;
  page?: number;
  limit?: number;
}

/**
 * Payment status response
 */
export interface PaymentStatusResponse {
  success: boolean;
  payment: PaymentTransaction;
}

/**
 * Transaction details response
 */
export interface TransactionDetailsResponse {
  success: boolean;
  transaction: {
    tx_hash: string;
    status: string;
    amount?: number;
    from?: string;
    to?: string;
    timestamp?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
}

/**
 * Gas estimation request
 */
export interface EstimateGasRequest {
  to: string;
  amount: number;
}

/**
 * Gas estimation response
 */
export interface EstimateGasResponse {
  success: boolean;
  estimated_gas: number;
  estimated_cost: number;
  currency: string;
}

/**
 * Generic API response
 */
export interface ApiResponse {
  success: boolean;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
