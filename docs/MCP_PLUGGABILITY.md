# MCP Pluggability in Hackflow

Complete guide to using pluggable MCP servers in Hackflow.

> 📖 **Want to use official Git, GitHub, GitLab servers?**  
> See [OFFICIAL_MCP_SERVERS.md](OFFICIAL_MCP_SERVERS.md) for setup instructions using the latest servers from https://github.com/modelcontextprotocol/servers

## 🔌 What is MCP Pluggability?

**Pluggability** means you can:
1. **Choose** which MCP servers to use
2. **Configure** servers via a simple JSON file
3. **Switch** between mock and real servers
4. **Add** new servers without changing Hackflow code

Think of it like plugins for your browser - install what you need!

## 🏗️ How It Works

```
Workflow YAML
    ↓
mcps_required: [git, github, gitlab]
    ↓
Hackflow reads ~/.hackflow/mcp-servers.json
    ↓
For each required server:
  - Load configuration
  - Spawn MCP server process
  - Connect via MCP protocol
    ↓
Workflow can now call tools:
  - git.commit
  - github.create_pr
  - gitlab.create_merge_request
```

## 📋 Configuration File

### Location

`~/.hackflow/mcp-servers.json`

### Format

```json
{
  "server-name": {
    "command": "executable-or-script",
    "args": ["array", "of", "arguments"],
    "env": {
      "ENV_VAR": "value",
      "ANOTHER": "${FROM_ENVIRONMENT}"
    }
  }
}
```

### Example Configuration

```json
{
  "git": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
  },
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "gitlab": {
    "command": "node",
    "args": ["/home/user/gitlab-mcp-server.js"],
    "env": {
      "GITLAB_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_URL": "https://gitlab.com"
    }
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
  },
  "database": {
    "command": "node",
    "args": ["/path/to/my-custom-mcp-server.js"]
  }
}
```

## 🚀 Using MCP Servers

### Step 1: Install MCP Servers

#### Official Servers (from Anthropic)

```bash
# Git
npm install -g @modelcontextprotocol/server-git

# GitHub
npm install -g @modelcontextprotocol/server-github

# Filesystem
npm install -g @modelcontextprotocol/server-filesystem

# PostgreSQL
npm install -g @modelcontextprotocol/server-postgres
```

#### Or use npx (no install needed)

```bash
# Just run with npx - it downloads on-demand
npx -y @modelcontextprotocol/server-git
```

### Step 2: Configure in Hackflow

Create `~/.hackflow/mcp-servers.json`:

```json
{
  "git": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
  },
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

### Step 3: Set Environment Variables

```bash
# For GitHub
export GITHUB_TOKEN=ghp_your_token_here

# For GitLab
export GITLAB_TOKEN=glpat_your_token_here

# For databases
export DATABASE_URL=postgresql://...
```

### Step 4: Use in Workflows

```yaml
name: my-workflow
description: Uses real MCP servers

# Specify which servers you need
mcps_required:
  - git
  - github

steps:
  # Git operations
  - action: git.status
    output: status

  - action: git.commit
    params:
      message: "feat: new feature"
    output: commit_result

  # GitHub operations
  - action: github.create_pr
    params:
      owner: "myorg"
      repo: "myrepo"
      title: "Add new feature"
      body: "Description"
      head: "feature-branch"
      base: "main"
    output: pr_result

  - action: log.info
    params:
      message: "PR created: {{pr_result.url}}"
```

### Step 5: Run with Real MCP

```bash
# Use real MCP servers
hackflow run my-workflow.yaml --mcp real

# Or still use mock for development
hackflow run my-workflow.yaml --mcp mock  # default
```

## 🛠️ Adding Custom MCP Servers

### Option 1: Use Existing Servers

Check the [official MCP servers](https://github.com/modelcontextprotocol/servers):

- Git
- GitHub
- GitLab
- Slack
- PostgreSQL
- Filesystem
- Google Drive
- Many more!

### Option 2: Create Your Own

Create `my-server.ts`:

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "my-custom-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Define tools
const TOOLS = [
  {
    name: "my_tool",
    description: "Does something cool",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
      required: ["input"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "my_tool") {
    const input = (args as any).input;
    // Do something with input
    return {
      content: [{
        type: "text",
        text: `Processed: ${input}`,
      }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("My custom MCP server running!");
}

main();
```

Build and configure:

```bash
# Build
npx tsc my-server.ts

# Add to config
{
  "mycustom": {
    "command": "node",
    "args": ["/full/path/to/my-server.js"]
  }
}
```

Use in workflow:

```yaml
mcps_required:
  - mycustom

steps:
  - action: mycustom.my_tool
    params:
      input: "Hello!"
```

## 🎯 Real-World Examples

### Example 1: Git + GitHub Workflow

**Config** (`~/.hackflow/mcp-servers.json`):
```json
{
  "git": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
  },
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

**Workflow**:
```yaml
name: feature-to-pr
description: Commit changes and create PR

