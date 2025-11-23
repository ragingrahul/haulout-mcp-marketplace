/**
 * Blockchain Storage Adapter
 * Combines Sui blockchain and Walrus storage for endpoint management
 * Replaces Supabase for endpoint and payment data
 */

import { WalrusService } from "./walrusService.js";
import { SuiRegistryService } from "./suiRegistryService.js";
import { supabase } from "./supabase.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";
import { ILogger } from "../core/interfaces/ILogger.js";
import {
  APIEndpoint,
  CreateEndpointInput,
  UpdateEndpointInput,
} from "../types/api.types.js";

const MIST_PER_SUI = 1_000_000_000n;

/**
 * Endpoint configuration stored in Walrus (public data only)
 * Note: Only public APIs are supported - no authentication credentials
 */
interface EndpointConfig {
  name: string;
  url: string;
  method: string;
  description: string;
  parameters: any[];
  headers?: Record<string, string>; // Generic headers only (User-Agent, Accept, etc.)
  timeout: number;
  // Auth removed: developers add public APIs only
}

/**
 * Blockchain Storage Adapter
 * Manages endpoint lifecycle using Sui + Walrus
 */
export class BlockchainStorageAdapter {
  private logger: ILogger;
  private walrus: WalrusService;
  private sui: SuiRegistryService;

  constructor() {
    this.logger = LoggerFactory.getLogger("BlockchainStorageAdapter");
    this.walrus = new WalrusService();
    this.sui = new SuiRegistryService();

    this.logger.info("Initialized BlockchainStorageAdapter");
  }

  /**
   * Prepare endpoint creation (returns transaction for user to sign)
   * 1. Get user's Sui wallet address
   * 2. Store endpoint config in Walrus
   * 3. Build transaction for user to sign
   * Returns: { walrusBlobId, serializedTransaction, endpoint data }
   */
  async prepareEndpointCreation(
    userId: string,
    endpoint: CreateEndpointInput
  ): Promise<{
    walrusBlobId: string;
    serializedTransaction: string;
    packageId: string;
    network: string;
  }> {
    try {
      this.logger.info(
        `Preparing endpoint creation for '${endpoint.name}' (user ${userId})`
      );

      // 1. Get user's Sui wallet address
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", userId)
        .single();

      if (error || !profile?.wallet_address) {
        throw new Error(
          "User wallet address not found. User must connect a Sui wallet."
        );
      }

      // 2. Store endpoint configuration in Walrus
      const endpointConfig: EndpointConfig = {
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        description: endpoint.description,
        parameters: endpoint.parameters,
        headers: endpoint.headers,
        timeout: endpoint.timeout || 30,
      };

      const walrusBlobId = await this.walrus.storeJSON(endpointConfig);
      this.logger.info(`Stored endpoint config in Walrus: ${walrusBlobId}`);

      // 3. Convert price to MIST
      const priceInMist = endpoint.price_per_call_eth
        ? this.ethToMist(endpoint.price_per_call_eth)
        : "0";

      // 4. Build transaction for user to sign
      const serializedTransaction =
        await this.sui.buildCreateEndpointTransaction(
          walrusBlobId,
          profile.wallet_address,
          priceInMist
        );

      this.logger.info(
        `Prepared endpoint creation transaction for user to sign`
      );

      return {
        walrusBlobId,
        serializedTransaction,
        packageId: this.sui.getPackageId(),
        network: process.env.SUI_NETWORK || "testnet",
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to prepare endpoint creation: ${error.message}`,
        error
      );
      throw new Error(`Failed to prepare endpoint creation: ${error.message}`);
    }
  }

  /**
   * Complete endpoint creation after user signs transaction
   * Indexes the endpoint from the transaction digest
   */
  async completeEndpointCreation(
    userId: string,
    txDigest: string,
    walrusBlobId: string,
    endpointData: CreateEndpointInput
  ): Promise<APIEndpoint> {
    try {
      this.logger.info(`Completing endpoint creation from tx: ${txDigest}`);

      // 1. Get user's wallet address
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", userId)
        .single();

      if (error || !profile?.wallet_address) {
        throw new Error("User wallet address not found");
      }

      const walletAddress = profile.wallet_address;

      // 2. Extract endpoint object ID from transaction
      const objectId = await this.sui.getEndpointIdFromTransaction(txDigest);

      // 3. Store user-to-endpoint mapping in Supabase with full endpoint data
      try {
        const { error: mappingError } = await supabase
          .from("user_endpoints")
          .insert({
            user_id: userId,
            wallet_address: walletAddress,
            endpoint_object_id: objectId,
            endpoint_name: endpointData.name,
            walrus_blob_id: walrusBlobId,
            endpoint_data: {
              name: endpointData.name,
              url: endpointData.url,
              method: endpointData.method,
              description: endpointData.description || "",
              parameters: endpointData.parameters || [],
              headers: endpointData.headers || {},
              timeout: endpointData.timeout || 30,
              price_per_call_eth: endpointData.price_per_call_eth || "0",
            },
          });

        if (mappingError) {
          this.logger.error(
            `Failed to store endpoint mapping: ${mappingError.message}`
          );
        } else {
          this.logger.info(`Stored endpoint mapping: ${userId} → ${objectId}`);
        }
      } catch (error: any) {
        this.logger.error(`Error storing endpoint mapping: ${error.message}`);
      }

      // 4. Fetch full endpoint data from blockchain
      const suiEndpoint = await this.sui.getEndpoint(objectId);

      // 5. Use endpoint data passed from frontend (already available, no need to fetch from Walrus)
      // Note: We skip fetching from Walrus here because:
      // - The data was just stored moments ago in the prepare step
      // - Walrus may not have fully replicated it yet
      // - We already have all the data we need from the frontend

      // 6. Return combined endpoint data
      const result: APIEndpoint = {
        id: objectId,
        objectId,
        walrusBlobId,
        onChain: true,
        user_id: userId,
        name: endpointData.name,
        url: endpointData.url,
        method: endpointData.method as any,
        description: endpointData.description || "",
        parameters: endpointData.parameters || [],
        headers: endpointData.headers || {},
        timeout: endpointData.timeout || 30,
        auth: undefined,
        price_per_call_eth: endpointData.price_per_call_eth || "0",
        developer_wallet_address: walletAddress,
        requires_payment:
          !!endpointData.price_per_call_eth &&
          parseFloat(endpointData.price_per_call_eth) > 0,
        totalCalls: suiEndpoint.totalCalls,
        created_at: new Date(suiEndpoint.createdAt).toISOString(),
      };

      this.logger.info(`Successfully completed endpoint creation: ${objectId}`);

      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to complete endpoint creation: ${error.message}`,
        error
      );
      throw new Error(`Failed to complete endpoint creation: ${error.message}`);
    }
  }

