import { resolve, normalize } from "path";
import { homedir } from "os";
import type {
  ISecurityGuard,
  SecurityAction,
  PermissionResult,
  ModelCall,
  CostEstimate,
  IPromptHandler,
} from "../types/index.js";

/**
 * Security guard implementation with configurable rules
 */
export class SecurityGuard implements ISecurityGuard {
  private rateLimits: Map<string, RateLimit> = new Map();
  private promptHandler?: IPromptHandler;
  private config: SecurityConfig;

  constructor(config: SecurityConfig = {}, promptHandler?: IPromptHandler) {
    this.config = {
      allowedPaths: config.allowedPaths ?? [process.cwd()],
      protectedPaths: config.protectedPaths ?? this.getDefaultProtectedPaths(),
      requireConfirmation: config.requireConfirmation ?? {
        fileDelete: true,
        gitPush: true,
        bulkOperations: true,
      },
      rateLimits: config.rateLimits ?? {
        "api.call": { maxRequests: 100, windowMs: 60000 },
        "file.write": { maxRequests: 1000, windowMs: 60000 },
      },
      dryRun: config.dryRun ?? false,
    };
    this.promptHandler = promptHandler;
  }

  async checkPermission(action: SecurityAction): Promise<PermissionResult> {
    // In dry-run mode, allow everything but flag for confirmation
    if (this.config.dryRun) {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: "Dry-run mode: action will be simulated",
      };
    }

    // Check rate limits
    if (!(await this.checkRateLimit(action.type))) {
      return {
        allowed: false,
        reason: "Rate limit exceeded for this action",
      };
    }

    // Check specific action types
    switch (action.type) {
      case "file.read":
        return this.checkFileRead(action.target);

      case "file.write":
        return this.checkFileWrite(action.target);

      case "file.delete":
        return this.checkFileDelete(action.target);

      case "git.push":
        return this.checkGitPush(action);

      case "api.call":
        return this.checkApiCall(action);

      case "code.execute":
        return this.checkCodeExecution(action);

      default:
        return {
          allowed: true,
          requiresConfirmation: false,
        };
    }
  }

  async requestConfirmation(
    action: SecurityAction,
    message: string
  ): Promise<boolean> {
    if (!this.promptHandler) {
      // If no prompt handler, default to deny for safety
      console.warn(
        "No prompt handler available for confirmation. Denying action."
      );
      return false;
    }

    return this.promptHandler.confirm(message, false);
  }

  validatePath(
    path: string,
    operation: "read" | "write" | "delete"
  ): boolean {
    const normalizedPath = normalize(resolve(path));

    // Check if path is in protected directories
    for (const protectedPath of this.config.protectedPaths!) {
      if (normalizedPath.startsWith(protectedPath)) {
        return false;
      }
    }

    // For read operations, be more lenient
    if (operation === "read") {
      return true;
    }

    // For write/delete, must be in allowed paths
    for (const allowedPath of this.config.allowedPaths!) {
      if (normalizedPath.startsWith(allowedPath)) {
        return true;
      }
    }

    return false;
  }

  async checkRateLimit(action: string): Promise<boolean> {
    const limitConfig = this.config.rateLimits![action];
    if (!limitConfig) return true; // No limit configured

    const now = Date.now();
    let limit = this.rateLimits.get(action);

    if (!limit) {
      limit = {
        requests: [],
        maxRequests: limitConfig.maxRequests,
        windowMs: limitConfig.windowMs,
      };
      this.rateLimits.set(action, limit);
    }

    // Remove old requests outside the window
    limit.requests = limit.requests.filter(
      (time) => now - time < limit.windowMs
    );

    // Check if limit exceeded
    if (limit.requests.length >= limit.maxRequests) {
      return false;
    }

    // Add current request
    limit.requests.push(now);
    return true;
  }

  async estimateCost(modelCalls: ModelCall[]): Promise<CostEstimate> {
    // Rough cost estimates (as of 2025)
    const costPerMToken: Record<string, number> = {
      "claude-3-opus": 15.0,
      "claude-3-sonnet": 3.0,
      "claude-3-haiku": 0.25,
      "gpt-4": 30.0,
      "gpt-3.5-turbo": 0.5,
    };

    let totalCost = 0;
    const breakdown: Record<string, number> = {};

    for (const call of modelCalls) {
      const costPerM = costPerMToken[call.model] ?? 1.0;
      const cost = (call.estimatedTokens / 1_000_000) * costPerM;
      totalCost += cost;
      breakdown[call.model] = (breakdown[call.model] ?? 0) + cost;
    }

    return {
      estimatedCost: totalCost,
      currency: "USD",
      breakdown,
    };
  }

  // Private helper methods

  private checkFileRead(path: string): PermissionResult {
    if (!this.validatePath(path, "read")) {
      return {
        allowed: false,
        reason: `Path not accessible: ${path}`,
      };
    }

    return { allowed: true };
  }

  private checkFileWrite(path: string): PermissionResult {
    if (!this.validatePath(path, "write")) {
      return {
        allowed: false,
        reason: `Path not writable: ${path}`,
      };
    }

    return { allowed: true };
  }

  private checkFileDelete(path: string): PermissionResult {
    if (!this.validatePath(path, "delete")) {
      return {
        allowed: false,
        reason: `Path not deletable: ${path}`,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: this.config.requireConfirmation!.fileDelete,
    };
  }

  private checkGitPush(action: SecurityAction): PermissionResult {
    const branch = action.params?.branch ?? "unknown";
    const isMainBranch = ["main", "master"].includes(branch);

    if (isMainBranch || this.config.requireConfirmation!.gitPush) {
      return {
        allowed: true,
        requiresConfirmation: true,
      };
    }

    return { allowed: true };
  }

  private checkApiCall(action: SecurityAction): PermissionResult {
    // Could check for bulk operations, destructive actions, etc.
    const isBulk = action.params?.bulk ?? false;

    if (isBulk && this.config.requireConfirmation!.bulkOperations) {
      return {
        allowed: true,
        requiresConfirmation: true,
      };
    }

    return { allowed: true };
  }

  private checkCodeExecution(action: SecurityAction): PermissionResult {
    // Code execution is powerful - always require confirmation in production
    return {
      allowed: true,
      requiresConfirmation: !this.config.dryRun,
    };
  }

  private getDefaultProtectedPaths(): string[] {
    const home = homedir();
    return [
      "/System",
      "/bin",
      "/sbin",
      "/usr/bin",
      "/usr/sbin",
      "/etc",
      "/var",
      "/tmp",
      "/Library",
      `${home}/Library`,
      `${home}/.ssh`,
      `${home}/.gnupg`,
    ];
  }
}

// Types

export interface SecurityConfig {
  /** Paths where write/delete operations are allowed */
  allowedPaths?: string[];

  /** Paths that are protected from any modifications */
  protectedPaths?: string[];

  /** Which operations require user confirmation */
  requireConfirmation?: {
    fileDelete?: boolean;
    gitPush?: boolean;
    bulkOperations?: boolean;
  };

  /** Rate limits for different action types */
  rateLimits?: Record<string, { maxRequests: number; windowMs: number }>;

  /** Dry-run mode (simulate actions without executing) */
  dryRun?: boolean;
}

interface RateLimit {
  requests: number[];
  maxRequests: number;
  windowMs: number;
}
