/**
 * Endpoint management for dynamic API endpoints.
 * This module provides the EndpointManager class which handles adding, removing,
 * and calling dynamic API endpoints, converting them to MCP tools.
 */

import { APIEndpoint, HTTPMethod, ApiResponse } from "../types/api.types.js";
import { MCPTool } from "../types/mcp.types.js";
import { IHttpClient } from "../core/interfaces/IHttpClient.js";
import { ILogger } from "../core/interfaces/ILogger.js";
import { AxiosHttpClient } from "../infrastructure/http/AxiosHttpClient.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";
import { PAYMENT_TOOLS } from "./PaymentTools.js";

export class EndpointManager {
  private endpoints: Map<string, APIEndpoint>;
  private tools: Map<string, MCPTool>;
  private httpClient: IHttpClient;
  private logger: ILogger;

  constructor(httpClient?: IHttpClient, logger?: ILogger) {
    this.endpoints = new Map();
    this.tools = new Map();
    this.httpClient = httpClient || new AxiosHttpClient();
    this.logger = logger || LoggerFactory.getLogger("EndpointManager");

    // Register payment tools
    this.registerPaymentTools();

    this.logger.info("Initialized endpoint manager with payment tools");
  }

  /**
   * Register payment tools that are available for all MCP servers
   */
  private registerPaymentTools(): void {
    for (const [toolName, tool] of Object.entries(PAYMENT_TOOLS)) {
      this.tools.set(toolName, tool);
      this.logger.info(`Registered payment tool: ${toolName}`);
    }
  }

  /**
   * Add a new API endpoint and create a corresponding MCP tool
   *
   * @param endpoint - APIEndpoint configuration to add
   * @throws Error if endpoint name already exists
   */
  addEndpoint(endpoint: APIEndpoint): void {
    if (this.endpoints.has(endpoint.name)) {
      throw new Error(`Endpoint '${endpoint.name}' already exists`);
    }

    this.endpoints.set(endpoint.name, endpoint);

    // Create MCP tool definition
    const tool = this.createEndpointTool(endpoint);
    this.tools.set(endpoint.name, tool);

    this.logger.info(
      `Added endpoint '${endpoint.name}' as MCP tool (${endpoint.method} ${endpoint.url})`
    );
  }

  /**
   * Create MCP tool definition from endpoint configuration
   * This replaces the create_endpoint_function from Python
   */
  private createEndpointTool(endpoint: APIEndpoint): MCPTool {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of endpoint.parameters) {
      // Map parameter type to JSON Schema type
      let jsonSchemaType: string;
      if (param.type === "string") {
        jsonSchemaType = "string";
      } else if (param.type === "number") {
        jsonSchemaType = "number";
      } else if (param.type === "boolean") {
        jsonSchemaType = "boolean";
      } else if (param.type === "object") {
        jsonSchemaType = "object";
      } else if (param.type === "array") {
        jsonSchemaType = "array";
      } else {
        jsonSchemaType = "string"; // default
      }

      properties[param.name] = {
        type: jsonSchemaType,
        description: param.description,
      };

      if (param.default !== undefined) {
        properties[param.name].default = param.default;
      }

      if (param.required !== false) {
        required.push(param.name);
      }
    }

    // Add _payment_id as an optional parameter for paid tools
    // This allows Claude to include it after payment approval
    properties["_payment_id"] = {
      type: "string",
      description:
        "Payment ID from approve_payment tool. Include this after approving payment to use your paid transaction. Without this, you'll be charged again!",
    };

