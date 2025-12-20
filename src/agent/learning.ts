/**
 * Usage Pattern Learning - Track and learn from user interactions
 * 
 * This module persists usage patterns to improve intent matching over time.
 * Stored in ~/.hackflow/learning.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { UsagePattern, ExecutionPlan } from "./types.js";

const LEARNING_FILE = join(homedir(), ".hackflow", "learning.json");
const MAX_PATTERNS = 500; // Keep last 500 patterns

export interface LearningData {
  version: number;
  patterns: UsagePattern[];
  shortcuts: Record<string, string>; // User-defined shortcuts: "ship" -> "auto-ship"
  preferences: UserPreferences;
  stats: UsageStats;
}

export interface UserPreferences {
  /** Preferred workflows for certain actions */
  workflowPreferences: Record<string, string>; // action -> workflow name
  
  /** Default parameter values */
  defaultParams: Record<string, Record<string, any>>; // workflow -> params
  
  /** Auto-confirm for specific workflows */
  autoConfirm: string[];
}

export interface UsageStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  mostUsedWorkflows: Record<string, number>;
  lastActive: Date;
}

const DEFAULT_LEARNING_DATA: LearningData = {
  version: 1,
  patterns: [],
  shortcuts: {},
  preferences: {
    workflowPreferences: {},
    defaultParams: {},
    autoConfirm: [],
  },
  stats: {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    mostUsedWorkflows: {},
    lastActive: new Date(),
  },
};

export class LearningManager {
  private data: LearningData;
  private dirty: boolean = false;

  constructor() {
    this.data = this.load();
  }

  /**
   * Load learning data from disk
   */
  private load(): LearningData {
    try {
      if (existsSync(LEARNING_FILE)) {
        const content = readFileSync(LEARNING_FILE, "utf-8");
        const data = JSON.parse(content);
        
        // Convert date strings back to Date objects
        if (data.stats?.lastActive) {
          data.stats.lastActive = new Date(data.stats.lastActive);
        }
        for (const pattern of data.patterns || []) {
          if (pattern.timestamp) {
            pattern.timestamp = new Date(pattern.timestamp);
          }
        }
        
        return { ...DEFAULT_LEARNING_DATA, ...data };
      }
    } catch {
      // Ignore errors, use defaults
    }
    return { ...DEFAULT_LEARNING_DATA };
  }

  /**
   * Save learning data to disk
   */
  save(): void {
    if (!this.dirty) return;

    try {
      const dir = join(homedir(), ".hackflow");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(LEARNING_FILE, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch (error) {
      console.error("Failed to save learning data:", error);
    }
  }

  /**
   * Record a usage pattern
   */
  recordPattern(pattern: UsagePattern): void {
    this.data.patterns.push(pattern);
    
    // Trim old patterns
    if (this.data.patterns.length > MAX_PATTERNS) {
      this.data.patterns = this.data.patterns.slice(-MAX_PATTERNS);
    }
    
    // Update stats
    this.data.stats.totalExecutions++;
    if (pattern.executionSuccess) {
      this.data.stats.successfulExecutions++;
    } else if (pattern.executionSuccess === false) {
      this.data.stats.failedExecutions++;
    }
    
    // Update workflow usage
    if (pattern.resolvedTo.workflows) {
      for (const wf of pattern.resolvedTo.workflows) {
        this.data.stats.mostUsedWorkflows[wf] = 
          (this.data.stats.mostUsedWorkflows[wf] || 0) + 1;
      }
    }
    
    this.data.stats.lastActive = new Date();
    this.dirty = true;
  }

  /**
   * Record that user accepted/rejected a suggestion
   */
  recordFeedback(input: string, accepted: boolean, correction?: string): void {
    // Find the most recent pattern matching this input
    const pattern = [...this.data.patterns].reverse().find(p => p.input === input);
    if (pattern) {
      pattern.wasAccepted = accepted;
      if (correction) {
        pattern.correction = correction;
      }
      this.dirty = true;
    }
  }

  /**
   * Add a shortcut
   */
  addShortcut(shortcut: string, workflow: string): void {
    this.data.shortcuts[shortcut.toLowerCase()] = workflow;
    this.dirty = true;
  }

  /**
   * Get shortcut resolution
   */
  getShortcut(input: string): string | undefined {
    return this.data.shortcuts[input.toLowerCase()];
  }

  /**
   * Set workflow preference for an action
   */
  setWorkflowPreference(action: string, workflow: string): void {
    this.data.preferences.workflowPreferences[action.toLowerCase()] = workflow;
    this.dirty = true;
  }

  /**
   * Get workflow preference
   */
  getWorkflowPreference(action: string): string | undefined {
    return this.data.preferences.workflowPreferences[action.toLowerCase()];
  }

  /**
   * Set default parameters for a workflow
   */
  setDefaultParams(workflow: string, params: Record<string, any>): void {
    this.data.preferences.defaultParams[workflow] = {
      ...this.data.preferences.defaultParams[workflow],
      ...params,
    };
    this.dirty = true;
  }

  /**
   * Get default parameters for a workflow
   */
  getDefaultParams(workflow: string): Record<string, any> {
    return this.data.preferences.defaultParams[workflow] || {};
  }

  /**
   * Add workflow to auto-confirm list
   */
  addAutoConfirm(workflow: string): void {
    if (!this.data.preferences.autoConfirm.includes(workflow)) {
      this.data.preferences.autoConfirm.push(workflow);
      this.dirty = true;
    }
  }

  /**
   * Check if workflow is auto-confirmed
   */
  isAutoConfirm(workflow: string): boolean {
    return this.data.preferences.autoConfirm.includes(workflow);
  }

  /**
   * Get similar patterns for learning
   */
  getSimilarPatterns(input: string, limit: number = 5): UsagePattern[] {
    const inputLower = input.toLowerCase();
    const words = inputLower.split(/\s+/);
    
    // Score patterns by word overlap
    const scored = this.data.patterns
      .filter(p => p.wasAccepted)
      .map(pattern => {
        const patternWords = pattern.input.toLowerCase().split(/\s+/);
        const overlap = words.filter(w => patternWords.includes(w)).length;
        return { pattern, score: overlap / Math.max(words.length, patternWords.length) };
      })
      .filter(s => s.score > 0.3)
      .sort((a, b) => b.score - a.score);
    
    return scored.slice(0, limit).map(s => s.pattern);
  }

  /**
   * Get most used workflows
   */
  getMostUsedWorkflows(limit: number = 5): string[] {
    return Object.entries(this.data.stats.mostUsedWorkflows)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name]) => name);
  }

  /**
   * Get usage statistics
   */
  getStats(): UsageStats {
    return this.data.stats;
  }

  /**
   * Get all patterns (for debugging)
   */
  getPatterns(): UsagePattern[] {
    return this.data.patterns;
  }

  /**
   * Clear all learning data
   */
  clear(): void {
    this.data = { ...DEFAULT_LEARNING_DATA };
    this.dirty = true;
  }
}
