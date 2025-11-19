/**
 * Walrus Storage Service
 * HTTP API client for Walrus decentralized storage
 * Uses aggregator for reads and publisher for writes
 */

import axios, { AxiosInstance } from "axios";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";
import { ILogger } from "../core/interfaces/ILogger.js";

export interface WalrusBlob {
  blobId: string;
  size: number;
  uploadedAt: string;
}

export interface WalrusStoreResponse {
  newlyCreated?: {
    blobObject: {
      id: string;
      storedEpoch: number;
      blobId: string;
      size: number;
      erasureCodeType: string;
      certifiedEpoch: number;
      storage: {
        id: string;
        startEpoch: number;
        endEpoch: number;
        storageSize: number;
      };
    };
    encodedSize: number;
    cost: number;
  };
  alreadyCertified?: {
    blobId: string;
    event: any;
    endEpoch: number;
  };
}

/**
 * Walrus Storage Service
 * Provides blob storage and retrieval via Walrus HTTP API
 */
export class WalrusService {
  private logger: ILogger;
  private aggregatorUrl: string;
  private publisherUrl: string;
  private epochs: number;
  private httpClient: AxiosInstance;
  private fallbackAggregators: string[];

  constructor() {
    this.logger = LoggerFactory.getLogger("WalrusService");

    // Get configuration from environment
    this.aggregatorUrl =
      process.env.WALRUS_AGGREGATOR_URL ||
      "https://aggregator.walrus-testnet.walrus.space";
    this.publisherUrl =
      process.env.WALRUS_PUBLISHER_URL ||
      "https://publisher.walrus-testnet.walrus.space";
    this.epochs = parseInt(process.env.WALRUS_EPOCHS || "100", 10);

    // List of fallback aggregators from Walrus Testnet
    // See: https://docs.wal.app/usage/web-api.html#testnet-aggregators
    this.fallbackAggregators = [
      "https://aggregator.walrus-testnet.walrus.space",
      "https://walrus-testnet-aggregator.chainbase.online",
      "https://walrus-testnet-aggregator.brightlystake.com",
      "https://walrus-testnet-aggregator.nodes.guru",
      "https://testnet-aggregator.walrus.graphyte.dev",
      "https://walrus-testnet-aggregator.nodeinfra.com",
      "https://walrus-testnet-aggregator.everstake.one",
    ];

    // Create axios instance with default config
    this.httpClient = axios.create({
      timeout: 30000, // 30 seconds
      maxContentLength: 50 * 1024 * 1024, // 50MB
      maxBodyLength: 50 * 1024 * 1024,
    });

    this.logger.info(
      `Initialized WalrusService (Aggregator: ${this.aggregatorUrl}, Publisher: ${this.publisherUrl}, Epochs: ${this.epochs})`
    );
  }

  /**
   * Store a blob in Walrus
   * @param data - Data to store (string or Buffer)
   * @returns Blob ID for retrieval
   */
  async storeBlob(data: string | Buffer): Promise<string> {
    try {
      const buffer = typeof data === "string" ? Buffer.from(data) : data;

      this.logger.info(`Storing blob of size ${buffer.length} bytes to Walrus`);
      this.logger.info(
        `Publisher URL: ${this.publisherUrl}/v1/blobs?epochs=${this.epochs}`
      );

      const response = await this.httpClient.put<WalrusStoreResponse>(
        `${this.publisherUrl}/v1/blobs?epochs=${this.epochs}`,
        buffer,
        {
          headers: {
            "Content-Type": "application/octet-stream",
          },
        }
      );

      let blobId: string;

      if (response.data.newlyCreated) {
        blobId = response.data.newlyCreated.blobObject.blobId;
        this.logger.info(`Successfully stored new blob: ${blobId}`);
      } else if (response.data.alreadyCertified) {
        blobId = response.data.alreadyCertified.blobId;
        this.logger.info(`Blob already exists: ${blobId}`);
      } else {
        throw new Error("Unexpected response format from Walrus publisher");
      }

      return blobId;
    } catch (error: any) {
      // Enhanced error logging
      if (error.response) {
        this.logger.error(
          `Walrus API error: ${error.response.status} ${error.response.statusText}`
        );
        this.logger.error(
          `Response data: ${JSON.stringify(error.response.data)}`
        );
        this.logger.error(
          `Request URL: ${this.publisherUrl}/v1/blobs?epochs=${this.epochs}`
        );

        if (error.response.status === 404) {
          throw new Error(
            `Walrus publisher endpoint not found. The testnet might be down or the URL might have changed. ` +
              `Current URL: ${this.publisherUrl}. Please check https://docs.walrus.site for the latest endpoints.`
          );
        }
      }

      this.logger.error(`Failed to store blob: ${error.message}`, error);
      throw new Error(`Walrus storage failed: ${error.message}`);
    }
  }

  /**
   * Store JSON data in Walrus
   * @param data - JSON-serializable data
   * @returns Blob ID
   */
  async storeJSON<T>(data: T): Promise<string> {
    try {
      const jsonString = JSON.stringify(data);
      this.logger.info(`Storing JSON data (${jsonString.length} chars)`);
      return await this.storeBlob(jsonString);
    } catch (error: any) {
      this.logger.error(`Failed to store JSON: ${error.message}`, error);
      throw new Error(`Failed to store JSON: ${error.message}`);
    }
  }

