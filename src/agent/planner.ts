/**
 * Planner - Creates execution plans from parsed intents
 */

import { randomUUID } from "crypto";
import type { 
  IModelProvider, 
  WorkflowDefinition, 
  IMCPClient,
  MCPTool 
} from "../types/index.js";
import type { WorkflowRegistry } from "../workflows/registry.js";
import type { 
  ParsedIntent, 
  ExecutionPlan, 
  PlanStep, 
  DataFlowMapping,
  RiskLevel,
  EphemeralWorkflowPlan,
  EnvironmentContext,
} from "./types.js";

export class Planner {
  constructor(
    private aiProvider: IModelProvider,
    private registry: WorkflowRegistry,
    private mcpClient: IMCPClient,
  ) {}

  /**
   * Create an execution plan from a parsed intent
   */
  async createPlan(
    intent: ParsedIntent,
    environment: EnvironmentContext,
  ): Promise<ExecutionPlan> {
    switch (intent.type) {
      case "execute":
        return this.planSingleWorkflow(intent, environment);
      
      case "chain":
        return this.planWorkflowChain(intent, environment);
      
      case "create":
        return this.planEphemeralWorkflow(intent, environment);
      
      default:
        throw new Error(`Cannot create plan for intent type: ${intent.type}`);
    }
  }

  /**
   * Plan a single workflow execution
   */
  private async planSingleWorkflow(
    intent: ParsedIntent,
    environment: EnvironmentContext,
  ): Promise<ExecutionPlan> {
    if (intent.matchedWorkflows.length === 0) {
      throw new Error("No workflow matched for execution");
    }

    const match = intent.matchedWorkflows[0];
    const definition = match.definition || await this.registry.get(match.workflow.name);
    
    if (!definition) {
      throw new Error(`Workflow "${match.workflow.name}" not found`);
    }

    const step: PlanStep = {
      id: randomUUID().slice(0, 8),
      type: "workflow",
      description: definition.description || `Execute ${definition.name}`,
      workflowName: definition.name,
      workflowDef: definition,
      params: intent.extractedParams,
      dependsOn: [],
      outputAs: "result",
      risk: this.assessWorkflowRisk(definition),
    };

    const risk = step.risk;
    const requiresConfirmation = risk !== "low";

    return {
      id: randomUUID(),
      description: `Execute ${definition.name}`,
      steps: [step],
      dataFlow: [],
      risk,
      requiresConfirmation,
      explanation: this.buildExplanation([step], intent.extractedParams),
    };
  }

  /**
   * Plan a chain of workflows
   */
  private async planWorkflowChain(
    intent: ParsedIntent,
    environment: EnvironmentContext,
  ): Promise<ExecutionPlan> {
    const chainNames = intent.suggestedChain || 
      intent.matchedWorkflows.map(m => m.workflow.name);

    if (chainNames.length === 0) {
      throw new Error("No workflows to chain");
    }

    const steps: PlanStep[] = [];
    const dataFlow: DataFlowMapping[] = [];
    let previousStepId: string | undefined;

    for (let i = 0; i < chainNames.length; i++) {
      const name = chainNames[i];
      const definition = await this.registry.get(name);
      
      if (!definition) {
        throw new Error(`Workflow "${name}" not found`);
      }

      const stepId = randomUUID().slice(0, 8);
      const step: PlanStep = {
        id: stepId,
        type: "workflow",
        description: definition.description || `Execute ${definition.name}`,
        workflowName: definition.name,
        workflowDef: definition,
        params: i === 0 ? intent.extractedParams : {},
        dependsOn: previousStepId ? [previousStepId] : [],
        outputAs: `step${i + 1}_result`,
        risk: this.assessWorkflowRisk(definition),
      };

      steps.push(step);

      // Add data flow from previous step
      if (previousStepId) {
        dataFlow.push({
          from: { step: previousStepId, variable: "result" },
          to: { step: stepId, variable: "previousResult" },
        });
      }

      previousStepId = stepId;
    }

    const overallRisk = this.calculateOverallRisk(steps);
    
    return {
      id: randomUUID(),
      description: `Chain: ${chainNames.join(" → ")}`,
      steps,
      dataFlow,
      risk: overallRisk,
      requiresConfirmation: overallRisk !== "low",
      explanation: this.buildChainExplanation(steps),
    };
  }

