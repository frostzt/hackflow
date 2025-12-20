/**
 * Real-time progress reporter for CLI
 * Shows live updates during workflow execution
 */

import chalk from "chalk";
import type { ProgressEvent } from "../core/executor.js";

export interface ProgressReporterOptions {
  /** Show verbose output including inputs/outputs */
  verbose?: boolean;
  /** Use compact single-line updates */
  compact?: boolean;
  /** Disable colors */
  noColor?: boolean;
}

/**
 * CLI Progress Reporter
 * Renders real-time workflow execution progress
 */
export class CLIProgressReporter {
  private options: ProgressReporterOptions;
  private startTime: number = Date.now();
  private currentWorkflow: string = "";
  private stepCount: number = 0;
  private completedSteps: number = 0;
  private depth: number = 0;
  private lastLineLength: number = 0;

  constructor(options: ProgressReporterOptions = {}) {
    this.options = options;
  }

  /**
   * Handle a progress event from the executor
   */
  handleEvent(event: ProgressEvent): void {
    switch (event.type) {
      case "execution:start":
        this.onExecutionStart(event);
        break;
      case "execution:complete":
        this.onExecutionComplete(event);
        break;
      case "execution:failed":
        this.onExecutionFailed(event);
        break;
      case "step:start":
        this.onStepStart(event);
        break;
      case "step:complete":
        this.onStepComplete(event);
        break;
      case "step:failed":
        this.onStepFailed(event);
        break;
      case "step:skipped":
        this.onStepSkipped(event);
        break;
      case "child:start":
        this.onChildStart(event);
        break;
      case "child:complete":
        this.onChildComplete(event);
        break;
    }
  }

  private onExecutionStart(event: ProgressEvent): void {
    this.startTime = Date.now();
    this.currentWorkflow = event.workflowName;
    this.depth = event.depth;
    this.stepCount = 0;
    this.completedSteps = 0;

    if (event.depth === 0) {
      // Root workflow
      console.log();
      console.log(chalk.bold.blue("━".repeat(60)));
      console.log(chalk.bold.blue(`  ▶ ${event.workflowName}`));
      console.log(chalk.bold.blue("━".repeat(60)));
      console.log();
    } else {
      // Child workflow - show indented
      const indent = this.getIndent(event.depth);
      console.log(`${indent}${chalk.cyan("┌─")} ${chalk.cyan.bold(event.workflowName)}`);
    }
  }

  private onExecutionComplete(event: ProgressEvent): void {
    const duration = this.formatDuration(event.data?.duration || (Date.now() - this.startTime));
    
    if (event.depth === 0) {
      console.log();
      console.log(chalk.bold.green("━".repeat(60)));
      console.log(chalk.bold.green(`  ✓ ${event.workflowName} completed in ${duration}`));
      console.log(chalk.bold.green("━".repeat(60)));
      console.log();
    } else {
      const indent = this.getIndent(event.depth);
      console.log(`${indent}${chalk.green("└─ ✓")} ${chalk.gray(`completed in ${duration}`)}`);
    }
  }

  private onExecutionFailed(event: ProgressEvent): void {
    const duration = this.formatDuration(event.data?.duration || (Date.now() - this.startTime));
    
    if (event.depth === 0) {
      console.log();
      console.log(chalk.bold.red("━".repeat(60)));
      console.log(chalk.bold.red(`  ✗ ${event.workflowName} failed after ${duration}`));
      if (event.data?.error) {
        console.log(chalk.red(`    ${event.data.error}`));
      }
      console.log(chalk.bold.red("━".repeat(60)));
      console.log();
    } else {
      const indent = this.getIndent(event.depth);
      console.log(`${indent}${chalk.red("└─ ✗")} ${chalk.red(`failed: ${event.data?.error || "Unknown error"}`)}`);
    }
  }

