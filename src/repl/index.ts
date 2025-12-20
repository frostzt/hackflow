/**
 * Hackflow REPL - Interactive Natural Language Interface
 */

import * as readline from "node:readline";
import chalk from "chalk";
import type { IModelProvider, ExecutionResult } from "../types/index.js";
import type { HackflowAgent } from "../core/agent.js";
import { NLAgent, type NLAgentCallbacks } from "../agent/nl-agent.js";
import type { ExecutionPlan, MissingParam, AgentConfig } from "../agent/types.js";

export interface REPLOptions {
  /** Show welcome message */
  showWelcome?: boolean;
  /** Agent configuration */
  agentConfig?: Partial<AgentConfig>;
}

// Global readline interface - reuse to avoid issues
let globalRL: readline.Interface | null = null;

function getReadline(): readline.Interface {
  if (!globalRL) {
    globalRL = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false, // Disable terminal mode to avoid double echo
    });
  }
  return globalRL;
}

function closeReadline(): void {
  if (globalRL) {
    globalRL.close();
    globalRL = null;
  }
}

/**
 * Simple line reader using readline but with terminal:false to avoid double echo
 */
function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = getReadline();
    
    // Manually write prompt
    process.stdout.write(prompt);
    
    const lineHandler = (line: string) => {
      // Don't echo - the terminal already echoes input
      resolve(line || "");
    };
    
    rl.once("line", lineHandler);
  });
}

export class HackflowREPL {
  private nlAgent: NLAgent;
  private isRunning: boolean = false;

  constructor(
    private hackflowAgent: HackflowAgent,
    private aiProvider: IModelProvider,
    private options: REPLOptions = {},
  ) {
    const callbacks = this.createCallbacks();
    this.nlAgent = new NLAgent(hackflowAgent, aiProvider, callbacks, options.agentConfig);
  }

  /**
   * Create the callback handlers for the NL Agent
   */
  private createCallbacks(): NLAgentCallbacks {
    return {
      onOutput: (text: string) => this.output(text),
      onInput: (prompt: string) => readLine(prompt),
      onPlanPreview: (plan: ExecutionPlan) => this.showPlan(plan),
      onConfirm: (message: string) => this.confirm(message),
      onExecutionStart: (name: string) => this.showExecutionStart(name),
      onExecutionComplete: (result: ExecutionResult) => this.showExecutionComplete(result),
      onAskParam: (param: MissingParam) => this.askParam(param),
    };
  }

  /**
   * Start the REPL
   */
  async start(): Promise<void> {
    this.isRunning = true;

    if (this.options.showWelcome !== false) {
      this.showWelcome();
    }

    // Handle Ctrl+C at process level
    const sigintHandler = () => {
      console.log();
      this.isRunning = false;
      this.showGoodbye();
      process.exit(0);
    };
    process.on("SIGINT", sigintHandler);

    while (this.isRunning) {
      try {
        const userInput = await readLine(chalk.green("> "));
        
        // Check for Ctrl+C signal
        if (userInput === "\x03") {
          break;
        }
        
        if (!userInput.trim()) {
          continue;
        }

        await this.nlAgent.process(userInput);
      } catch (error) {
        const errorMessage = (error as Error).message;
        
        // EXIT is not an error, it's a signal to exit cleanly
        if (errorMessage === "EXIT") {
          this.isRunning = false;
          break;
        }
        
        // Don't show errors for empty/undefined
        if (errorMessage && !errorMessage.includes("closed")) {
          this.output(chalk.red(`Error: ${errorMessage}`));
        }
      }
    }

    process.off("SIGINT", sigintHandler);
    closeReadline();
    this.showGoodbye();
  }

  /**
   * Stop the REPL
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Show welcome message
   */
  private showWelcome(): void {
    const version = "0.1.0";
    
    console.log();
    console.log(chalk.cyan("╭──────────────────────────────────────────────────────────────╮"));
    console.log(chalk.cyan("│") + chalk.bold.white("  Hackflow ") + chalk.gray(`v${version}`) + " ".repeat(44 - version.length) + chalk.cyan("│"));
    console.log(chalk.cyan("│") + chalk.gray("  Type naturally. I'll figure out the rest.                   ") + chalk.cyan("│"));
    console.log(chalk.cyan("│") + chalk.gray("  Use /help for commands, Ctrl+C to exit.                     ") + chalk.cyan("│"));
    console.log(chalk.cyan("╰──────────────────────────────────────────────────────────────╯"));
    console.log();
  }

  /**
   * Show goodbye message
   */
  private showGoodbye(): void {
    console.log();
    console.log(chalk.gray("  Goodbye!"));
    console.log();
  }

  /**
   * Output text to console
   */
  private output(text: string): void {
    console.log();
    const lines = text.split("\n");
    for (const line of lines) {
      console.log("  " + line);
    }
    console.log();
  }

  /**
   * Confirm an action
   */
  private async confirm(message: string): Promise<boolean> {
    const answer = await readLine(chalk.yellow(`  ${message} [Y/n] `));
    const response = (answer || "").toLowerCase().trim();
    return response === "" || response === "y" || response === "yes";
  }

