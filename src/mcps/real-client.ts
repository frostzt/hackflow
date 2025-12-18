import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { IMCPClient, MCPServerConfig, MCPTool } from "../types/index.js";

/**
 * Real MCP Client - connects to actual MCP servers via the protocol
 * 
 * This replaces the mock client and enables real tool integrations
 */
export class RealMCPClient implements IMCPClient {
  private clients = new Map<string, Client>();
  private transports = new Map<string, StdioClientTransport>();
  private configs = new Map<string, MCPServerConfig>();

  async connect(serverName: string, config?: MCPServerConfig): Promise<void> {
    if (this.clients.has(serverName)) {
      console.log(`[MCP] Already connected to ${serverName}`);
      return;
    }

    // Use provided config or load from file
    const serverConfig = config ?? (await this.loadServerConfig(serverName));
    if (!serverConfig) {
      throw new Error(`No configuration for ${serverName}`);
    }

    this.configs.set(serverName, serverConfig);

    console.log(`[MCP] Connecting to ${serverName}...`);
    console.log(`[MCP] Command: ${serverConfig.command} ${serverConfig.args?.join(" ") || ""}`);

    // Create stdio transport - it will spawn the process
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: this.interpolateEnv(serverConfig.env || {}),
    });

    this.transports.set(serverName, transport);

    // Create MCP client
    const client = new Client(
      {
        name: "hackflow",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    // Connect to server
    try {
      await client.connect(transport);
      this.clients.set(serverName, client);
      console.log(`[MCP] ✓ Connected to ${serverName}`);
    } catch (error) {
      throw new Error(
        `Failed to connect to MCP server ${serverName}: ${(error as Error).message}`
      );
    }
  }

  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const transport = this.transports.get(serverName);

    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.error(`[MCP] Error closing ${serverName}:`, error);
      }
      this.clients.delete(serverName);
    }

    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.error(`[MCP] Error closing transport:`, error);
      }
      this.transports.delete(serverName);
    }

    console.log(`[MCP] Disconnected from ${serverName}`);
  }

  async callTool(
    serverName: string,
    toolName: string,
    params: Record<string, any>
  ): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(
        `Not connected to MCP server: ${serverName}. ` +
        `Make sure server is in mcps_required.`
      );
    }

    console.log(`[MCP] Calling ${serverName}.${toolName}`, params);

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: params,
      });

      // Extract content from MCP response
      const content = result.content as any[];
      if (content && content.length > 0) {
        const firstContent = content[0];
        
        if (firstContent.type === "text") {
          // Try to parse as JSON, otherwise return as is
          try {
            return JSON.parse(firstContent.text);
          } catch {
            return { result: firstContent.text };
          }
        }
        
        if (firstContent.type === "resource") {
          return firstContent;
        }
      }

      return result;
    } catch (error) {
      throw new Error(
        `MCP tool call failed (${serverName}.${toolName}): ${(error as Error).message}`
      );
    }
  }

  async listTools(serverName: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to MCP server: ${serverName}`);
    }

    try {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, any>,
      }));
    } catch (error) {
      throw new Error(
        `Failed to list tools from ${serverName}: ${(error as Error).message}`
      );
    }
  }

  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  async autoConnect(requiredServers: string[]): Promise<void> {
    for (const serverName of requiredServers) {
      if (!this.isConnected(serverName)) {
        try {
          const config = await this.loadServerConfig(serverName);
          if (config) {
            await this.connect(serverName, config);
          } else {
            console.warn(
              `[MCP] No configuration for ${serverName}, will try to use if available`
            );
          }
        } catch (error) {
          console.error(
            `[MCP] Failed to connect to ${serverName}:`,
            (error as Error).message
          );
          throw error;
        }
      }
    }
  }

  /**
   * Load MCP server configuration from ~/.hackflow/mcp-servers.json
   */
  private async loadServerConfig(
    serverName: string
  ): Promise<MCPServerConfig | undefined> {
    const configPath = join(homedir(), ".hackflow", "mcp-servers.json");

    if (!existsSync(configPath)) {
      return undefined;
    }

    try {
      const configContent = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      return config[serverName];
    } catch (error) {
      console.error(
        `[MCP] Error reading config file:`,
        (error as Error).message
      );
      return undefined;
    }
  }

  /**
   * Interpolate environment variables in config
   * Example: "${GITHUB_TOKEN}" -> actual token value
   */
  private interpolateEnv(
    env: Record<string, string>
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      // Replace ${VAR_NAME} with actual env var
      const interpolated = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
        return process.env[varName] || "";
      });
      result[key] = interpolated;
    }

    return result;
  }

  /**
   * Cleanup - disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    const servers = Array.from(this.clients.keys());
    for (const serverName of servers) {
      await this.disconnect(serverName);
    }
  }
}