  /**
   * Retrieve a blob from Walrus with retry logic
   * Tries multiple aggregators with retries for resilience
   * @param blobId - Blob ID to retrieve
   * @param retries - Number of retries per aggregator (default 2)
   * @param delayMs - Initial delay in milliseconds (default 1000)
   * @returns Blob data as Buffer
   */
  async retrieveBlob(
    blobId: string,
    retries: number = 2,
    delayMs: number = 1000
  ): Promise<Buffer> {
    // Try primary aggregator first, then fallbacks
    const aggregatorsToTry = [
      this.aggregatorUrl,
      ...this.fallbackAggregators.filter((a) => a !== this.aggregatorUrl),
    ];

    let lastError: any;

    for (let aggIndex = 0; aggIndex < aggregatorsToTry.length; aggIndex++) {
      const aggregatorUrl = aggregatorsToTry[aggIndex];

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          if (attempt > 0) {
            this.logger.info(
              `Retry ${attempt}/${retries} for blob ${blobId} on aggregator ${aggIndex + 1}/${aggregatorsToTry.length}`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, delayMs * attempt)
            );
          } else if (aggIndex > 0) {
            this.logger.info(
              `Trying aggregator ${aggIndex + 1}/${aggregatorsToTry.length}: ${aggregatorUrl}`
            );
          } else {
            this.logger.info(`Retrieving blob: ${blobId}`);
          }

          const response = await this.httpClient.get<ArrayBuffer>(
            `${aggregatorUrl}/v1/blobs/${blobId}`,
            {
              responseType: "arraybuffer",
              timeout: 10000, // 10 second timeout per attempt
            }
          );

          const buffer = Buffer.from(response.data);
          this.logger.info(
            `Successfully retrieved blob: ${blobId} (${buffer.length} bytes) from aggregator ${aggIndex + 1}`
          );

          return buffer;
        } catch (error: any) {
          lastError = error;

          if (error.response?.status === 404) {
            if (attempt < retries) {
              this.logger.info(
                `Blob not found yet on aggregator ${aggIndex + 1} (attempt ${attempt + 1}/${retries + 1}): ${blobId}`
              );
              continue; // Retry on this aggregator
            } else if (aggIndex < aggregatorsToTry.length - 1) {
              this.logger.info(
                `Blob not found on aggregator ${aggIndex + 1} after ${retries + 1} attempts, trying next aggregator...`
              );
              break; // Try next aggregator
            } else {
              this.logger.error(
                `Blob not found on any aggregator after trying ${aggregatorsToTry.length} aggregators: ${blobId}`
              );
              throw new Error(
                `Blob not found on any aggregator: ${blobId}. The blob may have expired or never been stored.`
              );
            }
          }

          // For other errors, log and retry
          this.logger.info(
            `Failed to retrieve blob from aggregator ${aggIndex + 1} (attempt ${attempt + 1}/${retries + 1}): ${error.message}`
          );

          if (attempt === retries && aggIndex === aggregatorsToTry.length - 1) {
            // Last attempt on last aggregator
            this.logger.error(
              `Failed to retrieve blob after trying all aggregators: ${error.message}`,
              error
            );
            throw new Error(
              `Walrus retrieval failed after trying ${aggregatorsToTry.length} aggregators: ${error.message}`
            );
          }
        }
      }
    }

    throw lastError;
  }

  /**
   * Retrieve JSON data from Walrus
   * @param blobId - Blob ID to retrieve
   * @returns Parsed JSON data
   */
  async retrieveJSON<T>(blobId: string): Promise<T> {
    try {
      const buffer = await this.retrieveBlob(blobId);
      const jsonString = buffer.toString("utf-8");
      const data = JSON.parse(jsonString) as T;

      this.logger.info(`Successfully parsed JSON from blob: ${blobId}`);
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to retrieve JSON: ${error.message}`, error);
      throw new Error(`Failed to retrieve JSON: ${error.message}`);
    }
  }

  /**
   * Verify a blob exists in Walrus
   * @param blobId - Blob ID to verify
   * @returns True if blob exists
   */
  async verifyBlob(blobId: string): Promise<boolean> {
    try {
      await this.httpClient.head(`${this.aggregatorUrl}/v1/blobs/${blobId}`);
      this.logger.info(`Blob verified: ${blobId}`);
      return true;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.info(`Blob not found: ${blobId}`);
        return false;
      }
      this.logger.error(`Failed to verify blob: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Get blob metadata (if available via HEAD request)
   * @param blobId - Blob ID
   * @returns Blob metadata
   */
  async getBlobMetadata(
    blobId: string
  ): Promise<{ size?: number; contentType?: string }> {
    try {
      const response = await this.httpClient.head(
        `${this.aggregatorUrl}/v1/blobs/${blobId}`
      );

      return {
        size: response.headers["content-length"]
          ? parseInt(response.headers["content-length"], 10)
          : undefined,
        contentType: response.headers["content-type"],
      };
    } catch (error: any) {
      this.logger.error(`Failed to get blob metadata: ${error.message}`, error);
      throw new Error(`Failed to get blob metadata: ${error.message}`);
    }
  }

  /**
   * Get Walrus aggregator URL for direct access
   * Useful for frontend to fetch blobs directly
   */
  getBlobUrl(blobId: string): string {
    return `${this.aggregatorUrl}/v1/blobs/${blobId}`;
  }

  /**
   * Get configuration info
   */
  getConfig() {
    return {
      aggregatorUrl: this.aggregatorUrl,
      publisherUrl: this.publisherUrl,
      epochs: this.epochs,
    };
  }
}
