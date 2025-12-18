# Hackflow Architecture

This document describes the architecture and design decisions behind Hackflow.

## 🎯 Design Philosophy

Hackflow is built on three core principles:

1. **Interfaces Over Implementation**: Every major component is defined by an interface, making it easy to swap implementations
2. **Hackability First**: Users can replace any component without forking the codebase
3. **No Premature Optimization**: Start with SQLite, allow scaling to Durable Objects later

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       User Interface                         │
│                    (CLI / Future: Web UI)                    │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Hackflow Agent                          │
│  - Coordinates all components                                │
│  - Entry point for workflow execution                        │
└────────────────────────────┬────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ↓                 ↓                 ↓
    ┌───────────┐     ┌───────────┐    ┌──────────┐
    │  Storage  │     │ Security  │    │   MCP    │
    │  Adapter  │     │   Guard   │    │  Client  │
    └───────────┘     └───────────┘    └──────────┘
           │                 │                 │
           ↓                 ↓                 ↓
    ┌───────────┐     ┌───────────┐    ┌──────────┐
    │  SQLite   │     │   Rules   │    │   Git    │
    │ Durable O │     │   Paths   │    │  GitHub  │
    │  Custom   │     │Rate Limit │    │   etc    │
    └───────────┘     └───────────┘    └──────────┘
                             │
                             ↓
                   ┌──────────────────┐
                   │ Workflow Executor │
                   │  - Step execution │
                   │  - Error handling │
                   │  - State tracking │
                   └──────────────────┘
```

## 🧩 Core Components

### 1. Types (`src/types/index.ts`)

**Purpose**: Define contracts for all major components

**Key Interfaces**:
- `IStorageAdapter`: Persistent state management
- `IWorkflowExecutor`: Workflow execution logic
- `ISecurityGuard`: Safety and permission checks
- `IMCPClient`: Tool integration via MCP
- `IPromptHandler`: User interaction

**Why Interface-First?**
- Decouples implementation from usage
- Enables testing with mocks
- Allows users to bring their own implementations
- Future-proof: new backends don't require refactoring

### 2. Hackflow Agent (`src/core/agent.ts`)

**Purpose**: Main entry point, coordinates all components

**Responsibilities**:
- Initialize storage
- Auto-connect to required MCP servers
- Delegate execution to WorkflowExecutor
- Provide high-level API for CLI/programmatic usage

**Design Decision**: Agent is a thin coordinator, not a god object. Business logic lives in specialized components.

### 3. Workflow Executor (`src/core/executor.ts`)

**Purpose**: Execute workflow steps with state management

**Responsibilities**:
- Parse and validate workflow definitions
- Execute steps sequentially
- Handle conditionals (`if` statements)
- Retry failed steps
- Save execution state at each step
- Interpolate template variables

**Key Features**:
- **Stateful**: Every step is persisted to storage
- **Resumable**: Can pause and resume workflows (future)
- **Observable**: Each step generates a `StepResult`
- **Safe**: Checks security permissions before actions

**Execution Flow**:
```
1. Create execution record in storage
2. Initialize context with config values
3. For each step:
   a. Update current step in storage
   b. Evaluate condition (if present)
   c. Interpolate parameters with context
   d. Check security permissions
   e. Execute action via MCP or built-in
   f. Save step result to storage
   g. Update context with output
4. Mark execution as completed/failed
```

### 4. Storage Adapters (`src/storage/`)

**Purpose**: Persist workflow execution state

**Interface**: `IStorageAdapter`

**Implementations**:
- **SQLite** (`sqlite/index.ts`): Local, file-based storage
- **Durable Objects** (future): Cloudflare-based, distributed
- **Custom**: Users can implement their own

**Data Model**:
```sql
executions:
  - id (PK)
  - workflow_name
  - status (pending/running/completed/failed)
  - started_at, completed_at
  - current_step
  - error
  - metadata (JSON)

steps:
  - id (PK)
  - execution_id (FK)
  - step_index
  - step_name
  - action
  - status
  - started_at, completed_at
  - output (JSON)
  - error

contexts:
  - execution_id (PK, FK)
  - data (JSON)
  - updated_at
