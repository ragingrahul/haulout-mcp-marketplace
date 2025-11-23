/**
 * Core API endpoint type definitions
 *
 * Note: This system only supports PUBLIC APIs (no authentication).
 * Developers add publicly accessible endpoints and monetize via pay-per-use pricing.
 */

import { AuthConfig } from "./auth.types.js";

export enum HTTPMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  PATCH = "PATCH",
}

export type ParameterType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";
export type ParameterLocation = "path" | "query" | "body" | "header";

export interface APIParameter {
  name: string;
  type: ParameterType;
  description: string;
  location: ParameterLocation;
  required?: boolean;
  default?: any;
}

export interface APIEndpoint {
  id?: string; // UUID from Supabase OR Sui object ID
  user_id?: string; // Owner of the endpoint
  name: string;
  url: string;
  method: HTTPMethod;
  description: string;
  parameters: APIParameter[];
  headers?: Record<string, string>; // Generic headers only (User-Agent, Accept, etc.)
  timeout?: number;
  auth?: AuthConfig; // DEPRECATED: Not supported - public APIs only. Kept for backward compatibility.
  price_per_call_eth?: string; // Payment: SUI cost per call (field name kept for DB compatibility)
  developer_wallet_address?: string; // Payment: where to send funds
  is_paid?: boolean; // Payment: computed field for frontend compatibility (true if price > 0)
  requires_payment?: boolean; // Payment: computed field for backend compatibility (true if price > 0)
  created_at?: string; // ISO timestamp
  updated_at?: string; // ISO timestamp
  // Blockchain fields
  objectId?: string; // Sui object ID
  walrusBlobId?: string; // Walrus blob pointer
  onChain?: boolean; // Whether stored on blockchain
  totalCalls?: number; // Total API calls (from blockchain)
}

/**
 * Database representation of endpoint (matches Supabase schema)
 */
export interface EndpointRecord {
  id: string;
  user_id: string;
  name: string;
  url: string;
  method: string;
  description: string;
  parameters: APIParameter[];
  headers?: Record<string, string>;
  timeout: number;
  created_at: string;
  updated_at: string;
}

/**
 * Input type for creating a new endpoint
 * Note: Only public APIs are supported (no auth credentials)
 */
export interface CreateEndpointInput {
  name: string;
  url: string;
  method: HTTPMethod;
  description: string;
  parameters: APIParameter[];
  headers?: Record<string, string>; // Generic headers only (User-Agent, Accept, etc.)
  timeout?: number;
  auth?: AuthConfig; // DEPRECATED: Not used - public APIs only
  price_per_call_eth?: string; // Payment: SUI cost per call
  developer_wallet_address?: string; // Payment: developer's wallet
}

/**
 * Input type for updating an endpoint
 * Note: Only public APIs are supported (no auth credentials)
 */
export interface UpdateEndpointInput {
  name?: string;
  url?: string;
  method?: HTTPMethod;
  description?: string;
  parameters?: APIParameter[];
  headers?: Record<string, string>; // Generic headers only
  timeout?: number;
  auth?: AuthConfig; // DEPRECATED: Not used - public APIs only
  price_per_call_eth?: string; // Payment: SUI cost per call
  developer_wallet_address?: string; // Payment: developer's wallet
}

/**
 * Api Response type
 */

export interface ApiResponse {
  success: boolean;
  status_code?: number;
  data?: any;
  message: string;
  payment_details?: any; // For 402 Payment Required responses
}
