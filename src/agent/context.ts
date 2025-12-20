/**
 * Context Manager - Maintains conversation state and environment info
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { ExecutionResult } from "../types/index.js";
import type { 
  ConversationContext, 
  EnvironmentContext, 
  Message,
  AgentConfig,
} from "./types.js";
import { DEFAULT_AGENT_CONFIG } from "./types.js";

export class ContextManager {
  private context: ConversationContext;
  private config: AgentConfig;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.context = this.createNewContext();
  }

  private createNewContext(): ConversationContext {
    return {
      sessionId: randomUUID(),
      history: [],
      recentResults: new Map(),
      environment: this.detectEnvironment(),
      sessionVariables: {},
    };
  }

  /**
   * Detect environment context (git, project type, etc.)
   */
  private detectEnvironment(): EnvironmentContext {
    const cwd = process.cwd();
    const env: EnvironmentContext = { cwd };

    // Detect git info
    try {
      const isGitRepo = existsSync(join(cwd, ".git"));
      if (isGitRepo) {
        env.git = {
          branch: this.runCommand("git branch --show-current").trim(),
          hasChanges: this.runCommand("git status --porcelain").trim().length > 0,
        };

        // Try to get remote
        try {
          env.git.remote = this.runCommand("git remote get-url origin").trim();
        } catch {
          // No remote configured
        }

        // Try to get last commit
        try {
          env.git.lastCommit = this.runCommand("git log -1 --pretty=%B").trim().split("\n")[0];
        } catch {
          // No commits yet
        }
      }
    } catch {
      // Not a git repo or git not available
    }

    // Detect package manager and project type
    if (existsSync(join(cwd, "package.json"))) {
      env.projectType = "node";
      
      if (existsSync(join(cwd, "bun.lockb"))) {
        env.packageManager = "bun";
      } else if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
        env.packageManager = "pnpm";
      } else if (existsSync(join(cwd, "yarn.lock"))) {
        env.packageManager = "yarn";
      } else {
        env.packageManager = "npm";
      }
    } else if (existsSync(join(cwd, "Cargo.toml"))) {
      env.projectType = "rust";
    } else if (existsSync(join(cwd, "go.mod"))) {
      env.projectType = "go";
    } else if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) {
      env.projectType = "python";
    }

    return env;
  }

  private runCommand(cmd: string): string {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  }

  /**
   * Refresh environment context
   */
  refreshEnvironment(): void {
    this.context.environment = this.detectEnvironment();
  }

  /**
   * Add a message to history
   */
  addMessage(message: Omit<Message, "timestamp">): void {
    this.context.history.push({
      ...message,
      timestamp: new Date(),
    });

    // Trim history if too long
    if (this.context.history.length > this.config.maxHistoryLength) {
      // Keep system messages and trim from the start
      const systemMessages = this.context.history.filter(m => m.role === "system");
      const nonSystemMessages = this.context.history.filter(m => m.role !== "system");
      
      const trimmed = nonSystemMessages.slice(-this.config.maxHistoryLength + systemMessages.length);
      this.context.history = [...systemMessages, ...trimmed];
    }
  }

  /**
   * Add user message
   */
  addUserMessage(content: string): void {
    this.addMessage({ role: "user", content });
  }

  /**
   * Add assistant message
   */
  addAssistantMessage(content: string, executionResult?: ExecutionResult): void {
    this.addMessage({ role: "assistant", content, executionResult });
  }

  /**
   * Store execution result
   */
  storeExecutionResult(executionId: string, result: ExecutionResult): void {
    this.context.recentResults.set(executionId, result);
    
    // Also store in session variables if the workflow produced output
    if (result.context) {
      Object.assign(this.context.sessionVariables, result.context);
    }
  }

  /**
   * Get recent execution results
   */
  getRecentResults(): Map<string, ExecutionResult> {
    return this.context.recentResults;
  }

  /**
   * Get the last execution result
   */
  getLastResult(): ExecutionResult | undefined {
    const results = Array.from(this.context.recentResults.values());
    return results[results.length - 1];
  }

  /**
   * Set current focus
   */
  setFocus(topic: string, workflows: string[] = [], variables: Record<string, any> = {}): void {
    this.context.focus = {
      topic,
      relatedWorkflows: workflows,
      variables,
    };
  }

  /**
   * Clear focus
   */
  clearFocus(): void {
    this.context.focus = undefined;
  }

  /**
   * Get session variables
   */
  getSessionVariables(): Record<string, any> {
    return this.context.sessionVariables;
  }

  /**
   * Set a session variable
   */
  setSessionVariable(key: string, value: any): void {
    this.context.sessionVariables[key] = value;
  }

  /**
   * Get the full context
   */
  getContext(): ConversationContext {
    return this.context;
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return this.context.history;
  }

  /**
   * Get environment
   */
  getEnvironment(): EnvironmentContext {
    return this.context.environment;
  }

  /**
   * Clear conversation history (but keep environment)
   */
  clearHistory(): void {
    this.context.history = [];
    this.context.recentResults.clear();
    this.context.focus = undefined;
  }

  /**
   * Reset entire context
   */
  reset(): void {
    this.context = this.createNewContext();
  }

  /**
   * Build context string for AI prompts
   */
  buildContextString(): string {
    const env = this.context.environment;
    const parts: string[] = [];

    parts.push(`Working Directory: ${env.cwd}`);

    if (env.git) {
      parts.push(`Git Branch: ${env.git.branch}`);
      parts.push(`Has Uncommitted Changes: ${env.git.hasChanges ? "yes" : "no"}`);
      if (env.git.lastCommit) {
        parts.push(`Last Commit: "${env.git.lastCommit}"`);
      }
    }

    if (env.projectType) {
      parts.push(`Project Type: ${env.projectType}`);
    }

    if (env.packageManager) {
      parts.push(`Package Manager: ${env.packageManager}`);
    }

    if (this.context.focus) {
      parts.push(`Current Focus: ${this.context.focus.topic}`);
      if (this.context.focus.relatedWorkflows.length > 0) {
        parts.push(`Related Workflows: ${this.context.focus.relatedWorkflows.join(", ")}`);
      }
    }

    // Add recent execution summary
    const recentResults = Array.from(this.context.recentResults.entries()).slice(-3);
    if (recentResults.length > 0) {
      parts.push("\nRecent Executions:");
      for (const [id, result] of recentResults) {
        const status = result.status === "completed" ? "success" : result.status;
        parts.push(`  - ${id.slice(0, 8)}: ${status} (${result.duration}ms)`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Build recent history string for AI context
   */
  buildHistoryString(maxMessages: number = 10): string {
    const recent = this.context.history.slice(-maxMessages);
    
    return recent.map(msg => {
      const prefix = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
      let content = `${prefix}: ${msg.content}`;
      
      if (msg.executionResult) {
        const status = msg.executionResult.status;
        content += ` [Executed: ${status}]`;
      }
      
      return content;
    }).join("\n");
  }
}
