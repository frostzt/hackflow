# Understanding MCP (Model Context Protocol)

A complete guide to MCP and how to build MCP servers for Hackflow.

## 🤔 What is MCP?

**Model Context Protocol** is a standard protocol created by Anthropic that allows AI applications to connect to external tools and data sources.

Think of it like this:

- **HTTP** is a protocol for web servers
- **MCP** is a protocol for AI tool servers

### Why MCP?

Before MCP, every AI app had to write custom integrations for Git, GitHub, databases, etc. MCP standardizes this:

```
┌─────────────┐
│   AI App    │
│ (Hackflow)  │
└──────┬──────┘
       │ Uses MCP Protocol
       │
   ┌───┴────────────────┬──────────────┐
   ↓                    ↓              ↓
┌──────────┐     ┌──────────┐   ┌──────────┐
│   Git    │     │  GitHub  │   │ Database │
│   MCP    │     │   MCP    │   │   MCP    │
│  Server  │     │  Server  │   │  Server  │
└──────────┘     └──────────┘   └──────────┘
```

**Benefits**:

1. Write once, use in any MCP-compatible app
2. Standard protocol = easier to build
3. Secure - MCP handles authentication
4. Composable - mix and match servers

## 🏗️ MCP Architecture

### Components

```
┌──────────────────────────────────────────────┐
│              MCP Client                       │
│         (Your AI App - Hackflow)              │
│                                               │
│  - Connects to MCP servers                    │
│  - Calls tools                                │
│  - Manages sessions                           │
└────────────────┬─────────────────────────────┘
                 │
                 │ MCP Protocol (JSON-RPC)
                 │
┌────────────────┴─────────────────────────────┐
│              MCP Server                       │
│           (Git, GitHub, etc.)                 │
│                                               │
│  - Exposes tools                              │
│  - Handles requests                           │
│  - Returns results                            │
└──────────────────────────────────────────────┘
```

### Protocol

MCP uses **JSON-RPC 2.0** over stdio (standard input/output):

```typescript
// Client sends request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "git_commit",
    "arguments": {
      "message": "feat: add new feature"
    }
  }
}

// Server responds
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Committed successfully: abc123"
      }
    ]
  }
}
```

## 📦 MCP Server Structure

An MCP server has three main parts:

### 1. Server Metadata

```typescript
{
  "name": "git-mcp-server",
  "version": "1.0.0",
  "description": "Git operations via MCP"
}
```

### 2. Tool Definitions

Tools are the actions your server can perform:

```typescript
{
  "name": "git_commit",
  "description": "Commit staged changes",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "Commit message"
      }
    },
    "required": ["message"]
  }
}
```

### 3. Tool Handlers

Code that executes when a tool is called:

```typescript
async function handleGitCommit(args: { message: string }) {
  // Execute git commit
  const result = await exec(`git commit -m "${args.message}"`);
  return {
    content: [
      {
        type: "text",
        text: `Committed: ${result.stdout}`,
      },
    ],
  };
}
```

## 🛠️ Building a Git MCP Server

Let's build a real Git MCP server step by step!

### Step 1: Install MCP SDK

```bash
npm install @modelcontextprotocol/sdk
```

### Step 2: Create Server File

