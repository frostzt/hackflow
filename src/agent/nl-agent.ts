/**
 * Natural Language Agent - The main orchestrator
 * 
 * This is the brain of Hackflow's natural language interface.
 * It understands user requests, creates plans, asks for missing info,
 * and executes workflows.
 */

import type { 
  IModelProvider, 
  WorkflowDefinition,
  ExecutionResult,
  WorkflowConfig,
} from "../types/index.js";
import type { WorkflowRegistry } from "../workflows/registry.js";
import type { HackflowAgent } from "../core/agent.js";
import { IntentParser } from "./intent.js";
import { Planner } from "./planner.js";
import { ContextManager } from "./context.js";
import type { 
  ParsedIntent, 
  ExecutionPlan, 
  AgentConfig,
  Message,
  MissingParam,
  UsagePattern,
} from "./types.js";
import { DEFAULT_AGENT_CONFIG } from "./types.js";
import { LearningManager } from "./learning.js";

export interface NLAgentCallbacks {
  /** Called when the agent wants to show output */
  onOutput: (text: string) => void;
  
  /** Called when the agent needs user input */
  onInput: (prompt: string) => Promise<string>;
  
  /** Called when showing a plan for confirmation */
  onPlanPreview: (plan: ExecutionPlan) => void;
  
  /** Called to confirm execution */
  onConfirm: (message: string) => Promise<boolean>;
  
  /** Called when execution starts */
  onExecutionStart: (workflowName: string) => void;
  
  /** Called when execution completes */
  onExecutionComplete: (result: ExecutionResult) => void;
  
  /** Called for asking missing parameters */
  onAskParam: (param: MissingParam) => Promise<string>;
}

export class NLAgent {
  private intentParser: IntentParser;
  private planner: Planner;
  private contextManager: ContextManager;
  private learningManager: LearningManager;
  private config: AgentConfig;

  constructor(
    private hackflowAgent: HackflowAgent,
    private aiProvider: IModelProvider,
    private callbacks: NLAgentCallbacks,
    config: Partial<AgentConfig> = {},
  ) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    
    const registry = hackflowAgent.getRegistry();
    const mcpClient = (hackflowAgent as any).mcpClient; // Access internal MCP client
    