  private onStepStart(event: ProgressEvent): void {
    this.stepCount++;
    const indent = this.getIndent(event.depth);
    const stepInfo = event.data;
    
    if (this.options.compact) {
      // Single-line update (overwrite previous)
      const line = `${indent}${chalk.yellow("◐")} Step ${stepInfo?.stepIndex ?? "?"}: ${stepInfo?.action || ""}...`;
      this.writeInPlace(line);
    } else {
      // Multi-line output
      const desc = stepInfo?.description ? chalk.gray(` - ${stepInfo.description}`) : "";
      console.log(`${indent}${chalk.yellow("◐")} ${stepInfo?.action || "unknown"}${desc}`);
    }
  }

  private onStepComplete(event: ProgressEvent): void {
    this.completedSteps++;
    const indent = this.getIndent(event.depth);
    const stepInfo = event.data;
    const duration = stepInfo?.duration ? chalk.gray(` (${this.formatDuration(stepInfo.duration)})`) : "";
    
    if (this.options.compact) {
      const line = `${indent}${chalk.green("✓")} Step ${stepInfo?.stepIndex ?? "?"}: ${stepInfo?.action || ""}${duration}`;
      this.writeInPlace(line);
      console.log(); // New line after completion
    } else {
      // Move cursor up and overwrite the "running" line
      process.stdout.write("\x1b[1A\x1b[2K"); // Move up, clear line
      const desc = stepInfo?.description ? chalk.gray(` - ${stepInfo.description}`) : "";
      console.log(`${indent}${chalk.green("✓")} ${stepInfo?.action || "unknown"}${duration}${desc}`);
      
      if (this.options.verbose && stepInfo?.output !== undefined) {
        const outputStr = typeof stepInfo.output === "string" 
          ? stepInfo.output.slice(0, 100)
          : JSON.stringify(stepInfo.output).slice(0, 100);
        if (outputStr.length > 0) {
          console.log(`${indent}  ${chalk.gray("→")} ${chalk.gray(outputStr)}${outputStr.length >= 100 ? "..." : ""}`);
        }
      }
    }
  }

  private onStepFailed(event: ProgressEvent): void {
    const indent = this.getIndent(event.depth);
    const stepInfo = event.data;
    
    if (this.options.compact) {
      const line = `${indent}${chalk.red("✗")} Step ${stepInfo?.stepIndex ?? "?"}: ${stepInfo?.action || ""} - FAILED`;
      this.writeInPlace(line);
      console.log();
    } else {
      process.stdout.write("\x1b[1A\x1b[2K");
      console.log(`${indent}${chalk.red("✗")} ${stepInfo?.action || "unknown"} ${chalk.red("FAILED")}`);
      if (stepInfo?.error) {
        console.log(`${indent}  ${chalk.red(stepInfo.error)}`);
      }
    }
  }

  private onStepSkipped(event: ProgressEvent): void {
    const indent = this.getIndent(event.depth);
    const stepInfo = event.data;
    
    if (!this.options.compact) {
      process.stdout.write("\x1b[1A\x1b[2K");
      console.log(`${indent}${chalk.gray("○")} ${stepInfo?.action || "unknown"} ${chalk.gray("(skipped)")}`);
    }
  }

  private onChildStart(event: ProgressEvent): void {
    // Child workflow starting is handled by execution:start
  }

  private onChildComplete(event: ProgressEvent): void {
    // Child workflow completion is handled by execution:complete
  }

  private getIndent(depth: number): string {
    if (depth === 0) return "  ";
    return "  " + "│ ".repeat(depth - 1) + "├ ";
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  private writeInPlace(line: string): void {
    // Clear current line and write new content
    process.stdout.write("\r\x1b[2K" + line);
    this.lastLineLength = line.length;
  }
}

/**
 * Create a simple spinner for long-running operations
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string = "";

  start(message: string): void {
    this.message = message;
    this.frameIndex = 0;
    
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      process.stdout.write(`\r${chalk.cyan(frame)} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  update(message: string): void {
    this.message = message;
  }

  succeed(message?: string): void {
    this.stop();
    console.log(`\r${chalk.green("✓")} ${message || this.message}`);
  }

  fail(message?: string): void {
    this.stop();
    console.log(`\r${chalk.red("✗")} ${message || this.message}`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write("\r\x1b[2K"); // Clear line
    }
  }
}
