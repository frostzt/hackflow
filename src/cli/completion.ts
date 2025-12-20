/**
 * Shell completion for hackflow CLI
 * Supports bash, zsh, and fish
 */

import { homedir } from "os";
import { join, dirname } from "path";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { WorkflowLoader } from "../workflows/loader.js";
import type { InstalledWorkflow, InstallationManifest } from "../types/index.js";

// Get the hackflow installation directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HACKFLOW_WORKFLOWS_DIR = join(__dirname, "../../workflows");

// Cache for workflow names to avoid repeated filesystem reads
let workflowCache: { names: string[]; timestamp: number } | null = null;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Get all available workflow names for completion
 */
export function getWorkflowNames(): string[] {
  // Check cache
  if (workflowCache && Date.now() - workflowCache.timestamp < CACHE_TTL) {
    return workflowCache.names;
  }

  const names = new Set<string>();

  // 1. Get installed workflows
  const manifestPath = join(homedir(), ".hackflow", "workflows", "installed.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest: InstallationManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      for (const workflow of Object.values(manifest.workflows)) {
        names.add(workflow.shortName);
        names.add(workflow.fqn);
      }
    } catch {
      // Ignore errors
    }
  }

  // 2. Get built-in workflows (from hackflow's workflows directory)
  const builtinDirs = [
    join(homedir(), ".hackflow", "workflows"),
    HACKFLOW_WORKFLOWS_DIR,  // Built-in workflows bundled with hackflow
  ];

  for (const dir of builtinDirs) {
    collectWorkflowNames(dir, names);
  }

  const result = Array.from(names).sort();
  workflowCache = { names: result, timestamp: Date.now() };
  return result;
}

/**
 * Recursively collect workflow names from a directory
 */
function collectWorkflowNames(dir: string, names: Set<string>): void {
  if (!existsSync(dir)) return;

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
          collectWorkflowNames(fullPath, names);
        } else if (stat.isFile() && (entry.endsWith(".yaml") || entry.endsWith(".yml"))) {
          // Add filename without extension
          names.add(entry.replace(/\.ya?ml$/, ""));
          
          // Also add the workflow's internal name
          try {
            const workflow = WorkflowLoader.loadFromFile(fullPath);
            names.add(workflow.name);
          } catch {
            // Ignore invalid workflows
          }
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}

/**
 * Get completions for a partial workflow name
 */
export function completeWorkflow(partial: string): string[] {
  const names = getWorkflowNames();
  if (!partial) return names;
  
  const lower = partial.toLowerCase();
  return names.filter(name => name.toLowerCase().startsWith(lower));
}

/**
 * Generate bash completion script
 */
export function generateBashCompletion(): string {
  return `
# hackflow bash completion
_hackflow_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local cmd="\${COMP_WORDS[1]}"

  # Main commands
  local commands="run install uninstall update workflows search list show cleanup init completion help"

  case "\${cmd}" in
    run|install|i|uninstall|remove|update|search)
      # Complete with workflow names
      COMPREPLY=( $(compgen -W "$(hackflow --completion-list 2>/dev/null)" -- "\${cur}") )
      return 0
      ;;
    show)
      # Could complete with execution IDs but that's complex
      return 0
      ;;
    *)
      # Complete main commands
      if [[ \${COMP_CWORD} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        return 0
      fi
      ;;
  esac
}

complete -F _hackflow_completions hackflow
`.trim();
}

/**
 * Generate zsh completion script
 */
export function generateZshCompletion(): string {
  return `
#compdef hackflow

_hackflow() {
  local -a commands workflows

  commands=(
    'run:Execute a workflow by name or file path'
    'install:Install a workflow from hackflow-curated or GitHub'
    'uninstall:Remove an installed workflow'
    'update:Update installed workflows'
    'workflows:List available workflows'
    'search:Search for workflows'
    'list:List recent workflow executions'
    'show:Show details of a workflow execution'
    'cleanup:Clean up old workflow executions'
    'init:Initialize Hackflow configuration'
    'completion:Generate shell completion scripts'
    'help:Display help for command'
  )

  _arguments -C \\
    '1: :->command' \\
    '*: :->args'

  case "$state" in
    command)
      _describe -t commands 'hackflow commands' commands
      ;;
    args)
      case "\${words[2]}" in
        run|install|i|uninstall|remove|update|search)
          # Get workflow names dynamically
          workflows=(\${(f)"$(hackflow --completion-list 2>/dev/null)"})
          _describe -t workflows 'workflows' workflows
          ;;
        show)
          # Execution IDs - could be enhanced
          ;;
      esac
      ;;
  esac
}

# Only register the completion function, don't call it
compdef _hackflow hackflow
`.trim();
}

/**
 * Generate fish completion script
 */
export function generateFishCompletion(): string {
  return `
# hackflow fish completion

# Disable file completion by default
complete -c hackflow -f

# Main commands
complete -c hackflow -n "__fish_use_subcommand" -a "run" -d "Execute a workflow"
complete -c hackflow -n "__fish_use_subcommand" -a "install" -d "Install a workflow"
complete -c hackflow -n "__fish_use_subcommand" -a "uninstall" -d "Remove a workflow"
complete -c hackflow -n "__fish_use_subcommand" -a "update" -d "Update workflows"
complete -c hackflow -n "__fish_use_subcommand" -a "workflows" -d "List workflows"
complete -c hackflow -n "__fish_use_subcommand" -a "search" -d "Search workflows"
complete -c hackflow -n "__fish_use_subcommand" -a "list" -d "List executions"
complete -c hackflow -n "__fish_use_subcommand" -a "show" -d "Show execution details"
complete -c hackflow -n "__fish_use_subcommand" -a "cleanup" -d "Clean up old executions"
complete -c hackflow -n "__fish_use_subcommand" -a "init" -d "Initialize config"
complete -c hackflow -n "__fish_use_subcommand" -a "completion" -d "Shell completion"

# Workflow completion for relevant commands
complete -c hackflow -n "__fish_seen_subcommand_from run install uninstall update search" -a "(hackflow --completion-list 2>/dev/null)"
`.trim();
}

/**
 * Print installation instructions
 */
export function getInstallInstructions(shell: string): string {
  switch (shell) {
    case "bash":
      return `
# Add to ~/.bashrc or ~/.bash_profile:
eval "$(hackflow completion bash)"

# Or save to a file:
hackflow completion bash > ~/.local/share/bash-completion/completions/hackflow
`.trim();

    case "zsh":
      return `
# Add to ~/.zshrc:
eval "$(hackflow completion zsh)"

# Or save to completions directory:
hackflow completion zsh > ~/.zsh/completions/_hackflow
# Make sure ~/.zsh/completions is in your fpath
`.trim();

    case "fish":
      return `
# Save to fish completions directory:
hackflow completion fish > ~/.config/fish/completions/hackflow.fish
`.trim();

    default:
      return `
Supported shells: bash, zsh, fish

# Bash
eval "$(hackflow completion bash)"

# Zsh  
eval "$(hackflow completion zsh)"

# Fish
hackflow completion fish > ~/.config/fish/completions/hackflow.fish
`.trim();
  }
}
