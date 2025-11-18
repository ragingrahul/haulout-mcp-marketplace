/**
 * Dynamic MCP HTTP Server
 *
 * This server provides:
 * - Per-user MCP servers via Streamable HTTP at /mcp/{userId}
 * - REST API for managing dynamic endpoints
 * - Authentication system
 * - Health check endpoint
 */

import express from "express";
import { MCPServerRegistry } from "./mcp/MCPServerRegistry.js";
import { createEndpointRoutes } from "./routes/endpointRoutes.js";
import { createHealthRoutes } from "./routes/healthRoutes.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createMCPRoutes, closeAllTransports } from "./routes/mcpRoutes.js";
import { createWalletRoutes } from "./routes/walletRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

import { getAllUsersWithEndpoints } from "./services/endpointRepository.js";

// Configure logging
const log = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warning: (message: string) => console.warn(`[WARNING] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

/**
 * Main function to start the MCP marketplace server
 */
async function main(): Promise<void> {
  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";

  log.info("[Server] Initializing MCP Marketplace Server...");

  // Initialize the MCP server registry
  const registry = new MCPServerRegistry();

  // Load all users with endpoints and initialize their servers
  try {
    const userIds = await getAllUsersWithEndpoints();
    log.info(`[Server] Found ${userIds.length} users with endpoints`);

    if (userIds.length > 0) {
      await registry.initializeAllServers(userIds);
    }
  } catch (error: any) {
    log.warning(
      `[Server] Could not load endpoints from database: ${error.message}`
    );
    log.warning("[Server] Starting with empty registry");
  }

  // Create Express app
  const app = express();

  // DEBUG: Comprehensive request logger
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const requestId = Math.random().toString(36).substring(7);

    // Log all requests
    if (!req.path.includes("/health")) {
      console.log(`\n[${timestamp}] [${requestId}] ${req.method} ${req.path}`);
      console.log(
        "Query:",
        Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : "(none)"
      );
      console.log("Headers:", {
        "user-agent": req.headers["user-agent"],
        authorization: req.headers.authorization ? "Present" : "Missing",
        origin: req.headers["origin"],
        "content-type": req.headers["content-type"],
      });
    }

    // Capture response
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function (data) {
      if (!req.path.includes("/health")) {
        console.log(`[${requestId}] Response: ${res.statusCode}`);
        if (res.statusCode >= 400) {
          console.log("Response Headers:", res.getHeaders());
        }
      }
      return originalSend.call(this, data);
    };

    res.json = function (data) {
      if (!req.path.includes("/health")) {
        console.log(`[${requestId}] Response: ${res.statusCode} (JSON)`);
        if (res.statusCode >= 400) {
          console.log("Error Response:", JSON.stringify(data, null, 2));
        }
      }
      return originalJson.call(this, data);
    };

    next();
  });

  // Conditional JSON parsing - SKIP for MCP endpoints
  app.use((req, res, next) => {
    // Don't parse JSON for root MCP endpoint or /mcp/* paths
    // Let StreamableHTTPServerTransport handle raw streams
    if (
      req.path === "/" ||
      req.path.startsWith("/mcp/") ||
      req.path.startsWith("/mcp")
    ) {
      next();
    } else {
      express.json()(req, res, next);
    }
  });

  // Parse URL-encoded bodies (for OAuth token requests - required by OAuth 2.1 spec)
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware (optional - enable if needed for frontend)
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, mcp-protocol-version"
    );

    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }

    next();
  });

  // Setup routes
  // Authentication routes (public)
  app.use("/api/auth", createAuthRoutes());

  // Endpoint management routes (protected with authentication)
  app.use("/api/endpoints", createEndpointRoutes(registry));

  // Payment routes (protected with authentication)
  app.use("/api", paymentRoutes);

  // Wallet routes (protected with authentication)
  app.use("/api/wallet", createWalletRoutes());

  // MCP routes (includes both public MCP endpoints and protected connection info)
  app.use(createMCPRoutes(registry));

  // Health check routes (public)
  app.use("/health", createHealthRoutes());

  // Root endpoint - Information about the service
  app.get("/", (_req, res) => {
    res.json({
      name: "MCP Marketplace Server",
      version: "1.0.0",
      description: "OAuth 2.1 protected MCP server with dynamic endpoints",
      endpoints: {
        health: "/health",
        auth: {
          signup: "POST /api/auth/signup",
          login: "POST /api/auth/login",
          profile: "GET /api/auth/profile",
        },
        oauth: {
          discovery: "GET /.well-known/oauth-protected-resource",
          authorize: "GET /api/auth/oauth/authorize",
          token: "POST /api/auth/oauth/token",
          clients: "GET /api/auth/oauth/clients",
        },
        mcp: {
          connection: "GET /api/mcp/connection",
          server_by_id: "ALL /mcp/:userId (requires OAuth)",
          server_by_username: "ALL /mcp/u/:username (requires OAuth)",
        },
        endpoints: {
          create: "POST /api/endpoints",
          list: "GET /api/endpoints",
          update: "PUT /api/endpoints/:id",
          delete: "DELETE /api/endpoints/:name",
        },
        wallet: {
          connect: "POST /api/wallet/connect",
          disconnect: "POST /api/wallet/disconnect",
          get: "GET /api/wallet",
        },
      },
      documentation: "https://github.com/your-repo/mcp-marketplace",
    });
  });

  // Error handling middleware
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      log.error(`[Server] Unhandled error: ${err.message}`);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  );

  // Start the server
  app.listen(port, host, () => {
    log.info(`[Server] ✓ MCP Marketplace Server started on ${host}:${port}`);
    log.info(`[Server] ✓ Active MCP servers: ${registry.getServerCount()}`);
    log.info("");
    log.info("[Server] 📚 API Documentation:");
    log.info("");
    log.info("  Authentication:");
    log.info(`    POST   http://${host}:${port}/api/auth/signup`);
    log.info(`    POST   http://${host}:${port}/api/auth/login`);
    log.info(
      `    GET    http://${host}:${port}/api/auth/profile (auth required)`
    );
    log.info(
      `    POST   http://${host}:${port}/api/auth/logout (auth required)`
    );
    log.info(`    POST   http://${host}:${port}/api/auth/refresh`);
    log.info("");
    log.info("  Endpoint Management (auth required):");
    log.info(`    POST   http://${host}:${port}/api/endpoints`);
    log.info(`    GET    http://${host}:${port}/api/endpoints`);
    log.info(`    PUT    http://${host}:${port}/api/endpoints/:id`);
    log.info(`    DELETE http://${host}:${port}/api/endpoints/:name`);
    log.info("");
    log.info("  Payment & Balance (auth required):");
    log.info(`    GET    http://${host}:${port}/api/balance`);
    log.info(`    GET    http://${host}:${port}/api/deposit`);
    log.info(`    POST   http://${host}:${port}/api/deposit/credit`);
    log.info(`    POST   http://${host}:${port}/api/deposit/manual`);
    log.info(
      `    POST   http://${host}:${port}/api/pricing/endpoint/:endpointId`
    );
    log.info(
      `    GET    http://${host}:${port}/api/pricing/endpoint/:endpointId`
    );
    log.info(`    GET    http://${host}:${port}/api/payments/history`);
    log.info("");
    log.info("  MCP Connections:");
    log.info(
      `    GET    http://${host}:${port}/api/mcp/connection (get your MCP URL)`
    );
    log.info(
      `    GET    http://${host}:${port}/mcp/:userId (connect to user's MCP server)`
    );
    log.info(
      `    GET    http://${host}:${port}/mcp/u/:username (connect by username)`
    );
    log.info(`    POST   http://${host}:${port}/mcp/:userId (call MCP tools)`);
    log.info("");
    log.info("  Health:");
    log.info(`    GET    http://${host}:${port}/health`);
    log.info("");
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    log.info("[Server] Shutting down gracefully...");
    await closeAllTransports();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log.info("[Server] Shutting down gracefully...");
    await closeAllTransports();
    process.exit(0);
  });
}

// Start the server
main().catch((error) => {
  log.error(`[Server] Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});

export { main };
