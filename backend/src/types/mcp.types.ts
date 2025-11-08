export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * MCP Server Registry interface
 */
export interface IMCPServerRegistry {
  getOrCreateServer(userId: string): Promise<any>;
  getServerByUserId(userId: string): any | null;
  getServerByUsername(username: string): Promise<any | null>;
  removeServer(userId: string): boolean;
  reloadServerEndpoints(userId: string): Promise<void>;
  hasServer(userId: string): boolean;
}

/**
 * MCP Protocol message types for HTTP/SSE transport
 */
export interface MCPRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