Create `git-mcp-server.ts`:

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Create MCP server
const server = new Server(
  {
    name: "git-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define tools
const TOOLS = [
  {
    name: "git_status",
    description: "Get the current git status",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "git_commit",
    description: "Commit staged changes",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Commit message",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "git_push",
    description: "Push commits to remote",
    inputSchema: {
      type: "object",
      properties: {
        remote: {
          type: "string",
          description: "Remote name",
          default: "origin",
        },
        branch: {
          type: "string",
          description: "Branch name",
        },
      },
    },
  },
  {
    name: "git_diff",
    description: "Show git diff",
    inputSchema: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description: "Show staged changes only",
          default: false,
        },
      },
    },
  },
];

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "git_status": {
        const { stdout } = await execAsync("git status --porcelain");
        return {
          content: [
            {
              type: "text",
              text: stdout || "No changes",
            },
          ],
        };
      }

      case "git_commit": {
        const message = (args as any).message;
        const { stdout } = await execAsync(`git commit -m "${message}"`);
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      case "git_push": {
        const remote = (args as any).remote || "origin";
        const branch = (args as any).branch || "main";
        const { stdout } = await execAsync(`git push ${remote} ${branch}`);
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      case "git_diff": {
        const staged = (args as any).staged || false;
        const command = staged ? "git diff --staged" : "git diff";
        const { stdout } = await execAsync(command);
        return {
          content: [
            {
              type: "text",
              text: stdout || "No changes",
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Git MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
```

### Step 3: Make it Executable

```bash
chmod +x git-mcp-server.ts
```

### Step 4: Test the Server

```bash
# Build
npx tsx git-mcp-server.ts

# Or compile to JS
npx tsc git-mcp-server.ts
node git-mcp-server.js
```

## 🐙 Building a GitHub MCP Server

Now let's build a GitHub MCP server using the GitHub API!

Create `github-mcp-server.ts`:

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const server = new Server(
  {
    name: "github-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const TOOLS = [
  {
    name: "create_pr",
    description: "Create a pull request",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description" },
        head: { type: "string", description: "Branch to merge from" },
        base: {
          type: "string",
          description: "Branch to merge into",
          default: "main",
        },
      },
      required: ["owner", "repo", "title", "head"],
    },
  },
  {
    name: "create_issue",
    description: "Create an issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    name: "list_prs",
    description: "List pull requests",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: {
          type: "string",
          enum: ["open", "closed", "all"],
          default: "open",
        },
      },
      required: ["owner", "repo"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_pr": {
        const { owner, repo, title, body, head, base } = args as any;
        const result = await octokit.pulls.create({
          owner,
          repo,
          title,
          body,
          head,
          base: base || "main",
        });

        return {
          content: [
            {
              type: "text",
              text: `Created PR #${result.data.number}: ${result.data.html_url}`,
            },
          ],
        };
      }

      case "create_issue": {
        const { owner, repo, title, body, labels } = args as any;
        const result = await octokit.issues.create({
          owner,
          repo,
          title,
          body,
          labels,
        });

        return {
          content: [
            {
              type: "text",
              text: `Created issue #${result.data.number}: ${result.data.html_url}`,
            },
          ],
        };
      }

      case "list_prs": {
        const { owner, repo, state } = args as any;
        const result = await octokit.pulls.list({
          owner,
          repo,
          state: state || "open",
        });

        const prs = result.data
          .map((pr) => `#${pr.number}: ${pr.title} (${pr.state})`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: prs || "No pull requests found",
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
```

## 🔌 Integrating MCP Servers with Hackflow

Now let's update Hackflow to use REAL MCP servers!

### Step 1: Install MCP SDK in Hackflow

```bash
cd hackflow
npm install @modelcontextprotocol/sdk
```

### Step 2: Create Real MCP Client

Create `src/mcps/real-client.ts`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import type { IMCPClient, MCPServerConfig, MCPTool } from "../types/index.js";

export class RealMCPClient implements IMCPClient {
  private clients = new Map<string, Client>();
  private transports = new Map<string, StdioClientTransport>();
  private configs = new Map<string, MCPServerConfig>();

  async connect(serverName: string, config: MCPServerConfig): Promise<void> {
    if (this.clients.has(serverName)) {
      return; // Already connected
    }

    // Store config
    this.configs.set(serverName, config);

    // Spawn MCP server process
    const process = spawn(config.command, config.args || [], {
      env: { ...process.env, ...config.env },
    });

    // Create transport
    const transport = new StdioClientTransport({
      reader: process.stdout,
      writer: process.stdin,
    });

    this.transports.set(serverName, transport);

    // Create client
    const client = new Client(
      {
        name: "hackflow-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Connect
    await client.connect(transport);
    this.clients.set(serverName, client);

    console.log(`[MCP] Connected to ${serverName}`);
  }

  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      await client.close();
      this.clients.delete(serverName);
      this.transports.delete(serverName);
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    params: Record<string, any>,
  ): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to MCP server: ${serverName}`);
    }

    // Call tool via MCP
    const result = await client.callTool({
      name: toolName,
      arguments: params,
    });

    // Extract text from response
    if (result.content && result.content[0]) {
      const content = result.content[0];
      if (content.type === "text") {
        return { result: content.text };
      }
    }

    return result;
  }

  async listTools(serverName: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to MCP server: ${serverName}`);
    }

    const result = await client.listTools();

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as any,
    }));
  }

  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  async autoConnect(requiredServers: string[]): Promise<void> {
    for (const serverName of requiredServers) {
      if (!this.isConnected(serverName)) {
        const config = await this.loadServerConfig(serverName);
        if (config) {
          await this.connect(serverName, config);
        }
      }
    }
  }

  private async loadServerConfig(
    serverName: string,
  ): Promise<MCPServerConfig | undefined> {
    // Load from ~/.hackflow/mcp-servers.json
    // For now, return hardcoded configs
    const configs: Record<string, MCPServerConfig> = {
      git: {
        command: "node",
        args: ["/path/to/git-mcp-server.js"],
      },
      github: {
        command: "node",
        args: ["/path/to/github-mcp-server.js"],
        env: {
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
        },
      },
    };

    return configs[serverName];
  }
}
```

### Step 3: Configure MCP Servers

Create config file `~/.hackflow/mcp-servers.json`:

```json
{
  "git": {
    "command": "node",
    "args": ["/path/to/git-mcp-server.js"]
  },
  "github": {
    "command": "node",
    "args": ["/path/to/github-mcp-server.js"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

### Step 4: Use in Hackflow

Update `src/mcps/index.ts`:

```typescript
import { RealMCPClient } from "./real-client.js";
import { MCPClient as MockMCPClient } from "./client.js";

export function createMCPClient(useMock: boolean = true) {
  if (useMock) {
    return new MockMCPClient(); // Current mock
  } else {
    return new RealMCPClient(); // Real MCP protocol
  }
}
```

## 📚 MCP Resources

### Official Resources

- **Spec**: https://spec.modelcontextprotocol.io/
- **SDK**: https://github.com/modelcontextprotocol/sdk
- **Examples**: https://github.com/modelcontextprotocol/servers

### Community MCP Servers

- **Git**: https://github.com/modelcontextprotocol/servers/tree/main/src/git
- **GitHub**: https://github.com/modelcontextprotocol/servers/tree/main/src/github
- **PostgreSQL**: https://github.com/modelcontextprotocol/servers/tree/main/src/postgres
- **Filesystem**: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem

### Building Your Own

Want to build a custom MCP server?

1. Install SDK: `npm install @modelcontextprotocol/sdk`
2. Create server (see examples above)
3. Define tools (what your server can do)
4. Implement handlers (how tools work)
5. Test with MCP inspector: `npx @modelcontextprotocol/inspector`

## 🎯 Next Steps for Hackflow

To fully integrate real MCP in Hackflow:

1. ✅ Install `@modelcontextprotocol/sdk`
2. ✅ Create `RealMCPClient` class
3. ⏳ Add MCP server configuration
4. ⏳ Create or install Git/GitHub MCP servers
5. ⏳ Switch from mock to real in production

**For now**, the mock MCP client is perfect for:

- Testing workflows
- Developing features
- Understanding the flow

**Real MCP** will enable:

- Actual git operations
- Real GitHub API calls
- Any tool via MCP servers

---

**MCP is the future of AI tool integration!** It's like USB for AI apps - one standard that connects everything.
