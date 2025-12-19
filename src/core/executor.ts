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

export class WorkflowExecutor implements IWorkflowExecutor {
  constructor(
    private storage: IStorageAdapter,
    private mcpClient: IMCPClient,
    private promptHandler?: IPromptHandler,
    private _security?: ISecurityGuard, // Reserved for future security checks
    private workflowRegistry?: IWorkflowRegistry,
    private aiProvider?: IModelProvider,
  ) { }

  async execute(
    workflow: WorkflowDefinition,
    config: WorkflowConfig,
    context?: ExecutionContext,
  ): Promise<ExecutionResult> {
    const executionId = randomUUID();
    const startTime = Date.now();

    // Initialize execution record
    const execution: WorkflowExecution = {
      id: executionId,
      workflowName: workflow.name,
      status: "running",
      startedAt: new Date(),
      currentStep: 0,
      metadata: {
        config: config.values,
        ...context?.metadata,
      },
    };

    await this.storage.saveExecution(execution);

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

    try {
      // Determine starting step (for resume)
      const startStep = context?.resumeFromStep ?? 0;

      // Execute each step
      for (let i = startStep; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];

        // Update current step
        await this.storage.updateExecution(executionId, { currentStep: i });

        // Execute step
        const stepResult = await this.executeStep(
          step,
          i,
          variables,
          workflow,
          config,
          executionId,
          callStack,
        );

        steps.push(stepResult);
        await this.storage.saveStepResult(executionId, stepResult);

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

      // Mark as completed
      await this.storage.updateExecution(executionId, {
        status: "completed",
        completedAt: new Date(),
      });

      return {
        executionId,
        status: "completed",
        steps,
        duration: Date.now() - startTime,
        output: variables,
        context: variables, // Alias for easier access in composed workflows
      };
    } catch (err) {
      error = (err as Error).message;

      // Mark as failed
      await this.storage.updateExecution(executionId, {
        status: "failed",
        completedAt: new Date(),
        error,
      });

      return {
        executionId,
        status: "failed",
        error,
        steps,
        duration: Date.now() - startTime,
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

    // Get workflow definition (would need to be stored or passed)
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
  ): Promise<StepResult> {
    const stepResult: StepResult = {
      stepIndex: index,
      stepName: step.id ?? `step-${index}`,
      action: step.action,
      status: "running",
      startedAt: new Date(),
    };

    try {
      // Check condition (if specified)
      if (step.if) {
        const shouldExecute = TemplateEngine.evaluateCondition(
          step.if,
          variables,
        );
        if (!shouldExecute) {
          stepResult.status = "skipped";
          stepResult.completedAt = new Date();
          return stepResult;
        }
      }

      // Interpolate parameters
      const params = step.params
        ? TemplateEngine.interpolateObject(step.params, variables)
        : {};

      // Dry-run mode
      if (config.options?.dryRun) {
        console.log(
          `[DRY RUN] Would execute: ${step.action} with params:`,
          params,
        );
        stepResult.status = "completed";
        stepResult.output = { dryRun: true };
        stepResult.completedAt = new Date();
        return stepResult;
      }

      // Execute the action
      const output = await this.executeAction(step.action, params, variables, callStack);

      stepResult.status = "completed";
      stepResult.output = output;
      stepResult.completedAt = new Date();

      return stepResult;
    } catch (err) {
      const error = (err as Error).message;

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

        return this.executeStep(
          retryStep,
          index,
          variables,
          workflow,
          config,
          executionId,
          callStack,
        );
      }

      stepResult.status = "failed";
      stepResult.error = error;
      stepResult.completedAt = new Date();
      return stepResult;
    }
  }

  private async executeAction(
    action: string,
    params: Record<string, any>,
    variables: Record<string, any>,
    callStack: string[] = [],
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
      return this.executeWorkflowAction(actionName, params, variables, callStack);
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
      case "ask":
        return (
          await this.promptHandler.ask({
            message: params.message,
            type: "text",
            dynamic: params.dynamic ?? false,
          })
        ).value;

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
    switch (action) {
      case "info":
        console.log(`[INFO] ${params.message}`);
        return null;

      case "error":
        console.error(`[ERROR] ${params.message}`);
        return null;

      case "debug":
        if (params.verbose) {
          console.log(`[DEBUG] ${params.message}`);
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
        // Interpret user input in context
        const interpretPrompt = `Given this user input: "${params.input}"
        
Context: ${params.context || "None"}

Please interpret what the user means and extract the key information in a structured way.
Return only the interpretation, no explanation.`;

        return this.aiProvider.generate(interpretPrompt, {
          temperature: 0.3, // Lower temperature for more consistent interpretation
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
  ): Promise<any> {
    if (!this.workflowRegistry) {
      throw new Error(
        "Workflow registry not available. Cannot execute workflow composition.",
      );
    }

    switch (action) {
      case "run":
        return this.executeChildWorkflow(params, variables, callStack);

      default:
        throw new Error(`Unknown workflow action: ${action}`);
    }
  }

  private async executeChildWorkflow(
    params: Record<string, any>,
    parentVariables: Record<string, any>,
    callStack: string[],
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



    // Prepare variables to pass to child workflow
    const childVars: Record<string, any> = {};

    // If vars are explicitly provided, use them
    if (params.vars) {
      // Interpolate the vars object to resolve any {{variable}} references
      const interpolatedVars = TemplateEngine.interpolateObject(
        params.vars,
        parentVariables,
      );
      Object.assign(childVars, interpolatedVars);
    }

    // Create new call stack with current workflow added
    const newCallStack = [...callStack, workflowName];

    // Execute child workflow with isolated context and call stack
    const childResult = await this.execute(
      childWorkflow,
      { values: childVars },
      { variables: {}, callStack: newCallStack },
    );

    // Check if child execution failed and propagate error
    if (childResult.status === "failed") {
      throw new Error(
        `Child workflow '${workflowName}' failed: ${childResult.error}`,
      );
    }

    // Return the child workflow's context (all variables)
    return childResult.context;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Checks if a shell command result contains a non-zero exit code and throws an error if so.
   * The shell MCP server returns results in the format:
   * "exit_code: 0\nstdout: ...\nstderr: ..."
   */
  private checkShellExitCode(result: any, action: string): void {
    // Handle different result formats
    let resultText: string;

    if (typeof result === "string") {
      resultText = result;
    } else if (result && typeof result === "object") {
      // Result might be in result.content, result.result, or directly contain exit_code
      resultText = result.content || result.result || JSON.stringify(result);
    } else {
      // Can't parse, assume success
      return;
    }

    // Look for exit_code in the response
    const exitCodeMatch = resultText.match(/exit_code:\s*(\d+)/);

    if (exitCodeMatch) {
      const exitCode = parseInt(exitCodeMatch[1], 10);

      if (exitCode !== 0) {
        // Extract stderr if available for better error message
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

  /**
   * Formats shell command results to return clean stdout/stderr instead of raw JSON.
   * The shell MCP server returns results in the format:
   * { result: "exit_code: 0\nstdout: ...\nstderr: ..." }
   * 
   * This method parses that and returns just the relevant output.
   */
  private formatShellResult(result: any): string {
    // Handle different result formats
    let resultText: string;
    
    if (typeof result === "string") {
      resultText = result;
    } else if (result && typeof result === "object") {
      // Result might be in result.content, result.result, or directly contain exit_code
      resultText = result.content || result.result || JSON.stringify(result);
    } else {
      // Can't parse, return as is
      return result;
    }

    // Extract stdout and stderr using more precise regex
    const stdoutMatch = resultText.match(/stdout:\s*([\s\S]*?)(?=\nstderr:|$)/);
    const stderrMatch = resultText.match(/stderr:\s*([\s\S]*?)(?=\nexit_code:|$)/);
    
    let output = "";
    
    if (stdoutMatch) {
      let stdout = stdoutMatch[1].trim();
      
      // Clean up YAML-style multiline strings (|, |+, |-)
      stdout = stdout.replace(/^\|[+-]?\s*\n/, '');
      
      // Remove surrounding quotes (handle both single and double quotes)
      stdout = stdout.replace(/^["']|["']$/g, '');
      
      // Unescape common escape sequences
      stdout = stdout
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\e\[\d+m/g, '') // Remove ANSI color codes like \e[32m
        .replace(/\\e\[[\d;]+m/g, ''); // Remove complex ANSI codes
      
      // Clean up any remaining escaped characters or extra whitespace
      stdout = stdout.trim();
      
      output += stdout;
    }
    
    if (stderrMatch) {
      let stderr = stderrMatch[1].trim();
      
      // Clean up YAML-style multiline strings
      stderr = stderr.replace(/^\|[+-]?\s*\n/, '');
      
      // Remove surrounding quotes
      stderr = stderr.replace(/^["']|["']$/g, '');
      
      // Unescape escape sequences
      stderr = stderr
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\e\[\d+m/g, '')
        .replace(/\\e\[[\d;]+m/g, '');
      
      stderr = stderr.trim();
      
      // Only include stderr if it has actual content
      if (stderr && stderr !== "''" && stderr !== '""' && stderr !== '') {
        if (output) output += "\n";
        output += `[stderr]\n${stderr}`;
      }
    }
    
    return output || resultText;
  }
}
