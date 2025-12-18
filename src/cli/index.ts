#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { HackflowAgent } from "../core/agent.js";
import { createStorage } from "../storage/index.js";
import { SecurityGuard } from "../security/index.js";
import { MCPClient } from "../mcps/client.js";
import { CLIPromptHandler } from "../core/prompt.js";
import { createAIProvider, loadAIConfig } from "../ai/index.js";
import type { WorkflowConfig } from "../types/index.js";

const program = new Command();

program
  .name("hackflow")
  .description("A hackable AI agent with workflow-based plugins")
  .version("0.1.0");

// Run command
program
  .command("run <workflow>")
  .description("Execute a workflow")
  .option("-c, --config <file>", "Config file with workflow values")
  .option("-d, --dry-run", "Simulate execution without making changes")
  .option("-v, --verbose", "Verbose output")
  .option("--var <key=value>", "Set workflow variables", collect, [])
  .action(async (workflowPath: string, options: any) => {
    try {
      const agent = await createAgent();

      // Parse variables
      const variables: Record<string, any> = {};
      for (const pair of options.var) {
        const [key, value] = pair.split("=");
        variables[key] = value;
      }

      // Create config
      const config: WorkflowConfig = {
        values: variables,
        options: {
          dryRun: options.dryRun,
          verbose: options.verbose,
        },
      };

      console.log(chalk.blue(`🚀 Running workflow: ${workflowPath}`));
      if (options.dryRun) {
        console.log(chalk.yellow("⚠️  DRY RUN MODE - No changes will be made"));
      }
      console.log();

      const result = await agent.runWorkflowFile(workflowPath, config);

      console.log();
      if (result.status === "completed") {
        console.log(chalk.green("✓ Workflow completed successfully"));
        console.log(chalk.gray(`  Execution ID: ${result.executionId}`));
        console.log(chalk.gray(`  Duration: ${result.duration}ms`));
        console.log(chalk.gray(`  Steps: ${result.steps.length}`));
      } else {
        console.log(chalk.red("✗ Workflow failed"));
        console.log(chalk.gray(`  Execution ID: ${result.executionId}`));
        console.log(chalk.red(`  Error: ${result.error}`));
        process.exit(1);
      }

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// List executions
program
  .command("list")
  .description("List recent workflow executions")
  .option("-w, --workflow <name>", "Filter by workflow name")
  .option("-l, --limit <number>", "Number of results", "10")
  .action(async (options: any) => {
    try {
      const agent = await createAgent();
      const executions = await agent.listExecutions(
        options.workflow,
        parseInt(options.limit),
      );

      if (executions.length === 0) {
        console.log(chalk.gray("No executions found"));
        return;
      }

      console.log(chalk.bold("\nRecent Executions:\n"));

      for (const exec of executions) {
        const statusColor =
          exec.status === "completed"
            ? chalk.green
            : exec.status === "failed"
              ? chalk.red
              : chalk.yellow;

        console.log(`${statusColor("●")} ${exec.workflowName}`);
        console.log(chalk.gray(`  ID: ${exec.id}`));
        console.log(chalk.gray(`  Status: ${exec.status}`));
        console.log(
          chalk.gray(`  Started: ${exec.startedAt.toLocaleString()}`),
        );
        if (exec.error) {
          console.log(chalk.red(`  Error: ${exec.error}`));
        }
        console.log();
      }

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Show execution details
program
  .command("show <executionId>")
  .description("Show details of a workflow execution")
  .action(async (executionId: string) => {
    try {
      const agent = await createAgent();
      const details = await agent.getExecution(executionId);

      if (!details) {
        console.log(chalk.red("Execution not found"));
        process.exit(1);
      }

      const { execution, steps, context } = details;

      console.log(chalk.bold("\nExecution Details:\n"));
      console.log(`Workflow: ${chalk.cyan(execution.workflowName)}`);
      console.log(`ID: ${execution.id}`);
      console.log(`Status: ${getStatusBadge(execution.status)}`);
      console.log(`Started: ${execution.startedAt.toLocaleString()}`);
      if (execution.completedAt) {
        console.log(`Completed: ${execution.completedAt.toLocaleString()}`);
      }

      console.log(chalk.bold("\nSteps:\n"));
      for (const step of steps) {
        const statusIcon =
          step.status === "completed"
            ? chalk.green("✓")
            : step.status === "failed"
              ? chalk.red("✗")
              : step.status === "skipped"
                ? chalk.gray("○")
                : chalk.yellow("◐");

        console.log(`${statusIcon} ${step.action}`);
        if (step.error) {
          console.log(chalk.red(`  Error: ${step.error}`));
        }
      }

      if (Object.keys(context).length > 0) {
        console.log(chalk.bold("\nContext:\n"));
        console.log(JSON.stringify(context, null, 2));
      }

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Clean up old executions
program
  .command("cleanup")
  .description("Clean up old workflow executions")
  .option("-d, --days <number>", "Remove executions older than N days", "30")
  .action(async (options: any) => {
    try {
      const agent = await createAgent();
      const count = await agent.cleanup(parseInt(options.days));

      console.log(
        chalk.green(
          `✓ Cleaned up ${count} execution(s) older than ${options.days} days`,
        ),
      );

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Init command (create config directory)
program
  .command("init")
  .description("Initialize Hackflow configuration")
  .action(async () => {
    try {
      const agent = await createAgent();
      await agent.initialize();
      console.log(chalk.green("✓ Hackflow initialized successfully"));
      console.log(chalk.gray("  Config directory: ~/.hackflow"));
      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Helper functions

async function createAgent(): Promise<HackflowAgent> {
  const storage = createStorage({ type: "sqlite" });

  // Try to load AI provider (optional)
  let aiProvider;
  try {
    const aiConfig = loadAIConfig();
    if (aiConfig) {
      aiProvider = createAIProvider(aiConfig);
    }
  } catch (error) {
    // AI provider is optional - continue without it
    console.log(chalk.gray("ℹ️  AI features disabled (no API key found)"));
  }

  const promptHandler = new CLIPromptHandler(aiProvider);
  const security = new SecurityGuard({}, promptHandler);
  const mcpClient = new MCPClient();

  const agent = new HackflowAgent(
    storage,
    security,
    mcpClient,
    promptHandler,
    aiProvider,
  );
  await agent.initialize();

  return agent;
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function getStatusBadge(status: string): string {
  switch (status) {
    case "completed":
      return chalk.green("completed");
    case "failed":
      return chalk.red("failed");
    case "running":
      return chalk.yellow("running");
    case "paused":
      return chalk.blue("paused");
    default:
      return chalk.gray(status);
  }
}
