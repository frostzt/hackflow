# Contributing to Hackflow

Thank you for your interest in contributing to Hackflow! This document provides guidelines and information for contributors.

## 🎯 Philosophy

Hackflow is built with a core principle: **hackability**. Every component should be:

- **Swappable**: Implementations can be replaced without changing the core
- **Interface-driven**: All major components are defined by interfaces
- **Minimal core**: The core does orchestration; plugins do the work
- **Future-proof**: Design decisions should not require refactoring later

## 🏗️ Architecture

### Core Components

```
src/
├── types/          # Interface definitions (contracts)
├── core/           # Agent, executor, prompt handler
├── storage/        # Storage adapters (SQLite, DO, etc.)
├── mcps/           # MCP client integration
├── security/       # Security guards and safety
├── workflows/      # Workflow loader, template engine, registry
└── cli/            # Command-line interface
```

### Design Principles

1. **Interfaces First**: Define the interface before implementation
2. **Dependency Injection**: Components receive dependencies, not create them
3. **Clean Separation**: Storage, execution, security are independent
4. **Extensibility**: New features should extend, not modify existing code

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- TypeScript knowledge

### Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/hackflow.git
cd hackflow

# Install dependencies
npm install

# Build
npm run build

# Run in dev mode
npm run dev -- run examples/hello-world.yaml --var name=Test
```

## 🔧 Development Workflow

### Running Tests

```bash
# Run tests (when implemented)
npm test

# Run with coverage
npm run test:coverage
```

### Building

```bash
# Build TypeScript
npm run build

# Watch mode
npm run build -- --watch
```

### Code Style

```bash
# Format code
npm run format

# Lint (when configured)
npm run lint
```

## 🎨 Adding New Features

### Adding a Storage Backend

1. Create a new file in `src/storage/<backend-name>/index.ts`
2. Implement the `IStorageAdapter` interface
3. Add factory support in `src/storage/index.ts`

Example:

```typescript
// src/storage/durable-objects/index.ts
import type { IStorageAdapter } from "../../types/index.js";

export class DurableObjectsStorage implements IStorageAdapter {
  async initialize() { /* ... */ }
  async saveExecution(exec) { /* ... */ }
  // ... implement all interface methods
}

// src/storage/index.ts
export function createStorage(config: StorageConfig): IStorageAdapter {
  switch (config.type) {
    case "durable-objects":
      return new DurableObjectsStorage(config);
    // ... other cases
  }
}
```

### Adding Built-in Actions

Add new actions to the executor's `executeAction` method:

```typescript
// src/core/executor.ts
private async executeAction(action: string, params: any, variables: any) {
  const [namespace, actionName] = action.split(".");
  
  if (namespace === "myaction") {
    return this.executeMyAction(actionName, params);
  }
  
  // ... rest of implementation
}
```

### Adding MCP Server Support

Update the MCP client to support new servers:

```typescript
// src/mcps/client.ts
private getMockTools(serverName: string): MCPTool[] {
  const mockTools: Record<string, MCPTool[]> = {
    myserver: [
      {
        name: "my_tool",
        description: "Does something cool",
        inputSchema: { /* ... */ },
      },
    ],
  };
  return mockTools[serverName] ?? [];
}
```

## 📝 Creating Workflows

### Workflow Structure

```yaml
name: workflow-name
description: What it does
version: 1.0.0
author: Your Name

mcps_required:
  - server1
  - server2

config_schema:
  param1:
    type: string
    required: true
  param2:
    type: boolean
    default: false

steps:
  - action: namespace.action
    description: What this step does
    params:
      key: value
    output: variable_name
    if: "{{condition}}"
    retry:
      attempts: 3
      delay: 1000
```

### Best Practices

1. **Descriptive names**: Use clear, action-oriented names
2. **Add descriptions**: Help users understand each step
3. **Use conditionals**: Make workflows flexible
4. **Handle errors**: Add retry logic for flaky operations
5. **Document config**: Explain required parameters

### Example Workflow

```yaml
name: backup-database
description: Backup database to cloud storage
version: 1.0.0

