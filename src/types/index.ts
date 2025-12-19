/**
 * Core type definitions for Hackflow
 * These interfaces define the contracts for all major components
 */

// ============================================================================
// Storage Interface
// ============================================================================

export interface IStorageAdapter {
  /** Initialize storage (create tables, etc.) */
  initialize(): Promise<void>;

  /** Save workflow execution state */
  saveExecution(execution: WorkflowExecution): Promise<void>;

  /** Get execution by ID */
  getExecution(executionId: string): Promise<WorkflowExecution | null>;

  /** Update execution state */
  updateExecution(
    executionId: string,
    updates: Partial<WorkflowExecution>
  ): Promise<void>;

  /** Save step result */
  saveStepResult(executionId: string, step: StepResult): Promise<void>;

  /** Get all steps for an execution */
  getSteps(executionId: string): Promise<StepResult[]>;

  /** Save context/variables */
  saveContext(executionId: string, context: Record<string, any>): Promise<void>;

  /** Get context/variables */
  getContext(executionId: string): Promise<Record<string, any>>;

  /** Query executions with filters */
  queryExecutions(filters?: ExecutionFilters): Promise<WorkflowExecution[]>;

  /** Clean up old executions */
  cleanup(olderThan: Date): Promise<number>;
}

export interface WorkflowExecution {
  id: string;
  workflowName: string;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  startedAt: Date;
  completedAt?: Date;
  currentStep?: number;
  error?: string;
  metadata: Record<string, any>;
}

export interface StepResult {
  stepIndex: number;
  stepName: string;
  action: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: Date;
  completedAt?: Date;
  output?: any;
  error?: string;
}

export interface ExecutionFilters {
  workflowName?: string;
  status?: WorkflowExecution["status"];
  startedAfter?: Date;
  startedBefore?: Date;
  limit?: number;
}

// ============================================================================
// Workflow Definition
// ============================================================================

export interface WorkflowDefinition {
  name: string;
  description?: string;
  version?: string;
  author?: string;

  /** Required MCP servers */
  mcps_required?: string[];

  /** Configuration schema for this workflow */
  config_schema?: Record<string, ConfigField>;

  /** Steps to execute */
  steps: WorkflowStep[];

  /** Timeout in milliseconds */
  timeout?: number;

  /** Prompt mode: static, dynamic, or both */
  prompt_mode?: "static" | "dynamic" | "both";
}

export interface ConfigField {
  type: "string" | "number" | "boolean" | "array" | "enum";
  description?: string;
  required?: boolean;
  default?: any;
  enum_values?: string[];
}

export interface WorkflowStep {
  /** Unique identifier for this step (optional) */
  id?: string;

  /** Action to perform (e.g., "git.commit", "ai.generate", "prompt.ask") */
  action: string;

  /** Description of what this step does */
  description?: string;

  /** Parameters for the action */
  params?: Record<string, any>;

  /** Condition to execute this step (template string) */
  if?: string;

  /** Variable name to store output */
  output?: string;

  /** Retry configuration */
  retry?: {
    attempts: number;
    delay?: number;
  };

  /** For custom code execution */
  file?: string;
}

// ============================================================================
// MCP Interface
// ============================================================================

export interface IMCPClient {
  /** Connect to an MCP server */
  connect(serverName: string, config?: MCPServerConfig): Promise<void>;

  /** Disconnect from an MCP server */
  disconnect(serverName: string): Promise<void>;

  /** Call a tool on an MCP server */
  callTool(
    serverName: string,
    toolName: string,
    params: Record<string, any>
  ): Promise<any>;

  /** List available tools for a server */
  listTools(serverName: string): Promise<MCPTool[]>;

  /** Check if server is connected */
  isConnected(serverName: string): boolean;

  /** Auto-connect to required MCP servers */
  autoConnect(requiredServers: string[]): Promise<void>;
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
}

// ============================================================================
// Security Interface
// ============================================================================

