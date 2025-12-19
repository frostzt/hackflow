# Agent Guidelines for Hackflow

## Build/Test Commands
```bash
npm run build                    # Compile TypeScript
npm test                         # Run all tests
npm test -- src/path/to/file.test.ts  # Run single test file
npm run test:watch              # Watch mode for tests
npm run format                  # Format code with Prettier
```

## Code Style & Conventions

### Imports
- Use ES modules with `.js` extensions: `import { foo } from "./bar.js"`
- Import types with `type`: `import type { IStorageAdapter } from "../types/index.js"`
- Group imports: types first, then local modules, then external packages

### Types & Interfaces
- **Interfaces for contracts**: All major components use interfaces (e.g., `IStorageAdapter`, `IMCPClient`)
- **Type everything**: Enable `strict: true` in tsconfig
- **Prefer interfaces over types** for public APIs
- Use `Record<string, any>` for flexible objects, not `any` alone

### Naming Conventions
- Interfaces: `IComponentName` (e.g., `IWorkflowExecutor`)
- Classes: `PascalCase` (e.g., `WorkflowExecutor`)
- Files: `kebab-case.ts` (e.g., `workflow-loader.ts`)
- Private methods: prefix with `_` or mark as `private` (e.g., `private executeAction()`)
- Constants: `UPPER_SNAKE_CASE` for true constants

### Architecture Patterns
- **Interface-driven design**: Define interfaces in `src/types/index.ts` before implementation
- **Dependency injection**: Components receive dependencies via constructor, never create them
- **Single responsibility**: Each class/function does one thing well
- **Composition over inheritance**: Prefer composing interfaces

### Error Handling
- Always throw `Error` objects, never strings: `throw new Error("message")`
- Catch and wrap errors with context: `Failed to execute action ${action}: ${err.message}`
- Use try-catch in async functions, propagate errors to caller
- Log errors before throwing when appropriate

### Shell MCP Integration
- Shell commands return formatted output (not raw JSON)
- Exit codes are automatically checked - non-zero exits throw errors
- Format shell responses with `formatShellResult()` for clean output
- Check exit codes with `checkShellExitCode()` before returning results

### Testing
- Use Vitest: `describe()` and `it()` for test structure
- Mock external dependencies (storage, MCP, security)
- Test files: `*.test.ts` in same directory as source
- Test workflow composition with `MockMCPClient` that throws for unconnected servers

### Workflow Development
- YAML workflows in `workflows/` directory
- Use `workflow.run` action for composition - supports circular dependency detection
- Variables passed via `vars` param, child workflows have isolated context
- Always add `description` fields for clarity
- Use `if` conditions for flow control: `if: "{{variable}} == true"`

### Recent Changes (Session Context)
1. **Exit code checking**: Shell MCP responses are validated; non-zero exits fail workflows
2. **Pretty printing**: Shell output is parsed and formatted (no raw JSON in logs)
3. **Workflow composition**: Workflows can call other workflows with `workflow.run`
4. **Call stack tracking**: Circular dependencies detected and prevented
5. **Context isolation**: Child workflows only see explicitly passed variables

### Important Files
- `src/core/executor.ts` - Workflow execution engine (handles exit codes, composition)
- `src/core/agent.ts` - Main entry point, coordinates components
- `src/types/index.ts` - All interface definitions
- `src/workflows/registry.ts` - Workflow discovery with recursive search
- `workflows/validate-code.yaml` - Example validation workflow

### Common Pitfalls
- Don't forget `.js` extensions in imports (required for ES modules)
- Shell MCP working directory may differ from where `hackflow run` is executed
- Always check if MCP clients are connected before calling tools
- Use `TemplateEngine.interpolateObject()` for variable substitution
- Remember to call `storage.initialize()` before using storage methods
