/**
 * Hackflow - A hackable AI agent with workflow-based plugins
 *
 * Main exports for programmatic usage
 */

// Core classes
export { HackflowAgent } from "./core/agent.js";
export { WorkflowExecutor } from "./core/executor.js";
export { CLIPromptHandler } from "./core/prompt.js";

// Storage
export { createStorage, SQLiteStorageAdapter } from "./storage/index.js";
export type { StorageType, StorageConfig } from "./storage/index.js";

// Security
export { SecurityGuard } from "./security/index.js";
export type { SecurityConfig } from "./security/index.js";

// MCP
export { MCPClient } from "./mcps/client.js";

// Workflows
export { WorkflowLoader } from "./workflows/loader.js";
export { TemplateEngine } from "./workflows/template.js";
export { WorkflowRegistry } from "./workflows/registry.js";
export { WorkflowInstaller } from "./workflows/installer.js";

// UI
export { UIServer } from "./ui/server.js";
export type { UIServerOptions } from "./ui/server.js";

// Natural Language Agent
export { NLAgent, IntentParser, Planner, ContextManager } from "./agent/index.js";
export type { 
  NLAgentCallbacks,
  ParsedIntent,
  ExecutionPlan,
  AgentConfig,
  ConversationContext,
} from "./agent/index.js";

// REPL
export { HackflowREPL, runOneShot } from "./repl/index.js";

// AI
export { createAIProvider, loadAIConfig, ClaudeProvider } from "./ai/index.js";
export type { AIProviderType, AIConfig } from "./ai/index.js";

// Types - export all type definitions
export type {
  // Storage
  IStorageAdapter,
  WorkflowExecution,
  StepResult,
  ExecutionFilters,

  // Workflow
  WorkflowDefinition,
  WorkflowStep,
  ConfigField,
  WorkflowConfig,
  ExecutionContext,
  ExecutionResult,

  // MCP
  IMCPClient,
  MCPServerConfig,
  MCPTool,

  // Security
  ISecurityGuard,
  SecurityAction,
  PermissionResult,
  ModelCall,
  CostEstimate,

  // Executor
  IWorkflowExecutor,

  // Prompt
  IPromptHandler,
  PromptRequest,
  PromptResponse,

  // Registry
  IWorkflowRegistry,
  WorkflowMetadata,
  
  // Installation
  InstalledWorkflow,
  InstallationManifest,
  ParsedWorkflowId,
  WorkflowSource,

  // Model
  IModelProvider,
  GenerateOptions,
} from "./types/index.js";