    this.intentParser = new IntentParser(aiProvider, registry);
    this.planner = new Planner(aiProvider, registry, mcpClient);
    this.contextManager = new ContextManager(config);
    this.learningManager = new LearningManager();
  }

  /**
   * Process a user message and take appropriate action
   */
  async process(input: string): Promise<void> {
    // Refresh environment context
    this.contextManager.refreshEnvironment();
    
    // Add to history
    this.contextManager.addUserMessage(input);

    try {
      // Parse the intent
      const intent = await this.parseIntent(input);
      
      // Handle based on intent type
      switch (intent.type) {
        case "command":
          await this.handleSlashCommand(intent);
          break;
        
        case "execute":
        case "chain":
          await this.handleExecution(intent);
          break;
        
        case "query":
          await this.handleQuery(intent);
          break;
        
        case "clarify":
          await this.handleClarification(intent);
          break;
        
        case "chat":
          await this.handleChat(intent);
          break;
        
        default:
          this.callbacks.onOutput("I'm not sure what you want to do. Could you rephrase that?");
      }
    } catch (error) {
      const message = `Error: ${(error as Error).message}`;
      this.callbacks.onOutput(message);
      this.contextManager.addAssistantMessage(message);
    }
  }

  /**
   * Parse user input into an intent
   */
  private async parseIntent(input: string): Promise<ParsedIntent> {
    const environment = this.contextManager.getEnvironment();
    const history = this.contextManager.buildHistoryString(5);
    
    // Check for learned shortcuts first
    if (this.config.enableLearning) {
      const shortcut = this.learningManager.getShortcut(input);
      if (shortcut) {
        const registry = this.hackflowAgent.getRegistry();
        const workflow = await registry.get(shortcut);
        if (workflow) {
          return {
            type: "execute",
            confidence: 1.0,
            originalInput: input,
            matchedWorkflows: [{
              workflow: { name: shortcut },
              score: 1.0,
              extractedParams: this.learningManager.getDefaultParams(shortcut),
              missingRequiredParams: [],
            }],
            extractedParams: this.learningManager.getDefaultParams(shortcut),
          };
        }
      }
    }
    
    // Try quick match first for common patterns
    const quickMatch = await this.intentParser.quickMatch(input);
    if (quickMatch && quickMatch.score > 0.8) {
      // Merge with learned default params
      if (this.config.enableLearning && quickMatch.workflow.name) {
        const defaultParams = this.learningManager.getDefaultParams(quickMatch.workflow.name);
        quickMatch.extractedParams = { ...defaultParams, ...quickMatch.extractedParams };
      }
      
      return {
        type: "execute",
        confidence: quickMatch.score,
        originalInput: input,
        matchedWorkflows: [quickMatch],
        extractedParams: quickMatch.extractedParams,
        missingParams: quickMatch.missingRequiredParams.map(p => ({
          name: p,
          type: "string",
          required: true,
          workflow: quickMatch.workflow.name,
        })),
      };
    }

    // Full AI-powered parsing
    return this.intentParser.parse(input, environment, history);
  }

  /**
   * Handle execution intents (single workflow or chain)
   */
  private async handleExecution(intent: ParsedIntent): Promise<void> {
    // Check if we have any workflow matches
    if (intent.matchedWorkflows.length === 0) {
      // Try to create an ephemeral workflow
      intent.type = "create";
      return this.handleEphemeralCreation(intent);
    }

    const bestMatch = intent.matchedWorkflows[0];
    
    // If confidence is low and user had specific modifiers, offer clarification
    if (bestMatch.score < 0.6 && (intent.scopeModifier || intent.exclusions)) {
      return this.handleLowConfidenceWithModifiers(intent);
    }
    
    // If we have multiple matches with similar scores, ask for clarification
    if (intent.matchedWorkflows.length > 1) {
      const secondBest = intent.matchedWorkflows[1];
      if (secondBest && bestMatch.score - secondBest.score < 0.1) {
        // Scores are very close, ask user to choose
        return this.handleAmbiguousMatch(intent);
      }
    }

    // Create execution plan
    const plan = await this.planner.createPlan(
      intent,
      this.contextManager.getEnvironment(),
    );

    // Check for missing required parameters
    const missingParams = this.collectMissingParams(plan);
    if (missingParams.length > 0) {
      // Ask for missing parameters
      await this.askForMissingParams(plan, missingParams);
    }

    // Show the plan
    this.callbacks.onPlanPreview(plan);

    // Check if workflow is auto-confirmed
    const shouldAutoConfirm = this.config.enableLearning && 
      plan.steps.length === 1 && 
      plan.steps[0].workflowName &&
      this.learningManager.isAutoConfirm(plan.steps[0].workflowName);

    // Confirm if needed
    if ((plan.requiresConfirmation || this.config.alwaysConfirm) && !shouldAutoConfirm) {
      const confirmed = await this.callbacks.onConfirm(
        `Execute this plan? (Risk level: ${plan.risk})`
      );
      
      if (!confirmed) {
        this.callbacks.onOutput("Cancelled.");
        this.contextManager.addAssistantMessage("Execution cancelled by user.");
        
        // Record rejection
        if (this.config.enableLearning) {
          this.recordUsagePattern(intent, plan, false);
        }
        return;
      }
    }

    // Execute the plan and record the result
    const success = await this.executePlan(plan);
    
    // Record successful execution pattern
    if (this.config.enableLearning) {
      this.recordUsagePattern(intent, plan, true, success);
    }
  }
  
  /**
   * Handle case where user had modifiers but we have low confidence
   */
  private async handleLowConfidenceWithModifiers(intent: ParsedIntent): Promise<void> {
    const bestMatch = intent.matchedWorkflows[0];
    
    let message = "";
    
    if (intent.scopeModifier) {
      message += `You asked to "${intent.scopeModifier.type}" ${intent.scopeModifier.targetAction}.\n`;
    }
    
    if (intent.exclusions && intent.exclusions.excludedActions.length > 0) {
      message += `You don't want: ${intent.exclusions.excludedActions.join(", ")}\n`;
    }
    
    message += `\nThe closest workflow I found is "${bestMatch.workflow.name}"`;
    if (bestMatch.workflow.description) {
      message += `\n  → ${bestMatch.workflow.description}`;
    }
    message += "\n\nThis workflow might do more than you want. Options:\n";
    message += "  1. Run it anyway\n";
    message += "  2. Create a custom workflow for exactly what you need\n";
    message += "  3. Cancel\n";
    
    this.callbacks.onOutput(message);
    
    const choice = await this.callbacks.onInput("Enter choice (1/2/3): ");
    const trimmedChoice = choice.trim();
    
    if (trimmedChoice === "1") {
      // Run the best match anyway
      const plan = await this.planner.createPlan(intent, this.contextManager.getEnvironment());
      this.callbacks.onPlanPreview(plan);
      
      const confirmed = await this.callbacks.onConfirm("Execute this plan?");
      if (confirmed) {
        const success = await this.executePlan(plan);
        if (this.config.enableLearning) {
          this.recordUsagePattern(intent, plan, true, success);
        }
      }
    } else if (trimmedChoice === "2") {
      // Create ephemeral workflow
      intent.type = "create";
      await this.handleEphemeralCreation(intent);
    } else {
      this.callbacks.onOutput("Cancelled.");
    }
  }
  
  /**
   * Handle case where multiple workflows match with similar scores
   */
  private async handleAmbiguousMatch(intent: ParsedIntent): Promise<void> {
    let message = "I found multiple workflows that might match:\n\n";
    
    const topMatches = intent.matchedWorkflows.slice(0, 4);
    for (let i = 0; i < topMatches.length; i++) {
      const match = topMatches[i];
      const scorePercent = Math.round(match.score * 100);
      message += `  ${i + 1}. ${match.workflow.name} (${scorePercent}% match)`;
      if (match.workflow.description) {
        message += `\n     ${match.workflow.description}`;
      }
      message += "\n";
    }
    
    message += `\n  ${topMatches.length + 1}. Create a custom workflow\n`;
    message += `  ${topMatches.length + 2}. Cancel\n`;
    
    this.callbacks.onOutput(message);
    
    const choice = await this.callbacks.onInput("Enter choice: ");
    const choiceNum = parseInt(choice.trim(), 10);
    
    if (choiceNum >= 1 && choiceNum <= topMatches.length) {
      // User selected a specific workflow
      const selectedMatch = topMatches[choiceNum - 1];
      const newIntent: ParsedIntent = {
        ...intent,
        matchedWorkflows: [selectedMatch],
        confidence: 1.0, // User explicitly chose
      };
      
      const plan = await this.planner.createPlan(newIntent, this.contextManager.getEnvironment());
      
      const missingParams = this.collectMissingParams(plan);
      if (missingParams.length > 0) {
        await this.askForMissingParams(plan, missingParams);
      }
      
      this.callbacks.onPlanPreview(plan);
      
      const confirmed = await this.callbacks.onConfirm(`Execute "${selectedMatch.workflow.name}"?`);
      if (confirmed) {
        const success = await this.executePlan(plan);
        if (this.config.enableLearning) {
          this.recordUsagePattern(newIntent, plan, true, success);
        }
      }
    } else if (choiceNum === topMatches.length + 1) {
      // Create ephemeral
      intent.type = "create";
      await this.handleEphemeralCreation(intent);
    } else {
      this.callbacks.onOutput("Cancelled.");
    }
  }
  
  /**
   * Record a usage pattern for learning
   */
  private recordUsagePattern(
    intent: ParsedIntent,
    plan: ExecutionPlan,
    wasAccepted: boolean,
    executionSuccess?: boolean,
  ): void {
    const pattern: UsagePattern = {
      input: intent.originalInput,
      resolvedTo: {
        type: plan.steps.length > 1 ? "chain" : 
              plan.steps[0]?.type === "ephemeral" ? "ephemeral" : "workflow",
        workflows: plan.steps
          .filter(s => s.workflowName)
          .map(s => s.workflowName!),
        plan,
      },
      wasAccepted,
      timestamp: new Date(),
      executionSuccess,
    };
    
    this.learningManager.recordPattern(pattern);
    this.learningManager.save();
  }

  /**
   * Collect missing required parameters from plan
   */
  private collectMissingParams(plan: ExecutionPlan): MissingParam[] {
    const missing: MissingParam[] = [];

    for (const step of plan.steps) {
      if (step.type === "workflow" && step.workflowDef?.config_schema) {
        for (const [name, schema] of Object.entries(step.workflowDef.config_schema)) {
          if (schema.required && step.params[name] === undefined) {
            missing.push({
              name,
              description: schema.description,
              type: schema.type,
              required: true,
              workflow: step.workflowName,
            });
          }
        }
      }
    }

    return missing;
  }

  /**
   * Ask user for missing parameters
   */
  private async askForMissingParams(
    plan: ExecutionPlan,
    params: MissingParam[],
  ): Promise<void> {
    for (const param of params) {
      const value = await this.callbacks.onAskParam(param);
      
      // Add to the appropriate step
      for (const step of plan.steps) {
        if (step.workflowName === param.workflow) {
          step.params[param.name] = value;
        }
      }

      // Store in session
      this.contextManager.setSessionVariable(param.name, value);
    }
  }

  /**
   * Execute a plan
   * Returns true if all steps completed successfully
   */
  private async executePlan(plan: ExecutionPlan): Promise<boolean> {
    let allSuccess = true;
    
    for (const step of plan.steps) {
      if (step.type === "workflow" || step.type === "ephemeral") {
        const workflow = step.type === "workflow" 
          ? step.workflowDef!
          : step.ephemeralWorkflow!;

        this.callbacks.onExecutionStart(workflow.name);

        const config: WorkflowConfig = {
          values: step.params,
          options: { verbose: this.config.verbose },
        };

        try {
          const result = await this.hackflowAgent.runWorkflow(workflow, config);
          
          this.callbacks.onExecutionComplete(result);
          this.contextManager.storeExecutionResult(result.executionId, result);
          
          // Store output for next steps
          if (step.outputAs && result.context) {
            this.contextManager.setSessionVariable(step.outputAs, result.context);
          }

          if (result.status === "failed") {
            this.callbacks.onOutput(`Workflow failed: ${result.error}`);
            allSuccess = false;
            break; // Stop chain on failure
          }
        } catch (error) {
          this.callbacks.onOutput(`Error executing ${workflow.name}: ${(error as Error).message}`);
          allSuccess = false;
          break;
        }
      }
    }
    
    return allSuccess;
  }

  /**
   * Handle ephemeral workflow creation
   */
  private async handleEphemeralCreation(intent: ParsedIntent): Promise<void> {
    // Build a clear message about what we're doing
    let contextMessage = "Creating a custom workflow for your request...\n";
    
    if (intent.scopeModifier) {
      contextMessage = `Creating a focused workflow to ${intent.scopeModifier.type} ${intent.scopeModifier.targetAction}...\n`;
    }
    
    if (intent.exclusions && intent.exclusions.excludedActions.length > 0) {
      contextMessage += `(Excluding: ${intent.exclusions.excludedActions.join(", ")})\n`;
    }
    
    this.callbacks.onOutput(contextMessage);

    try {
      const plan = await this.planner.createPlan(
        { ...intent, type: "create" },
        this.contextManager.getEnvironment(),
      );

      // Clear heading for ephemeral workflow
      this.callbacks.onOutput("\n--- Custom Workflow Generated ---\n");
      
      // Show what the workflow will do
      if (plan.steps.length > 0 && plan.steps[0].ephemeralWorkflow) {
        const ephemeral = plan.steps[0].ephemeralWorkflow;
        this.callbacks.onOutput(`Name: ${ephemeral.name}`);
        this.callbacks.onOutput(`Description: ${ephemeral.description || "Custom workflow"}\n`);
        
        if (ephemeral.steps && ephemeral.steps.length > 0) {
          this.callbacks.onOutput("Steps:");
          for (let i = 0; i < ephemeral.steps.length; i++) {
            const step = ephemeral.steps[i];
            this.callbacks.onOutput(`  ${i + 1}. ${step.description || step.action}`);
          }
          this.callbacks.onOutput("");
        }
      }
      
      this.callbacks.onPlanPreview(plan);

      if (plan.warnings && plan.warnings.length > 0) {
        this.callbacks.onOutput("\nWarnings:");
        for (const warning of plan.warnings) {
          this.callbacks.onOutput(`  ⚠ ${warning}`);
        }
      }

      this.callbacks.onOutput("\n---------------------------------\n");

      // Always confirm ephemeral workflows with clear messaging
      const confirmed = await this.callbacks.onConfirm(
        "This is a custom workflow. Execute it?"
      );

      if (!confirmed) {
        this.callbacks.onOutput("Cancelled. No changes were made.");
        return;
      }

      this.callbacks.onOutput("\nExecuting custom workflow...\n");
      const success = await this.executePlan(plan);

      if (success) {
        // Offer to save the workflow
        const save = await this.callbacks.onConfirm(
          "\nWorkflow completed successfully! Would you like to save it for future use?"
        );

        if (save) {
          const name = await this.callbacks.onInput("Enter a name for this workflow: ");
          const trimmedName = name.trim();
          
          if (trimmedName) {
            // Save the ephemeral workflow
            await this.saveEphemeralWorkflow(plan, trimmedName);
            this.callbacks.onOutput(`\nSaved as "${trimmedName}"! You can now run it with: /run ${trimmedName}`);
          } else {
            this.callbacks.onOutput("No name provided, workflow not saved.");
          }
        }
      }
    } catch (error) {
      this.callbacks.onOutput(`\nFailed to create workflow: ${(error as Error).message}`);
      this.callbacks.onOutput("Try rephrasing your request or use /workflows to see available workflows.");
    }
  }
  
  /**
   * Save an ephemeral workflow for future use
   */
  private async saveEphemeralWorkflow(plan: ExecutionPlan, name: string): Promise<void> {
    if (plan.steps.length === 0 || !plan.steps[0].ephemeralWorkflow) {
      throw new Error("No ephemeral workflow to save");
    }
    
    const workflow = plan.steps[0].ephemeralWorkflow;
    workflow.name = name;
    
    // For now, we'll just record this as a learned shortcut
    // Full workflow saving would require file system access
    if (this.config.enableLearning) {
      this.learningManager.addShortcut(name, name);
      this.learningManager.save();
    }
    
    // TODO: Actually save the workflow YAML to disk
    // This would require access to the workflow directory
  }

  /**
   * Handle query intents
   */
  private async handleQuery(intent: ParsedIntent): Promise<void> {
    // Use AI to answer the query
    const context = this.contextManager.buildContextString();
    
    const prompt = `
The user asked: "${intent.originalInput}"

Context:
${context}

Answer their question concisely. If they're asking about workflows, list relevant ones.
If they're asking about status, check recent executions.
`;

    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 512,
      temperature: 0.5,
    });

    this.callbacks.onOutput(response);
    this.contextManager.addAssistantMessage(response);
  }

  /**
   * Handle clarification requests
   */
  private async handleClarification(intent: ParsedIntent): Promise<void> {
    let message = "I need a bit more information:\n";
    
    // Check if user had scope/exclusion modifiers but we couldn't find a match
    if (intent.scopeModifier || intent.exclusions) {
      message = this.buildModifierClarificationMessage(intent);
    } else if (intent.missingParams && intent.missingParams.length > 0) {
      message += "\nMissing parameters:\n";
      for (const param of intent.missingParams) {
        message += `  • ${param.name}`;
        if (param.description) {
          message += `: ${param.description}`;
        }
        message += "\n";
      }
    } else if (intent.matchedWorkflows.length > 1) {
      message += "\nDid you mean one of these?\n";
      for (const match of intent.matchedWorkflows) {
        message += `  • ${match.workflow.name}`;
        if (match.workflow.description) {
          message += `: ${match.workflow.description}`;
        }
        message += "\n";
      }
    } else {
      message = "I'm not sure what you want to do. Could you be more specific?";
      if (intent.reasoning) {
        message += `\n\n(${intent.reasoning})`;
      }
    }

    this.callbacks.onOutput(message);
    this.contextManager.addAssistantMessage(message);
  }
  
  /**
   * Build a helpful clarification message when user had scope/exclusion modifiers
   */
  private buildModifierClarificationMessage(intent: ParsedIntent): string {
    let message = "";
    
    if (intent.scopeModifier) {
      message += `I understand you want to "${intent.scopeModifier.type}" ${intent.scopeModifier.targetAction}.\n\n`;
    }
    
    if (intent.exclusions && intent.exclusions.excludedActions.length > 0) {
      message += `I noticed you don't want: ${intent.exclusions.excludedActions.join(", ")}\n\n`;
    }
    
    // Check if we have partial matches that were filtered out
    if (intent.matchedWorkflows.length > 0) {
      const bestMatch = intent.matchedWorkflows[0];
      
      if (bestMatch.score < 0.6) {
        message += `The closest workflow I found is "${bestMatch.workflow.name}"`;
        if (bestMatch.workflow.description) {
          message += ` (${bestMatch.workflow.description})`;
        }
        message += `, but it might do more than you want.\n\n`;
        
        message += "Would you like me to:\n";
        message += `  1. Run "${bestMatch.workflow.name}" anyway\n`;
        message += "  2. Create a custom workflow that does exactly what you asked\n\n";
        message += 'Reply with "1", "2", or describe what you want differently.';
      } else {
        message += "Here are some options:\n";
        for (const match of intent.matchedWorkflows.slice(0, 3)) {
          const scorePercent = Math.round(match.score * 100);
          message += `  • ${match.workflow.name} (${scorePercent}% match)`;
          if (match.workflow.description) {
            message += `: ${match.workflow.description}`;
          }
          message += "\n";
        }
      }
    } else {
      message += "I couldn't find a workflow that matches exactly what you want.\n\n";
      message += "Would you like me to create a custom workflow for this task?";
    }
    
    return message;
  }

  /**
   * Handle slash commands
   */
  private async handleSlashCommand(intent: ParsedIntent): Promise<void> {
    const cmd = intent.slashCommand!;
    
    switch (cmd.name) {
      case "help":
        this.showHelp();
        break;
      
      case "workflows":
      case "ls":
        await this.listWorkflows();
        break;
      
      case "history":
        this.showHistory();
        break;
      
      case "context":
        this.showContext();
        break;
      
      case "clear":
        this.contextManager.clearHistory();
        this.callbacks.onOutput("History cleared.");
        break;
      
      case "plan":
        if (cmd.args.length > 0) {
          await this.showPlanOnly(cmd.args.join(" "));
        } else {
          this.callbacks.onOutput("Usage: /plan <task description>");
        }
        break;
      
      case "run":
        if (cmd.args.length > 0) {
          await this.runWorkflowDirect(cmd.args[0], cmd.args.slice(1));
        } else {
          this.callbacks.onOutput("Usage: /run <workflow-name> [args...]");
        }
        break;
      
      case "exit":
      case "quit":
        // This is handled by the REPL
        throw new Error("EXIT");
      
      case "stats":
        this.showStats();
        break;
      
      case "shortcut":
        if (cmd.args.length >= 2) {
          this.learningManager.addShortcut(cmd.args[0], cmd.args.slice(1).join(" "));
          this.learningManager.save();
          this.callbacks.onOutput(`Shortcut added: "${cmd.args[0]}" → ${cmd.args.slice(1).join(" ")}`);
        } else {
          this.callbacks.onOutput("Usage: /shortcut <name> <workflow>\nExample: /shortcut ship auto-ship");
        }
        break;
      
      case "autoconfirm":
        if (cmd.args.length > 0) {
          this.learningManager.addAutoConfirm(cmd.args[0]);
          this.learningManager.save();
          this.callbacks.onOutput(`"${cmd.args[0]}" will now auto-confirm.`);
        } else {
          this.callbacks.onOutput("Usage: /autoconfirm <workflow-name>");
        }
        break;
      
      default:
        this.callbacks.onOutput(`Unknown command: /${cmd.name}\nType /help for available commands.`);
    }
  }
  
  /**
   * Show usage statistics
   */
  private showStats(): void {
    const stats = this.learningManager.getStats();
    const topWorkflows = this.learningManager.getMostUsedWorkflows(5);
    
    let output = "Usage Statistics:\n\n";
    output += `  Total executions: ${stats.totalExecutions}\n`;
    output += `  Successful: ${stats.successfulExecutions}\n`;
    output += `  Failed: ${stats.failedExecutions}\n`;
    
    if (topWorkflows.length > 0) {
      output += "\n  Most used workflows:\n";
      for (const wf of topWorkflows) {
        const count = stats.mostUsedWorkflows[wf];
        output += `    • ${wf}: ${count} times\n`;
      }
    }
    
    if (stats.lastActive) {
      output += `\n  Last active: ${stats.lastActive.toLocaleString()}`;
    }
    
    this.callbacks.onOutput(output);
  }

  /**
   * Handle general chat
   */
  private async handleChat(intent: ParsedIntent): Promise<void> {
    const context = this.contextManager.buildContextString();
    
    const prompt = `
You are Hackflow, a workflow automation assistant. The user said:
"${intent.originalInput}"

Context:
${context}

Respond naturally. If they're greeting you, be friendly.
If they seem to want to do something with workflows, suggest how you can help.
Keep responses concise.
`;

    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 256,
      temperature: 0.7,
    });

    this.callbacks.onOutput(response);
    this.contextManager.addAssistantMessage(response);
  }

  /**
   * Show help
   */
  private showHelp(): void {
    const help = `
Hackflow - Natural Language Workflow Agent

Just type naturally to describe what you want to do:
  "commit my changes"
  "run tests and then push"
  "create a PR for this branch"

Commands:
  /help              - Show this help
  /workflows         - List available workflows
  /history           - Show conversation history
  /context           - Show current context
  /clear             - Clear conversation history
  /plan <task>       - Show execution plan without running
  /run <wf> [args]   - Run a workflow directly
  /stats             - Show usage statistics
  /shortcut <n> <wf> - Create a shortcut (e.g., /shortcut ship auto-ship)
  /autoconfirm <wf>  - Skip confirmation for a workflow
  /exit              - Exit Hackflow

Tips:
  • I'll ask for any required information
  • I'll show you a plan before executing
  • Say "cancel" or "no" to stop any action
  • Use quotes for exact values: commit with message "fix bug"
  • I learn from your usage to improve over time
`.trim();

    this.callbacks.onOutput(help);
  }

  /**
   * List workflows
   */
  private async listWorkflows(): Promise<void> {
    const registry = this.hackflowAgent.getRegistry();
    const workflows = await registry.list();

    if (workflows.length === 0) {
      this.callbacks.onOutput("No workflows installed. Use `hackflow install <workflow>` to add some.");
      return;
    }

    let output = "Available Workflows:\n\n";
    
    for (const w of workflows) {
      output += `  • ${w.name}`;
      if (w.description) {
        output += `: ${w.description}`;
      }
      output += "\n";
    }

    this.callbacks.onOutput(output);
  }

  /**
   * Show conversation history
   */
  private showHistory(): void {
    const history = this.contextManager.getHistory();
    
    if (history.length === 0) {
      this.callbacks.onOutput("No conversation history yet.");
      return;
    }

    let output = "Recent Conversation:\n\n";
    
    for (const msg of history.slice(-10)) {
      const prefix = msg.role === "user" ? "You" : "Hackflow";
      const time = msg.timestamp.toLocaleTimeString();
      output += `[${time}] ${prefix}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? "..." : ""}\n`;
    }

    this.callbacks.onOutput(output);
  }

  /**
   * Show current context
   */
  private showContext(): void {
    const context = this.contextManager.buildContextString();
    this.callbacks.onOutput(`Current Context:\n\n${context}`);
  }

  /**
   * Show plan without executing
   */
  private async showPlanOnly(task: string): Promise<void> {
    const intent = await this.parseIntent(task);
    
    if (intent.type === "clarify" || intent.matchedWorkflows.length === 0) {
      this.callbacks.onOutput("Could not create a plan for this request.");
      return;
    }

    const plan = await this.planner.createPlan(
      intent,
      this.contextManager.getEnvironment(),
    );

    this.callbacks.onPlanPreview(plan);
  }

  /**
   * Run a workflow directly by name
   */
  private async runWorkflowDirect(name: string, args: string[]): Promise<void> {
    // Parse args as key=value pairs
    const values: Record<string, any> = {};
    for (const arg of args) {
      const [key, value] = arg.split("=");
      if (key && value) {
        values[key] = value;
      }
    }

    const config: WorkflowConfig = {
      values,
      options: { verbose: this.config.verbose },
    };

    try {
      this.callbacks.onExecutionStart(name);
      const result = await this.hackflowAgent.runWorkflowByName(name, config);
      this.callbacks.onExecutionComplete(result);
      this.contextManager.storeExecutionResult(result.executionId, result);
    } catch (error) {
      this.callbacks.onOutput(`Error: ${(error as Error).message}`);
    }
  }

  /**
   * Get the context manager
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }
}
