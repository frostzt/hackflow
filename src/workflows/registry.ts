import type {
  IWorkflowRegistry,
  WorkflowDefinition,
  WorkflowMetadata,
} from "../types/index.js";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { WorkflowLoader } from "./loader.js";

/**
 * Workflow Registry - manages workflow installation and discovery
 * 
 * For MVP: Simple file-based registry
 * Future: GitHub-based discovery and installation
 */
export class WorkflowRegistry implements IWorkflowRegistry {
  private workflowsDir: string;
  private metadataFile: string;
  private inMemoryWorkflows: Map<string, WorkflowDefinition>;

  constructor(baseDir?: string) {
    this.workflowsDir = baseDir ?? join(homedir(), ".hackflow", "workflows");
    this.metadataFile = join(this.workflowsDir, "metadata.json");
    this.inMemoryWorkflows = new Map();
    
    // Ensure directory exists
    if (!existsSync(this.workflowsDir)) {
      mkdirSync(this.workflowsDir, { recursive: true });
    }
  }

  /**
   * Register a workflow in-memory (useful for testing and programmatic workflows)
   */
  async register(workflow: WorkflowDefinition): Promise<void> {
    this.inMemoryWorkflows.set(workflow.name, workflow);
  }

  async install(source: string): Promise<string> {
    // TODO: Implement GitHub workflow installation
    // For now, just copy local file
    
    throw new Error("Workflow installation not yet implemented. Coming in v0.2!");
  }

  async list(): Promise<WorkflowMetadata[]> {
    // List all YAML files in workflows directory
    if (!existsSync(this.workflowsDir)) {
      return [];
    }

    const files = readdirSync(this.workflowsDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml")
    );

    const metadata: WorkflowMetadata[] = [];

    for (const file of files) {
      try {
        const filePath = join(this.workflowsDir, file);
        const workflow = WorkflowLoader.loadFromFile(filePath);
        
        metadata.push({
          name: workflow.name,
          description: workflow.description,
          version: workflow.version,
          author: workflow.author,
          source: filePath,
        });
      } catch (error) {
        console.warn(`Failed to load workflow ${file}:`, (error as Error).message);
      }
    }

    return metadata;
  }

  async get(name: string): Promise<WorkflowDefinition | null> {
    // Check in-memory workflows first
    if (this.inMemoryWorkflows.has(name)) {
      return this.inMemoryWorkflows.get(name)!;
    }

    // Then check file system recursively
    const workflow = this.findWorkflowRecursive(this.workflowsDir, name);
    return workflow;
  }

  /**
   * Recursively search for a workflow by name
   */
  private findWorkflowRecursive(dir: string, name: string): WorkflowDefinition | null {
    if (!existsSync(dir)) {
      return null;
    }

    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        const result = this.findWorkflowRecursive(fullPath, name);
        if (result) {
          return result;
        }
      } else if (stat.isFile() && (entry.endsWith(".yaml") || entry.endsWith(".yml"))) {
        // Check if this workflow file matches the name
        try {
          const workflow = WorkflowLoader.loadFromFile(fullPath);
          if (workflow.name === name) {
            return workflow;
          }
        } catch (error) {
          // Skip invalid files
        }
      }
    }

    return null;
  }

  async update(name: string): Promise<void> {
    // TODO: Implement workflow update from source
    throw new Error("Workflow update not yet implemented. Coming in v0.2!");
  }

  async remove(name: string): Promise<void> {
    // TODO: Implement workflow removal
    throw new Error("Workflow removal not yet implemented. Coming in v0.2!");
  }

  async search(query: string): Promise<WorkflowMetadata[]> {
    const all = await this.list();
    const lowerQuery = query.toLowerCase();

    return all.filter(
      (w) =>
        w.name.toLowerCase().includes(lowerQuery) ||
        w.description?.toLowerCase().includes(lowerQuery)
    );
  }

  // Helper methods

  private loadMetadata(): Record<string, WorkflowMetadata> {
    if (!existsSync(this.metadataFile)) {
      return {};
    }

    try {
      return JSON.parse(readFileSync(this.metadataFile, "utf-8"));
    } catch {
      return {};
    }
  }

  private saveMetadata(metadata: Record<string, WorkflowMetadata>): void {
    writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
  }
}
