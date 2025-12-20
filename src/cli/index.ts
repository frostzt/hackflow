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
import { CLIProgressReporter } from "./progress.js";

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
  .option("-q, --quiet", "Suppress progress output")
  .option("--mock-mcp", "Use mock MCP servers (for development/testing)")
  .option("--var <key=value>", "Set workflow variables", collect, [])
  .action(async (workflow: string, options: any) => {
    try {
      // Use real MCP by default, mock only if --mock-mcp flag is set
      const mcpType = options.mockMcp ? "mock" : "real";
      const agent = await createAgent(mcpType);

      // Setup progress reporter unless quiet mode
      if (!options.quiet && !options.dryRun) {
        const progressReporter = new CLIProgressReporter({ 
          verbose: options.verbose 
        });
        agent.onProgress((event) => progressReporter.handleEvent(event));
      }

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

      if (options.quiet || options.dryRun) {
        if (isFilePath) {
          console.log(chalk.blue(`🚀 Running workflow file: ${workflow}`));
        } else {
          console.log(chalk.blue(`🚀 Running workflow: ${workflow}`));
        }
        
        if (options.dryRun) {
          console.log(chalk.yellow("⚠️  DRY RUN MODE - No changes will be made"));
        }
        console.log();
      }

      // Use smart resolution - tries registry first, then file path
      const result = await agent.runWorkflowByName(workflow, config);

      // Show summary (progress reporter already showed the progress)
      if (options.quiet || options.dryRun) {
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
      } else {
        // Progress reporter already showed completion, just show execution ID
        console.log(chalk.gray(`Execution ID: ${result.executionId}`));
        if (result.status === "failed") {
          process.exit(1);
        }
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
  .option("-a, --all", "Include child executions (show all)")
  .action(async (options: any) => {
    try {
      const agent = await createAgent();
      const executions = await agent.listExecutions(
        options.workflow,
        parseInt(options.limit),
        options.all,
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

        const statusIcon =
          exec.status === "completed" ? "✓"
          : exec.status === "failed" ? "✗"
          : exec.status === "running" ? "◐"
          : "○";

        // Get child count if available
        let childInfo = "";
        if (!options.all) {
          try {
            const children = await agent.getChildExecutions(exec.id);
            if (children.length > 0) {
              childInfo = chalk.gray(` (${children.length} sub-workflow${children.length > 1 ? "s" : ""})`);
            }
          } catch {
            // Ignore errors getting children
          }
        }

        // Format duration
        const duration = exec.duration 
          ? formatDuration(exec.duration)
          : exec.completedAt 
            ? formatDuration(exec.completedAt.getTime() - exec.startedAt.getTime())
            : "";

        console.log(`${statusColor(statusIcon)} ${chalk.bold(exec.workflowName)}${childInfo}`);
        console.log(chalk.gray(`   ID: ${exec.id.slice(0, 8)}...`));
        console.log(chalk.gray(`   Status: ${exec.status}${duration ? ` • ${duration}` : ""}`));
        console.log(chalk.gray(`   Started: ${exec.startedAt.toLocaleString()}`));
        
        if (exec.totalSteps) {
          console.log(chalk.gray(`   Steps: ${exec.currentStep ?? 0}/${exec.totalSteps}`));
        }
        
        if (exec.error) {
          // Truncate error message
          const shortError = exec.error.length > 60 
            ? exec.error.slice(0, 60) + "..." 
            : exec.error;
          console.log(chalk.red(`   Error: ${shortError}`));
        }
        console.log();
      }

      console.log(chalk.gray(`Tip: Use "hackflow show <id>" for full details`));

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
  .option("-t, --tree", "Show full execution tree with children")
  .option("-v, --verbose", "Show all details including input/output")
  .option("-c, --context", "Show execution context/variables")
  .action(async (executionId: string, options: any) => {
    try {
      const agent = await createAgent();
      
      // Handle partial execution ID
      let fullId = executionId;
      if (executionId.length < 36) {
        // Try to find matching execution
        const executions = await agent.listExecutions(undefined, 100, true);
        const match = executions.find(e => e.id.startsWith(executionId));
        if (match) {
          fullId = match.id;
        }
      }

      if (options.tree) {
        // Show full tree
        const tree = await agent.getExecutionTree(fullId);
        console.log(chalk.bold("\nExecution Tree:\n"));
        printExecutionTree(tree, 0, options.verbose);
      } else {
        // Show single execution details
        const details = await agent.getExecution(fullId);

        if (!details) {
          console.log(chalk.red("Execution not found"));
          process.exit(1);
        }

        const { execution, steps, context } = details;

        // Header
        console.log(chalk.bold("\n═══════════════════════════════════════════════════════════"));
        console.log(chalk.bold(`  ${execution.workflowName}`));
        console.log(chalk.bold("═══════════════════════════════════════════════════════════\n"));

        // Status and metadata
        console.log(`${chalk.gray("ID:")}       ${execution.id}`);
        console.log(`${chalk.gray("Status:")}   ${getStatusBadge(execution.status)}`);
        console.log(`${chalk.gray("Started:")}  ${execution.startedAt.toLocaleString()}`);
        if (execution.completedAt) {
          console.log(`${chalk.gray("Completed:")} ${execution.completedAt.toLocaleString()}`);
        }
        if (execution.duration) {
          console.log(`${chalk.gray("Duration:")} ${formatDuration(execution.duration)}`);
        }
        if (execution.totalSteps) {
          console.log(`${chalk.gray("Progress:")} ${execution.currentStep ?? 0}/${execution.totalSteps} steps`);
        }
        if (execution.parentExecutionId) {
          console.log(`${chalk.gray("Parent:")}   ${execution.parentExecutionId.slice(0, 8)}...`);
        }
        if (execution.trigger) {
          console.log(`${chalk.gray("Trigger:")}  ${execution.trigger.type}${execution.trigger.source ? ` (${execution.trigger.source})` : ""}`);
        }

        // Steps
        console.log(chalk.bold("\n─── Steps ───────────────────────────────────────────────────\n"));
        
        for (const step of steps) {
          printStep(step, options.verbose);
        }

        // Error details
        if (execution.error) {
          console.log(chalk.bold("\n─── Error ───────────────────────────────────────────────────\n"));
          console.log(chalk.red(execution.error));
          if (options.verbose && execution.errorStack) {
            console.log(chalk.gray("\nStack trace:"));
            console.log(chalk.gray(execution.errorStack));
          }
        }

        // Child executions
        const children = await agent.getChildExecutions(fullId);
        if (children.length > 0) {
          console.log(chalk.bold("\n─── Child Workflows ─────────────────────────────────────────\n"));
          for (const child of children) {
            const childStatus = getStatusBadge(child.status);
            const childDuration = child.duration ? formatDuration(child.duration) : "";
            console.log(`  ${childStatus} ${child.workflowName} ${chalk.gray(`(${child.id.slice(0, 8)}...)`)} ${chalk.gray(childDuration)}`);
          }
          console.log(chalk.gray("\n  Use --tree to see full nested view"));
        }

        // Context
        if (options.context && Object.keys(context).length > 0) {
          console.log(chalk.bold("\n─── Context ─────────────────────────────────────────────────\n"));
          console.log(JSON.stringify(context, null, 2));
        }

        console.log();
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

// UI command - start the web-based UI explorer
program
  .command("ui")
  .description("Start the web-based UI explorer to view workflow executions")
  .option("-p, --port <number>", "Port number", "3333")
  .option("-h, --host <host>", "Host to bind to", "localhost")
  .option("-o, --open", "Open browser automatically")
  .action(async (options: any) => {
    try {
      const agent = await createAgent();
      const { UIServer } = await import("../ui/server.js");
      
      const server = new UIServer({
        port: parseInt(options.port),
        host: options.host,
        storage: agent.getStorage(),
      });

      const url = await server.start();
      
      console.log(chalk.bold("\n╔══════════════════════════════════════════════════════════╗"));
      console.log(chalk.bold("║            Hackflow Explorer                              ║"));
      console.log(chalk.bold("╚══════════════════════════════════════════════════════════╝\n"));
      console.log(`  ${chalk.green("✓")} Server running at ${chalk.cyan(url)}`);
      console.log();
      console.log(chalk.gray("  Press Ctrl+C to stop the server\n"));

      // Open browser if requested
      if (options.open) {
        const { exec } = await import("child_process");
        const openCmd = process.platform === "darwin" ? "open" 
          : process.platform === "win32" ? "start" 
          : "xdg-open";
        exec(`${openCmd} ${url}`);
      }

      // Keep process alive
      process.on("SIGINT", async () => {
        console.log(chalk.gray("\n  Shutting down..."));
        await server.stop();
        await agent.shutdown();
        process.exit(0);
      });
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
      return chalk.green("✓ completed");
    case "failed":
      return chalk.red("✗ failed");
    case "running":
      return chalk.yellow("◐ running");
    case "paused":
      return chalk.blue("⏸ paused");
    case "skipped":
      return chalk.gray("○ skipped");
    default:
      return chalk.gray(status);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function printStep(step: any, verbose: boolean = false): void {
  const statusIcon =
    step.status === "completed"
      ? chalk.green("✓")
      : step.status === "failed"
        ? chalk.red("✗")
        : step.status === "skipped"
          ? chalk.gray("○")
          : chalk.yellow("◐");

  const duration = step.duration ? chalk.gray(` (${formatDuration(step.duration)})`) : "";
  const desc = step.description ? chalk.gray(` - ${step.description}`) : "";
  
  console.log(`  ${statusIcon} ${chalk.white(step.action)}${duration}${desc}`);
  
  if (step.childExecutionId) {
    console.log(chalk.cyan(`     └─ Child workflow: ${step.childExecutionId.slice(0, 8)}...`));
  }

  if (step.skipReason) {
    console.log(chalk.gray(`     Skipped: ${step.skipReason}`));
  }

  if (step.error) {
    console.log(chalk.red(`     Error: ${step.error}`));
  }

  if (verbose) {
    if (step.input && Object.keys(step.input).length > 0) {
      console.log(chalk.gray("     Input:"), JSON.stringify(step.input, null, 2).split("\n").join("\n     "));
    }
    if (step.output !== undefined) {
      const outputStr = typeof step.output === "string" 
        ? step.output.slice(0, 200) + (step.output.length > 200 ? "..." : "")
        : JSON.stringify(step.output, null, 2).slice(0, 200);
      console.log(chalk.gray("     Output:"), outputStr.split("\n").join("\n     "));
    }
  }
}

function printExecutionTree(tree: any, depth: number = 0, verbose: boolean = false): void {
  const indent = "  ".repeat(depth);
  const prefix = depth === 0 ? "" : "├─ ";
  
  const { execution, steps, children } = tree;
  
  const statusIcon =
    execution.status === "completed"
      ? chalk.green("✓")
      : execution.status === "failed"
        ? chalk.red("✗")
        : chalk.yellow("◐");

  const duration = execution.duration ? chalk.gray(` (${formatDuration(execution.duration)})`) : "";
  
  console.log(`${indent}${prefix}${statusIcon} ${chalk.bold(execution.workflowName)}${duration}`);
  console.log(`${indent}   ${chalk.gray(`ID: ${execution.id.slice(0, 8)}... • ${steps.length} steps`)}`);
  
  if (execution.error) {
    const shortError = execution.error.length > 50 ? execution.error.slice(0, 50) + "..." : execution.error;
    console.log(`${indent}   ${chalk.red(`Error: ${shortError}`)}`);
  }

  // Print steps
  if (verbose || depth === 0) {
    console.log(`${indent}   ${chalk.gray("Steps:")}`);
    for (const step of steps) {
      const stepIcon =
        step.status === "completed" ? chalk.green("✓")
        : step.status === "failed" ? chalk.red("✗")
        : step.status === "skipped" ? chalk.gray("○")
        : chalk.yellow("◐");
      
      const stepDuration = step.duration ? chalk.gray(` ${formatDuration(step.duration)}`) : "";
      console.log(`${indent}   ${stepIcon} ${step.action}${stepDuration}`);
      
      if (step.error && verbose) {
        console.log(`${indent}      ${chalk.red(step.error)}`);
      }
    }
  }
  
  // Print children
  if (children.length > 0) {
    console.log(`${indent}   ${chalk.gray("Sub-workflows:")}`);
    for (const child of children) {
      printExecutionTree(child, depth + 1, verbose);
    }
  }
  
  if (depth === 0) console.log();
}
