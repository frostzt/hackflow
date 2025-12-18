import type {
  IWorkflowRegistry,
  WorkflowDefinition,
  WorkflowMetadata,
} from "../types/index.js";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
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

  constructor(baseDir?: string) {
    this.workflowsDir = baseDir ?? join(homedir(), ".hackflow", "workflows");
    this.metadataFile = join(this.workflowsDir, "metadata.json");
    
    // Ensure directory exists
    if (!existsSync(this.workflowsDir)) {
      mkdirSync(this.workflowsDir, { recursive: true });
    }
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
    const files = readdirSync(this.workflowsDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml")
    );

    for (const file of files) {
      try {
        const filePath = join(this.workflowsDir, file);
        const workflow = WorkflowLoader.loadFromFile(filePath);
        
        if (workflow.name === name) {
          return workflow;
        }
      } catch (error) {
        // Skip invalid files
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