  /**
   * Ask for a parameter value
   */
  private async askParam(param: MissingParam): Promise<string> {
    let prompt = `  ${chalk.cyan(param.name)}`;
    if (param.description) {
      prompt += chalk.gray(` (${param.description})`);
    }
    prompt += chalk.white(": ");
    return readLine(prompt);
  }

  /**
   * Show execution plan
   */
  private showPlan(plan: ExecutionPlan): void {
    console.log();
    console.log(chalk.bold("  ┌─────────────────────────────────────────────────────────────┐"));
    console.log(chalk.bold(`  │ Plan: ${plan.description.slice(0, 53).padEnd(53)} │`));
    console.log(chalk.bold("  ├─────────────────────────────────────────────────────────────┤"));

    for (const step of plan.steps) {
      const icon = step.type === "workflow" ? "●" : step.type === "ephemeral" ? "◆" : "○";
      
      console.log(`  │  ${icon} ${step.description.slice(0, 55).padEnd(55)} │`);
      
      if (Object.keys(step.params).length > 0) {
        for (const [key, value] of Object.entries(step.params)) {
          const paramStr = `    ${key}: ${JSON.stringify(value)}`;
          console.log(chalk.gray(`  │  ${paramStr.slice(0, 57).padEnd(57)} │`));
        }
      }
    }

    console.log(chalk.bold("  ├─────────────────────────────────────────────────────────────┤"));
    
    const riskLabel = plan.risk.toUpperCase();
    const riskColor = plan.risk === "low" ? chalk.green : 
                      plan.risk === "medium" ? chalk.yellow :
                      plan.risk === "high" ? chalk.red : chalk.magenta;
    
    console.log(`  │  Risk: ${riskColor(riskLabel.padEnd(54))} │`);
    console.log(chalk.bold("  └─────────────────────────────────────────────────────────────┘"));
    console.log();
  }

  /**
   * Show execution start
   */
  private showExecutionStart(workflowName: string): void {
    console.log();
    console.log(chalk.bold("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.bold(`    ▶ ${workflowName}`));
    console.log(chalk.bold("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log();
  }

  /**
   * Show execution complete
   */
  private showExecutionComplete(result: ExecutionResult): void {
    console.log();
    
    const statusIcon = result.status === "completed" ? chalk.green("✓") : chalk.red("✗");
    const statusText = result.status === "completed" ? chalk.green("completed") : chalk.red("failed");
    const duration = this.formatDuration(result.duration);

    for (const step of result.steps) {
      const stepIcon = step.status === "completed" ? chalk.green("✓") :
                       step.status === "failed" ? chalk.red("✗") :
                       step.status === "skipped" ? chalk.gray("○") : chalk.yellow("◐");
      const stepDuration = step.duration ? chalk.gray(` (${this.formatDuration(step.duration)})`) : "";
      const desc = step.description ? chalk.gray(` - ${step.description}`) : "";
      
      console.log(`    ${stepIcon} ${step.action}${stepDuration}${desc}`);
      
      if (step.error) {
        console.log(chalk.red(`       Error: ${step.error.slice(0, 60)}${step.error.length > 60 ? "..." : ""}`));
      }
    }

    console.log();
    console.log(chalk.bold("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(`    ${statusIcon} ${statusText} in ${duration}`);
    console.log(chalk.bold("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log();

    if (result.error) {
      console.log(chalk.red(`  Error: ${result.error}`));
      console.log();
    }
  }

  /**
   * Format duration in ms to human readable
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}

/**
 * Run a single command (one-shot mode)
 */
export async function runOneShot(
  hackflowAgent: HackflowAgent,
  aiProvider: IModelProvider,
  userInput: string,
): Promise<void> {
  const callbacks: NLAgentCallbacks = {
    onOutput: (text) => console.log(text),
    onInput: async (prompt) => {
      console.log(chalk.yellow(`Missing input: ${prompt}`));
      return "";
    },
    onPlanPreview: (plan) => {
      console.log();
      console.log(chalk.bold(`Plan: ${plan.description}`));
      console.log(chalk.gray(`Risk: ${plan.risk}`));
      for (const step of plan.steps) {
        console.log(`  • ${step.description}`);
      }
      console.log();
    },
    onConfirm: async (message) => {
      console.log(chalk.yellow(message));
      return false;
    },
    onExecutionStart: (name) => {
      console.log(chalk.blue(`\nExecuting: ${name}`));
    },
    onExecutionComplete: (result) => {
      const status = result.status === "completed" ? chalk.green("✓") : chalk.red("✗");
      console.log(`${status} ${result.status} in ${result.duration}ms`);
    },
    onAskParam: async (param) => {
      console.log(chalk.yellow(`Missing required parameter: ${param.name}`));
      return "";
    },
  };

  const agent = new NLAgent(hackflowAgent, aiProvider, callbacks);
  await agent.process(userInput);
}