mcps_required:
  - database
  - s3

config_schema:
  db_name:
    type: string
    required: true
  bucket:
    type: string
    required: true

steps:
  - action: database.dump
    description: Create database dump
    params:
      database: "{{db_name}}"
    output: dump_file
    retry:
      attempts: 3
      delay: 5000

  - action: s3.upload
    description: Upload to S3
    params:
      file: "{{dump_file}}"
      bucket: "{{bucket}}"
    output: upload_result

  - action: log.info
    params:
      message: "Backup complete: {{upload_result.url}}"
```

## 🧪 Testing

### Unit Tests

```typescript
import { WorkflowExecutor } from "../src/core/executor";
import { MockStorage, MockSecurity, MockMCP } from "./mocks";

describe("WorkflowExecutor", () => {
  it("should execute a simple workflow", async () => {
    const executor = new WorkflowExecutor(
      new MockStorage(),
      new MockSecurity(),
      new MockMCP()
    );

    const result = await executor.execute(workflow, config);
    expect(result.status).toBe("completed");
  });
});
```

### Integration Tests

Test complete workflows end-to-end:

```typescript
import { HackflowAgent } from "../src";

describe("Git Workflow", () => {
  it("should commit and push changes", async () => {
    const agent = createTestAgent();
    const result = await agent.runWorkflowFile(
      "examples/git-commit-workflow.yaml",
      { values: { auto_push: true } }
    );
    expect(result.status).toBe("completed");
  });
});
```

## 📚 Documentation

### Code Documentation

- Add JSDoc comments to public APIs
- Document complex logic with inline comments
- Keep README.md up to date with new features

### API Documentation

Public interfaces should have comprehensive documentation:

```typescript
/**
 * Storage adapter for workflow execution state
 * 
 * Implementations must provide persistent storage for:
 * - Workflow executions
 * - Step results
 * - Context/variables
 * 
 * @example
 * ```typescript
 * const storage = new SQLiteStorageAdapter("/path/to/db");
 * await storage.initialize();
 * await storage.saveExecution(execution);
 * ```
 */
export interface IStorageAdapter {
  // ...
}
```

## 🐛 Bug Reports

### Good Bug Reports Include:

1. **Clear title**: Summarize the issue
2. **Steps to reproduce**: Exact steps to trigger the bug
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Environment**: OS, Node version, Hackflow version
6. **Logs/errors**: Any relevant error messages

### Example

```markdown
**Title**: Workflow fails when variable contains special characters

**Steps to reproduce**:
1. Create workflow with variable interpolation
2. Run with: `hackflow run test.yaml --var "name=John's Workflow"`
3. Observe error

**Expected**: Variable should be interpolated correctly

**Actual**: Error: Template variable not found: name

**Environment**: 
- OS: macOS 14
- Node: v20.10.0
- Hackflow: v0.1.0
```

## 🎉 Feature Requests

We love new ideas! When proposing features:

1. **Describe the problem**: What are you trying to solve?
2. **Propose a solution**: How should it work?
3. **Consider alternatives**: What other approaches exist?
4. **Check roadmap**: See if it's already planned

## 📋 Pull Request Process

1. **Fork the repo** and create a feature branch
2. **Make your changes** following our code style
3. **Add tests** for new functionality
4. **Update documentation** if needed
5. **Run `npm run format`** before committing
6. **Create a PR** with a clear description

### PR Template

```markdown
## What does this PR do?

Brief description of the changes

## Why is this needed?

Context and motivation

## How was it tested?

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manually tested with example workflows

## Checklist

- [ ] Code follows project style
- [ ] Documentation updated
- [ ] Tests pass
- [ ] No breaking changes (or clearly documented)
```

## 🏆 Recognition

Contributors will be:

- Listed in CONTRIBUTORS.md
- Credited in release notes

## ❓ Questions?

- **Discord**: [Join our community](#) (coming soon)
- **Discussions**: Use GitHub Discussions for questions
- **Twitter**: [@hackflow](#) (coming soon)

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. We're building something awesome together!

---

Thank you for contributing to Hackflow! 🚀