  /**
   * Plan an ephemeral workflow
   */
  private async planEphemeralWorkflow(
    intent: ParsedIntent,
    environment: EnvironmentContext,
  ): Promise<ExecutionPlan> {
    // Get available MCP tools
    const tools = await this.getAvailableTools();

    // Generate ephemeral workflow using AI
    const ephemeral = await this.generateEphemeralWorkflow(
      intent.originalInput,
      tools,
      environment,
    );

    const step: PlanStep = {
      id: randomUUID().slice(0, 8),
      type: "ephemeral",
      description: ephemeral.description,
      ephemeralWorkflow: ephemeral.workflow,
      params: intent.extractedParams,
      dependsOn: [],
      outputAs: "result",
      risk: ephemeral.risks.length > 0 ? "medium" : "low",
    };

    return {
      id: randomUUID(),
      description: `Ephemeral: ${ephemeral.description}`,
      steps: [step],
      dataFlow: [],
      risk: step.risk,
      requiresConfirmation: true, // Always confirm ephemeral workflows
      explanation: ephemeral.explanation,
      warnings: ephemeral.risks,
    };
  }

  /**
   * Generate an ephemeral workflow using AI
   */
  private async generateEphemeralWorkflow(
    userRequest: string,
    tools: MCPTool[],
    environment: EnvironmentContext,
  ): Promise<EphemeralWorkflowPlan> {
    const toolsContext = tools.map(t => {
      return `- ${t.name}: ${t.description || "No description"}`;
    }).join("\n");

    const prompt = `
Task: "${userRequest}"

Environment: ${environment.cwd}${environment.git ? `, branch: ${environment.git.branch}` : ""}

Available tools: ${toolsContext}

Generate a workflow using the templates from system prompt. Adapt TEMPLATE A for branch/commit tasks, TEMPLATE B for push/PR tasks, TEMPLATE C for simple commits.

Respond with JSON only:
{
  "description": "Short description",
  "explanation": "What this does step by step",
  "risks": ["potential risks"],
  "toolsUsed": ["git", "shell", "github"],
  "workflow": {
    "name": "ephemeral-taskname",
    "description": "...",
    "steps": [{ "action": "...", "description": "...", "params": {...}, "output": "..." }]
  }
}
`.trim();

    try {
      const response = await this.aiProvider.generate(prompt, {
        maxTokens: 2048,
        temperature: 0.3,
        systemPrompt: EPHEMERAL_SYSTEM_PROMPT,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to generate workflow");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure the workflow has proper structure
      const workflow = parsed.workflow as WorkflowDefinition;
      
      // Set prompt_mode to 'both' so prompts work during execution
      if (!workflow.prompt_mode) {
        workflow.prompt_mode = "both";
      }
      
      // Ensure steps have proper structure and fix common parameter issues
      if (workflow.steps) {
        workflow.steps = workflow.steps.map((step: any) => {
          const params = step.params || {};
          
          // Auto-fix: Add repo_path for git.* actions if missing
          if (step.action?.startsWith("git.") && !params.repo_path) {
            params.repo_path = ".";
          }
          
          // Auto-fix: Add staged: true for git.git_diff if missing (usually want staged)
          if (step.action === "git.git_diff" && params.staged === undefined) {
            params.staged = true;
          }
          
          return {
            action: step.action,
            description: step.description,
            params,
            output: step.output,
            condition: step.condition,
          };
        });
      }
      
      // CRITICAL: Detect and add mcps_required based on actions used
      workflow.mcps_required = this.detectRequiredMCPs(workflow);
      
      return {
        description: parsed.description,
        workflow,
        explanation: parsed.explanation,
        requiresConfirmation: true,
        risks: parsed.risks || [],
        toolsUsed: parsed.toolsUsed || [],
      };
    } catch (error) {
      throw new Error(`Failed to generate ephemeral workflow: ${(error as Error).message}`);
    }
  }

  /**
   * Detect which MCP servers are required based on the actions in the workflow
   */
  private detectRequiredMCPs(workflow: WorkflowDefinition): string[] {
    const mcps = new Set<string>();
    
    // Built-in actions that don't need MCP servers
    const builtInPrefixes = ["prompt", "ai", "log", "variable", "condition", "workflow"];
    
    for (const step of workflow.steps || []) {
      const action = step.action || "";
      
      // Skip built-in actions
      if (builtInPrefixes.some(prefix => action.startsWith(prefix + "."))) {
        continue;
      }
      
      // Extract the server name from action (e.g., "git.git_status" -> "git")
      const parts = action.split(".");
      if (parts.length >= 2) {
        const serverName = parts[0];
        mcps.add(serverName);
      }
    }
    
    return Array.from(mcps);
  }

  /**
   * Get available MCP tools
   */
  private async getAvailableTools(): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];
    
    // Try to get tools from all known servers
    const serverNames = ["shell", "git", "github", "gitlab"];
    
    for (const serverName of serverNames) {
      try {
        const serverTools = await this.mcpClient.listTools(serverName);
        tools.push(...serverTools);
      } catch {
        // Server not connected, skip
      }
    }

    return tools;
  }

