import type { IMCPClient } from "../types/index.js";
import { MCPClient as MockMCPClient } from "./client.js";
import { RealMCPClient } from "./real-client.js";
import { HybridMCPClient } from "./hybrid-client.js";

export type MCPClientType = "mock" | "real" | "auto";

export interface MCPConfig {
  type: MCPClientType;
}

/**
 * Factory function to create MCP clients
 * 
 * Makes it easy to switch between mock (for development) and real (for production)
 */
export function createMCPClient(config?: MCPConfig): IMCPClient {
  const clientType = config?.type ?? "real";

  switch (clientType) {
    case "mock":
      console.log("[MCP] Using mock MCP servers (development mode)");
      return new MockMCPClient();

    case "real":
      console.log("[MCP] Using real MCP servers");
      console.log("[MCP] Configure servers in ~/.hackflow/mcp-servers.json");
      return new HybridMCPClient();

    case "auto":
      // Auto-detect: use real if config exists, otherwise mock
      return new HybridMCPClient();

    default:
      throw new Error(`Unknown MCP client type: ${clientType}`);
  }
}

// Re-export clients
export { MCPClient as MockMCPClient } from "./client.js";
export { RealMCPClient } from "./real-client.js";
export { HybridMCPClient } from "./hybrid-client.js";