```

**Why SQLite First?**
- Zero configuration
- Single file, easy to backup
- Fast enough for most use cases
- Designed to be swappable when scaling is needed

### 5. Security Guard (`src/security/index.ts`)

**Purpose**: Prevent dangerous operations

**Protection Mechanisms**:

1. **Path Validation**
   - Whitelist allowed paths for write/delete
   - Blacklist system directories
   - Normalize paths to prevent traversal

2. **Permission Checks**
   - File operations require path validation
   - Git push to main requires confirmation
   - Bulk operations require confirmation

3. **Rate Limiting**
   - Prevent runaway API calls
   - Configurable per action type

4. **Dry-Run Mode**
   - Simulate execution without side effects
   - Safe for testing workflows

**Design Decision**: Security is opt-out, not opt-in. Better to be overly cautious by default.

### 6. MCP Client (`src/mcps/client.ts`)

**Purpose**: Communicate with MCP servers for tool integration

**Current State**: MVP stub with mock tools

**Future**: Integration with `@modelcontextprotocol/sdk`

**Design**:
- Lazy connection: Connect to servers when needed
- Auto-connect: Read workflow's `mcps_required` and connect automatically
- Tool discovery: List available tools from each server
- Error handling: Graceful failures with helpful messages

**Built-in Mock Tools** (for MVP):
- `git.*`: stage_all, commit, push, current_branch
- `github.*`: create_pr
- `filesystem.*`: read, write

### 7. Workflow Loader (`src/workflows/loader.ts`)

**Purpose**: Parse and validate workflow YAML files

**Features**:
- YAML parsing with `js-yaml`
- Schema validation
- Type checking
- Error reporting with line numbers (future)

**Validation Rules**:
- Required fields: `name`, `steps`
- Steps must have `action` field
- Valid `prompt_mode` values
- Config schema types are valid

### 8. Template Engine (`src/workflows/template.ts`)

**Purpose**: Interpolate variables in workflow parameters

**Syntax**: `{{variable_name}}`

**Features**:
- Simple variable replacement
- Nested object access: `{{user.name}}`
- Condition evaluation: `{{count}} > 0`
- Operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`

**Example**:
```yaml
- action: log.info
  if: "{{env}} == 'production' && {{enabled}} == true"
  params:
    message: "User {{user.name}} logged in from {{user.ip}}"
```

### 9. CLI (`src/cli/index.ts`)

**Purpose**: Command-line interface for end users

**Commands**:
- `run <workflow>`: Execute a workflow
- `list`: List recent executions
- `show <id>`: Show execution details
- `cleanup`: Remove old executions
- `init`: Initialize Hackflow

**Design**:
- Uses `commander` for argument parsing
- Uses `chalk` for colored output
- Creates agent instance per command
- Handles errors gracefully

## 🔄 Execution Flow

### Running a Workflow

```
1. User: hackflow run workflow.yaml --var name=Alice

2. CLI parses arguments
   └─> Creates HackflowAgent
       └─> Initializes storage (SQLite)
       └─> Creates security guard
       └─> Creates MCP client

3. Agent.runWorkflowFile()
   └─> WorkflowLoader.loadFromFile()
       └─> Parse YAML
       └─> Validate schema
       
4. Agent.runWorkflow()
   └─> Auto-connect to MCP servers (git, github, etc.)
   └─> WorkflowExecutor.execute()
       
5. For each step:
   └─> Check condition (if present)
   └─> Interpolate parameters with context
   └─> SecurityGuard.checkPermission()
   └─> Execute action:
       ├─> Built-in (log, prompt, variable)
       └─> Or MCPClient.callTool()
   └─> Save result to storage
   └─> Update context with output
   
6. Return ExecutionResult
   └─> CLI displays success/failure
```

## 🔐 Security Model

### Threat Model

**What we protect against**:
1. Accidental file deletion
2. Pushing to protected branches
3. Runaway API calls (rate limits)
4. Path traversal attacks
5. Operating on system directories

**What we don't protect against** (user responsibility):
- Malicious workflow definitions
- Compromised MCP servers
- Social engineering

### Trust Model

- **Workflows**: Users explicitly run workflows (like shell scripts)
- **MCP Servers**: Trusted tools (like npm packages)
- **User Confirmation**: Required for dangerous operations

### Security Layers

