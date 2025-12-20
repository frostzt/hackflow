import { homedir } from "os";
import { join, dirname, basename } from "path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
} from "fs";
import type {
  InstalledWorkflow,
  InstallationManifest,
  ParsedWorkflowId,
  WorkflowSource,
  WorkflowDefinition,
} from "../types/index.js";
import { WorkflowLoader } from "./loader.js";

// GitHub raw content base URLs
const HACKFLOW_CURATED_REPO = "hackflow-ai/hackflow-curated";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";

/**
 * WorkflowInstaller - Handles workflow installation, updates, and removal
 * 
 * Workflow ID formats:
 * - "auto-ship" -> searches all namespaces
 * - "hackflow/shipping/auto-ship" -> from curated repo
 * - "hackflow/shipping/auto-ship@v1.0.0" -> specific version
 * - "@username/repo/workflow" -> from user's GitHub repo
 * - "./path/to/workflow.yaml" -> local file
 */
export class WorkflowInstaller {
  private baseDir: string;
  private manifestPath: string;
  private manifest: InstallationManifest;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), ".hackflow", "workflows");
    this.manifestPath = join(this.baseDir, "installed.json");
    this.manifest = this.loadManifest();
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Parse a workflow identifier into its components
   * 
   * Examples:
   * - "auto-ship" -> { namespace: "*", name: "auto-ship" }
   * - "hackflow/github/create-pr" -> { namespace: "hackflow", category: "github", name: "create-pr" }
   * - "@frostzt/my-workflows/deploy" -> { namespace: "@frostzt", category: "my-workflows", name: "deploy" }
   * - "./local.yaml" -> { namespace: "local", name: "local" }
   */
  parseWorkflowId(input: string): ParsedWorkflowId {
    // Handle version suffix
    let version: string | undefined;
    let workflowId = input;
    
    if (input.includes("@") && !input.startsWith("@")) {
      const atIndex = input.lastIndexOf("@");
      version = input.slice(atIndex + 1);
      workflowId = input.slice(0, atIndex);
    }

    // Local file path
    if (workflowId.startsWith("./") || workflowId.startsWith("/") || workflowId.endsWith(".yaml") || workflowId.endsWith(".yml")) {
      const name = basename(workflowId).replace(/\.ya?ml$/, "");
      return {
        raw: input,
        namespace: "local",
        name,
        version,
        fqn: `local/${name}`,
        source: { type: "local", path: workflowId },
      };
    }

    // User GitHub repo (@username/repo/path)
    if (workflowId.startsWith("@")) {
      const parts = workflowId.slice(1).split("/");
      if (parts.length < 2) {
        throw new Error(`Invalid workflow ID: ${input}. Expected @owner/repo or @owner/repo/path`);
      }
      
      const [owner, repo, ...pathParts] = parts;
      const name = pathParts.length > 0 ? pathParts[pathParts.length - 1] : repo;
      const category = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : undefined;
      
      return {
        raw: input,
        namespace: `@${owner}`,
        category: category || repo,
        name,
        version,
        fqn: `@${owner}/${repo}${pathParts.length > 0 ? "/" + pathParts.join("/") : ""}`,
        source: {
          type: "github",
          owner,
          repo,
          path: pathParts.length > 0 ? pathParts.join("/") : undefined,
          version,
        },
      };
    }

    // Hackflow curated or namespaced (hackflow/category/name or category/name)
    const parts = workflowId.split("/");
    
    if (parts.length === 1) {
      // Just a name - will search all namespaces
      return {
        raw: input,
        namespace: "*",
        name: parts[0],
        version,
        fqn: parts[0],
        source: { type: "hackflow", category: "*", name: parts[0], version },
      };
    }

    // Handle local/ namespace explicitly
    if (parts[0] === "local") {
      const name = parts.slice(1).join("/");
      return {
        raw: input,
        namespace: "local",
        name,
        version,
        fqn: `local/${name}`,
        source: { type: "local", path: name },
      };
    }
    
    if (parts.length === 2) {
      // category/name -> hackflow/category/name
      return {
        raw: input,
        namespace: "hackflow",
        category: parts[0],
        name: parts[1],
        version,
        fqn: `hackflow/${parts[0]}/${parts[1]}`,
        source: { type: "hackflow", category: parts[0], name: parts[1], version },
      };
    }
    
    if (parts.length >= 3 && parts[0] === "hackflow") {
      // hackflow/category/name
      const category = parts.slice(1, -1).join("/");
      const name = parts[parts.length - 1];
      return {
        raw: input,
        namespace: "hackflow",
        category,
        name,
        version,
        fqn: `hackflow/${category}/${name}`,
        source: { type: "hackflow", category, name, version },
      };
    }

    // Default: treat as hackflow/path
    const category = parts.slice(0, -1).join("/");
    const name = parts[parts.length - 1];
    return {
      raw: input,
      namespace: "hackflow",
      category,
      name,
      version,
      fqn: `hackflow/${category}/${name}`,
      source: { type: "hackflow", category, name, version },
    };
  }

  /**
   * Install a workflow from various sources
   */
  async install(workflowId: string, options: { force?: boolean } = {}): Promise<InstalledWorkflow> {
    const parsed = this.parseWorkflowId(workflowId);
    
    // Check if already installed (unless force)
    if (!options.force && this.manifest.workflows[parsed.fqn]) {
      const existing = this.manifest.workflows[parsed.fqn];
      console.log(`Workflow ${parsed.fqn} is already installed (version: ${existing.version})`);
      console.log(`Use --force to reinstall`);
      return existing;
    }

    console.log(`Installing ${parsed.fqn}...`);

    // Fetch and install based on source type
    let workflow: WorkflowDefinition;
    let localPath: string;
    let commitHash: string | undefined;

    switch (parsed.source.type) {
      case "local":
        ({ workflow, localPath } = await this.installFromLocal(parsed));
        break;
      
      case "hackflow":
        ({ workflow, localPath, commitHash } = await this.installFromHackflow(parsed));
        break;
      
      case "github":
        ({ workflow, localPath, commitHash } = await this.installFromGitHub(parsed));
        break;
      
      default:
        throw new Error(`Unsupported source type: ${(parsed.source as any).type}`);
    }

    // Extract dependencies from workflow
    const dependencies = this.extractDependencies(workflow);

    // Create installed workflow entry
    const installed: InstalledWorkflow = {
      fqn: parsed.fqn,
      shortName: workflow.name,
      namespace: parsed.namespace,
      category: parsed.category,
      version: parsed.version || workflow.version || "latest",
      source: workflowId,
      localPath,
      dependencies,
      installedAt: new Date(),
      updatedAt: new Date(),
      commitHash,
    };

    // Save to manifest
    this.manifest.workflows[parsed.fqn] = installed;
    this.saveManifest();

    console.log(`Installed ${parsed.fqn} (${installed.version})`);

    // Install dependencies
    if (dependencies.length > 0) {
      console.log(`\nInstalling ${dependencies.length} dependencies...`);
      for (const dep of dependencies) {
        try {
          await this.install(dep, { force: false });
        } catch (error) {
          console.warn(`Warning: Could not install dependency ${dep}: ${(error as Error).message}`);
        }
      }
    }

    return installed;
  }

  /**
   * Update installed workflows
   */
  async update(workflowId?: string): Promise<void> {
    if (workflowId) {
      // Update specific workflow
      const parsed = this.parseWorkflowId(workflowId);
      const installed = this.manifest.workflows[parsed.fqn];
      
      if (!installed) {
        throw new Error(`Workflow ${parsed.fqn} is not installed`);
      }

      console.log(`Updating ${parsed.fqn}...`);
      await this.install(installed.source, { force: true });
    } else {
      // Update all workflows
      const workflows = Object.values(this.manifest.workflows);
      console.log(`Updating ${workflows.length} workflows...`);
      
      for (const workflow of workflows) {
        try {
          await this.install(workflow.source, { force: true });
        } catch (error) {
          console.error(`Failed to update ${workflow.fqn}: ${(error as Error).message}`);
        }
      }
    }
  }

  /**
   * Remove an installed workflow
   */
  async remove(workflowId: string): Promise<void> {
    const parsed = this.parseWorkflowId(workflowId);
    const installed = this.manifest.workflows[parsed.fqn];
    
    if (!installed) {
      // Try to find by short name
      const found = Object.values(this.manifest.workflows).find(w => w.shortName === parsed.name);
      if (!found) {
        throw new Error(`Workflow ${workflowId} is not installed`);
      }
      return this.remove(found.fqn);
    }

    console.log(`Removing ${installed.fqn}...`);

    // Remove file
    if (existsSync(installed.localPath)) {
      rmSync(installed.localPath);
    }

    // Remove from manifest
    delete this.manifest.workflows[installed.fqn];
    this.saveManifest();

    console.log(`Removed ${installed.fqn}`);
  }

  /**
   * List installed workflows
   */
  list(): InstalledWorkflow[] {
    return Object.values(this.manifest.workflows);
  }

  /**
   * Search for workflows (searches installed + available from hackflow-curated)
   */
  async search(query: string): Promise<Array<{ fqn: string; name: string; description?: string; installed: boolean }>> {
    const results: Array<{ fqn: string; name: string; description?: string; installed: boolean }> = [];
    const lowerQuery = query.toLowerCase();

    // Search installed workflows
    for (const workflow of Object.values(this.manifest.workflows)) {
      if (
        workflow.shortName.toLowerCase().includes(lowerQuery) ||
        workflow.fqn.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          fqn: workflow.fqn,
          name: workflow.shortName,
          installed: true,
        });
      }
    }

    // TODO: Search hackflow-curated repo index
    // For now, return just installed workflows

    return results;
  }

  /**
   * Get installed workflow by FQN or short name
   */
  get(workflowId: string): InstalledWorkflow | null {
    const parsed = this.parseWorkflowId(workflowId);
    
    // Direct FQN match
    if (this.manifest.workflows[parsed.fqn]) {
      return this.manifest.workflows[parsed.fqn];
    }

    // Search by short name if namespace is wildcard
    if (parsed.namespace === "*") {
      // Priority: local > hackflow > @user
      const priorities = ["local", "hackflow"];
      
      for (const ns of priorities) {
        const found = Object.values(this.manifest.workflows).find(
          w => w.shortName === parsed.name && w.namespace === ns
        );
        if (found) return found;
      }

      // Then check user namespaces
      const found = Object.values(this.manifest.workflows).find(
        w => w.shortName === parsed.name
      );
      if (found) return found;
    }

    return null;
  }

  /**
   * Resolve a workflow name to its local file path
   * Used by the registry for workflow composition
   */
  resolve(workflowId: string): string | null {
    const installed = this.get(workflowId);
    if (installed && existsSync(installed.localPath)) {
      return installed.localPath;
    }
    return null;
  }

  // Private methods

  private async installFromLocal(parsed: ParsedWorkflowId): Promise<{ workflow: WorkflowDefinition; localPath: string }> {
    const source = parsed.source as { type: "local"; path: string };
    
    if (!existsSync(source.path)) {
      throw new Error(`File not found: ${source.path}`);
    }

    // Load and validate
    const workflow = WorkflowLoader.loadFromFile(source.path);
    
    // Copy to local namespace directory
    const localDir = join(this.baseDir, "local");
    mkdirSync(localDir, { recursive: true });
    
    const localPath = join(localDir, `${workflow.name}.yaml`);
    copyFileSync(source.path, localPath);

    return { workflow, localPath };
  }

  private async installFromHackflow(parsed: ParsedWorkflowId): Promise<{ workflow: WorkflowDefinition; localPath: string; commitHash?: string }> {
    const source = parsed.source as { type: "hackflow"; category: string; name: string; version?: string };
    
    // Build URL to fetch from hackflow-curated repo
    const version = source.version || "main";
    const filePath = `${source.category}/${source.name}.yaml`;
    const url = `${GITHUB_RAW_BASE}/${HACKFLOW_CURATED_REPO}/${version}/${filePath}`;

    console.log(`Fetching from ${url}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch workflow: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();
    
    // Parse and validate
    const workflow = WorkflowLoader.loadFromString(content, `${source.category}/${source.name}.yaml`);

    // Save to hackflow namespace directory
    const localDir = join(this.baseDir, "hackflow", source.category);
    mkdirSync(localDir, { recursive: true });
    
    const localPath = join(localDir, `${source.name}.yaml`);
    writeFileSync(localPath, content);

    // TODO: Get commit hash for version tracking
    const commitHash = undefined;

    return { workflow, localPath, commitHash };
  }

  private async installFromGitHub(parsed: ParsedWorkflowId): Promise<{ workflow: WorkflowDefinition; localPath: string; commitHash?: string }> {
    const source = parsed.source as { type: "github"; owner: string; repo: string; path?: string; version?: string };
    
    const version = source.version || "main";
    const filePath = source.path ? `${source.path}.yaml` : `${source.repo}.yaml`;
    const url = `${GITHUB_RAW_BASE}/${source.owner}/${source.repo}/${version}/${filePath}`;

    console.log(`Fetching from ${url}...`);

    const response = await fetch(url);
    if (!response.ok) {
      // Try without .yaml extension
      const altUrl = `${GITHUB_RAW_BASE}/${source.owner}/${source.repo}/${version}/${source.path || source.repo}`;
      const altResponse = await fetch(altUrl);
      if (!altResponse.ok) {
        throw new Error(`Failed to fetch workflow: ${response.status} ${response.statusText}`);
      }
    }

    const content = await response.text();
    
    // Parse and validate
    const workflow = WorkflowLoader.loadFromString(content, filePath);

    // Save to @owner namespace directory
    const localDir = join(this.baseDir, `@${source.owner}`, source.repo);
    if (source.path) {
      const pathDir = dirname(source.path);
      if (pathDir !== ".") {
        mkdirSync(join(localDir, pathDir), { recursive: true });
      }
    } else {
      mkdirSync(localDir, { recursive: true });
    }
    
    const localPath = join(localDir, source.path ? `${source.path}.yaml` : `${workflow.name}.yaml`);
    writeFileSync(localPath, content);

    return { workflow, localPath, commitHash: undefined };
  }

  private extractDependencies(workflow: WorkflowDefinition): string[] {
    const deps: Set<string> = new Set();

    for (const step of workflow.steps) {
      if (step.action === "workflow.run" && step.params?.workflow) {
        deps.add(step.params.workflow);
      }
    }

    return Array.from(deps);
  }

  private ensureDirectories(): void {
    const dirs = [
      this.baseDir,
      join(this.baseDir, "local"),
      join(this.baseDir, "hackflow"),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private loadManifest(): InstallationManifest {
    if (!existsSync(this.manifestPath)) {
      return {
        schemaVersion: 1,
        workflows: {},
      };
    }

    try {
      const data = JSON.parse(readFileSync(this.manifestPath, "utf-8"));
      
      // Convert date strings back to Date objects
      for (const workflow of Object.values(data.workflows) as InstalledWorkflow[]) {
        workflow.installedAt = new Date(workflow.installedAt);
        workflow.updatedAt = new Date(workflow.updatedAt);
      }
      
      return data;
    } catch (error) {
      console.warn(`Failed to load manifest: ${(error as Error).message}`);
      return {
        schemaVersion: 1,
        workflows: {},
      };
    }
  }

  private saveManifest(): void {
    writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }
}
