/**
 * Intent Parser - Understands what the user wants from natural language
 */

import type { 
  IModelProvider, 
  WorkflowDefinition, 
  WorkflowMetadata,
  MCPTool 
} from "../types/index.js";
import type { WorkflowRegistry } from "../workflows/registry.js";
import type { 
  ParsedIntent, 
  WorkflowMatch, 
  MissingParam,
  IntentType,
  EnvironmentContext,
  ExclusionModifier,
  ScopeModifier,
} from "./types.js";

export class IntentParser {
  constructor(
    private aiProvider: IModelProvider,
    private registry: WorkflowRegistry,
  ) {}

  /**
   * Parse user input into a structured intent
   */
  async parse(
    input: string,
    environment: EnvironmentContext,
    conversationHistory: string = "",
  ): Promise<ParsedIntent> {
    // Check for slash commands first
    if (input.startsWith("/")) {
      return this.parseSlashCommand(input);
    }

    // Detect exclusion and scope modifiers FIRST
    const exclusions = this.detectExclusions(input);
    const scopeModifier = this.detectScopeModifier(input);

    // Get available workflows for context
    const workflows = await this.registry.list();
    const workflowsContext = this.buildWorkflowsContext(workflows);

    // Build the prompt for intent parsing
    const prompt = this.buildIntentPrompt(input, environment, workflowsContext, conversationHistory);

    // Call AI to parse intent
    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 2048,
      temperature: 0.3, // Low temperature for more deterministic parsing
      systemPrompt: INTENT_SYSTEM_PROMPT,
    });

    // Parse the AI response
    const parsed = this.parseAIResponse(response, input, workflows);
    
    // Add exclusion/scope modifiers
    parsed.exclusions = exclusions;
    parsed.scopeModifier = scopeModifier;
    
    // Re-filter workflows based on exclusions and scope
    if (exclusions || scopeModifier) {
      parsed.matchedWorkflows = this.filterWorkflowsByModifiers(
        parsed.matchedWorkflows,
        exclusions,
        scopeModifier,
      );
    }
    
    return parsed;
  }
  
  /**
   * Detect exclusion patterns like "but don't push", "without committing"
   */
  private detectExclusions(input: string): ExclusionModifier | undefined {
    const inputLower = input.toLowerCase();
    const excludedActions: string[] = [];
    const rawPhrases: string[] = [];
    
    // Patterns for exclusion detection
    const exclusionPatterns = [
      // "but don't X" / "but do not X"
      /but\s+(?:don'?t|do\s+not)\s+(\w+)/gi,
      // "without Xing" / "without X"  
      /without\s+(\w+(?:ing)?)/gi,
      // "don't X" at start or after comma
      /(?:^|,\s*)(?:don'?t|do\s+not)\s+(\w+)/gi,
      // "no X" / "skip X"
      /(?:no|skip)\s+(\w+(?:ing)?)/gi,
      // "except X" / "excluding X"
      /(?:except|excluding)\s+(\w+(?:ing)?)/gi,
    ];
    
    // Action word mappings (normalize different forms)
    const actionMappings: Record<string, string> = {
      "pushing": "push",
      "committing": "commit", 
      "commits": "commit",
      "staged": "stage",
      "staging": "stage",
      "adding": "add",
      "deploying": "deploy",
      "deployment": "deploy",
      "merging": "merge",
      "merged": "merge",
    };
    
    for (const pattern of exclusionPatterns) {
      let match;
      while ((match = pattern.exec(inputLower)) !== null) {
        const rawAction = match[1];
        rawPhrases.push(match[0].trim());
        
        // Normalize the action
        const normalizedAction = actionMappings[rawAction] || rawAction.replace(/ing$/, "");
        if (!excludedActions.includes(normalizedAction)) {
          excludedActions.push(normalizedAction);
        }
      }
    }
    
    if (excludedActions.length === 0) {
      return undefined;
    }
    
    return { excludedActions, rawPhrases };
  }
  
  /**
   * Detect scope modifiers like "just", "only", "exactly"
   */
  private detectScopeModifier(input: string): ScopeModifier | undefined {
    const inputLower = input.toLowerCase();
    
    // Patterns for scope detection
    const scopePatterns = [
      // "just X" / "only X" / "exactly X"
      /^(?:just|only|exactly)\s+(\w+)/i,
      // "I just want to X"
      /(?:i\s+)?(?:just|only)\s+(?:want\s+to\s+)?(\w+)/i,
      // "X only" / "X and nothing else"
      /(\w+)\s+(?:only|and\s+nothing\s+else)/i,
    ];
    
    // Action word mappings
    const actionMappings: Record<string, string> = {
      "stage": "stage",
      "staging": "stage",
      "add": "stage",
      "adding": "stage",
      "commit": "commit",
      "committing": "commit",
      "push": "push",
      "pushing": "push",
      "deploy": "deploy",
      "deploying": "deploy",
    };
    
    for (const pattern of scopePatterns) {
      const match = inputLower.match(pattern);
      if (match) {
        const rawAction = match[1];
        const normalizedAction = actionMappings[rawAction] || rawAction;
        
        // Determine the type
        let type: "just" | "only" | "exactly" = "just";
        if (inputLower.includes("only")) type = "only";
        if (inputLower.includes("exactly")) type = "exactly";
        
        return { type, targetAction: normalizedAction };
      }
    }
    
    return undefined;
  }
  
  /**
   * Filter workflows based on exclusions and scope modifiers
   */
  private filterWorkflowsByModifiers(
    workflows: WorkflowMatch[],
    exclusions: ExclusionModifier | undefined,
    scopeModifier: ScopeModifier | undefined,
  ): WorkflowMatch[] {
    if (!exclusions && !scopeModifier) {
      return workflows;
    }
    
    return workflows.map(match => {
      let scoreAdjustment = 0;
      
      // Check exclusions - penalize workflows that contain excluded actions
      if (exclusions) {
        const workflowName = match.workflow.name?.toLowerCase() || "";
        const workflowDesc = match.workflow.description?.toLowerCase() || "";
        
        for (const excludedAction of exclusions.excludedActions) {
          if (workflowName.includes(excludedAction) || workflowDesc.includes(excludedAction)) {
            // Heavy penalty for workflows that do what user explicitly doesn't want
            scoreAdjustment -= 0.5;
          }
        }
      }
      
      // Check scope modifier - prefer workflows that ONLY do the target action
      if (scopeModifier) {
        const workflowName = match.workflow.name?.toLowerCase() || "";
        const workflowDesc = match.workflow.description?.toLowerCase() || "";
        
        // Boost if workflow name suggests it's focused on the target action
        if (workflowName.includes(scopeModifier.targetAction)) {
          scoreAdjustment += 0.2;
        }
        
        // Penalize if workflow does MORE than the target (e.g., "add-commit-push" when user wants just "stage")
        const multiActionIndicators = ["-and-", "-commit-", "-push-", "full", "auto"];
        for (const indicator of multiActionIndicators) {
          if (workflowName.includes(indicator) && !workflowName.startsWith(scopeModifier.targetAction)) {
            scoreAdjustment -= 0.3;
          }
        }
        
        // Special handling for granular workflows
        const granularWorkflows: Record<string, string[]> = {
          "stage": ["git-stage", "git-add"],
          "commit": ["git-commit"],
          "push": ["git-push"],
        };
        
        const preferredWorkflows = granularWorkflows[scopeModifier.targetAction] || [];
        if (preferredWorkflows.some(name => workflowName.includes(name))) {
          scoreAdjustment += 0.4; // Strong boost for exact match
        }
      }
      
      return {
        ...match,
        score: Math.max(0, Math.min(1, match.score + scoreAdjustment)),
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Parse a slash command
   */
  private parseSlashCommand(input: string): ParsedIntent {
    const parts = input.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return {
      type: "command",
      confidence: 1.0,
      originalInput: input,
      matchedWorkflows: [],
      extractedParams: {},
      slashCommand: { name: command, args },
    };
  }

  /**
   * Build context string for available workflows
   */
  private buildWorkflowsContext(workflows: WorkflowMetadata[]): string {
    if (workflows.length === 0) {
      return "No workflows installed.";
    }

    const lines = workflows.map(w => {
      let desc = `- ${w.name}`;
      if (w.description) {
        desc += `: ${w.description}`;
      }
      return desc;
    });

    return `Available Workflows:\n${lines.join("\n")}`;
  }

  /**
   * Build the prompt for intent parsing
   */
  private buildIntentPrompt(
    input: string,
    environment: EnvironmentContext,
    workflowsContext: string,
    conversationHistory: string,
  ): string {
    return `
## User Request
"${input}"

## Environment
Working Directory: ${environment.cwd}
${environment.git ? `Git Branch: ${environment.git.branch}
Has Changes: ${environment.git.hasChanges}
${environment.git.lastCommit ? `Last Commit: "${environment.git.lastCommit}"` : ""}` : "Not a git repository"}
${environment.projectType ? `Project Type: ${environment.projectType}` : ""}

## ${workflowsContext}

${conversationHistory ? `## Recent Conversation\n${conversationHistory}` : ""}

## Task
Analyze the user's request and determine:
1. What type of intent is this? (execute, query, create, chain, clarify, chat)
2. Which workflow(s) match this request (if any)?
3. What parameters can be extracted from the input?
4. What required parameters are missing?
5. Should we chain multiple workflows?
6. Do we need to create an ephemeral workflow?

Respond in JSON format:
{
  "type": "execute|query|chain|clarify|chat",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of your analysis",
  "matchedWorkflows": [
    {
      "name": "workflow-name",
      "score": 0.0-1.0,
      "extractedParams": { "param": "value" },
      "missingRequiredParams": ["param1", "param2"]
    }
  ],
  "suggestedChain": ["workflow1", "workflow2"],
  "ephemeralNeeded": false,
  "ephemeralDescription": "description if ephemeral needed",
  "clarificationNeeded": ["question1", "question2"]
}
`.trim();
  }

  /**
   * Parse the AI response into a structured intent
   */
  private parseAIResponse(
    response: string,
    originalInput: string,
    workflows: WorkflowMetadata[],
  ): ParsedIntent {
    try {
      // Extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Build matched workflows
      const matchedWorkflows: WorkflowMatch[] = (parsed.matchedWorkflows || []).map((match: any) => {
        const metadata = workflows.find(w => w.name === match.name);
        return {
          workflow: metadata || { name: match.name },
          score: match.score || 0.5,
          extractedParams: match.extractedParams || {},
          missingRequiredParams: match.missingRequiredParams || [],
        };
      });

      // Build missing params list
      const missingParams: MissingParam[] = [];
      for (const match of matchedWorkflows) {
        for (const param of match.missingRequiredParams) {
          missingParams.push({
            name: param,
            type: "string",
            required: true,
            workflow: match.workflow.name,
          });
        }
      }

      return {
        type: this.normalizeIntentType(parsed.type),
        confidence: parsed.confidence || 0.5,
        originalInput,
        matchedWorkflows,
        extractedParams: this.mergeExtractedParams(matchedWorkflows),
        suggestedChain: parsed.suggestedChain,
        missingParams: missingParams.length > 0 ? missingParams : undefined,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      // If parsing fails, return a clarify intent
      return {
        type: "clarify",
        confidence: 0.3,
        originalInput,
        matchedWorkflows: [],
        extractedParams: {},
        reasoning: `Failed to parse intent: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Normalize intent type string
   */
  private normalizeIntentType(type: string): IntentType {
    const normalized = type?.toLowerCase();
    const validTypes: IntentType[] = ["execute", "query", "create", "chain", "clarify", "command", "chat"];
    
    if (validTypes.includes(normalized as IntentType)) {
      return normalized as IntentType;
    }
    
    return "clarify";
  }

  /**
   * Merge extracted params from all matched workflows
   */
  private mergeExtractedParams(matches: WorkflowMatch[]): Record<string, any> {
    const merged: Record<string, any> = {};
    
    for (const match of matches) {
      Object.assign(merged, match.extractedParams);
    }
    
    return merged;
  }

  /**
   * Quick match without AI - for simple cases
   * Now respects exclusion and scope modifiers
   */
  async quickMatch(input: string): Promise<WorkflowMatch | null> {
    const workflows = await this.registry.list();
    const inputLower = input.toLowerCase();
    
    // Detect modifiers first
    const exclusions = this.detectExclusions(input);
    const scopeModifier = this.detectScopeModifier(input);

    // If we have a scope modifier, prioritize granular workflows
    if (scopeModifier) {
      const granularMatch = await this.matchGranularWorkflow(scopeModifier, exclusions, workflows);
      if (granularMatch) {
        return granularMatch;
      }
    }

    // Try exact name match
    for (const workflow of workflows) {
      if (inputLower.includes(workflow.name.toLowerCase())) {
        // Skip if workflow contains excluded actions
        if (this.workflowContainsExcludedAction(workflow, exclusions)) {
          continue;
        }
        
        const definition = await this.registry.get(workflow.name);
        return {
          workflow,
          definition: definition || undefined,
          score: 0.9,
          extractedParams: {},
          missingRequiredParams: this.getMissingRequired(definition),
        };
      }
    }

    // Try keyword matching with scope-aware logic
    const keywords: Record<string, string[]> = {
      // Granular workflows first (when scope modifier present)
      "stage": ["git-stage"],
      "add": ["git-stage"],
      // Then combined workflows
      "commit": scopeModifier ? ["git-commit"] : ["git-smart-commit", "git-add-commit-push", "smart-commit"],
      "push": ["git-push"],
      "pr": ["github-create-pr", "create-pr", "auto-ship"],
      "pull request": ["github-create-pr", "create-pr", "auto-ship"],
      "ship": ["auto-ship"],
      "deploy": ["deploy"],
      "test": ["run-tests", "npm-test"],
    };

    for (const [keyword, workflowNames] of Object.entries(keywords)) {
      if (inputLower.includes(keyword)) {
        for (const name of workflowNames) {
          const workflow = workflows.find(w => w.name === name);
          if (workflow) {
            // Skip if workflow contains excluded actions
            if (this.workflowContainsExcludedAction(workflow, exclusions)) {
              continue;
            }
            
            const definition = await this.registry.get(workflow.name);
            return {
              workflow,
              definition: definition || undefined,
              score: scopeModifier ? 0.85 : 0.7, // Higher confidence when scope matched
              extractedParams: {},
              missingRequiredParams: this.getMissingRequired(definition),
            };
          }
        }
      }
    }

    return null;
  }
  
  /**
   * Match a granular workflow based on scope modifier
   */
  private async matchGranularWorkflow(
    scopeModifier: ScopeModifier,
    exclusions: ExclusionModifier | undefined,
    workflows: { name: string; description?: string }[],
  ): Promise<WorkflowMatch | null> {
    // Mapping from target action to preferred granular workflows
    const granularWorkflowMap: Record<string, string[]> = {
      "stage": ["git-stage"],
      "add": ["git-stage"],
      "commit": ["git-commit", "git-smart-commit"],
      "push": ["git-push"],
    };
    
    const preferredWorkflows = granularWorkflowMap[scopeModifier.targetAction];
    if (!preferredWorkflows) {
      return null;
    }
    
    for (const preferredName of preferredWorkflows) {
      const workflow = workflows.find(w => w.name === preferredName);
      if (workflow) {
        // Verify it doesn't contain excluded actions
        if (this.workflowContainsExcludedAction(workflow, exclusions)) {
          continue;
        }
        
        const definition = await this.registry.get(workflow.name);
        return {
          workflow,
          definition: definition || undefined,
          score: 0.95, // High confidence for scope-matched granular workflow
          extractedParams: {},
          missingRequiredParams: this.getMissingRequired(definition),
        };
      }
    }
    
    return null;
  }
  
  /**
   * Check if a workflow contains any excluded actions
   */
  private workflowContainsExcludedAction(
    workflow: { name: string; description?: string },
    exclusions: ExclusionModifier | undefined,
  ): boolean {
    if (!exclusions || exclusions.excludedActions.length === 0) {
      return false;
    }
    
    const workflowName = workflow.name.toLowerCase();
    const workflowDesc = workflow.description?.toLowerCase() || "";
    
    for (const excludedAction of exclusions.excludedActions) {
      if (workflowName.includes(excludedAction) || workflowDesc.includes(excludedAction)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get missing required parameters from workflow definition
   */
  private getMissingRequired(definition: WorkflowDefinition | null): string[] {
    if (!definition?.config_schema) {
      return [];
    }

    return Object.entries(definition.config_schema)
      .filter(([_, schema]) => schema.required === true)
      .map(([name]) => name);
  }

  /**
   * Extract parameters from natural language using AI
   */
  async extractParams(
    input: string,
    workflow: WorkflowDefinition,
  ): Promise<Record<string, any>> {
    if (!workflow.config_schema || Object.keys(workflow.config_schema).length === 0) {
      return {};
    }

    const schemaDesc = Object.entries(workflow.config_schema)
      .map(([name, schema]) => {
        let desc = `- ${name} (${schema.type})`;
        if (schema.description) desc += `: ${schema.description}`;
        if (schema.required) desc += " [REQUIRED]";
        if (schema.default !== undefined) desc += ` [default: ${schema.default}]`;
        return desc;
      })
      .join("\n");

    const prompt = `
Extract parameter values from this user input for the workflow "${workflow.name}".

User Input: "${input}"

Workflow Parameters:
${schemaDesc}

Extract any values that match these parameters from the user's input.
If a value is quoted (single or double quotes), extract the exact text inside.
If a value is not mentioned, do not include it.

Respond with JSON only:
{
  "extracted": { "paramName": "value" }
}
`.trim();

    try {
      const response = await this.aiProvider.generate(prompt, {
        maxTokens: 512,
        temperature: 0.1,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.extracted || {};
      }
    } catch {
      // Fall back to regex-based extraction
    }

    // Simple regex-based fallback
    return this.regexExtractParams(input, workflow);
  }

  /**
   * Simple regex-based parameter extraction
   */
  private regexExtractParams(
    input: string,
    workflow: WorkflowDefinition,
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract quoted strings
    const quotedStrings: string[] = [];
    const quoteRegex = /["']([^"']+)["']/g;
    let match;
    while ((match = quoteRegex.exec(input)) !== null) {
      quotedStrings.push(match[1]);
    }

    // Try to match parameter names in the input
    if (workflow.config_schema) {
      for (const [name, schema] of Object.entries(workflow.config_schema)) {
        // Check for "name: value" or "name=value" patterns
        const patterns = [
          new RegExp(`${name}\\s*[=:]\\s*["']([^"']+)["']`, "i"),
          new RegExp(`${name}\\s*[=:]\\s*(\\S+)`, "i"),
        ];

        for (const pattern of patterns) {
          const match = input.match(pattern);
          if (match) {
            params[name] = match[1];
            break;
          }
        }
      }
    }

    // If we have exactly one quoted string and one required param missing, assign it
    if (quotedStrings.length === 1 && workflow.config_schema) {
      const requiredParams = Object.entries(workflow.config_schema)
        .filter(([name, schema]) => schema.required && !params[name])
        .map(([name]) => name);

      if (requiredParams.length === 1) {
        params[requiredParams[0]] = quotedStrings[0];
      }
    }

    return params;
  }
}

const INTENT_SYSTEM_PROMPT = `You are an intent parser for Hackflow, a workflow automation tool.

Your job is to understand what the user wants to do and match it to available workflows.

Key behaviors:
1. Match user requests to the most appropriate workflow(s)
2. Extract any parameter values mentioned in the request
3. Identify when multiple workflows should be chained together
4. Recognize when the user is asking a question vs wanting to execute something
5. Identify when an ephemeral workflow needs to be created

Intent types:
- execute: User wants to run a specific workflow
- query: User is asking a question (about workflows, status, etc.)
- chain: User wants to run multiple workflows in sequence
- clarify: The request is unclear and we need more information
- chat: General conversation, not workflow-related

IMPORTANT - Scope and Exclusion Modifiers:
Pay close attention to words like "just", "only", "but don't", "without":
- "just stage my files" → User ONLY wants staging, NOT commit or push
- "commit but don't push" → User wants commit but explicitly NOT push  
- "stage my files, don't commit" → User wants staging only
- "only add the files" → User wants git add/stage only

When you detect these modifiers:
1. Prefer granular/focused workflows over combined ones
2. For "just stage" or "only add" → prefer git-stage over git-add-commit-push
3. For "commit but don't push" → prefer git-commit or git-smart-commit over auto-ship
4. NEVER match a workflow that does something the user explicitly excluded

Be precise with parameter extraction:
- If the user says "commit with message 'fix bug'", extract message="fix bug"
- If the user says "push to origin", extract remote="origin"
- If the user says "create a PR from feature to main", extract head="feature", base="main"

For chaining, recognize patterns like:
- "test and then deploy"
- "commit, push, and create PR"
- "run tests then commit if they pass"

Always respond with valid JSON.`;
