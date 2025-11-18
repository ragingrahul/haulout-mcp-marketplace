/**
 * Endpoint Controller
 * Handles all endpoint-related business logic
 */

import { Request, Response } from "express";
import { MCPServerRegistry } from "../mcp/MCPServerRegistry.js";
import { createEndpointFromConfig } from "../utils/endpointUtils.js";
import { AuthenticatedRequest } from "../types/auth.types.js";
// import {
//   createEndpoint,
//   deleteEndpointByName,
//   getEndpointsByUserId,
//   updateEndpoint,
// } from "../services/endpointRepository.js";
import { BlockchainStorageAdapter } from "../services/blockchainStorageAdapter.js";
import { supabase } from "../services/supabase.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";

// Get logger for this controller
const log = LoggerFactory.getLogger("EndpointController");

// Initialize blockchain storage adapter
const blockchainStorage = new BlockchainStorageAdapter();

/**
 * Prepare endpoint creation (returns transaction for user to sign)
 * Step 1: Backend stores config in Walrus and builds transaction
 */
export async function prepareEndpoint(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Validate endpoint config
    const endpoint = createEndpointFromConfig(req.body);

    // Prepare endpoint (store in Walrus, build transaction)
    const prepared = await blockchainStorage.prepareEndpointCreation(
      userId,
      endpoint
    );

    log.info(`Prepared endpoint '${endpoint.name}' for user ${userId} to sign`);

    res.json({
      success: true,
      message: "Transaction prepared. Please sign with your wallet.",
      transaction: {
        serialized: prepared.serializedTransaction,
        walrusBlobId: prepared.walrusBlobId,
        packageId: prepared.packageId,
        network: prepared.network,
      },
      endpoint: {
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        description: endpoint.description,
      },
    });
  } catch (error: any) {
    log.error(`Error preparing endpoint: ${error.message}`, error);
    res.status(400).json({
      success: false,
      message: `Error preparing endpoint: ${error.message}`,
    });
  }
}

/**
 * Complete endpoint creation (after user signs transaction)
 * Step 2: Backend indexes the endpoint from transaction digest
 */
export async function completeEndpoint(
  req: Request,
  res: Response,
  registry: MCPServerRegistry
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    log.info(
      `Complete endpoint request body: ${JSON.stringify(req.body, null, 2)}`
    );

    const { txDigest, walrusBlobId, endpoint: endpointData } = req.body;

    log.info(
      `Extracted values - txDigest: ${txDigest}, walrusBlobId: ${walrusBlobId}, endpointData: ${!!endpointData}`
    );

    if (!txDigest || !walrusBlobId || !endpointData) {
      log.error(
        `Missing fields - txDigest: ${!!txDigest}, walrusBlobId: ${!!walrusBlobId}, endpointData: ${!!endpointData}`
      );
      res.status(400).json({
        success: false,
        message: "Missing required fields: txDigest, walrusBlobId, endpoint",
      });
      return;
    }

    // Complete endpoint creation (extract from transaction, index)
    const savedEndpoint = await blockchainStorage.completeEndpointCreation(
      userId,
      txDigest,
      walrusBlobId,
      endpointData
    );

    // Add to user's MCP server
    const userServer = await registry.getOrCreateServer(userId);
    userServer.addEndpoint(savedEndpoint);

    log.info(
      `Successfully completed endpoint '${endpointData.name}' for user ${userId} (objectId: ${savedEndpoint.objectId})`
    );

    res.json({
      success: true,
      message: `Successfully created endpoint '${endpointData.name}'`,
      endpoint: {
        id: savedEndpoint.id,
        objectId: savedEndpoint.objectId,
        name: savedEndpoint.name,
        url: savedEndpoint.url,
        method: savedEndpoint.method,
        walrusBlobId: savedEndpoint.walrusBlobId,
        developer_wallet_address: savedEndpoint.developer_wallet_address,
      },
    });
  } catch (error: any) {
    log.error(`Error completing endpoint: ${error.message}`, error);
    res.status(400).json({
      success: false,
      message: `Error completing endpoint: ${error.message}`,
    });
  }
}

