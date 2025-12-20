import { randomUUID } from "crypto";
import type {
  IWorkflowExecutor,
  IStorageAdapter,
  ISecurityGuard,
  IMCPClient,
  IPromptHandler,
  IModelProvider,
  IWorkflowRegistry,
  WorkflowDefinition,
  WorkflowConfig,
  ExecutionContext,
  ExecutionResult,
  WorkflowExecution,
  StepResult,
  WorkflowStep,
} from "../types/index.js";
import { TemplateEngine } from "../workflows/template.js";

/** Event emitter for real-time progress updates */
export type ProgressEventType = 
  | "execution:start"
  | "execution:complete"
  | "execution:failed"
  | "step:start"
  | "step:complete"
  | "step:failed"
  | "step:skipped"
  | "child:start"
  | "child:complete";

export interface ProgressEvent {
  type: ProgressEventType;
  executionId: string;
  workflowName: string;
  timestamp: Date;
  depth: number;
  data?: {
    stepIndex?: number;
    stepName?: string;
    action?: string;
    description?: string;
    duration?: number;
    error?: string;
    childExecutionId?: string;
    output?: any;
  };
}

export type ProgressHandler = (event: ProgressEvent) => void;

export class WorkflowExecutor implements IWorkflowExecutor {
  private progressHandlers: ProgressHandler[] = [];

  constructor(
    private storage: IStorageAdapter,
    private mcpClient: IMCPClient,
    private promptHandler?: IPromptHandler,
    private _security?: ISecurityGuard,
    private workflowRegistry?: IWorkflowRegistry,
    private aiProvider?: IModelProvider,
  ) {}

  /** Register a progress handler for real-time updates */
  onProgress(handler: ProgressHandler): void {
    this.progressHandlers.push(handler);
  }

  /** Remove a progress handler */
  offProgress(handler: ProgressHandler): void {
    this.progressHandlers = this.progressHandlers.filter(h => h !== handler);
  }

  /** Emit a progress event to all handlers */
  private emitProgress(event: ProgressEvent): void {
    for (const handler of this.progressHandlers) {
      try {
        handler(event);
      } catch (e) {
        // Don't let handler errors break execution
        console.error("Progress handler error:", e);
      }
    }
  }

