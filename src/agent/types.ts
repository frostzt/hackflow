/**
 * Types for the Natural Language Agent
 */

import type { WorkflowDefinition, WorkflowMetadata, ExecutionResult, MCPTool } from "../types/index.js";

// ============================================================================
// Intent Parsing
// ============================================================================

export type IntentType = 
  | "execute"      // Run a workflow or chain
  | "query"        // Ask about workflows, status, etc.
  | "create"       // Create new workflow
  | "chain"        // Chain multiple workflows
  | "clarify"      // Need more info from user
  | "command"      // Slash command
  | "chat";        // General conversation

export interface ParsedIntent {
  /** What type of request is this? */
  type: IntentType;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** The original user input */
  originalInput: string;
  
  /** Matched workflows with scores */
  matchedWorkflows: WorkflowMatch[];
  
  /** Extracted parameters from the input */
  extractedParams: Record<string, any>;
  
  /** If we need to chain multiple workflows */
  suggestedChain?: string[];
  
  /** If we need to create an ephemeral workflow */
  ephemeralPlan?: EphemeralWorkflowPlan;
  
  /** Missing required parameters that need to be asked */
  missingParams?: MissingParam[];
  
  /** If this is a slash command */
  slashCommand?: {
    name: string;
    args: string[];
  };
  
  /** Raw AI reasoning (for debugging) */
  reasoning?: string;
  
  /** Exclusion modifiers - what the user explicitly DOESN'T want */
  exclusions?: ExclusionModifier;
  
  /** Whether this is a "just/only" scoped request */
  scopeModifier?: ScopeModifier;
}

/**
 * Represents exclusion patterns like "but don't push" or "without committing"
 */
export interface ExclusionModifier {
  /** Actions the user explicitly doesn't want (e.g., ["push", "commit"]) */
  excludedActions: string[];
  
  /** Raw exclusion phrases detected */
  rawPhrases: string[];
}

/**
 * Represents scope limiting modifiers like "just" or "only"
 */
export interface ScopeModifier {
  /** The type of scope modifier */
  type: "just" | "only" | "exactly";
  
  /** The specific action they want (e.g., "stage", "add") */
  targetAction: string;
}

export interface WorkflowMatch {
  workflow: WorkflowMetadata;
  definition?: WorkflowDefinition;
  score: number;
  extractedParams: Record<string, any>;
  missingRequiredParams: string[];
}

export interface MissingParam {
  name: string;
  description?: string;
  type: string;
  required: boolean;
  workflow?: string;
}

// ============================================================================
// Execution Planning
// ============================================================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ExecutionPlan {
  id: string;
  description: string;
  
  /** The steps to execute */
  steps: PlanStep[];
  
  /** Variables that flow between steps */
  dataFlow: DataFlowMapping[];
  
  /** Risk assessment */
  risk: RiskLevel;
  
  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
  
  /** Human-readable explanation */
  explanation: string;
  
  /** Estimated duration */
  estimatedDuration?: string;
  
  /** Potential risks/warnings */
  warnings?: string[];
}

export interface PlanStep {
  id: string;
  type: "workflow" | "tool" | "prompt" | "condition" | "ephemeral";
  
  /** Human-readable description */
  description: string;
  
  /** For existing workflows */
  workflowName?: string;
  workflowDef?: WorkflowDefinition;
  
  /** For direct MCP tool calls */
  tool?: {
    server: string;
    name: string;
    args: Record<string, any>;
  };
  
  /** For AI decision steps */
  prompt?: string;
  
  /** For ephemeral workflows */
  ephemeralWorkflow?: WorkflowDefinition;
  
  /** Parameters for this step */
  params: Record<string, any>;
  
  /** Dependencies (step IDs that must complete first) */
  dependsOn: string[];
  
  /** Output variable name */
  outputAs?: string;
  
  /** Condition to execute */
  condition?: string;
  
  /** Risk level for this step */
  risk: RiskLevel;
}

export interface DataFlowMapping {
  from: { step: string; variable: string };
  to: { step: string; variable: string };
}

// ============================================================================
// Ephemeral Workflows
// ============================================================================

export interface EphemeralWorkflowPlan {
  /** Natural language description */
  description: string;
  
  /** The generated workflow definition */
  workflow: WorkflowDefinition;
  
  /** Human-readable explanation */
  explanation: string;
  
  /** Whether we need user confirmation */
  requiresConfirmation: boolean;
  
  /** Potential risks */
  risks: string[];
  
  /** Available tools used */
  toolsUsed: string[];
}

// ============================================================================
// Context Management
// ============================================================================

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  
  /** If this was an execution, the result */
  executionResult?: ExecutionResult;
  
  /** If this was a plan, the plan */
  plan?: ExecutionPlan;
}

export interface ConversationContext {
  /** Session ID */
  sessionId: string;
  
  /** Conversation history */
  history: Message[];
  
  /** Results from recent executions */
  recentResults: Map<string, ExecutionResult>;
  
  /** Environment context */
  environment: EnvironmentContext;
  
  /** Current focus/topic */
  focus?: {
    topic: string;
    relatedWorkflows: string[];
    variables: Record<string, any>;
  };
  
  /** Accumulated variables from this session */
  sessionVariables: Record<string, any>;
}

export interface EnvironmentContext {
  /** Current working directory */
  cwd: string;
  
  /** Git info if in a git repo */
  git?: {
    branch: string;
    hasChanges: boolean;
    remote?: string;
    lastCommit?: string;
  };
  
  /** Detected project type */
  projectType?: string;
  
  /** Package manager if detected */
  packageManager?: "npm" | "yarn" | "pnpm" | "bun";
}

// ============================================================================
// Usage Patterns (Learning)
// ============================================================================

export interface UsagePattern {
  /** The user's input */
  input: string;
  
  /** What it resolved to */
  resolvedTo: {
    type: "workflow" | "chain" | "ephemeral" | "command";
    workflows?: string[];
    plan?: ExecutionPlan;
  };
  
  /** Whether the user accepted the resolution */
  wasAccepted: boolean;
  
  /** If they corrected it, what they wanted */
  correction?: string;
  
  /** Timestamp */
  timestamp: Date;
  
  /** Success of execution */
  executionSuccess?: boolean;
}

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  /** Auto-execute low-risk operations */
  autoExecuteLowRisk: boolean;
  
  /** Always confirm before execution */
  alwaysConfirm: boolean;
  
  /** Maximum history to keep in context */
  maxHistoryLength: number;
  
  /** Enable learning from usage */
  enableLearning: boolean;
  
  /** Verbose output */
  verbose: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  autoExecuteLowRisk: false,
  alwaysConfirm: false,
  maxHistoryLength: 20,
  enableLearning: true,
  verbose: false,
};
