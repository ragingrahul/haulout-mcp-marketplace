/**
 * MCP Controller
 * Handles MCP-specific endpoints like connection info
 */

import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/auth.types.js";
import { getEndpointCount } from "../services/endpointRepository.js";
import { LoggerFactory } from "../infrastructure/logging/LoggerFactory.js";

// Get logger for this controller
const log = LoggerFactory.getLogger("MCPController");

/**
 * Get MCP connection details for authenticated developer
 */
export async function getConnectionInfo(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const userEmail = authReq.user?.email;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Get endpoint count for user
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace("Bearer ", "");
    const endpointCount = await getEndpointCount(userId, accessToken);

    // Get base URL from environment or construct from request
    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    // Build connection info
    const connectionInfo = {
      url_by_id: `${baseUrl}/mcp/${userId}`,
      url_by_username: userEmail
        ? `${baseUrl}/mcp/u/${userEmail.split("@")[0]}`
        : undefined,
      format: "streamable-http" as const,
      endpoints_count: endpointCount,
      oauth_required: true,
    };

    log.info(`Provided connection info to user ${userId}`);

    res.json({
      success: true,
      connection: connectionInfo,
      architecture: {
        url_format: "/mcp/{developerId}",
        description:
          "URL contains developer ID whose endpoints you want to use",
        authentication: "OAuth token identifies the end user (you)",
        examples: {
          use_own_endpoints: `${baseUrl}/mcp/${userId}`,
          use_other_developer: `${baseUrl}/mcp/other-developer-id`,
        },
      },
      usage_instructions: {
        step1: "Create OAuth credentials via POST /api/auth/oauth/clients",
        step2:
          "Specify developer_id in request body (optional, defaults to your own ID)",
        step3: "Use returned client_id and client_secret in Claude Desktop",
        step4:
          "Configure Claude Desktop with the MCP URL and OAuth credentials",
        note: "The URL determines which developer's tools you use; OAuth determines who you are",
      },
    });
  } catch (error: any) {
    log.error(`Error getting connection info: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: `Error retrieving connection info: ${error.message}`,
    });
  }
}

/**
 * Health check for MCP endpoint
 */
export async function mcpHealthCheck(
  _req: Request,
  res: Response
): Promise<void> {
  res.json({
    success: true,
    message: "MCP service is running",
    version: "1.0.0",
  });
}