  async execute(
    workflow: WorkflowDefinition,
    config: WorkflowConfig,
    context?: ExecutionContext,
  ): Promise<ExecutionResult> {
    const executionId = randomUUID();
    const startTime = Date.now();
    const depth = context?.depth ?? 0;

    // Initialize execution record with all new fields
    const execution: WorkflowExecution = {
      id: executionId,
      workflowName: workflow.name,
      status: "running",
      startedAt: new Date(),
      currentStep: 0,
      totalSteps: workflow.steps.length,
      depth,
      parentExecutionId: context?.parentExecutionId,
      parentStepIndex: context?.parentStepIndex,
      trigger: context?.trigger ?? { type: "cli" },
      metadata: {
        config: config.values,
        ...context?.metadata,
      },
    };

    await this.storage.saveExecution(execution);

    // Emit start event
    this.emitProgress({
      type: "execution:start",
      executionId,
      workflowName: workflow.name,
      timestamp: new Date(),
      depth,
    });

    // Apply defaults from config_schema first
    const defaults: Record<string, any> = {};
    if (workflow.config_schema) {
      for (const [key, field] of Object.entries(workflow.config_schema)) {
        if (field.default !== undefined) {
          defaults[key] = field.default;
        }
      }
    }

    // Initialize context with defaults, then config values, then any provided variables
    const variables: Record<string, any> = {
      ...defaults,
      ...config.values,
      ...context?.variables,
    };

    // Initialize call stack for circular dependency detection
    const callStack = context?.callStack ?? [];

    await this.storage.saveContext(executionId, variables);

    const steps: StepResult[] = [];
    let error: string | undefined;
    let errorStack: string | undefined;

    try {
      // Determine starting step (for resume)
      const startStep = context?.resumeFromStep ?? 0;

      // Execute each step
      for (let i = startStep; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];

        // Update current step
        await this.storage.updateExecution(executionId, { currentStep: i });

        // Execute step with full context
        const stepResult = await this.executeStep(
          step,
          i,
          variables,
          workflow,
          config,
          executionId,
          callStack,
          depth,
        );

        steps.push(stepResult);
        await this.storage.saveStepResult(executionId, stepResult);

        // Emit step event
        this.emitProgress({
          type: stepResult.status === "completed" ? "step:complete" 
               : stepResult.status === "skipped" ? "step:skipped"
               : "step:failed",
          executionId,
          workflowName: workflow.name,
          timestamp: new Date(),
          depth,
          data: {
            stepIndex: i,
            stepName: stepResult.stepName,
            action: stepResult.action,
            description: stepResult.description,
            duration: stepResult.duration,
            error: stepResult.error,
            childExecutionId: stepResult.childExecutionId,
          },
        });

        // If step failed and no retry, stop execution
        if (stepResult.status === "failed") {
          throw new Error(
            `Step ${i} (${step.action}) failed: ${stepResult.error}`,
          );
        }

        // If step was skipped, continue
        if (stepResult.status === "skipped") {
          continue;
        }

        // Store output in variables
        if (step.output && stepResult.output !== undefined) {
          variables[step.output] = stepResult.output;
          await this.storage.saveContext(executionId, variables);
        }

        // Check for timeout
        if (workflow.timeout && Date.now() - startTime > workflow.timeout) {
          throw new Error(`Workflow timeout after ${workflow.timeout}ms`);
        }
      }

      const duration = Date.now() - startTime;

      // Mark as completed
      await this.storage.updateExecution(executionId, {
        status: "completed",
        completedAt: new Date(),
        duration,
      });

      // Emit completion event
      this.emitProgress({
        type: "execution:complete",
        executionId,
        workflowName: workflow.name,
        timestamp: new Date(),
        depth,
        data: { duration },
      });

      return {
        executionId,
        status: "completed",
        steps,
        duration,
        output: variables,
        context: variables,
      };
    } catch (err) {
      error = (err as Error).message;
      errorStack = (err as Error).stack;
      const duration = Date.now() - startTime;

      // Mark as failed
      await this.storage.updateExecution(executionId, {
        status: "failed",
        completedAt: new Date(),
        error,
        errorStack,
        duration,
      });

      // Emit failure event
      this.emitProgress({
        type: "execution:failed",
        executionId,
        workflowName: workflow.name,
        timestamp: new Date(),
        depth,
        data: { error, duration },
      });

      return {
        executionId,
        status: "failed",
        error,
        steps,
        duration,
      };
    }
  }

  async pause(executionId: string): Promise<void> {
    await this.storage.updateExecution(executionId, {
      status: "paused",
    });
  }

  async resume(
    executionId: string,
    context?: ExecutionContext,
  ): Promise<ExecutionResult> {
    const execution = await this.storage.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== "paused") {
      throw new Error(
        `Cannot resume execution with status: ${execution.status}`,
      );
    }

    throw new Error("Resume not yet fully implemented - needs workflow lookup");
  }

  async cancel(executionId: string): Promise<void> {
    await this.storage.updateExecution(executionId, {
      status: "cancelled",
      completedAt: new Date(),
    });
  }

  async getStatus(executionId: string): Promise<WorkflowExecution | null> {
    return this.storage.getExecution(executionId);
  }

  // Private methods

  private async executeStep(
    step: WorkflowStep,
    index: number,
    variables: Record<string, any>,
    workflow: WorkflowDefinition,
    config: WorkflowConfig,
    executionId: string,
    callStack: string[] = [],
    depth: number = 0,
  ): Promise<StepResult> {
    const stepStartTime = Date.now();
    
    const stepResult: StepResult = {
      stepIndex: index,
      stepName: step.id ?? `step-${index}`,
      action: step.action,
      description: step.description,
      status: "running",
      startedAt: new Date(),
      retryAttempt: 0,
    };

    // Emit step start event
    this.emitProgress({
      type: "step:start",
      executionId,
      workflowName: workflow.name,
      timestamp: new Date(),
      depth,
      data: {
        stepIndex: index,
        stepName: stepResult.stepName,
        action: step.action,
        description: step.description,
      },
    });

    try {
      // Check condition (if specified)
      if (step.if) {
        const shouldExecute = TemplateEngine.evaluateCondition(
          step.if,
          variables,
        );
        if (!shouldExecute) {
          stepResult.status = "skipped";
          stepResult.skipReason = `Condition not met: ${step.if}`;
          stepResult.completedAt = new Date();
          stepResult.duration = Date.now() - stepStartTime;
          return stepResult;
        }
      }

      // Interpolate parameters and store as input
      const params = step.params
        ? TemplateEngine.interpolateObject(step.params, variables)
        : {};
      
      stepResult.input = params;

      // Dry-run mode
      if (config.options?.dryRun) {
        console.log(
          `[DRY RUN] Would execute: ${step.action} with params:`,
          params,
        );
        stepResult.status = "completed";
        stepResult.output = { dryRun: true };
        stepResult.completedAt = new Date();
        stepResult.duration = Date.now() - stepStartTime;
        return stepResult;
      }

      // Execute the action
      const output = await this.executeAction(
        step.action,
        params,
        variables,
        callStack,
        executionId,
        index,
        depth,
      );

      stepResult.status = "completed";
      stepResult.output = output;
      stepResult.completedAt = new Date();
      stepResult.duration = Date.now() - stepStartTime;

      // If this was a workflow.run action, the childExecutionId is in the output
      if (step.action === "workflow.run" && output?._childExecutionId) {
        stepResult.childExecutionId = output._childExecutionId;
        delete output._childExecutionId;
      }

      return stepResult;
    } catch (err) {
      const error = (err as Error).message;
      const errorStack = (err as Error).stack;

      // Check if we should retry
      if (step.retry && step.retry.attempts > 0) {
        console.log(
          `Step failed, retrying (${step.retry.attempts} attempts remaining)...`,
        );

        if (step.retry.delay) {
          await this.sleep(step.retry.delay);
        }

        // Retry by recursing with decremented retry count
        const retryStep = {
          ...step,
          retry: {
            ...step.retry,
            attempts: step.retry.attempts - 1,
          },
        };

        const retryResult = await this.executeStep(
          retryStep,
          index,
          variables,
          workflow,
          config,
          executionId,
          callStack,
          depth,
        );
        
        retryResult.retryAttempt = (stepResult.retryAttempt ?? 0) + 1;
        return retryResult;
      }

      stepResult.status = "failed";
      stepResult.error = error;
      stepResult.errorStack = errorStack;
      stepResult.completedAt = new Date();
      stepResult.duration = Date.now() - stepStartTime;
      return stepResult;
    }
  }

  private async executeAction(
    action: string,
    params: Record<string, any>,
    variables: Record<string, any>,
    callStack: string[] = [],
    executionId?: string,
    stepIndex?: number,
    depth: number = 0,
  ): Promise<any> {
    // Parse action (format: "namespace.action")
    const [namespace, actionName] = action.split(".");

    if (!actionName) {
      throw new Error(
        `Invalid action format: ${action}. Expected "namespace.action"`,
      );
    }

    // Built-in actions
    if (namespace === "prompt") {
      return this.executePromptAction(actionName, params);
    }

    if (namespace === "variable") {
      return this.executeVariableAction(actionName, params, variables);
    }

    if (namespace === "log") {
      return this.executeLogAction(actionName, params);
    }

    if (namespace === "ai") {
      return this.executeAIAction(actionName, params);
    }

    if (namespace === "workflow") {
      return this.executeWorkflowAction(
        actionName,
        params,
        variables,
        callStack,
        executionId,
        stepIndex,
        depth,
      );
    }

    // MCP actions
    try {
      const result = await this.mcpClient.callTool(namespace, actionName, params);

      // Special handling for shell commands: check exit codes and format output
      if (namespace === "shell" && result) {
        this.checkShellExitCode(result, action);
        return this.formatShellResult(result);
      }

      return result;
    } catch (err) {
      throw new Error(
        `Failed to execute action ${action}: ${(err as Error).message}`,
      );
    }
  }

  private async executePromptAction(
    action: string,
    params: Record<string, any>,
  ): Promise<any> {
    if (!this.promptHandler) {
      throw new Error("Prompt handler not available");
    }

    switch (action) {
      case "ask": {
        const response = await this.promptHandler.ask({
          message: params.message,
          type: "text",
          default: params.default,
          dynamic: params.dynamic ?? false,
        });
        // If user entered nothing and we have a default, use the default
        const value = response.value;
        if ((value === "" || value === undefined || value === null) && params.default !== undefined) {
          return params.default;
        }
        return value;
      }

      case "confirm":
        return this.promptHandler.confirm(params.message, params.default);

      case "select":
        return this.promptHandler.select(params.message, params.options);

      default:
        throw new Error(`Unknown prompt action: ${action}`);
    }
  }

  private executeVariableAction(
    action: string,
    params: Record<string, any>,
    variables: Record<string, any>,
  ): any {
    switch (action) {
      case "set":
        variables[params.name] = params.value;
        return params.value;

      case "get":
        return variables[params.name];

      default:
        throw new Error(`Unknown variable action: ${action}`);
    }
  }

  private executeLogAction(action: string, params: Record<string, any>): any {
    // Format the message - if it contains JSON, try to make it readable
    const formatMessage = (msg: string): string => {
      if (!msg) return "";
      
      // Check if message looks like it contains JSON object/array
      const trimmed = msg.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
          const parsed = JSON.parse(trimmed);
          // Extract just the useful content
          if (parsed.result) {
            return typeof parsed.result === "string" 
              ? parsed.result 
              : JSON.stringify(parsed.result, null, 2);
          }
          return JSON.stringify(parsed, null, 2);
        } catch {
          // Not valid JSON, return as-is
        }
      }
      
      // Check if message contains embedded JSON (like "Status: {...}")
      const jsonMatch = msg.match(/^([^{]*?)(\{[\s\S]*\})$/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[2]);
          const prefix = jsonMatch[1].trim();
          const content = parsed.result || parsed;
          const formatted = typeof content === "string" 
            ? content 
            : JSON.stringify(content, null, 2);
          return prefix ? `${prefix}\n${formatted}` : formatted;
        } catch {
          // Not valid JSON
        }
      }
      
      return msg;
    };
    
    switch (action) {
      case "info":
        console.log(`[INFO] ${formatMessage(params.message)}`);
        return null;

      case "error":
        console.error(`[ERROR] ${formatMessage(params.message)}`);
        return null;

      case "debug":
        if (params.verbose) {
          console.log(`[DEBUG] ${formatMessage(params.message)}`);
        }
        return null;

      default:
        throw new Error(`Unknown log action: ${action}`);
    }
  }

  private async executeAIAction(
    action: string,
    params: Record<string, any>,
  ): Promise<any> {
    if (!this.aiProvider) {
      throw new Error(
        "AI provider not available. Set ANTHROPIC_API_KEY or provide AI config.",
      );
    }

    switch (action) {
      case "generate":
        return this.aiProvider.generate(params.prompt, {
          model: params.model,
          temperature: params.temperature,
          maxTokens: params.max_tokens,
          systemPrompt: params.system,
        });

      case "interpret":
        const interpretPrompt = `Given this user input: "${params.input}"
        
Context: ${params.context || "None"}

Please interpret what the user means and extract the key information in a structured way.
Return only the interpretation, no explanation.`;

        return this.aiProvider.generate(interpretPrompt, {
          temperature: 0.3,
          maxTokens: 500,
        });

      case "summarize":
        return this.aiProvider.generate(
          `Summarize the following:\n\n${params.text}`,
          {
            temperature: 0.5,
            maxTokens: params.max_length || 200,
          },
        );

      default:
        throw new Error(`Unknown AI action: ${action}`);
    }
  }

  private async executeWorkflowAction(
    action: string,
    params: Record<string, any>,
    variables: Record<string, any>,
    callStack: string[],
    parentExecutionId?: string,
    parentStepIndex?: number,
    parentDepth: number = 0,
  ): Promise<any> {
    if (!this.workflowRegistry) {
      throw new Error(
        "Workflow registry not available. Cannot execute workflow composition.",
      );
    }

    switch (action) {
      case "run":
        return this.executeChildWorkflow(
          params,
          variables,
          callStack,
          parentExecutionId,
          parentStepIndex,
          parentDepth,
        );

      default:
        throw new Error(`Unknown workflow action: ${action}`);
    }
  }

  private async executeChildWorkflow(
    params: Record<string, any>,
    parentVariables: Record<string, any>,
    callStack: string[],
    parentExecutionId?: string,
    parentStepIndex?: number,
    parentDepth: number = 0,
  ): Promise<any> {
    const workflowName = params.workflow;

    if (!workflowName) {
      throw new Error(
        "workflow.run requires a 'workflow' parameter specifying the workflow name",
      );
    }

    // Circular dependency detection
    if (callStack.includes(workflowName)) {
      throw new Error(
        `Circular dependency detected: ${callStack.join(" → ")} → ${workflowName}`,
      );
    }

    // Load the child workflow
    const childWorkflow = await this.workflowRegistry!.get(workflowName);

    if (!childWorkflow) {
      throw new Error(
        `Workflow '${workflowName}' not found. Make sure it's registered or available in the workflows directory.`,
      );
    }

    // Emit child start event
    this.emitProgress({
      type: "child:start",
      executionId: parentExecutionId || "",
      workflowName: childWorkflow.name,
      timestamp: new Date(),
      depth: parentDepth + 1,
    });

    // Prepare variables to pass to child workflow
    const childVars: Record<string, any> = {};

    if (params.vars) {
      const interpolatedVars = TemplateEngine.interpolateObject(
        params.vars,
        parentVariables,
      );
      Object.assign(childVars, interpolatedVars);
    }

    // Create new call stack with current workflow added
    const newCallStack = [...callStack, workflowName];

    // Execute child workflow with parent context for tracking
    const childResult = await this.execute(
      childWorkflow,
      { values: childVars },
      {
        variables: {},
        callStack: newCallStack,
        parentExecutionId,
        parentStepIndex,
        depth: parentDepth + 1,
        trigger: { type: "workflow", source: callStack[callStack.length - 1] },
      },
    );

    // Emit child complete event
    this.emitProgress({
      type: "child:complete",
      executionId: parentExecutionId || "",
      workflowName: childWorkflow.name,
      timestamp: new Date(),
      depth: parentDepth + 1,
      data: {
        childExecutionId: childResult.executionId,
        duration: childResult.duration,
        error: childResult.error,
      },
    });

    // Check if child execution failed and propagate error
    if (childResult.status === "failed") {
      throw new Error(
        `Child workflow '${workflowName}' failed: ${childResult.error}`,
      );
    }

    // Return the child workflow's context with execution ID attached
    return {
      ...childResult.context,
      _childExecutionId: childResult.executionId,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private checkShellExitCode(result: any, action: string): void {
    let resultText: string;

    if (typeof result === "string") {
      resultText = result;
    } else if (result && typeof result === "object") {
      resultText = result.content || result.result || JSON.stringify(result);
    } else {
      return;
    }

    const exitCodeMatch = resultText.match(/exit_code:\s*(\d+)/);

    if (exitCodeMatch) {
      const exitCode = parseInt(exitCodeMatch[1], 10);

      if (exitCode !== 0) {
        const stderrMatch = resultText.match(/stderr:\s*(.+?)(?=\n(?:exit_code|stdout|stderr):|$)/s);
        const stdoutMatch = resultText.match(/stdout:\s*(.+?)(?=\n(?:exit_code|stdout|stderr):|$)/s);

        const stderr = stderrMatch ? stderrMatch[1].trim() : "";
        const stdout = stdoutMatch ? stdoutMatch[1].trim() : "";

        let errorMessage = `Shell command failed with exit code ${exitCode}`;

        if (stderr) {
          errorMessage += `\nError output: ${stderr}`;
        } else if (stdout) {
          errorMessage += `\nOutput: ${stdout}`;
        }

        throw new Error(errorMessage);
      }
    }
  }

  private formatShellResult(result: any): string {
    let resultText: string;
    
    if (typeof result === "string") {
      resultText = result;
    } else if (result && typeof result === "object") {
      resultText = result.content || result.result || JSON.stringify(result);
    } else {
      return result;
    }

    const stdoutMatch = resultText.match(/stdout:\s*([\s\S]*?)(?=\nstderr:|$)/);
    const stderrMatch = resultText.match(/stderr:\s*([\s\S]*?)(?=\nexit_code:|$)/);
    
    let output = "";
    
    if (stdoutMatch) {
      let stdout = stdoutMatch[1].trim();
      stdout = stdout.replace(/^\|[+-]?\s*\n/, '');
      stdout = stdout.replace(/^["']|["']$/g, '');
      stdout = stdout
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\e\[\d+m/g, '')
        .replace(/\\e\[[\d;]+m/g, '');
      stdout = stdout.trim();
      output += stdout;
    }
    
    if (stderrMatch) {
      let stderr = stderrMatch[1].trim();
      stderr = stderr.replace(/^\|[+-]?\s*\n/, '');
      stderr = stderr.replace(/^["']|["']$/g, '');
      stderr = stderr
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\e\[\d+m/g, '')
        .replace(/\\e\[[\d;]+m/g, '');
      stderr = stderr.trim();
      
      if (stderr && stderr !== "''" && stderr !== '""' && stderr !== '') {
        if (output) output += "\n";
        output += `[stderr]\n${stderr}`;
      }
    }
    
    return output || resultText;
  }
}