mcps_required:
  - git
  - github

steps:
  - action: git.status
    output: status

  - action: prompt.ask
    params:
      message: "Commit message:"
    output: msg

  - action: git.add
    params:
      files: ["."]

  - action: git.commit
    params:
      message: "{{msg}}"

  - action: git.push

  - action: github.create_pr
    params:
      owner: "myorg"
      repo: "myrepo"
      title: "{{msg}}"
      head: "feature-branch"
      base: "main"
```

**Run**:
```bash
export GITHUB_TOKEN=ghp_...
hackflow run feature-to-pr.yaml --mcp real
```

### Example 2: GitLab Workflow

First, create or use a GitLab MCP server, then:

**Config**:
```json
{
  "gitlab": {
    "command": "node",
    "args": ["/path/to/gitlab-mcp-server.js"],
    "env": {
      "GITLAB_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_URL": "https://gitlab.com"
    }
  }
}
```

**Workflow**:
```yaml
name: gitlab-mr
mcps_required:
  - gitlab

steps:
  - action: gitlab.create_merge_request
    params:
      project_id: "123"
      source_branch: "feature"
      target_branch: "main"
      title: "Add feature"
```

### Example 3: Multi-Platform

Support both GitHub and GitLab:

```yaml
name: universal-pr
description: Create PR on GitHub or MR on GitLab

config_schema:
  platform:
    type: enum
    enum_values: [github, gitlab]
    required: true

mcps_required:
  - git
  - github  # Optional
  - gitlab  # Optional

steps:
  - action: git.commit
    params:
      message: "{{commit_msg}}"

  - action: github.create_pr
    if: "{{platform}} == 'github'"
    params:
      owner: "{{org}}"
      repo: "{{repo}}"
      title: "{{title}}"

  - action: gitlab.create_merge_request
    if: "{{platform}} == 'gitlab'"
    params:
      project_id: "{{project_id}}"
      title: "{{title}}"
```

## 🔄 Mock vs Real MCP

### Mock MCP (Default)

```bash
hackflow run workflow.yaml --mcp mock
# or just
hackflow run workflow.yaml
```

**Pros**:
- Fast development
- No external dependencies
- Works offline
- Predictable responses

**Cons**:
- Doesn't do real operations
- Limited tools available

**Use for**:
- Testing workflows
- Development
- Learning Hackflow

### Real MCP

```bash
hackflow run workflow.yaml --mcp real
```

**Pros**:
- Real operations (actual git commits, GitHub PRs, etc.)
- Full tool ecosystem
- Production ready

**Cons**:
- Requires MCP servers installed/configured
- Needs API keys
- Network dependent

**Use for**:
- Production workflows
- Actual work
- CI/CD pipelines

## 🔐 Security Best Practices

### 1. Environment Variables for Secrets

**❌ Don't hardcode**:
```json
{
  "github": {
    "env": {
      "GITHUB_TOKEN": "ghp_hardcoded_token"  // DON'T DO THIS
    }
  }
}
```

**✅ Use environment variables**:
```json
{
  "github": {
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"  // Reads from environment
    }
  }
}
```

### 2. Scope API Keys

- GitHub: Use fine-grained tokens with minimal permissions
- GitLab: Create project-specific tokens
- Databases: Read-only when possible

### 3. Protect Config File

```bash
# Restrict permissions
chmod 600 ~/.hackflow/mcp-servers.json
```

## 🐛 Troubleshooting

### "No configuration found for MCP server"

**Error**:
```
No configuration found for MCP server: git
Add it to ~/.hackflow/mcp-servers.json
```

**Solution**: Create the config file with server definition

### "Failed to connect to MCP server"

**Causes**:
1. Server not installed
2. Wrong command/path
3. Missing permissions

**Debug**:
```bash
# Test server manually
npx -y @modelcontextprotocol/server-git

# Check if command exists
which node
```

### "Tool not found"

**Error**:
```
Tool "some_tool" not found on server "git"
```

**Solution**: Check available tools:
```yaml
- action: log.info
  params:
    message: "Available tools: ..."
```

Or check MCP server documentation.

## 📚 Resources

- **Official MCP Servers**: https://github.com/modelcontextprotocol/servers
- **MCP Spec**: https://spec.modelcontextprotocol.io/
- **Building Servers**: See [MCP_GUIDE.md](MCP_GUIDE.md)

## 🎯 Next Steps

1. **Try mock first**: Get comfortable with workflows
2. **Install one server**: Start with Git
3. **Add configuration**: Create `~/.hackflow/mcp-servers.json`
4. **Test real MCP**: Run with `--mcp real`
5. **Build custom servers**: For your specific needs

---

**MCP pluggability makes Hackflow infinitely extensible!** Any tool can become an MCP server, and any MCP server works with Hackflow.