export interface ISecurityGuard {
  /** Check if an action is allowed */
  checkPermission(action: SecurityAction): Promise<PermissionResult>;

  /** Request user confirmation for dangerous operations */
  requestConfirmation(action: SecurityAction, message: string): Promise<boolean>;

  /** Validate file path is within allowed boundaries */
  validatePath(path: string, operation: "read" | "write" | "delete"): boolean;

  /** Check rate limits */
  checkRateLimit(action: string): Promise<boolean>;

  /** Estimate cost of AI operations */
  estimateCost(modelCalls: ModelCall[]): Promise<CostEstimate>;
}

export interface SecurityAction {
  type:
    | "file.read"
    | "file.write"
    | "file.delete"
    | "git.push"
    | "api.call"
    | "code.execute";
  target: string;
  params?: Record<string, any>;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

export interface ModelCall {
  model: string;
  estimatedTokens: number;
}

export interface CostEstimate {
  estimatedCost: number;
  currency: string;
  breakdown: Record<string, number>;
}

// ============================================================================
// Workflow Executor
// ============================================================================

export interface IWorkflowExecutor {
  /** Execute a workflow */
  execute(
    workflow: WorkflowDefinition,
    config: WorkflowConfig,
    context?: ExecutionContext
  ): Promise<ExecutionResult>;

  /** Pause a running workflow */
  pause(executionId: string): Promise<void>;

  /** Resume a paused workflow */
  resume(executionId: string, context?: ExecutionContext): Promise<ExecutionResult>;

  /** Cancel a running workflow */
  cancel(executionId: string): Promise<void>;

  /** Get execution status */
  getStatus(executionId: string): Promise<WorkflowExecution | null>;
}

export interface WorkflowConfig {
  /** User-provided configuration values */
  values: Record<string, any>;

  /** Execution options */
  options?: {
    dryRun?: boolean;
    verbose?: boolean;
    timeout?: number;
  };
}

export interface ExecutionContext {
  /** Variables available to the workflow */
  variables: Record<string, any>;

  /** Execution metadata */
  metadata?: Record<string, any>;

  /** Resume from step index */
  resumeFromStep?: number;

  /** Workflow call stack (for circular dependency detection) */
  callStack?: string[];
}

export interface ExecutionResult {
  executionId: string;
  status: WorkflowExecution["status"];
  output?: any;
  context?: Record<string, any>; // Alias for output (all variables after execution)
  error?: string;
  steps: StepResult[];
  duration: number;
  context?: Record<string, any>;

}

// ============================================================================
// Prompt Interface (for interactive workflows)
// ============================================================================

export interface IPromptHandler {
  /** Ask user a question and get response */
  ask(prompt: PromptRequest): Promise<PromptResponse>;

  /** Show a confirmation dialog */
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;

  /** Select from multiple options */
  select(message: string, options: string[]): Promise<string>;
}

export interface PromptRequest {
  message: string;
  type: "text" | "confirm" | "select";
  default?: any;
  options?: string[];
  /** For dynamic mode: let AI interpret the response */
  dynamic?: boolean;
}

export interface PromptResponse {
  value: any;
  interpreted?: any; // AI-interpreted value for dynamic mode
}

// ============================================================================
// Workflow Registry
// ============================================================================

export interface IWorkflowRegistry {
  /** Install a workflow from GitHub */
  install(source: string): Promise<string>;

  /** List installed workflows */
  list(): Promise<WorkflowMetadata[]>;

  /** Get workflow definition */
  get(name: string): Promise<WorkflowDefinition | null>;

  /** Update a workflow */
  update(name: string): Promise<void>;

  /** Remove a workflow */
  remove(name: string): Promise<void>;

  /** Search for workflows */
  search(query: string): Promise<WorkflowMetadata[]>;
}

export interface WorkflowMetadata {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  source?: string;
  installedAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// Model Interface (for AI interactions)
// ============================================================================

export interface IModelProvider {
  /** Generate text completion */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;

  /** Stream text completion */
  stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateOptions
  ): Promise<void>;
}

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}