  /**
   * Create a new endpoint on blockchain (DEPRECATED - SERVER SIGNS)
   * Use prepareEndpointCreation() + completeEndpointCreation() instead
   * 1. Get user's Sui wallet address from Supabase profiles
   * 2. Store endpoint config in Walrus
   * 3. Create Sui object with Walrus blob ID
   */
  async createEndpoint(
    userId: string,
    endpoint: CreateEndpointInput
  ): Promise<APIEndpoint> {
    try {
      this.logger.info(
        `Creating endpoint '${endpoint.name}' for user ${userId}`
      );

      // 1. Get user's Sui wallet address from Supabase
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", userId)
        .single();

      if (error || !profile?.wallet_address) {
        throw new Error(
          "User wallet address not found. User must have a Sui wallet."
        );
      }

      const walletAddress = profile.wallet_address;

      // 2. Store endpoint configuration in Walrus (public data only)
      const endpointConfig: EndpointConfig = {
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        description: endpoint.description,
        parameters: endpoint.parameters,
        headers: endpoint.headers, // Generic headers only, no auth credentials
        timeout: endpoint.timeout || 30,
        // Auth not stored - developers add public APIs only
      };

      // Store endpoint config in Walrus
      const walrusBlobId = await this.walrus.storeJSON(endpointConfig);
      this.logger.info(`Stored endpoint config in Walrus: ${walrusBlobId}`);

      // 3. Convert price to MIST (Sui's smallest unit)
      const priceInMist = endpoint.price_per_call_eth
        ? this.ethToMist(endpoint.price_per_call_eth)
        : "0";

      // 4. Create Sui object
      const objectId = await this.sui.createEndpoint(walrusBlobId, priceInMist);

      // 4.5. Store user-to-endpoint mapping in Supabase (quick fix for ownership)
      try {
        const { error: mappingError } = await supabase
          .from("user_endpoints")
          .insert({
            user_id: userId,
            wallet_address: walletAddress,
            endpoint_object_id: objectId,
            endpoint_name: endpoint.name,
          });

        if (mappingError) {
          this.logger.error(
            `Failed to store endpoint mapping: ${mappingError.message}`
          );
          // Continue anyway - endpoint is created on blockchain
        } else {
          this.logger.info(`Stored endpoint mapping: ${userId} → ${objectId}`);
        }
      } catch (error: any) {
        this.logger.error(`Error storing endpoint mapping: ${error.message}`);
        // Continue anyway
      }

      // 5. Return combined endpoint data
      const result: APIEndpoint = {
        id: objectId,
        objectId,
        walrusBlobId,
        onChain: true,
        user_id: userId,
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        description: endpoint.description,
        parameters: endpoint.parameters,
        headers: endpoint.headers, // Generic headers only
        timeout: endpoint.timeout || 30,
        auth: undefined, // No auth support - public APIs only
        price_per_call_eth: endpoint.price_per_call_eth,
        developer_wallet_address: walletAddress,
        requires_payment:
          !!endpoint.price_per_call_eth &&
          parseFloat(endpoint.price_per_call_eth) > 0,
        totalCalls: 0,
        created_at: new Date().toISOString(),
      };

      this.logger.info(
        `Successfully created endpoint on blockchain: ${objectId}`
      );

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to create endpoint: ${error.message}`, error);
      throw new Error(`Failed to create endpoint: ${error.message}`);
    }
  }

  /**
   * Get endpoint by Sui object ID
   */
  async getEndpoint(objectId: string): Promise<APIEndpoint | null> {
    try {
      // 1. Get on-chain metadata
      const suiEndpoint = await this.sui.getEndpoint(objectId);

      if (!suiEndpoint.active) {
        this.logger.warning(`Endpoint ${objectId} is inactive`);
        return null;
      }

      // 2. Fetch full configuration from Walrus
      const config = await this.walrus.retrieveJSON<EndpointConfig>(
        suiEndpoint.walrusBlobId
      );

      // 3. Combine data
      const result: APIEndpoint = {
        id: objectId,
        objectId,
        walrusBlobId: suiEndpoint.walrusBlobId,
        onChain: true,
        user_id: suiEndpoint.owner,
        name: config.name,
        url: config.url,
        method: config.method as any,
        description: config.description,
        parameters: config.parameters,
        headers: config.headers, // Generic headers only
        timeout: config.timeout,
        auth: undefined, // No auth support - public APIs only
        price_per_call_eth: this.mistToEth(suiEndpoint.pricePerCall),
        developer_wallet_address: suiEndpoint.owner,
        requires_payment: BigInt(suiEndpoint.pricePerCall) > 0n,
        totalCalls: suiEndpoint.totalCalls,
        created_at: new Date(suiEndpoint.createdAt).toISOString(),
      };

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to get endpoint: ${error.message}`, error);
      throw new Error(`Failed to get endpoint: ${error.message}`);
    }
  }

  /**
   * Get all endpoints for a user by their Sui wallet address
   * Uses Supabase mapping table to find user's endpoints
   */
  async getUserEndpoints(walletAddress: string): Promise<APIEndpoint[]> {
    try {
      this.logger.info(`Fetching endpoints for wallet: ${walletAddress}`);

      // 1. Get endpoint object IDs from Supabase mapping
      const { data: mappings, error: mappingError } = await supabase
        .from("user_endpoints")
        .select(
          "endpoint_object_id, user_id, endpoint_name, endpoint_data, walrus_blob_id"
        )
        .eq("wallet_address", walletAddress);

      if (mappingError) {
        this.logger.error(
          `Failed to get endpoint mappings: ${mappingError.message}`
        );
        return []; // Return empty array instead of failing
      }

      if (!mappings || mappings.length === 0) {
        this.logger.info(`No endpoints found for wallet ${walletAddress}`);
        return [];
      }

      this.logger.info(
        `Found ${mappings.length} endpoint mappings for ${walletAddress}`
      );

      // 2. Build endpoints from cached data (no Walrus fetch needed!)
      const endpoints = await Promise.all(
        mappings.map(async (mapping: any) => {
          try {
            const suiEndpoint = await this.sui.getEndpoint(
              mapping.endpoint_object_id
            );
            const data = mapping.endpoint_data;

            const isPaid =
              !!data.price_per_call_eth &&
              parseFloat(data.price_per_call_eth) > 0;

            return {
              id: mapping.endpoint_object_id,
              objectId: mapping.endpoint_object_id,
              walrusBlobId: mapping.walrus_blob_id,
              onChain: true,
              user_id: mapping.user_id,
              name: data.name,
              url: data.url,
              method: data.method,
              description: data.description || "",
              parameters: data.parameters || [],
              headers: data.headers || {},
              timeout: data.timeout || 30,
              auth: undefined,
              price_per_call_eth: data.price_per_call_eth || "0",
              developer_wallet_address: walletAddress,
              is_paid: isPaid, // Frontend compatibility
              requires_payment: isPaid, // Backend compatibility
              totalCalls: suiEndpoint.totalCalls,
              created_at: new Date(suiEndpoint.createdAt).toISOString(),
            } as APIEndpoint;
          } catch (error: any) {
            this.logger.error(
              `Failed to build endpoint ${mapping.endpoint_object_id}: ${error.message}`
            );
            return null;
          }
        })
      );

      const validEndpoints = endpoints.filter(
        (ep): ep is APIEndpoint => ep !== null
      );

      this.logger.info(
        `Successfully fetched ${validEndpoints.length} endpoints for ${walletAddress}`
      );

      return validEndpoints;
    } catch (error: any) {
      this.logger.error(
        `Failed to get user endpoints: ${error.message}`,
        error
      );
      throw new Error(`Failed to get user endpoints: ${error.message}`);
    }
  }

  /**
   * Update an endpoint
   * Creates new Walrus blob (immutable) and updates Sui pointer
   */
  async updateEndpoint(
    objectId: string,
    userId: string,
    updates: UpdateEndpointInput
  ): Promise<APIEndpoint> {
    try {
      this.logger.info(`Updating endpoint ${objectId}`);

      // 1. Get current endpoint (handle missing blob gracefully)
      let currentEndpoint: APIEndpoint | null = null;
      try {
        currentEndpoint = await this.getEndpoint(objectId);
      } catch (error: any) {
        // If blob not found, we can still proceed with partial updates
        if (error.message?.includes("Blob not found")) {
          this.logger.info(
            `Could not retrieve existing endpoint data from Walrus (${error.message}). Proceeding with partial update.`
          );
          // We'll create a minimal endpoint structure from the updates
        } else {
          throw error; // Re-throw if it's not a blob issue
        }
      }

      if (!currentEndpoint) {
        // If we couldn't get the current endpoint, ensure we have minimum required fields
        if (!updates.name || !updates.url || !updates.method) {
          throw new Error(
            "Cannot update endpoint: missing required fields (name, url, method) and could not retrieve from Walrus"
          );
        }
      }

      // 2. Verify ownership
      const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", userId)
        .single();

      if (
        currentEndpoint &&
        profile?.wallet_address !== currentEndpoint.developer_wallet_address
      ) {
        throw new Error("Not authorized to update this endpoint");
      }

      // 3. If configuration changed, create new Walrus blob
      let newBlobId = currentEndpoint?.walrusBlobId;
      const configChanged =
        updates.name ||
        updates.url ||
        updates.method ||
        updates.description ||
        updates.parameters ||
        updates.headers ||
        updates.timeout !== undefined;

      if (configChanged) {
        const updatedConfig: EndpointConfig = {
          name: updates.name || currentEndpoint?.name || "",
          url: updates.url || currentEndpoint?.url || "",
          method: updates.method || currentEndpoint?.method || "GET",
          description:
            updates.description || currentEndpoint?.description || "",
          parameters: updates.parameters || currentEndpoint?.parameters || [],
          headers: updates.headers || currentEndpoint?.headers || {}, // Generic headers only
          timeout: updates.timeout ?? currentEndpoint?.timeout ?? 30,
          // Auth not stored - public APIs only
        };

        newBlobId = await this.walrus.storeJSON(updatedConfig);
        this.logger.info(`Created new Walrus blob: ${newBlobId}`);

        // Update Sui with new blob ID (requires user's keypair in production)
        // For now, we'll log this as a TODO
        this.logger.warning(
          "Walrus blob update requires user keypair - not implemented yet"
        );
      }

      // 4. If pricing changed, update in user_endpoints table
      if (updates.price_per_call_eth !== undefined) {
        this.logger.info(
          `Updating pricing for endpoint ${objectId} to ${updates.price_per_call_eth}`
        );

        // Get current endpoint_data from user_endpoints
        const { data: mapping, error: mappingError } = await supabase
          .from("user_endpoints")
          .select("endpoint_data")
          .eq("endpoint_object_id", objectId)
          .single();

        if (mappingError) {
          this.logger.error(
            `Failed to get endpoint mapping: ${mappingError.message}`
          );
        } else if (mapping) {
          // Update the pricing in endpoint_data JSON
          const updatedData = {
            ...mapping.endpoint_data,
            price_per_call_eth: updates.price_per_call_eth,
          };

          const { error: updateError } = await supabase
            .from("user_endpoints")
            .update({ endpoint_data: updatedData })
            .eq("endpoint_object_id", objectId);

          if (updateError) {
            this.logger.error(
              `Failed to update pricing in user_endpoints: ${updateError.message}`
            );
            throw new Error(`Failed to update pricing: ${updateError.message}`);
          }

          this.logger.info(
            `Successfully updated pricing in user_endpoints table`
          );
        }

        // TODO: Also update on Sui blockchain (requires user keypair)
        // const newPrice = this.ethToMist(updates.price_per_call_eth);
        // await this.sui.updatePricing(objectId, newPrice, userKeypair);
      }

      // 5. Return updated endpoint (try to fetch, but return current if fetch fails)
      try {
        const updatedEndpoint = await this.getEndpoint(objectId);
        if (!updatedEndpoint) {
          throw new Error("Updated endpoint returned null");
        }
        return updatedEndpoint;
      } catch (error: any) {
        this.logger.info(
          `Could not retrieve updated endpoint data: ${error.message}. Returning current data.`
        );
        if (!currentEndpoint) {
          throw new Error(
            "Cannot retrieve endpoint after update and no cached data available"
          );
        }
        return currentEndpoint;
      }
    } catch (error: any) {
      this.logger.error(`Failed to update endpoint: ${error.message}`, error);
      throw new Error(`Failed to update endpoint: ${error.message}`);
    }
  }

  /**
   * Delete (deactivate) an endpoint
   */
  async deleteEndpoint(objectId: string, userId: string): Promise<boolean> {
    try {
      this.logger.info(`Deleting endpoint ${objectId}`);

      // 1. Verify ownership
      const endpoint = await this.getEndpoint(objectId);
      if (!endpoint) {
        throw new Error("Endpoint not found");
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", userId)
        .single();

      if (profile?.wallet_address !== endpoint.developer_wallet_address) {
        throw new Error("Not authorized to delete this endpoint");
      }

      // 2. Deactivate on Sui (requires user keypair)
      this.logger.warning(
        "Endpoint deactivation requires user keypair - marking as deleted"
      );

      // In production, call: await this.sui.deactivateEndpoint(objectId, userKeypair);

      return true;
    } catch (error: any) {
      this.logger.error(`Failed to delete endpoint: ${error.message}`, error);
      throw new Error(`Failed to delete endpoint: ${error.message}`);
    }
  }

  /**
   * Process payment for API call
   */
  async processPayment(
    consumerAddress: string,
    endpointId: string,
    amount: string
  ): Promise<string> {
    try {
      this.logger.info(
        `Processing payment: ${amount} from ${consumerAddress} for ${endpointId}`
      );

      // In production, this requires consumer's keypair to sign
      // For now, return a placeholder transaction hash
      const txHash = `0x${Date.now().toString(16)}`;

      this.logger.warning(
        "Payment processing requires consumer keypair - returning mock tx hash"
      );

      return txHash;
    } catch (error: any) {
      this.logger.error(`Failed to process payment: ${error.message}`, error);
      throw new Error(`Failed to process payment: ${error.message}`);
    }
  }

  /**
   * Get user's SUI balance
   */
  async getUserBalance(walletAddress: string): Promise<string> {
    try {
      const balance = await this.sui.getSuiBalance(walletAddress);
      return this.mistToEth(balance); // Convert to human-readable format
    } catch (error: any) {
      this.logger.error(`Failed to get balance: ${error.message}`, error);
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  // ===== Helper Methods =====

  /**
   * Convert ETH string to MIST (Sui's smallest unit)
   */
  private ethToMist(ethAmount: string): string {
    try {
      const eth = parseFloat(ethAmount);
      const mist = BigInt(Math.floor(eth * Number(MIST_PER_SUI)));
      return mist.toString();
    } catch {
      return "0";
    }
  }

  /**
   * Convert MIST to ETH string
   */
  private mistToEth(mistAmount: string): string {
    try {
      const mist = BigInt(mistAmount);
      const eth = Number(mist) / Number(MIST_PER_SUI);
      return eth.toString();
    } catch {
      return "0";
    }
  }

  /**
   * Get service information
   */
  getInfo() {
    return {
      walrus: this.walrus.getConfig(),
      sui: this.sui.getConfig(),
    };
  }
}
