import { randomUUID } from "crypto";
import type {
  IWorkflowExecutor,
  IStorageAdapter,
  ISecurityGuard,
  IMCPClient,
  IPromptHandler,
  IModelProvider,
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
    private _security: ISecurityGuard, // Reserved for future security checks
    private mcpClient: IMCPClient,
    private promptHandler?: IPromptHandler,
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

    // Initialize context with config values and any provided variables
    const variables: Record<string, any> = {
      ...config.values,
      ...context?.variables,
    };

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
      const output = await this.executeAction(step.action, params, variables);

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

    // MCP actions
    try {
      return await this.mcpClient.callTool(namespace, actionName, params);
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