  /**
   * Assess risk level of a workflow
   */
  private assessWorkflowRisk(workflow: WorkflowDefinition): RiskLevel {
    const riskyActions = [
      "git.push", "github.create_pr", "github.merge_pr",
      "deploy", "publish", "delete", "rm", "remove",
    ];

    const veryRiskyActions = [
      "force-push", "delete-branch", "drop", "truncate",
    ];

    let maxRisk: RiskLevel = "low";

    for (const step of workflow.steps) {
      const action = step.action.toLowerCase();
      const params = JSON.stringify(step.params || {}).toLowerCase();

      // Check for critical actions
      for (const risky of veryRiskyActions) {
        if (action.includes(risky) || params.includes(risky)) {
          return "critical";
        }
      }

      // Check for high risk actions
      for (const risky of riskyActions) {
        if (action.includes(risky) || params.includes(risky)) {
          maxRisk = maxRisk === "low" ? "medium" : maxRisk;
        }
      }

      // Remote write operations
      if (action.includes("push") || action.includes("deploy") || action.includes("publish")) {
        maxRisk = "high";
      }
    }

    return maxRisk;
  }

  /**
   * Calculate overall risk for a chain of workflows
   */
  private calculateOverallRisk(steps: PlanStep[]): RiskLevel {
    const riskOrder: RiskLevel[] = ["low", "medium", "high", "critical"];
    let maxIndex = 0;

    for (const step of steps) {
      const index = riskOrder.indexOf(step.risk);
      if (index > maxIndex) {
        maxIndex = index;
      }
    }

    return riskOrder[maxIndex];
  }

