# 🔧 Hackflow

**A hackable AI agent with workflow-based plugins**

HEY HEY

Hackflow is an extensible AI agent platform where workflows are plugins. Think of it as Vim for AI agents - minimal core, maximum customization.

## ✨ Features

- **🔌 Plugin Architecture**: Workflows are plugins that can be downloaded and shared
- **🛡️ Safety First**: Built-in security guards prevent dangerous operations
- **🎯 MCP Native**: Leverages Model Context Protocol for tool integrations
- **💾 Stateful**: Persistent storage with SQLite (swappable backends)
- **🤝 Interactive**: Support for both static and dynamic prompts
- **🤖 AI-Powered**: Optional AI features for smart workflows (Claude, OpenAI)
- **🌐 Hackable**: Every component is an interface - swap implementations easily

## 🚀 Quick Start

### Installation

```bash
npm install -g hackflow
```

Or run from source:

```bash
git clone https://github.com/yourusername/hackflow.git
cd hackflow
npm install
npm run build
npm link
```

### Initialize

```bash
hackflow init
```

### Run a Workflow

```bash
# Simple hello world
hackflow run examples/hello-world.yaml --var name=Alice

# Git commit workflow
hackflow run examples/git-commit-workflow.yaml

# Create a PR
hackflow run examples/create-pr-workflow.yaml --var pr_title="Add new feature"

# Dry run mode (simulate without executing)
hackflow run examples/git-commit-workflow.yaml --dry-run

# Use mock MCP servers (for development)
hackflow run examples/git-commit-workflow.yaml --mock-mcp

# AI-powered workflows (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY=your_key
hackflow run examples/ai-commit-message.yaml
```

**Note**: Hackflow uses real MCP servers by default. If no configuration is found, it gracefully falls back to mock servers. 

**To use real Git/GitHub/GitLab**: See [docs/OFFICIAL_MCP_SERVERS.md](docs/OFFICIAL_MCP_SERVERS.md) for setup instructions.

### 🤖 AI Features (Optional)

Hackflow includes AI capabilities powered by Claude:

```yaml
steps:
  # Dynamic prompts - AI interprets natural language
  - action: prompt.ask
    params:
      message: "Describe your changes"
      dynamic: true # AI interprets the response
    output: description

  # Generate text with AI
  - action: ai.generate
    params:
      prompt: "Write a commit message for: {{description}}"
    output: commit_msg
```

See [AI Features Documentation](docs/AI_FEATURES.md) for details.

````

## 📝 Creating Workflows

Workflows are defined in YAML with a simple, intuitive structure:

```yaml
name: my-workflow
description: What this workflow does
version: 1.0.0

# Required MCP servers
mcps_required:
  - git
  - github

# Configuration schema
config_schema:
  repo_name:
    type: string
    required: true
  auto_push:
    type: boolean
    default: false

# Steps to execute
steps:
  - action: git.status
    description: Check git status
    output: status

  - action: prompt.ask
    description: Ask user for input
    params:
      message: "Enter commit message"
    output: commit_msg

  - action: git.commit
    description: Commit changes
    params:
      message: "{{commit_msg}}"
    output: commit_result

  - action: log.info
    params:
      message: "Committed: {{commit_result.sha}}"
````

### Variable Interpolation

Use `{{variable}}` syntax to reference variables:

```yaml
- action: log.info
  params:
    message: "Hello {{name}}!"
```

### Conditional Steps

Use `if` to conditionally execute steps:

```yaml
- action: git.push
  if: "{{auto_push}} == true"
  params:
    remote: origin
```

### Interactive Prompts

Ask users for input during workflow execution:

```yaml
- action: prompt.ask
  params:
    message: "Enter your name"
    dynamic: true # Let AI interpret the response
  output: user_name

- action: prompt.confirm
  params:
    message: "Are you sure?"
  output: confirmed

- action: prompt.select
  params:
    message: "Choose an option"
    options:
      - Option 1
      - Option 2
  output: selection
```

## 🏗️ Architecture

Hackflow is built with clean interfaces for maximum hackability:

```
┌─────────────────────────────────────────┐
│         Workflow Definition             │
│  (YAML/JSON/TS - stored in git repos)   │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│         Hackflow Agent                  │
│  - Workflow executor                    │
│  - MCP client                           │
│  - State manager                        │
│  - Security guard                       │
└──────────────┬──────────────────────────┘
               │
      ┌────────┼────────┐
      ↓        ↓        ↓
  ┌──────┐ ┌──────┐ ┌──────┐
  │ MCP  │ │ MCP  │ │ MCP  │
  │ Git  │ │ GH   │ │ FS   │
  └──────┘ └──────┘ └──────┘
```

### Swappable Components

Every major component is an interface:

- **Storage**: SQLite (default), Cloudflare Durable Objects, or custom
- **MCP Client**: Built-in or bring your own
- **Security**: Configurable rules and guards
- **Prompts**: CLI (default) or custom UI

## 🔐 Security

Hackflow takes security seriously:

- ✅ **Path Validation**: Operations restricted to allowed directories
- ✅ **Protected Paths**: System directories are off-limits
- ✅ **Confirmation Prompts**: Dangerous operations require user approval
- ✅ **Rate Limiting**: Prevent runaway operations
- ✅ **Dry Run Mode**: Test workflows without side effects

### Protected Operations

These operations always require confirmation:

- File deletion
- Git push to main/master
- Bulk API operations
- Code execution

## 📦 CLI Commands

```bash
# Run a workflow
hackflow run <workflow> [options]
  --var key=value     Set workflow variables
  --dry-run           Simulate without executing
  --verbose           Show detailed output

# List recent executions
hackflow list
  --workflow <name>   Filter by workflow
  --limit <n>         Number of results

# Show execution details
hackflow show <execution-id>

# Clean up old executions
hackflow cleanup
  --days <n>          Remove executions older than N days

# Initialize Hackflow
hackflow init
```

## 🎯 Roadmap

### MVP (Current)

- ✅ Core workflow executor
- ✅ SQLite storage
- ✅ Security guards
- ✅ CLI interface
- ✅ Basic MCP integration
- ✅ Example workflows

### v0.2

- [ ] Workflow registry (install from GitHub)
- [ ] Real MCP protocol integration
- [ ] AI model integration (for dynamic prompts)
- [ ] Workflow testing framework

### v0.3

- [ ] Cloudflare Durable Objects backend
- [ ] Webhook support for long-running workflows
- [ ] Workflow composition (call workflows from workflows)
- [ ] Event-driven workflow triggers

### v1.0

- [ ] Web UI for workflow management
- [ ] Workflow marketplace
- [ ] Team collaboration features
- [ ] Enterprise security features

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in dev mode
npm run dev -- run examples/hello-world.yaml --var name=Dev

# Format code
npm run format
```

## 🤝 Contributing

Hackflow is designed to be hackable! Here's how to extend it:

### Adding a Storage Backend

Implement the `IStorageAdapter` interface:

```typescript
import { IStorageAdapter } from "./types";

export class MyStorageAdapter implements IStorageAdapter {
  async initialize() {
    /* ... */
  }
  async saveExecution(exec) {
    /* ... */
  }
  // ... implement other methods
}
```

### Adding Custom Actions

Custom actions can be added via MCP servers or as built-in actions in the executor.

### Creating Workflows

Workflows are just YAML files! Create, test, and share them via GitHub.

## 📄 License

MIT

## 🙏 Acknowledgments

- Model Context Protocol (MCP) for tool integration standards
- Temporal for workflow orchestration inspiration
- Vim ❤️ for the philosophy of hackability

---

**Built with ❤️ for developers who love to hack**
