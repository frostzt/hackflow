import { RealMCPClient } from "./real-client.js";
import { MCPClient as MockMCPClient } from "./client.js";
import type { IMCPClient, MCPServerConfig, MCPTool } from "../types/index.js";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Hybrid MCP Client - uses real MCP when configured, falls back to mock
 * 
 * This provides the best UX:
 * - If user has configured MCP servers → use real servers
 * - If no configuration → use mock servers (still works!)
 * - Per-server fallback (some real, some mock)
 */
export class HybridMCPClient implements IMCPClient {
  private realClient = new RealMCPClient();
  private mockClient = new MockMCPClient();
  private serverTypes = new Map<string, "real" | "mock">();
  private hasConfigFile = false;

  constructor() {
    // Check if config file exists
    const configPath = join(homedir(), ".hackflow", "mcp-servers.json");
    this.hasConfigFile = existsSync(configPath);

    if (!this.hasConfigFile) {
      console.log("[MCP] ℹ️  No MCP config found - using mock servers");
      console.log("[MCP]    Create ~/.hackflow/mcp-servers.json to use real MCP servers");
      console.log("[MCP]    Example: cp .hackflow/mcp-servers.json.example ~/.hackflow/mcp-servers.json");
    }
  }

  async connect(serverName: string, config?: MCPServerConfig): Promise<void> {
    // If no config file, skip trying real and go straight to mock
    if (!this.hasConfigFile) {
      await this.mockClient.connect(serverName, config);
      this.serverTypes.set(serverName, "mock");
      return;
    }

    try {
      // Try to connect with real MCP
      await this.realClient.connect(serverName, config);
      this.serverTypes.set(serverName, "real");
      console.log(`[MCP] ✓ Connected to real server: ${serverName}`);
    } catch (error) {
      // Fall back to mock
      console.log(`[MCP] ⚠️  ${serverName}: ${(error as Error).message}`);
      console.log(`[MCP] → Using mock server for: ${serverName}`);
      await this.mockClient.connect(serverName, config);
      this.serverTypes.set(serverName, "mock");
    }
  }

  async disconnect(serverName: string): Promise<void> {
    const type = this.serverTypes.get(serverName);
    if (type === "real") {
      await this.realClient.disconnect(serverName);
    } else if (type === "mock") {
      await this.mockClient.disconnect(serverName);
    }
    this.serverTypes.delete(serverName);
  }

  async callTool(
    serverName: string,
    toolName: string,
    params: Record<string, any>
  ): Promise<any> {
    const type = this.serverTypes.get(serverName);
    
    if (type === "real") {
      return this.realClient.callTool(serverName, toolName, params);
    } else if (type === "mock") {
      return this.mockClient.callTool(serverName, toolName, params);
    } else {
      throw new Error(
        `Not connected to MCP server: ${serverName}. ` +
        `Make sure it's in mcps_required.`
      );
    }
  }

  async listTools(serverName: string): Promise<MCPTool[]> {
    const type = this.serverTypes.get(serverName);
    
    if (type === "real") {
      return this.realClient.listTools(serverName);
    } else if (type === "mock") {
      return this.mockClient.listTools(serverName);
    } else {
      throw new Error(`Not connected to MCP server: ${serverName}`);
    }
  }

  isConnected(serverName: string): boolean {
    return this.serverTypes.has(serverName);
  }

  async autoConnect(requiredServers: string[]): Promise<void> {
    for (const serverName of requiredServers) {
      if (!this.isConnected(serverName)) {
        await this.connect(serverName);
      }
    }
  }

  /**
   * Get info about which servers are real vs mock
   */
  getServerInfo(): Map<string, "real" | "mock"> {
    return new Map(this.serverTypes);
  }
}