  /**
   * Build human-readable explanation for a plan
   */
  private buildExplanation(steps: PlanStep[], params: Record<string, any>): string {
    const parts: string[] = ["This will:"];

    for (const step of steps) {
      parts.push(`  • ${step.description}`);
    }

    if (Object.keys(params).length > 0) {
      parts.push("\nWith parameters:");
      for (const [key, value] of Object.entries(params)) {
        parts.push(`  • ${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Build explanation for a workflow chain
   */
  private buildChainExplanation(steps: PlanStep[]): string {
    const parts: string[] = ["This will execute the following workflows in order:"];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const prefix = i === steps.length - 1 ? "└" : "├";
      parts.push(`  ${prefix}─ ${step.workflowName}: ${step.description}`);
    }

    return parts.join("\n");
  }

  /**
   * Add missing parameters to a plan interactively
   */
  async fillMissingParams(
    plan: ExecutionPlan,
    getParam: (name: string, description?: string) => Promise<string>,
  ): Promise<ExecutionPlan> {
    for (const step of plan.steps) {
      if (step.type === "workflow" && step.workflowDef?.config_schema) {
        for (const [name, schema] of Object.entries(step.workflowDef.config_schema)) {
          if (schema.required && step.params[name] === undefined) {
            const value = await getParam(name, schema.description);
            step.params[name] = value;
          }
        }
      }
    }

    return plan;
  }
}

const EPHEMERAL_SYSTEM_PROMPT = `You are a workflow generator. Generate ONLY valid JSON workflows.

## CRITICAL RULES

1. Git MCP tools ALWAYS need "repo_path": "."
2. AI generation prompts MUST end with: "Output ONLY the [thing], nothing else. No explanation, no markdown, no quotes."
3. Use prompt.ask with "default" parameter when you have an AI-generated suggestion
4. NEVER use gh CLI - use github.create_pull_request MCP tool instead
5. NEVER use shell substitution $(command) - capture output with "output" field instead

## COMPLETE WORKING TEMPLATES - Copy and adapt these exactly:

### TEMPLATE A: Stage, create branch, commit
{
  "name": "ephemeral-branch-commit",
  "description": "Create branch from changes and commit",
  "steps": [
    { "action": "git.git_diff", "description": "Get staged changes", "params": { "repo_path": ".", "staged": true }, "output": "diff" },
    { "action": "ai.generate", "description": "Generate branch name", "params": { "prompt": "Generate a kebab-case git branch name for these changes. Output ONLY the branch name, nothing else. No explanation, no markdown, no quotes.\\n\\nChanges:\\n{{diff}}" }, "output": "suggested_branch" },
    { "action": "prompt.ask", "description": "Confirm branch name", "params": { "message": "Branch name", "default": "{{suggested_branch}}" }, "output": "branch_name" },
    { "action": "shell.execute_command", "description": "Create branch", "params": { "command": "git checkout -b {{branch_name}}" } },
    { "action": "ai.generate", "description": "Generate commit message", "params": { "prompt": "Generate a conventional commit message for these changes. Output ONLY the commit message, nothing else. No explanation, no markdown code blocks.\\n\\nChanges:\\n{{diff}}" }, "output": "commit_msg" },
    { "action": "git.git_commit", "description": "Commit changes", "params": { "repo_path": ".", "message": "{{commit_msg}}" } },
    { "action": "log.info", "description": "Done", "params": { "message": "Created branch {{branch_name}} and committed changes" } }
  ]
}

### TEMPLATE B: Push and create PR
{
  "name": "ephemeral-push-pr",
  "description": "Push branch and create PR",
  "steps": [
    { "action": "shell.execute_command", "description": "Get current branch", "params": { "command": "git branch --show-current" }, "output": "branch" },
    { "action": "shell.execute_command", "description": "Push to origin", "params": { "command": "git push -u origin {{branch}}" } },
    { "action": "shell.execute_command", "description": "Get remote URL", "params": { "command": "git remote get-url origin" }, "output": "remote_url" },
    { "action": "ai.generate", "description": "Extract owner/repo", "params": { "prompt": "Extract owner/repo from this git URL: {{remote_url}}\\n\\nOutput ONLY in format: owner/repo\\nNothing else. No explanation." }, "output": "owner_repo" },
    { "action": "shell.execute_command", "description": "Get owner", "params": { "command": "echo '{{owner_repo}}' | cut -d'/' -f1 | tr -d '\\n '" }, "output": "owner" },
    { "action": "shell.execute_command", "description": "Get repo", "params": { "command": "echo '{{owner_repo}}' | cut -d'/' -f2 | tr -d '\\n '" }, "output": "repo" },
    { "action": "git.git_diff", "description": "Get changes for PR", "params": { "repo_path": ".", "staged": false }, "output": "diff" },
    { "action": "ai.generate", "description": "Generate PR title", "params": { "prompt": "Generate a PR title for these changes. Output ONLY the title, nothing else. No quotes, no markdown.\\n\\nBranch: {{branch}}\\nChanges:\\n{{diff}}" }, "output": "pr_title" },
    { "action": "ai.generate", "description": "Generate PR body", "params": { "prompt": "Generate a PR description in markdown for these changes. Output ONLY the description, no preamble.\\n\\nChanges:\\n{{diff}}" }, "output": "pr_body" },
    { "action": "github.create_pull_request", "description": "Create PR", "params": { "owner": "{{owner}}", "repo": "{{repo}}", "head": "{{branch}}", "base": "main", "title": "{{pr_title}}", "body": "{{pr_body}}" }, "output": "pr_result" },
    { "action": "log.info", "description": "Done", "params": { "message": "PR created!\\n{{pr_result}}" } }
  ]
}

### TEMPLATE C: Simple commit with AI message
{
  "name": "ephemeral-smart-commit",
  "description": "Commit staged changes with AI message",
  "steps": [
    { "action": "git.git_diff", "description": "Get staged diff", "params": { "repo_path": ".", "staged": true }, "output": "diff" },
    { "action": "ai.generate", "description": "Generate commit message", "params": { "prompt": "Generate a conventional commit message for these changes. Output ONLY the commit message, nothing else.\\n\\nChanges:\\n{{diff}}" }, "output": "commit_msg" },
    { "action": "prompt.ask", "description": "Confirm message", "params": { "message": "Commit message", "default": "{{commit_msg}}" }, "output": "final_msg" },
    { "action": "git.git_commit", "description": "Commit", "params": { "repo_path": ".", "message": "{{final_msg}}" } },
    { "action": "log.info", "description": "Done", "params": { "message": "Committed: {{final_msg}}" } }
  ]
}

## OUTPUT FORMAT
Return ONLY valid JSON matching this structure:
{
  "name": "ephemeral-taskname",
  "description": "Short description",
  "steps": [...]
}

Adapt the templates above for the user's request. Keep it minimal.`;