```
User Action
     │
     ↓
┌─────────────────┐
│  Dry-Run Mode   │  ← Test without side effects
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Path Validation │  ← Check allowed paths
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Rate Limiting  │  ← Prevent runaway calls
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Confirmation   │  ← Ask user for dangerous ops
└────────┬────────┘
         │
         ↓
    Execute
```

## 🎨 Extensibility Points

### 1. Custom Storage Backend

Implement `IStorageAdapter`:

```typescript
export class MyStorage implements IStorageAdapter {
  async initialize() { }
  async saveExecution(exec: WorkflowExecution) { }
  // ... etc
}

// Usage
const storage = new MyStorage();
const agent = new HackflowAgent(storage, ...);
```

### 2. Custom Actions

Add built-in actions in executor:

```typescript
// src/core/executor.ts
private async executeAction(action: string, params: any) {
  const [namespace, name] = action.split(".");
  
  if (namespace === "myaction") {
    return this.executeMyAction(name, params);
  }
}
```

### 3. Custom MCP Server

Implement MCP protocol or add mock tools:

```typescript
// src/mcps/client.ts
private getMockTools(serverName: string) {
  const mockTools = {
    myserver: [
      { name: "my_tool", description: "...", inputSchema: {...} }
    ]
  };
  return mockTools[serverName] ?? [];
}
```

### 4. Custom Prompt Handler

Implement `IPromptHandler`:

```typescript
export class WebPromptHandler implements IPromptHandler {
  async ask(prompt: PromptRequest): Promise<PromptResponse> {
    // Show web UI, get input
  }
}
```

## 📊 Performance Considerations

### Current Performance

- **Startup**: <100ms (SQLite initialization)
- **Workflow Parsing**: <10ms for typical workflow
- **Step Execution**: Depends on action (network calls, etc.)
- **Storage**: ~1ms per save operation

### Scaling Strategy

**Current (MVP)**:
- Local SQLite database
- Single-machine execution
- Sequential step execution

**Future (v0.3+)**:
- Cloudflare Durable Objects for distributed state
- Parallel step execution where safe
- Webhook-based event triggers for long-running workflows

### Memory Usage

- **Storage**: SQLite, disk-based (minimal memory)
- **Execution**: Context stored in memory during execution
- **Large outputs**: Consider streaming in future

## 🧪 Testing Strategy

### Unit Tests (Future)

- Individual components in isolation
- Mock dependencies
- Fast, no I/O

### Integration Tests (Future)

- Full workflow execution
- Real storage, real MCP calls
- Test common workflows end-to-end

### E2E Tests (Future)

- CLI commands
- Example workflows
- Simulate real user interactions

## 🚀 Roadmap Considerations

### v0.2: MCP & Registry

- Real MCP protocol integration
- Workflow installation from GitHub
- AI model integration for dynamic prompts

**Architecture Impact**: Minimal - interfaces already support this

### v0.3: Cloud Backend

- Cloudflare Durable Objects storage adapter
- Webhook support for long-running workflows
- Event-driven triggers

**Architecture Impact**: New storage implementation, webhook handler

### v1.0: Collaboration

- Web UI for workflow management
- Team sharing and permissions
- Workflow marketplace

**Architecture Impact**: Auth layer, multi-tenant storage, API server

## 💡 Key Design Decisions

### Why YAML for Workflows?

**Pros**:
- Human-readable
- Easy to edit
- Non-programmers can understand
- Can generate UI from schema

**Cons**:
- Limited expressiveness for complex logic
- YAML parsing can be tricky

**Decision**: Start with YAML, add code-first option later (TypeScript DSL)

### Why SQLite?

**Pros**:
- Zero configuration
- Single file, easy backup
- Fast for local use
- Built into Node.js ecosystem

**Cons**:
- Not distributed
- Limited concurrency

**Decision**: Perfect for MVP, easy to swap later via `IStorageAdapter`

### Why Interfaces Everywhere?

**Pros**:
- Testability (mocks)
- Swappable implementations
- Future-proof
- Clear contracts

**Cons**:
- More boilerplate
- Indirection

**Decision**: Core philosophy - hackability requires interfaces

## 📚 References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Temporal Workflows](https://temporal.io/)
- [Unix Philosophy](https://en.wikipedia.org/wiki/Unix_philosophy)
- [Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection)

---

**This architecture is designed to evolve.** Start simple, add complexity only when needed, and always preserve hackability.