/**
 * Add a new API endpoint (DEPRECATED - uses server signing)
 * Use prepareEndpoint + completeEndpoint for user-signed transactions
 */
export async function addEndpoint(
  req: Request,
  res: Response,
  registry: MCPServerRegistry
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Validate and create endpoint object
    const endpoint = createEndpointFromConfig(req.body);

    // Save to blockchain (Sui + Walrus)
    const savedEndpoint = await blockchainStorage.createEndpoint(
      userId,
      endpoint
    );

    // Get or create user's MCP server and add endpoint
    const userServer = await registry.getOrCreateServer(userId);
    userServer.addEndpoint(savedEndpoint);

    log.info(
      `Successfully added endpoint '${endpoint.name}' for user ${userId} (objectId: ${savedEndpoint.objectId})`
    );

    res.json({
      success: true,
      message: `Successfully added endpoint '${endpoint.name}'`,
      endpoint: {
        id: savedEndpoint.id,
        objectId: savedEndpoint.objectId,
        name: savedEndpoint.name,
        url: savedEndpoint.url,
        method: savedEndpoint.method,
      },
    });
  } catch (error: any) {
    log.error(`Error adding endpoint: ${error.message}`, error);
    res.status(400).json({
      success: false,
      message: `Error adding endpoint: ${error.message}`,
    });
  }
}

/**
 * Remove an API endpoint
 */
export async function removeEndpoint(
  req: Request,
  res: Response,
  registry: MCPServerRegistry
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Use objectId (Sui object ID) instead of name
    const objectId = req.params.name; // Keeping param name for backward compatibility

    if (!objectId) {
      log.warning("Remove endpoint called without objectId");
      res.status(400).json({
        success: false,
        message: "Endpoint objectId is required",
      });
      return;
    }

    // Delete from blockchain
    const deleted = await blockchainStorage.deleteEndpoint(objectId, userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        message: `Endpoint '${objectId}' not found`,
      });
      return;
    }

    // Remove from user's MCP server
    const userServer = registry.getServerByUserId(userId);
    if (userServer) {
      // TODO: Need to remove by objectId instead of name
      userServer.removeEndpoint(objectId);
    }

    log.info(`Successfully removed endpoint '${objectId}' for user ${userId}`);

    res.json({
      success: true,
      message: `Successfully removed endpoint '${objectId}'`,
    });
  } catch (error: any) {
    log.error(`Error removing endpoint: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error removing endpoint: ${error.message}`,
    });
  }
}

/**
 * List all configured endpoints for the authenticated user
 */
export async function listEndpoints(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Get user's wallet address from Supabase profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error || !profile?.wallet_address) {
      log.info(
        `User wallet address not found for userId: ${userId} - returning empty list`
      );
      // Return empty list instead of error - wallet might not be connected yet
      res.json({
        success: true,
        endpoints: [],
        count: 0,
        wallet_connected: false,
        message: "No wallet connected. Connect your wallet to see endpoints.",
      });
      return;
    }

    // Fetch from blockchain
    const endpoints = await blockchainStorage.getUserEndpoints(
      profile.wallet_address
    );

    res.json({
      success: true,
      endpoints,
      count: endpoints.length,
      wallet_connected: true,
    });
  } catch (error: any) {
    log.error(`Error listing endpoints: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error listing endpoints: ${error.message}`,
    });
  }
}

/**
 * Update an existing endpoint
 */
