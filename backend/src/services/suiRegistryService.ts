/**
 * Sui Registry Service
 * Wrapper for Sui smart contract interactions
 * Handles endpoint registry and payment operations on-chain
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";
import { ILogger } from "../core/interfaces/ILogger.js";

export interface SuiEndpoint {
  objectId: string;
  owner: string;
  walrusBlobId: string;
  pricePerCall: string; // MIST as string
  totalCalls: number;
  active: boolean;
  createdAt: number;
}

export interface SuiPaymentRecord {
  objectId: string;
  payer: string;
  endpointId: string;
  endpointOwner: string;
  amount: string;
  timestamp: number;
}

export interface SuiUserBalance {
  objectId: string;
  owner: string;
  totalDeposited: string;
  totalSpent: string;
  createdAt: number;
}

/**
 * Sui Registry Service
 * Manages interactions with deployed Move smart contracts
 */
export class SuiRegistryService {
  private logger: ILogger;
  private client: SuiClient;
  private network: "mainnet" | "testnet" | "devnet" | "localnet";
  private packageId: string;
  private serverKeypair: Ed25519Keypair | null = null;
  private clockObjectId: string = "0x6"; // Sui Clock object ID

  constructor() {
    this.logger = LoggerFactory.getLogger("SuiRegistryService");

    // Network configuration
    const networkEnv = process.env.SUI_NETWORK || "testnet";
    this.network = networkEnv as "mainnet" | "testnet" | "devnet" | "localnet";

    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(this.network);
    this.client = new SuiClient({ url: rpcUrl });

    // Package ID from environment
    this.packageId = process.env.SUI_PACKAGE_ID || "";
    if (!this.packageId) {
      this.logger.warning(
        "SUI_PACKAGE_ID not set. Smart contract calls will fail."
      );
    }

    // Server keypair for gas payment
    const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;
    if (serverPrivateKey) {
      try {
        this.serverKeypair = this.createKeypair(serverPrivateKey);
        this.logger.info(
          `Server keypair loaded: ${this.serverKeypair.getPublicKey().toSuiAddress()}`
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to load server keypair: ${error.message}`,
          error
        );
      }
    } else {
      this.logger.warning(
        "SERVER_PRIVATE_KEY not set. Server will not be able to pay gas."
      );
    }

    this.logger.info(
      `Initialized SuiRegistryService on ${this.network} (Package: ${this.packageId})`
    );
  }

  /**
   * Build transaction for creating an endpoint (for user to sign)
   * Returns serialized transaction that user can sign with their wallet
   */
  async buildCreateEndpointTransaction(
    walrusBlobId: string,
    senderAddress: string,
    pricePerCall: string = "0"
  ): Promise<string> {
    try {
      this.logger.info(
        `Building create endpoint transaction: blob=${walrusBlobId}, sender=${senderAddress}, price=${pricePerCall}`
      );

      const tx = new Transaction();

      // Set the sender (the user's wallet address)
      tx.setSender(senderAddress);

      // Convert walrus blob ID string to vector<u8>
      const blobIdBytes = Array.from(Buffer.from(walrusBlobId, "utf-8"));

      tx.moveCall({
        target: `${this.packageId}::endpoint_registry::create_endpoint`,
        arguments: [
          tx.pure.vector("u8", blobIdBytes),
          tx.pure.u64(pricePerCall),
          tx.object(this.clockObjectId),
        ],
      });

      // Serialize transaction for frontend to sign
      const txBytes = await tx.build({ client: this.client });
      const serializedTx = Buffer.from(txBytes).toString("base64");

      this.logger.info(
        `Built transaction for endpoint creation (${serializedTx.length} bytes)`
      );

      return serializedTx;
    } catch (error: any) {
      this.logger.error(
        `Failed to build create endpoint transaction: ${error.message}`,
        error
      );
      throw new Error(
        `Failed to build create endpoint transaction: ${error.message}`
      );
    }
  }

  /**
   * Create a new endpoint on-chain (SERVER SIGNS - DEPRECATED)
   * Use buildCreateEndpointTransaction() instead for user-signed transactions
   */
  async createEndpoint(
    walrusBlobId: string,
    pricePerCall: string = "0"
  ): Promise<string> {
    try {
      if (!this.serverKeypair) {
        throw new Error("Server keypair not configured");
      }

      this.logger.info(
        `Creating endpoint: blob=${walrusBlobId}, price=${pricePerCall}`
      );

      const tx = new Transaction();

      // Convert walrus blob ID string to vector<u8>
      const blobIdBytes = Array.from(Buffer.from(walrusBlobId, "utf-8"));

      tx.moveCall({
        target: `${this.packageId}::endpoint_registry::create_endpoint`,
        arguments: [
          tx.pure.vector("u8", blobIdBytes),
          tx.pure.u64(pricePerCall),
          tx.object(this.clockObjectId),
        ],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: this.serverKeypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });

      if (result.effects?.status?.status !== "success") {
        throw new Error(
          `Transaction failed: ${result.effects?.status?.error || "Unknown error"}`
        );
      }

      // Extract created endpoint object ID
      const createdObject = result.objectChanges?.find(
        (change) =>
          change.type === "created" &&
          change.objectType.includes("endpoint_registry::Endpoint")
      );

      if (!createdObject || createdObject.type !== "created") {
        throw new Error("Failed to find created endpoint object");
      }

      const endpointId = createdObject.objectId;
      this.logger.info(`Successfully created endpoint: ${endpointId}`);

      return endpointId;
    } catch (error: any) {
      this.logger.error(`Failed to create endpoint: ${error.message}`, error);
      throw new Error(`Failed to create endpoint: ${error.message}`);
    }
  }

  /**
   * Extract endpoint object ID from transaction digest
   * Used after user signs and executes transaction
   */
  async getEndpointIdFromTransaction(txDigest: string): Promise<string> {
    try {
      this.logger.info(`Getting endpoint ID from transaction: ${txDigest}`);

      const txDetails = await this.client.getTransactionBlock({
        digest: txDigest,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (txDetails.effects?.status?.status !== "success") {
        throw new Error(
          `Transaction failed: ${txDetails.effects?.status?.error || "Unknown error"}`
        );
      }

      // Extract created endpoint object ID
      const createdObject = txDetails.objectChanges?.find(
        (change) =>
          change.type === "created" &&
          change.objectType.includes("endpoint_registry::Endpoint")
      );

      if (!createdObject || createdObject.type !== "created") {
        throw new Error("Failed to find created endpoint object");
      }

      const endpointId = createdObject.objectId;
      this.logger.info(`Found endpoint ID: ${endpointId}`);

      return endpointId;
    } catch (error: any) {
      this.logger.error(
        `Failed to get endpoint ID from transaction: ${error.message}`,
        error
      );
      throw new Error(
        `Failed to get endpoint ID from transaction: ${error.message}`
      );
    }
  }

  /**
   * Get endpoint details from chain
   */
  async getEndpoint(endpointId: string): Promise<SuiEndpoint> {
    try {
      const obj = await this.client.getObject({
        id: endpointId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        throw new Error("Invalid endpoint object");
      }

      const fields = obj.data.content.fields as any;

      return {
        objectId: endpointId,
        owner: fields.owner,
        walrusBlobId: Buffer.from(fields.walrus_blob_id).toString("utf-8"),
        pricePerCall: fields.price_per_call,
        totalCalls: parseInt(fields.total_calls, 10),
        active: fields.active,
        createdAt: parseInt(fields.created_at, 10),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get endpoint ${endpointId}: ${error.message}`,
        error
      );
      throw new Error(`Failed to get endpoint: ${error.message}`);
    }
  }

  /**
   * Query all endpoints by owner address
   * Note: Endpoints are shared objects, so we query by the owner field in the object data
   */
  async getEndpointsByOwner(ownerAddress: string): Promise<SuiEndpoint[]> {
    try {
      this.logger.info(`Querying endpoints for owner: ${ownerAddress}`);

      // Query using queryEvents to find EndpointCreated events for this owner
      // This is more efficient than scanning all objects
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${this.packageId}::endpoint_registry::EndpointCreated`,
        },
        limit: 1000, // Adjust as needed
      });

      this.logger.info(`Found ${events.data.length} EndpointCreated events`);

      // DEBUG: Log all event owners
      if (events.data.length > 0) {
        this.logger.info(
          `Sample event: ${JSON.stringify(events.data[0].parsedJson)}`
        );
        for (const event of events.data.slice(0, 5)) {
          const parsed = event.parsedJson as any;
          this.logger.info(`Event owner: ${parsed?.owner}`);
        }
      }

      // Filter events by owner and collect endpoint IDs
      const endpointIds: string[] = [];
      for (const event of events.data) {
        const parsedJson = event.parsedJson as any;
        this.logger.info(
          `Checking event - owner: ${parsedJson?.owner}, target: ${ownerAddress}`
        );

        if (parsedJson && parsedJson.owner === ownerAddress) {
          // Use endpoint_id (address) to query the object
          const endpointAddress = parsedJson.endpoint_id;
          this.logger.info(
            `✓ MATCH! Found endpoint for user: ${endpointAddress}`
          );
          endpointIds.push(endpointAddress);
        }
      }

      this.logger.info(
        `Found ${endpointIds.length} endpoints for ${ownerAddress} in events`
      );

      // Fetch full endpoint data for each ID
      const endpoints: SuiEndpoint[] = [];
      for (const endpointId of endpointIds) {
        try {
          const endpoint = await this.getEndpoint(endpointId);
          endpoints.push(endpoint);
        } catch (error: any) {
          this.logger.error(
            `Failed to fetch endpoint ${endpointId}: ${error.message}`
          );
          // Continue with other endpoints
        }
      }

      this.logger.info(
        `Successfully fetched ${endpoints.length} endpoints for ${ownerAddress}`
      );
      return endpoints;
    } catch (error: any) {
      this.logger.error(`Failed to query endpoints: ${error.message}`, error);
      throw new Error(`Failed to query endpoints: ${error.message}`);
    }
  }

  /**
   * Update endpoint pricing
   */
  async updatePricing(
    endpointId: string,
    newPrice: string,
    ownerKeypair: Ed25519Keypair
  ): Promise<string> {
    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${this.packageId}::endpoint_registry::update_pricing`,
        arguments: [
          tx.object(endpointId),
          tx.pure.u64(newPrice),
          tx.object(this.clockObjectId),
        ],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: ownerKeypair,
        transaction: tx,
      });

      this.logger.info(`Updated pricing for endpoint ${endpointId}`);
      return result.digest;
    } catch (error: any) {
      this.logger.error(`Failed to update pricing: ${error.message}`, error);
      throw new Error(`Failed to update pricing: ${error.message}`);
    }
  }

  /**
   * Update Walrus blob ID (for endpoint updates)
   */
  async updateWalrusBlob(
    endpointId: string,
    newBlobId: string,
    ownerKeypair: Ed25519Keypair
  ): Promise<string> {
    try {
      const tx = new Transaction();
      const blobIdBytes = Array.from(Buffer.from(newBlobId, "utf-8"));

      tx.moveCall({
        target: `${this.packageId}::endpoint_registry::update_walrus_blob`,
        arguments: [
          tx.object(endpointId),
          tx.pure.vector("u8", blobIdBytes),
          tx.object(this.clockObjectId),
        ],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: ownerKeypair,
        transaction: tx,
      });

      this.logger.info(`Updated Walrus blob for endpoint ${endpointId}`);
      return result.digest;
    } catch (error: any) {
      this.logger.error(
        `Failed to update Walrus blob: ${error.message}`,
        error
      );
      throw new Error(`Failed to update Walrus blob: ${error.message}`);
    }
  }

  /**
   * Deactivate an endpoint (soft delete)
   */
  async deactivateEndpoint(
    endpointId: string,
    ownerKeypair: Ed25519Keypair
  ): Promise<string> {
    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${this.packageId}::endpoint_registry::deactivate_endpoint`,
        arguments: [tx.object(endpointId), tx.object(this.clockObjectId)],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: ownerKeypair,
        transaction: tx,
      });

      this.logger.info(`Deactivated endpoint ${endpointId}`);
      return result.digest;
    } catch (error: any) {
      this.logger.error(
        `Failed to deactivate endpoint: ${error.message}`,
        error
      );
      throw new Error(`Failed to deactivate endpoint: ${error.message}`);
    }
  }

  /**
   * Process payment for an API call
   */
  async processPayment(
    endpointId: string,
    amount: string,
    payerKeypair: Ed25519Keypair
  ): Promise<string> {
    try {
      const tx = new Transaction();

      // Split coins for payment
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

      tx.moveCall({
        target: `${this.packageId}::payment_system::process_payment`,
        arguments: [tx.object(endpointId), coin, tx.object(this.clockObjectId)],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: payerKeypair,
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects?.status?.status !== "success") {
        throw new Error(
          `Payment failed: ${result.effects?.status?.error || "Unknown error"}`
        );
      }

      this.logger.info(`Payment processed for endpoint ${endpointId}`);
      return result.digest;
    } catch (error: any) {
      this.logger.error(`Failed to process payment: ${error.message}`, error);
      throw new Error(`Failed to process payment: ${error.message}`);
    }
  }

  /**
   * Create user balance tracker
   */
  async createBalance(userKeypair: Ed25519Keypair): Promise<string> {
    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${this.packageId}::payment_system::create_balance`,
        arguments: [tx.object(this.clockObjectId)],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: userKeypair,
        transaction: tx,
        options: {
          showObjectChanges: true,
        },
      });

      const createdObject = result.objectChanges?.find(
        (change) =>
          change.type === "created" &&
          change.objectType.includes("payment_system::UserBalance")
      );

      if (!createdObject || createdObject.type !== "created") {
        throw new Error("Failed to find created balance object");
      }

      this.logger.info(`Created balance tracker: ${createdObject.objectId}`);
      return createdObject.objectId;
    } catch (error: any) {
      this.logger.error(`Failed to create balance: ${error.message}`, error);
      throw new Error(`Failed to create balance: ${error.message}`);
    }
  }

  /**
   * Get native SUI balance for an address
   */
  async getSuiBalance(address: string): Promise<string> {
    try {
      const balance = await this.client.getBalance({ owner: address });
      return balance.totalBalance;
    } catch (error: any) {
      this.logger.error(`Failed to get SUI balance: ${error.message}`, error);
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Helper: Create keypair from private key
   * Supports both hex format (0x...) and Sui bech32 format (suiprivkey1...)
   */
  private createKeypair(privateKey: string): Ed25519Keypair {
    try {
      // If it's a Sui bech32 format (suiprivkey1...)
      if (privateKey.startsWith("suiprivkey")) {
        this.logger.info("Loading Sui bech32 format private key");
        return Ed25519Keypair.fromSecretKey(privateKey);
      }

      // If it's a hex format (0x... or plain hex)
      const cleanKey = privateKey.startsWith("0x")
        ? privateKey.slice(2)
        : privateKey;
      const keyBytes = Buffer.from(cleanKey, "hex");
      return Ed25519Keypair.fromSecretKey(keyBytes);
    } catch (error: any) {
      this.logger.error(`Failed to parse private key: ${error.message}`);
      throw new Error(`Invalid private key format: ${error.message}`);
    }
  }

  /**
   * Get service configuration
   */
  getConfig() {
    return {
      network: this.network,
      packageId: this.packageId,
      serverAddress: this.serverKeypair?.getPublicKey().toSuiAddress() || null,
    };
  }

  /**
   * Get Sui client instance
   */
  getClient(): SuiClient {
    return this.client;
  }

  /**
   * Get server keypair for signing transactions
   */
  getServerKeypair(): Ed25519Keypair {
    if (!this.serverKeypair) {
      throw new Error("Server keypair not initialized");
    }
    return this.serverKeypair;
  }

  /**
   * Get package ID
   */
  getPackageId(): string {
    return this.packageId;
  }
}
