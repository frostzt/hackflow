# MCP Quick Start

Get started with Model Context Protocol in 5 minutes!

## 🎯 What You Need to Know

**MCP in 3 sentences**:

1. MCP is a protocol that lets AI apps talk to tools (like Git, GitHub, databases)
2. You create MCP "servers" that expose tools
3. Hackflow (the client) connects to these servers and calls the tools

## 🏃 Quick Example

### The Flow

```
1. User runs workflow:
   hackflow run commit-workflow.yaml

2. Workflow says: "I need git server"
   mcps_required:
     - git

3. Hackflow connects to git MCP server:
   [Hackflow] → (connect) → [Git MCP Server]

4. Workflow step executes:
   - action: git.commit
     params:
       message: "feat: new feature"

5. Hackflow calls tool:
   [Hackflow] → (call tool "commit") → [Git MCP Server]

6. Git server executes command:
   [Git MCP Server] → runs `git commit -m "feat: new feature"`

7. Result returns:
   [Git MCP Server] → (result) → [Hackflow] → workflow continues
```

## 🛠️ Building Your First MCP Server (5 min)

### Step 1: Create Project

```bash
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk
```

### Step 2: Create Server

Create `server.ts`:

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 1. Create server
const server = new Server(
  { name: "hello-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// 2. Define tools
const TOOLS = [
  {
    name: "say_hello",
    description: "Say hello to someone",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Person's name" },
      },
      required: ["name"],
    },
  },
];

// 3. Handle "list tools" request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// 4. Handle "call tool" request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "say_hello") {
    const personName = (args as any).name;
    return {
      content: [
        {
          type: "text",
          text: `Hello, ${personName}! 👋`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// 5. Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hello MCP server running!");
}

main();
```

### Step 3: Test It

```bash
# Make executable
chmod +x server.ts

# Run
npx tsx server.ts
```

**You just created an MCP server!** 🎉

## 🔌 Using MCP Servers in Hackflow

### Current State (Mock)

Right now, Hackflow uses **mock MCP servers**:

```typescript
// src/mcps/client.ts
private getMockTools(serverName: string) {
  const mockTools = {
    git: [
      { name: "commit", ... },
      { name: "push", ... },
    ],
  };
  return mockTools[serverName] ?? [];
}
```

**Benefits**: Fast development, no external dependencies
**Limitation**: Can't do real operations

### Future State (Real MCP)

With real MCP servers:

```typescript
// Real Git operations
const client = new RealMCPClient();
await client.connect("git", {
  command: "node",
  args: ["./git-mcp-server.js"],
});

const result = await client.callTool("git", "commit", {
  message: "feat: add feature",
});
// Actually commits to git!
```

## 📦 Installing Existing MCP Servers

Anthropic provides official MCP servers:

```bash
# Install official MCP servers
npm install -g @modelcontextprotocol/server-git
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-filesystem
```

Then configure in `~/.hackflow/mcp-servers.json`:

```json
{
  "git": {
    "command": "mcp-server-git"
  },
  "github": {
    "command": "mcp-server-github",
    "env": {
      "GITHUB_TOKEN": "ghp_..."
    }
  },
  "filesystem": {
    "command": "mcp-server-filesystem",
    "args": ["--allowed-directory", "/home/user/projects"]
  }
}
```

## 🎨 MCP Server Patterns

### Pattern 1: Command Executor

Execute shell commands:

```typescript
case "run_command": {
  const { command } = args as any;
  const { stdout } = await execAsync(command);
  return {
    content: [{ type: "text", text: stdout }],
  };
}
```

### Pattern 2: API Wrapper

Wrap external APIs:

```typescript
case "search_github": {
  const { query } = args as any;
  const response = await fetch(
    `https://api.github.com/search/repositories?q=${query}`
  );
  const data = await response.json();
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}
```

### Pattern 3: Data Transformer

Transform data:

```typescript
case "json_to_yaml": {
  const { json } = args as any;
  const yaml = convertToYAML(json);
  return {
    content: [{ type: "text", text: yaml }],
  };
}
```

### Pattern 4: State Manager

Manage stateful operations:

```typescript
private connections = new Map();

case "db_connect": {
  const { url } = args as any;
  const conn = await createConnection(url);
  this.connections.set("default", conn);
  return {
    content: [{ type: "text", text: "Connected!" }],
  };
}

case "db_query": {
  const { sql } = args as any;
  const conn = this.connections.get("default");
  const results = await conn.query(sql);
  return {
    content: [{ type: "text", text: JSON.stringify(results) }],
  };
}
```

## 🔍 Debugging MCP

### Use MCP Inspector

Official debugging tool:

```bash
# Install
npm install -g @modelcontextprotocol/inspector

# Run your server through inspector
npx @modelcontextprotocol/inspector node server.js
```

Opens a web UI where you can:

- See all available tools
- Test calling tools
- View requests/responses
- Debug issues

### Add Logging

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`[MCP] Tool called: ${request.params.name}`);
  console.error(`[MCP] Arguments:`, request.params.arguments);

  const result = await handleTool(request);

  console.error(`[MCP] Result:`, result);
  return result;
});
```

**Note**: Use `console.error()` not `console.log()` because stdout is used for MCP protocol!

## 🚀 Next Steps

### For Learning

1. Read [MCP_GUIDE.md](MCP_GUIDE.md) - Complete guide
2. Check official examples: https://github.com/modelcontextprotocol/servers
3. Build a simple server (like hello-mcp above)

### For Hackflow

1. Keep using mock servers for now (they work great!)
2. Build custom MCP servers for your specific needs
3. We'll integrate real MCP in v0.2

### For Production

1. Use official MCP servers (Git, GitHub, etc.)
2. Build custom servers for your domain
3. Share servers with the community

## 📚 Resources

- **Spec**: https://spec.modelcontextprotocol.io/
- **SDK**: https://github.com/modelcontextprotocol/sdk
- **Servers**: https://github.com/modelcontextprotocol/servers
- **Inspector**: `npm install -g @modelcontextprotocol/inspector`

## 💡 Key Takeaways

1. **MCP = Standard protocol** for AI tools
2. **Server = Exposes tools** (like functions)
3. **Client = Calls tools** (Hackflow is a client)
4. **JSON-RPC over stdio** - simple, standard
5. **Composable** - mix and match servers

**You don't need to understand everything to use MCP!** Just know:

- Servers provide tools
- Clients call tools
- It's all standardized

The mock MCP in Hackflow is perfect for getting started. Real MCP can come later when you need actual integrations!