export async function updateEndpointController(
  req: Request,
  res: Response,
  registry: MCPServerRegistry
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const objectId = req.params.id;

    if (!objectId) {
      res.status(400).json({
        success: false,
        message: "Endpoint objectId is required",
      });
      return;
    }

    // Update on blockchain
    const updatedEndpoint = await blockchainStorage.updateEndpoint(
      objectId,
      userId,
      req.body
    );

    // Reload the user's server to reflect changes
    await registry.reloadServerEndpoints(userId);

    log.info(`Successfully updated endpoint ${objectId} for user ${userId}`);

    res.json({
      success: true,
      message: "Endpoint updated successfully",
      endpoint: updatedEndpoint,
    });
  } catch (error: any) {
    log.error(`Error updating endpoint: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error updating endpoint: ${error.message}`,
    });
  }
}

/**
 * Get marketplace - list all developers with their endpoints
 */
export async function getMarketplace(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    // Import supabase here to avoid circular dependencies
    const { supabase } = await import("../services/supabase.js");

    // Fetch all user_endpoints mappings (blockchain-backed endpoints)
    const { data: userEndpointMappings, error: mappingsError } = await supabase
      .from("user_endpoints")
      .select(
        "user_id, wallet_address, endpoint_object_id, endpoint_name, endpoint_data, walrus_blob_id, created_at"
      );

    if (mappingsError) {
      throw new Error(
        `Failed to fetch endpoint mappings: ${mappingsError.message}`
      );
    }

    log.info(
      `Fetched ${userEndpointMappings?.length || 0} blockchain endpoints`
    );

    // Convert mappings to endpoint format
    const endpoints =
      userEndpointMappings?.map((mapping: any) => {
        const data = mapping.endpoint_data;
        return {
          id: mapping.endpoint_object_id,
          objectId: mapping.endpoint_object_id,
          user_id: mapping.user_id,
          name: data.name,
          url: data.url,
          method: data.method,
          description: data.description || "",
          parameters: data.parameters || [],
          headers: data.headers || {},
          price_per_call_eth: data.price_per_call_eth || "0",
          developer_wallet_address: mapping.wallet_address,
          created_at: mapping.created_at,
          onChain: true,
        };
      }) || [];

    // Fetch all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name");

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Create a map of user_id to profile
    const profileMap = new Map(
      profiles?.map((profile) => [profile.id, profile]) || []
    );

    // Group endpoints by developer
    const developerMap = new Map<string, any>();

    endpoints?.forEach((endpoint: any) => {
      const userId = endpoint.user_id;
      const profile = profileMap.get(userId);

      if (!developerMap.has(userId)) {
        developerMap.set(userId, {
          id: userId,
          email: profile?.email || "Unknown",
          full_name: profile?.full_name,
          endpoints: [],
          endpoint_count: 0,
        });
      }

      const developer = developerMap.get(userId);
      const isPaid =
        endpoint.price_per_call_eth &&
        parseFloat(endpoint.price_per_call_eth) > 0;

      // Log pricing info for debugging
      if (isPaid) {
        log.info(
          `Found pricing for endpoint ${endpoint.name}: ${endpoint.price_per_call_eth} SUI`
        );
      }

      developer.endpoints.push({
        id: endpoint.id,
        name: endpoint.name,
        description: endpoint.description,
        url: endpoint.url,
        method: endpoint.method,
        user_id: endpoint.user_id,
        created_at: endpoint.created_at,
        updated_at: endpoint.created_at, // Use created_at for updated_at since we don't track updates yet
        is_paid: isPaid,
        price_per_call_eth: endpoint.price_per_call_eth,
        developer_wallet_address: endpoint.developer_wallet_address,
      });
      developer.endpoint_count += 1;
    });

    const developers = Array.from(developerMap.values());

    log.info(`Fetched marketplace with ${developers.length} developers`);

    res.json({
      success: true,
      developers,
      total_developers: developers.length,
      total_endpoints: endpoints?.length || 0,
    });
  } catch (error: any) {
    log.error(`Error fetching marketplace: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error fetching marketplace: ${error.message}`,
    });
  }
}
