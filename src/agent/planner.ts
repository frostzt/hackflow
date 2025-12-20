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
Create a workflow to accomplish this task:
"${userRequest}"

## Available MCP Tools
${toolsContext}

## Built-in Actions (always available)
- prompt.ask: Ask user for input. Params: { message: "question" }. Use for branch names, custom inputs.
- ai.generate: Generate text with AI. Params: { prompt: "...", temperature: 0.3 }. Use for commit messages, summaries.
- log.info: Show message to user. Params: { message: "..." }

## Git MCP Tools (IMPORTANT: always include repo_path: ".")
- git.git_status: Get repo status. Params: { repo_path: "." }
- git.git_diff: Get diff. Params: { repo_path: ".", staged: true/false }
- git.git_add: Stage files. Params: { repo_path: ".", files: ["."] }
- git.git_commit: Commit. Params: { repo_path: ".", message: "..." }

## Shell MCP Tools
- shell.execute_command: Run shell command. Params: { command: "..." }

## Environment
Working Directory: ${environment.cwd}
${environment.git ? `Git Branch: ${environment.git.branch}` : "Not a git repository"}
${environment.projectType ? `Project Type: ${environment.projectType}` : ""}

## IMPORTANT RULES
1. Use "output": "var_name" to capture step results
2. Use {{var_name}} to reference previous outputs
3. NEVER use shell substitution $(command) - it won't work!
4. ASK user (prompt.ask) for: branch names, version numbers, custom labels
5. GENERATE with AI (ai.generate) for: commit messages, summaries from diffs

## Example: Analyze changes and create branch
Step 1: Get diff → output: "diff_output"
Step 2: AI generates branch name suggestion from diff → output: "suggested_name"  
Step 3: Ask user to confirm/modify branch name → output: "branch_name"
Step 4: Create branch using {{branch_name}}

Respond with JSON:
{
  "description": "Short description",
  "explanation": "Step-by-step explanation for user",
  "risks": ["potential risks"],
  "toolsUsed": ["tool1", "tool2"],
  "workflow": {
    "name": "ephemeral-task",
    "description": "...",
    "steps": [
      { "action": "action.name", "description": "...", "params": {...}, "output": "var_name" }
    ]
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

const EPHEMERAL_SYSTEM_PROMPT = `You are a workflow generator for Hackflow.

Your job is to create minimal, focused workflows that accomplish specific tasks using available MCP tools.

## CRITICAL RULES - READ CAREFULLY

### 1. Variable System
- Each step can capture its output using "output": "variable_name"
- Use {{variable_name}} to reference previous step outputs in later steps
- NEVER use shell substitution like $(command) - it won't work!

### 2. User Input with Defaults
- When you need user input, use prompt.ask with a default value from a previous step:
  { "action": "prompt.ask", "params": { "message": "Branch name", "default": "{{suggested_name}}" }, "output": "branch_name" }
- If user presses Enter without typing, the default value is used
- ALWAYS provide a default when you have a suggestion from AI generation

### 3. AI Generation - CRITICAL FORMAT
- When generating values (branch names, commit messages), be VERY specific in the prompt:
  { 
    "action": "ai.generate", 
    "params": { 
      "prompt": "Generate a git branch name for these changes. Output ONLY the branch name, nothing else. No explanation, no code blocks, no quotes. Just the branch name in kebab-case.\n\nChanges:\n{{diff}}" 
    }, 
    "output": "suggested_branch" 
  }
- ALWAYS include "Output ONLY the X, nothing else. No explanation, no code blocks."
- The AI output will be used directly in commands, so it must be clean

### 4. REQUIRED PARAMETERS - VERY IMPORTANT
Git MCP tools ALWAYS need repo_path parameter:
- git.git_status: { "repo_path": "." }
- git.git_diff: { "repo_path": ".", "staged": true }
- git.git_add: { "repo_path": ".", "files": ["."] }
- git.git_commit: { "repo_path": ".", "message": "{{commit_msg}}" }

Shell commands:
- shell.execute_command: { "command": "git checkout -b {{branch_name}}" }

### 5. Data Flow Example - COMPLETE CORRECT PATTERN

Step 1 - Get diff:
  { "action": "git.git_diff", "params": { "repo_path": ".", "staged": true }, "output": "diff_output" }

Step 2 - AI generates branch name (MUST include strict output instructions):
  { "action": "ai.generate", "params": { "prompt": "Generate a git branch name for these changes. Output ONLY the branch name in kebab-case. No explanation, no markdown, no quotes.\\n\\nChanges:\\n{{diff_output}}" }, "output": "suggested_branch" }

Step 3 - Ask user with default:
  { "action": "prompt.ask", "params": { "message": "Branch name", "default": "{{suggested_branch}}" }, "output": "branch_name" }

Step 4 - Create branch:
  { "action": "shell.execute_command", "params": { "command": "git checkout -b {{branch_name}}" } }

Step 5 - AI generates commit message (MUST include strict output instructions):
  { "action": "ai.generate", "params": { "prompt": "Generate a detailed conventional commit message for these changes. Output ONLY the commit message. No explanation, no markdown code blocks.\\n\\nChanges:\\n{{diff_output}}" }, "output": "commit_msg" }

Step 6 - Commit:
  { "action": "git.git_commit", "params": { "repo_path": ".", "message": "{{commit_msg}}" } }

WRONG patterns to avoid:
- { "action": "git.git_status", "params": {} }  // Missing repo_path
- { "params": { "prompt": "Generate branch name for {{diff}}" } }  // Missing "Output ONLY..." instruction

### 6. When to Ask vs Generate
- GENERATE with AI first: branch names, commit messages, summaries from code changes
- Then ASK user to confirm with the AI suggestion as default:
  Step 1: ai.generate → output: "suggested_branch"
  Step 2: prompt.ask with default: "{{suggested_branch}}" → output: "branch_name"
- This way, user can press Enter to accept or type to override

Output valid JSON with this structure:
{
  "name": "ephemeral-taskname",
  "description": "What this workflow does",
  "steps": [
    {
      "action": "server.tool_name",
      "description": "What this step does",
      "params": { ... },
      "output": "variable_name"
    }
  ]
}`;
