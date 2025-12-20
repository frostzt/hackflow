#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { HackflowAgent } from "../core/agent.js";
import { createStorage } from "../storage/index.js";
import { SecurityGuard } from "../security/index.js";
import { createMCPClient } from "../mcps/index.js";
import { CLIPromptHandler } from "../core/prompt.js";
import { createAIProvider, loadAIConfig } from "../ai/index.js";
import type { WorkflowConfig } from "../types/index.js";
import { existsSync } from "fs";
import {
  getWorkflowNames,
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
  getInstallInstructions,
} from "./completion.js";

const program = new Command();

// Handle --completion-list before anything else (for shell completion)
if (process.argv.includes("--completion-list")) {
  const names = getWorkflowNames();
  console.log(names.join("\n"));
  process.exit(0);
}

program
  .name("hackflow")
  .description("A hackable AI agent with workflow-based plugins")
  .version("0.1.0");

// Run command - now supports both names and file paths
program
  .command("run <workflow>")
  .description("Execute a workflow by name or file path")
  .option("-c, --config <file>", "Config file with workflow values")
  .option("-d, --dry-run", "Simulate execution without making changes")
  .option("-v, --verbose", "Verbose output")
  .option("--mock-mcp", "Use mock MCP servers (for development/testing)")
  .option("--var <key=value>", "Set workflow variables", collect, [])
  .action(async (workflow: string, options: any) => {
    try {
      // Use real MCP by default, mock only if --mock-mcp flag is set
      const mcpType = options.mockMcp ? "mock" : "real";
      const agent = await createAgent(mcpType);

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

      // Determine if it's a file path or workflow name
      const isFilePath = workflow.includes("/") || 
                         workflow.endsWith(".yaml") || 
                         workflow.endsWith(".yml") ||
                         existsSync(workflow);

      if (isFilePath) {
        console.log(chalk.blue(`🚀 Running workflow file: ${workflow}`));
      } else {
        console.log(chalk.blue(`🚀 Running workflow: ${workflow}`));
      }
      
      if (options.dryRun) {
        console.log(chalk.yellow("⚠️  DRY RUN MODE - No changes will be made"));
      }
      console.log();

      // Use smart resolution - tries registry first, then file path
      const result = await agent.runWorkflowByName(workflow, config);

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

// Install command
program
  .command("install <workflow>")
  .alias("i")
  .description("Install a workflow from hackflow-curated or GitHub")
  .option("-f, --force", "Force reinstall if already installed")
  .action(async (workflow: string, options: any) => {
    try {
      const agent = await createAgent();
      const registry = agent.getRegistry();
      
      console.log(chalk.blue(`📦 Installing workflow: ${workflow}`));
      console.log();

      const fqn = await registry.install(workflow);
      
      console.log();
      console.log(chalk.green(`✓ Installed ${fqn}`));
      console.log(chalk.gray(`  Run with: hackflow run ${workflow.split("/").pop()}`));

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Update command
program
  .command("update [workflow]")
  .description("Update installed workflows (all if no name given)")
  .action(async (workflow?: string) => {
    try {
      const agent = await createAgent();
      const registry = agent.getRegistry();

      if (workflow) {
        console.log(chalk.blue(`🔄 Updating workflow: ${workflow}`));
      } else {
        console.log(chalk.blue("🔄 Updating all workflows..."));
      }
      console.log();

      await registry.update(workflow);
      
      console.log();
      console.log(chalk.green("✓ Update complete"));

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Uninstall command
program
  .command("uninstall <workflow>")
  .alias("remove")
  .description("Remove an installed workflow")
  .action(async (workflow: string) => {
    try {
      const agent = await createAgent();
      const registry = agent.getRegistry();

      console.log(chalk.blue(`🗑️  Removing workflow: ${workflow}`));

      await registry.remove(workflow);
      
      console.log(chalk.green(`✓ Removed ${workflow}`));

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// List workflows command
program
  .command("workflows")
  .alias("ls")
  .description("List available workflows")
  .option("-i, --installed", "Show only installed workflows")
  .option("-a, --all", "Show all details including source")
  .action(async (options: any) => {
    try {
      const agent = await createAgent();
      const registry = agent.getRegistry();

      const workflows = await registry.list();

      if (workflows.length === 0) {
        console.log(chalk.gray("No workflows found"));
        console.log(chalk.gray("Install workflows with: hackflow install <workflow>"));
        await agent.shutdown();
        return;
      }

      console.log(chalk.bold("\nAvailable Workflows:\n"));

      // Group by category (extracted from source path or workflow name prefix)
      const grouped: Record<string, typeof workflows> = {};
      
      for (const w of workflows) {
        let category = "Other";
        
        // Try to extract category from source path
        if (w.source) {
          // Match patterns like /workflows/git/, /workflows/github/, /workflows/shipping/
          // The category is the folder right after "workflows/"
          const pathMatch = w.source.match(/[\/\\]workflows[\/\\](\w+)[\/\\]/);
          if (pathMatch) {
            category = pathMatch[1];
          }
          // For FQN sources like "hackflow/github/create-pr" or "local/my-workflow"
          else if (!w.source.startsWith("/") && w.source.includes("/")) {
            const parts = w.source.split("/");
            if (parts.length >= 2) {
              // Skip namespace prefix if present
              category = parts[0] === "local" || parts[0] === "hackflow" || parts[0].startsWith("@") 
                ? (parts[1] || "other")
                : parts[0];
            }
          }
        }
        
        // Also try to extract from workflow name prefix (e.g., "git-smart-commit" -> "git")
        if (category === "Other" && w.name.includes("-")) {
          const prefix = w.name.split("-")[0];
          if (["git", "github", "gitlab", "docker", "npm", "code", "validate"].includes(prefix)) {
            category = prefix;
          }
        }

        // Capitalize category name
        category = category.charAt(0).toUpperCase() + category.slice(1);
        
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(w);
      }

      // Sort categories alphabetically, but put "Other" last
      const sortedCategories = Object.keys(grouped).sort((a, b) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      });

      for (const category of sortedCategories) {
        const items = grouped[category];
        // Sort workflows within category
        items.sort((a, b) => a.name.localeCompare(b.name));
        
        console.log(chalk.cyan.bold(`${category}:`));
        for (const w of items) {
          const version = w.version ? chalk.gray(` @${w.version}`) : "";
          const installed = w.installedAt ? chalk.green(" ✓") : "";
          const desc = w.description ? chalk.gray(` - ${w.description}`) : "";
          
          if (options.all) {
            console.log(`  ${chalk.white(w.name)}${version}${installed}`);
            if (w.description) console.log(chalk.gray(`    ${w.description}`));
            if (w.source) console.log(chalk.gray(`    Source: ${w.source}`));
          } else {
            // Truncate description if too long
            const maxDescLen = 50;
            let shortDesc = w.description || "";
            if (shortDesc.length > maxDescLen) {
              shortDesc = shortDesc.slice(0, maxDescLen) + "...";
            }
            const descDisplay = shortDesc ? chalk.gray(` - ${shortDesc}`) : "";
            console.log(`  ${chalk.white(w.name)}${version}${installed}${descDisplay}`);
          }
        }
        console.log();
      }

      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Search command
program
  .command("search <query>")
  .description("Search for workflows")
  .action(async (query: string) => {
    try {
      const agent = await createAgent();
      const registry = agent.getRegistry();

      console.log(chalk.blue(`🔍 Searching for: ${query}`));
      console.log();

      const results = await registry.search(query);

      if (results.length === 0) {
        console.log(chalk.gray("No workflows found matching your query"));
        await agent.shutdown();
        return;
      }

      console.log(chalk.bold(`Found ${results.length} workflow(s):\n`));

      for (const w of results) {
        const version = w.version ? chalk.gray(`@${w.version}`) : "";
        const desc = w.description ? chalk.gray(` - ${w.description}`) : "";
        const installed = w.installedAt ? chalk.green(" [installed]") : "";
        console.log(`  ${chalk.white(w.name)}${version}${installed}${desc}`);
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
      console.log(chalk.gray("  Workflows directory: ~/.hackflow/workflows"));
      console.log();
      console.log(chalk.gray("Next steps:"));
      console.log(chalk.gray("  1. Install workflows: hackflow install shipping/auto-ship"));
      console.log(chalk.gray("  2. Run workflows: hackflow run auto-ship"));
      console.log(chalk.gray("  3. Enable tab completion: hackflow completion"));
      await agent.shutdown();
    } catch (error) {
      console.error(chalk.red("Error:"), (error as Error).message);
      process.exit(1);
    }
  });

// Completion command
program
  .command("completion [shell]")
  .description("Generate shell completion scripts (bash, zsh, fish)")
  .action((shell?: string) => {
    if (!shell) {
      // Show instructions for all shells
      console.log(chalk.bold("\nShell Completion Setup\n"));
      console.log(getInstallInstructions(""));
      return;
    }

    switch (shell.toLowerCase()) {
      case "bash":
        console.log(generateBashCompletion());
        break;
      case "zsh":
        console.log(generateZshCompletion());
        break;
      case "fish":
        console.log(generateFishCompletion());
        break;
      case "install":
        // Show installation instructions
        console.log(chalk.bold("\nShell Completion Installation\n"));
        console.log(getInstallInstructions(""));
        break;
      default:
        console.error(chalk.red(`Unknown shell: ${shell}`));
        console.log(chalk.gray("Supported shells: bash, zsh, fish"));
        process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Helper functions

async function createAgent(mcpType: "mock" | "real" = "real"): Promise<HackflowAgent> {
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
  const mcpClient = createMCPClient({ type: mcpType });

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