    return {
      name: endpoint.name,
      description: endpoint.description,
      inputSchema: {
        type: "object",
        properties,
        required,
      },
    };
  }

  /**
   * Check if payment is required and verify payment status
   * Returns ApiResponse with 402 if payment required but not satisfied
   * Returns null if payment is not required or already satisfied
   *
   * @param endpoint - The endpoint object being called
   * @param endUserId - ID of end user who pays for the tool
   * @param developerId - ID of developer who receives the payment
   * @param args - Tool arguments
   */
  private async checkPaymentRequired(
    endpoint: APIEndpoint,
    endUserId: string,
    developerId: string,
    args: Record<string, any>
  ): Promise<ApiResponse | null> {
    try {
      const endpointId = endpoint.id || endpoint.name;

      // Check if endpoint requires payment (blockchain endpoints have price_per_call_eth field)
      const pricePerCall = endpoint.price_per_call_eth || "0";
      const price = parseFloat(pricePerCall);

      if (price <= 0) {
        // No payment required - free endpoint
        this.logger.info(
          `Endpoint ${endpoint.name} is free (price: ${pricePerCall})`
        );
        return null;
      }

      // Payment required - dynamic imports for payment services
      const { getPaymentByPaymentId, createPaymentTransaction } = await import(
        "../services/paymentRepository.js"
      );

      // Platform wallet address (can be moved to environment variable later)
      const PLATFORM_WALLET_ADDRESS =
        process.env.PLATFORM_WALLET_ADDRESS ||
        "0x0000000000000000000000000000000000000000";

      // Get developer wallet address from endpoint
      const developerWallet = endpoint.developer_wallet_address || developerId;

      // Check if payment_id is provided in args
      const paymentId = args._payment_id;

      if (paymentId) {
        this.logger.info(`Payment ID provided: ${paymentId}, verifying...`);
        // Verify the payment
        const payment = await getPaymentByPaymentId(paymentId);

        if (!payment) {
          return {
            success: false,
            status_code: 402,
            message: "Invalid payment_id provided",
          };
        }

        if (payment.user_id !== endUserId) {
          return {
            success: false,
            status_code: 402,
            message: "Unauthorized: payment_id belongs to another user",
          };
        }

        if (payment.endpoint_id !== endpointId) {
          return {
            success: false,
            status_code: 402,
            message: "payment_id is for a different endpoint",
          };
        }

        // Check if payment is completed
        if (payment.status === "completed") {
          // Payment verified and completed - allow tool execution
          this.logger.info(
            `✓ Payment ${paymentId} verified as completed, proceeding with tool execution`
          );
          // Remove _payment_id from args so it doesn't get passed to API
          delete args._payment_id;
          return null; // Payment satisfied - tool will execute
        }

        // Payment exists but not completed yet
        this.logger.warning(
          `Payment ${paymentId} status: ${payment.status} (not completed)`
        );
        return {
          success: false,
          status_code: 402,
          message: `Payment ${paymentId} status is ${payment.status}, not completed`,
          payment_details: {
            payment_id: paymentId,
            status: payment.status,
            message:
              payment.status === "pending"
                ? "Call approve_payment tool to complete this payment"
                : `Payment status: ${payment.status}. Cannot proceed.`,
          },
        };
      }

      // No payment_id provided - check user's on-chain balance and execute payment automatically
      // CUSTODIAL: User has deposited funds, platform deducts automatically

      // Import balance service
      const { getUserOnChainBalance, executeAutomaticPayment } = await import(
        "../services/balanceService.js"
      );

      // Check user's on-chain balance
      const userBalance = await getUserOnChainBalance(endUserId);

      if (!userBalance || !userBalance.has_balance_account) {
        this.logger.info(
          `User ${endUserId} has no balance account - prompting deposit`
        );

        return {
          success: false,
          status_code: 402,
          message: `DEPOSIT REQUIRED - You need to deposit SUI into your balance account to use paid tools.`,
          payment_details: {
            action_required: "deposit",
            reason: "No balance account found",
            amount_needed: pricePerCall,
            instructions: {
              step_1: "Go to the Wallet page",
              step_2: "Click 'Deposit Funds'",
              step_3: `Deposit at least ${pricePerCall} SUI`,
              step_4: "Return and call this tool again",
            },
          },
        };
      }

      const currentBalance = parseFloat(userBalance.balance || "0");
      const requiredAmount = parseFloat(pricePerCall);

      if (currentBalance < requiredAmount) {
        this.logger.info(
          `User ${endUserId} has insufficient balance: ${currentBalance} < ${requiredAmount}`
        );

        return {
          success: false,
          status_code: 402,
          message: `INSUFFICIENT BALANCE - You have ${currentBalance.toFixed(4)} SUI, but need ${requiredAmount} SUI.`,
          payment_details: {
            action_required: "deposit",
            current_balance: currentBalance.toFixed(4),
            required: requiredAmount,
            shortfall: (requiredAmount - currentBalance).toFixed(4),
            instructions: {
              step_1: "Go to the Wallet page",
              step_2: "Click 'Deposit Funds'",
              step_3: `Deposit at least ${(requiredAmount - currentBalance).toFixed(4)} SUI more`,
              step_4: "Return and call this tool again",
            },
          },
        };
      }

      // USER HAS SUFFICIENT BALANCE - Execute payment automatically!
      this.logger.info(
        `User has sufficient balance (${currentBalance} SUI >= ${requiredAmount} SUI), executing automatic payment...`
      );

      try {
        const txHash = await executeAutomaticPayment(
          userBalance.balance_object_id!,
          endpointId,
          pricePerCall,
          developerWallet
        );

        this.logger.info(
          `✅ Payment of ${pricePerCall} SUI executed successfully! TX: ${txHash}`
        );

        // Create payment record for tracking
        const payment = await createPaymentTransaction(
          endUserId,
          endpointId,
          PLATFORM_WALLET_ADDRESS,
          developerWallet,
          pricePerCall
        );

        // Mark as completed immediately
        const { updatePaymentStatus } = await import(
          "../services/paymentRepository.js"
        );
        const { PaymentStatus } = await import("../types/payment.types.js");
        await updatePaymentStatus(
          payment.payment_id,
          PaymentStatus.COMPLETED,
          txHash
        );

        this.logger.info(
          `Payment record created and marked completed: ${payment.payment_id}`
        );

        // Payment completed successfully - allow tool execution
        return null; // null means payment satisfied, proceed with tool execution
      } catch (paymentError: any) {
        this.logger.error(
          `Automatic payment execution failed: ${paymentError.message}`,
          paymentError
        );

        return {
          success: false,
          status_code: 500,
          message: `Payment execution failed: ${paymentError.message}`,
          payment_details: {
            error: paymentError.message,
            balance_object_id: userBalance.balance_object_id,
            endpoint_id: endpointId,
            amount: pricePerCall,
          },
        };
      }
    } catch (error: any) {
      this.logger.error(`Payment check error: ${error.message}`, error);
      return {
        success: false,
        status_code: 500,
        message: `Payment verification error: ${error.message}`,
      };
    }
  }

  /**
   * Call the actual API endpoint with the provided arguments
   * This is the equivalent of _call_api_endpoint from Python
   *
   * @param endpointName - Name of the endpoint to call
   * @param args - Arguments to pass to the API endpoint
   * @param endUserId - Optional end user ID (who pays for the tool)
   * @param developerId - Optional developer ID (who receives the payment)
   * @returns Dict containing success status, data, and message
   */
  async callApiEndpoint(
    endpointName: string,
    args: Record<string, any>,
    endUserId?: string,
    developerId?: string
  ): Promise<ApiResponse> {
    // Check if this is a payment tool (not an endpoint)
    if (PAYMENT_TOOLS[endpointName]) {
      this.logger.info(`Executing payment tool: ${endpointName}`);
      if (!endUserId) {
        return {
          success: false,
          message: "User authentication required for payment tools",
        };
      }

      const { executePaymentTool } = await import("./PaymentTools.js");
      return await executePaymentTool(endpointName, endUserId, args);
    }

    if (!this.endpoints.has(endpointName)) {
      this.logger.error(`Endpoint '${endpointName}' not found`);
      return {
        success: false,
        message: `Endpoint '${endpointName}' not found`,
      };
    }

    const endpoint = this.endpoints.get(endpointName)!;
    this.logger.info(`Calling ${endpoint.method} ${endpoint.url}`, { args });

    // DEBUG: Log all received parameters including _payment_id
    this.logger.info(
      `[DEBUG] Tool parameters received: ${JSON.stringify(args)}`
    );
    if (args._payment_id) {
      this.logger.info(`[DEBUG] ✓ _payment_id present: ${args._payment_id}`);
    } else {
      this.logger.warning(`[DEBUG] ⚠️ _payment_id NOT present in parameters!`);
    }

    try {
      // Check if payment is required for this endpoint
      if (endpoint.id && endUserId && developerId) {
        const paymentCheckResult = await this.checkPaymentRequired(
          endpoint, // Pass the whole endpoint object
          endUserId, // End user who pays
          developerId, // Developer who receives
          args
        );

        if (paymentCheckResult) {
          // Payment required but not satisfied - return 402
          return paymentCheckResult;
        }
        // Payment verified or not required - continue with API call
      }

      // Validate required parameters
      for (const param of endpoint.parameters) {
        if (param.required !== false && !(param.name in args)) {
          return {
            success: false,
            message: `Missing required parameter: ${param.name}`,
          };
        }
      }

      // Replace path parameters in URL
      let url = endpoint.url;
      for (const [paramName, paramValue] of Object.entries(args)) {
        url = url.replace(`{${paramName}}`, String(paramValue));
      }

      const headers = endpoint.headers ? { ...endpoint.headers } : {};
      const timeout = (endpoint.timeout || 30) * 1000; // Convert to milliseconds

      // Filter out path parameters from request args
      const requestArgs = { ...args };
      if (
        endpoint.method === HTTPMethod.GET ||
        endpoint.method === HTTPMethod.DELETE
      ) {
        for (const paramName of Object.keys(args)) {
          if (endpoint.url.includes(`{${paramName}}`)) {
            delete requestArgs[paramName];
          }
        }
      }

      // Make HTTP request using IHttpClient
      let response;

      if (endpoint.method === HTTPMethod.GET) {
        response = await this.httpClient.get(url, {
          params: requestArgs,
          headers,
          timeout,
        });
      } else if (endpoint.method === HTTPMethod.POST) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        response = await this.httpClient.post(url, args, {
          headers,
          timeout,
        });
      } else if (endpoint.method === HTTPMethod.PUT) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        response = await this.httpClient.put(url, args, {
          headers,
          timeout,
        });
      } else if (endpoint.method === HTTPMethod.PATCH) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        response = await this.httpClient.patch(url, args, {
          headers,
          timeout,
        });
      } else if (endpoint.method === HTTPMethod.DELETE) {
        response = await this.httpClient.delete(url, {
          params: requestArgs,
          headers,
          timeout,
        });
      } else {
        return {
          success: false,
          message: `Unsupported HTTP method: ${endpoint.method}`,
        };
      }

      return await this.processResponse(response, endpointName);
    } catch (error: any) {
      if (error.code === "ECONNABORTED") {
        const errorMsg = `Request to ${endpoint.url} timed out after ${endpoint.timeout || 30} seconds`;
        this.logger.error(errorMsg, error);
        return {
          success: false,
          message: errorMsg,
        };
      }

      this.logger.error(
        `Error calling endpoint '${endpointName}': ${error.message}`,
        error
      );
      return {
        success: false,
        message: `Error calling API: ${error.message}`,
      };
    }
  }

  /**
   * Process the HTTP response and return a standardized result
   * This is the equivalent of _process_response from Python
   *
   * @param response - HTTP response object
   * @param endpointName - Name of the endpoint that was called
   * @returns Dict containing success status, data, and message
   */
  private async processResponse(
    response: {
      data: any;
      status: number;
      statusText: string;
      headers: Record<string, string>;
    },
    endpointName: string
  ): Promise<ApiResponse> {
    try {
      const data = response.data;
      const statusCode = response.status;

      if (statusCode >= 200 && statusCode < 300) {
        this.logger.info(
          `API call successful: ${endpointName} returned ${statusCode}`
        );
        return {
          success: true,
          status_code: statusCode,
          data: data,
          message: `Successfully called ${endpointName}`,
        };
      } else {
        this.logger.warning(
          `API call failed: ${endpointName} returned ${statusCode}`
        );
        return {
          success: false,
          status_code: statusCode,
          data: data,
          message: `API call failed with status ${statusCode}`,
        };
      }
    } catch (error: any) {
      this.logger.error(
        `Error processing response from ${endpointName}: ${error.message}`,
        error
      );
      return {
        success: false,
        status_code: response.status,
        message: `Error processing response: ${error.message}`,
      };
    }
  }

  /**
   * Remove an endpoint and its corresponding tool
   *
   * @param endpointName - Name of the endpoint to remove
   * @returns true if endpoint was removed, false if it didn't exist
   */
  removeEndpoint(endpointName: string): boolean {
    const hadEndpoint = this.endpoints.delete(endpointName);
    const hadTool = this.tools.delete(endpointName);
    const removed = hadEndpoint || hadTool;

    if (removed) {
      this.logger.info(`Removed endpoint '${endpointName}'`);
    } else {
      this.logger.warning(`Endpoint '${endpointName}' not found for removal`);
    }

    return removed;
  }

  /**
   * Get all registered tools
   *
   * @returns Map of tool name to MCP tool definition
   */
  getTools(): Map<string, MCPTool> {
    return this.tools;
  }

  /**
   * List all configured endpoints
   *
   * @returns Array of endpoint configurations
   */
  listEndpoints(): any[] {
    const result: any[] = [];

    for (const endpoint of this.endpoints.values()) {
      result.push({
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        description: endpoint.description,
        parameters: endpoint.parameters,
        headers: endpoint.headers,
        timeout: endpoint.timeout,
      });
    }

    return result;
  }
}
