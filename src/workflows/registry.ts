import type {
  IWorkflowRegistry,
  WorkflowDefinition,
  WorkflowMetadata,
} from "../types/index.js";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { WorkflowLoader } from "./loader.js";
import { WorkflowInstaller } from "./installer.js";

/**
 * Workflow Registry - manages workflow discovery and resolution
 * 
 * Resolution priority:
 * 1. In-memory registered workflows (for testing/programmatic use)
 * 2. Installed workflows (via WorkflowInstaller)
 * 3. Built-in workflows directory (bundled with hackflow)
 * 4. Current working directory (for development)
 */
export class WorkflowRegistry implements IWorkflowRegistry {
  private builtinDir: string;
  private userWorkflowsDir: string;
  private metadataFile: string;
  private inMemoryWorkflows: Map<string, WorkflowDefinition>;
  private installer: WorkflowInstaller;

  constructor(builtinDir?: string) {
    // Built-in workflows bundled with hackflow
    this.builtinDir = builtinDir ?? join(homedir(), ".hackflow", "workflows");
    
    // User's installed workflows
    this.userWorkflowsDir = join(homedir(), ".hackflow", "workflows");
    this.metadataFile = join(this.userWorkflowsDir, "metadata.json");
    this.inMemoryWorkflows = new Map();
    this.installer = new WorkflowInstaller(this.userWorkflowsDir);
    
    // Ensure directory exists
    if (!existsSync(this.userWorkflowsDir)) {
      mkdirSync(this.userWorkflowsDir, { recursive: true });
    }
  }

  /**
   * Register a workflow in-memory (useful for testing and programmatic workflows)
   */
  async register(workflow: WorkflowDefinition): Promise<void> {
    this.inMemoryWorkflows.set(workflow.name, workflow);
  }

  /**
   * Install a workflow from various sources
   * 
   * Examples:
   * - "auto-ship" -> searches hackflow-curated
   * - "hackflow/shipping/auto-ship" -> from curated repo
   * - "@username/repo/workflow" -> from user's GitHub repo
   * - "./local-workflow.yaml" -> local file
   */
  async install(source: string): Promise<string> {
    const installed = await this.installer.install(source);
    return installed.fqn;
  }

  /**
   * List all available workflows (installed + built-in)
   */
  async list(): Promise<WorkflowMetadata[]> {
    const metadata: WorkflowMetadata[] = [];
    const seen = new Set<string>();

    // 1. List installed workflows
    const installed = this.installer.list();
    for (const workflow of installed) {
      if (!seen.has(workflow.shortName)) {
        seen.add(workflow.shortName);
        metadata.push({
          name: workflow.shortName,
          version: workflow.version,
          source: workflow.fqn,
          installedAt: workflow.installedAt,
          updatedAt: workflow.updatedAt,
        });
      }
    }

    // 2. List built-in workflows
    const builtinWorkflows = this.listWorkflowsInDir(this.builtinDir);
    for (const workflow of builtinWorkflows) {
      if (!seen.has(workflow.name)) {
        seen.add(workflow.name);
        metadata.push(workflow);
      }
    }

    return metadata;
  }

  /**
   * Get a workflow by name
   * 
   * Resolution order:
   * 1. In-memory workflows
   * 2. Installed workflows (by short name or FQN)
   * 3. Built-in workflows directory
   */
  async get(name: string): Promise<WorkflowDefinition | null> {
    // 1. Check in-memory workflows first
    if (this.inMemoryWorkflows.has(name)) {
      return this.inMemoryWorkflows.get(name)!;
    }

    // 2. Check installed workflows
    const installedPath = this.installer.resolve(name);
    if (installedPath) {
      return WorkflowLoader.loadFromFile(installedPath);
    }

    // 3. Search built-in workflows directory
    const builtinWorkflow = this.findWorkflowRecursive(this.builtinDir, name);
    if (builtinWorkflow) {
      return builtinWorkflow;
    }

    // 4. Try current working directory (for development)
    const cwdWorkflow = this.findWorkflowRecursive(process.cwd(), name);
    if (cwdWorkflow) {
      return cwdWorkflow;
    }

    return null;
  }

  /**
   * Update an installed workflow (or all if no name given)
   */
  async update(name?: string): Promise<void> {
    await this.installer.update(name);
  }

  /**
   * Remove an installed workflow
   */
  async remove(name: string): Promise<void> {
    await this.installer.remove(name);
  }

  /**
   * Search for workflows by query
   */
  async search(query: string): Promise<WorkflowMetadata[]> {
    const all = await this.list();
    const lowerQuery = query.toLowerCase();

    return all.filter(
      (w) =>
        w.name.toLowerCase().includes(lowerQuery) ||
        w.description?.toLowerCase().includes(lowerQuery) ||
        w.source?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get the installer instance for direct access
   */
  getInstaller(): WorkflowInstaller {
    return this.installer;
  }

  // Private helper methods

  /**
   * Recursively search for a workflow by name or filename
   */
  private findWorkflowRecursive(dir: string, name: string): WorkflowDefinition | null {
    if (!existsSync(dir)) {
      return null;
    }

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        
        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip node_modules and hidden directories
            if (entry === "node_modules" || entry.startsWith(".")) {
              continue;
            }
            
            // Recursively search subdirectories
            const result = this.findWorkflowRecursive(fullPath, name);
            if (result) {
              return result;
            }
          } else if (stat.isFile() && (entry.endsWith(".yaml") || entry.endsWith(".yml"))) {
            // Check if this workflow file matches the name (by workflow.name or filename)
            const filenameWithoutExt = entry.replace(/\.ya?ml$/, "");
            
            try {
              const workflow = WorkflowLoader.loadFromFile(fullPath);
              // Match by workflow.name OR by filename
              if (workflow.name === name || filenameWithoutExt === name) {
                return workflow;
              }
            } catch {
              // Skip invalid files
            }
          }
        } catch {
          // Skip files/dirs we can't access
        }
      }
    } catch {
      // Skip directories we can't read
    }

    return null;
  }

  /**
   * List all workflows in a directory (non-recursive, used for top-level listing)
   */
  private listWorkflowsInDir(dir: string): WorkflowMetadata[] {
    if (!existsSync(dir)) {
      return [];
    }

    const metadata: WorkflowMetadata[] = [];
    this.collectWorkflowsRecursive(dir, metadata);
    return metadata;
  }

  /**
   * Recursively collect workflow metadata from a directory
   */
  private collectWorkflowsRecursive(dir: string, results: WorkflowMetadata[]): void {
    if (!existsSync(dir)) {
      return;
    }

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        
        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip node_modules and hidden directories
            if (entry === "node_modules" || entry.startsWith(".")) {
              continue;
            }
            this.collectWorkflowsRecursive(fullPath, results);
          } else if (stat.isFile() && (entry.endsWith(".yaml") || entry.endsWith(".yml"))) {
            try {
              const workflow = WorkflowLoader.loadFromFile(fullPath);
              results.push({
                name: workflow.name,
                description: workflow.description,
                version: workflow.version,
                author: workflow.author,
                source: fullPath,
              });
            } catch {
              // Skip invalid files
            }
          }
        } catch {
          // Skip files/dirs we can't access
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
}
