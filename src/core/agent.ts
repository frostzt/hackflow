import type {
  IStorageAdapter,
  ISecurityGuard,
  IMCPClient,
  IPromptHandler,
  IModelProvider,
  IWorkflowExecutor,
  WorkflowDefinition,
  WorkflowConfig,
  ExecutionResult,
} from "../types/index.js";
import { WorkflowExecutor, type ProgressHandler } from "./executor.js";
import { WorkflowLoader } from "../workflows/loader.js";
import { WorkflowRegistry } from "../workflows/registry.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

/**
 * Main Agent class - the entry point for workflow execution
 */
export class HackflowAgent {
  private executor: WorkflowExecutor;
  private registry: WorkflowRegistry;

  constructor(
    private storage: IStorageAdapter,
    private _security: ISecurityGuard, // Reserved for future use
    private mcpClient: IMCPClient,
    private promptHandler?: IPromptHandler,
    private _aiProvider?: IModelProvider, // Passed to executor
  ) {
    // Create workflow registry with default workflows directory
    // Use absolute path relative to hackflow installation (dist/core/agent.js)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const workflowsPath = join(__dirname, "../../workflows");
    this.registry = new WorkflowRegistry(workflowsPath);
    
    this.executor = new WorkflowExecutor(
      storage,
      mcpClient,
      promptHandler,
      _security,
      this.registry, // Pass registry to executor for workflow composition
      _aiProvider,
    );
  }

  /**
   * Register a progress handler to receive real-time execution updates
   */
  onProgress(handler: ProgressHandler): void {
    this.executor.onProgress(handler);
  }

  /**
   * Remove a progress handler
   */
  offProgress(handler: ProgressHandler): void {
    this.executor.offProgress(handler);
  }

  /**
   * Initialize the agent (setup storage, etc.)
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
  }

  /**
   * Execute a workflow from a file
   */
  async runWorkflowFile(
    filePath: string,
    config: WorkflowConfig,
  ): Promise<ExecutionResult> {
    const workflow = WorkflowLoader.loadFromFile(filePath);
    return this.runWorkflow(workflow, config);
  }

  /**
   * Execute a workflow by name (searches registry)
   * Falls back to file path if name not found in registry
   */
  async runWorkflowByName(
    nameOrPath: string,
    config: WorkflowConfig,
  ): Promise<ExecutionResult> {
    // First, try to find in registry
    const workflow = await this.registry.get(nameOrPath);
    
    if (workflow) {
      return this.runWorkflow(workflow, config);
    }

    // Fall back to file path
    // Check if it looks like a file path
    if (nameOrPath.includes("/") || nameOrPath.endsWith(".yaml") || nameOrPath.endsWith(".yml")) {
      return this.runWorkflowFile(nameOrPath, config);
    }

    throw new Error(
      `Workflow "${nameOrPath}" not found. ` +
      `Use "hackflow install ${nameOrPath}" to install it, or provide a file path.`
    );
  }

  /**
   * Get the workflow registry
   */
  getRegistry(): WorkflowRegistry {
    return this.registry;
  }

  /**
   * Get the storage adapter (for UI server, etc.)
   */
  getStorage(): IStorageAdapter {
    return this.storage;
  }

  /**
   * Execute a workflow definition
   */
  async runWorkflow(
    workflow: WorkflowDefinition,
    config: WorkflowConfig,
  ): Promise<ExecutionResult> {
    // Auto-connect to required MCP servers
    if (workflow.mcps_required) {
      await this.mcpClient.autoConnect(workflow.mcps_required);
    }

    // Apply default values from config_schema for missing variables
    const configWithDefaults = this.applyConfigDefaults(workflow, config);

    // Execute the workflow
    return this.executor.execute(workflow, configWithDefaults);
  }

  /**
   * Apply default values from workflow config_schema
   */
  private applyConfigDefaults(
    workflow: WorkflowDefinition,
    config: WorkflowConfig,
  ): WorkflowConfig {
    if (!workflow.config_schema) {
      return config;
    }

    const valuesWithDefaults = { ...config.values };

    // Apply defaults for each config schema entry
    for (const [key, schema] of Object.entries(workflow.config_schema)) {
      // Only apply default if:
      // 1. Variable is not already set
      // 2. Schema has a default value
      // 3. Required is false (or not specified, which defaults to false)
      if (
        valuesWithDefaults[key] === undefined &&
        schema.default !== undefined &&
        schema.required !== true
      ) {
        valuesWithDefaults[key] = schema.default;
      }
    }

    return {
      ...config,
      values: valuesWithDefaults,
    };
  }

  /**
   * List recent workflow executions (root only by default)
   */
  async listExecutions(workflowName?: string, limit: number = 10, includeChildren: boolean = false) {
    return this.storage.queryExecutions({
      workflowName,
      limit,
      rootOnly: !includeChildren,
    });
  }

  /**
   * Get execution details
   */
  async getExecution(executionId: string) {
    const execution = await this.storage.getExecution(executionId);
    if (!execution) {
      return null;
    }

    const steps = await this.storage.getSteps(executionId);
    const context = await this.storage.getContext(executionId);

    return {
      execution,
      steps,
      context,
    };
  }

  /**
   * Get full execution tree (execution + all children recursively)
   */
  async getExecutionTree(executionId: string) {
    return this.storage.getExecutionTree(executionId);
  }

  /**
   * Get child executions of a parent
   */
  async getChildExecutions(parentExecutionId: string) {
    return this.storage.getChildExecutions(parentExecutionId);
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(executionId: string): Promise<ExecutionResult> {
    return this.executor.resume(executionId);
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(executionId: string): Promise<void> {
    await this.executor.cancel(executionId);
  }

  /**
   * Clean up old executions
   */
  async cleanup(daysOld: number = 30): Promise<number> {
    const date = new Date();
    date.setDate(date.getDate() - daysOld);
    return this.storage.cleanup(date);
  }

  /**
   * Close connections and cleanup
   */
  async shutdown(): Promise<void> {
    // Disconnect all MCP servers
    if (this.mcpClient && "disconnectAll" in this.mcpClient) {
      await (this.mcpClient as any).disconnectAll();
    }

    // Close prompt handler if available
    if (this.promptHandler && "close" in this.promptHandler) {
      (this.promptHandler as any).close();
    }

    // Close storage if available
    if (this.storage && "close" in this.storage) {
      (this.storage as any).close();
    }
  }
}
