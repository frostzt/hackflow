import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type {
  IStorageAdapter,
  WorkflowExecution,
  StepResult,
  ExecutionFilters,
  ExecutionTree,
} from "../../types/index.js";

export class SQLiteStorageAdapter implements IStorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL"); // Better concurrency
  }

  async initialize(): Promise<void> {
    // Create executions table with new fields
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        current_step INTEGER,
        total_steps INTEGER,
        error TEXT,
        error_stack TEXT,
        metadata TEXT,
        parent_execution_id TEXT,
        parent_step_index INTEGER,
        duration INTEGER,
        depth INTEGER DEFAULT 0,
        trigger_type TEXT,
        trigger_source TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (parent_execution_id) REFERENCES executions(id) ON DELETE CASCADE
      )
    `);

    // Create steps table with new fields
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        step_name TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration INTEGER,
        input TEXT,
        output TEXT,
        error TEXT,
        error_stack TEXT,
        child_execution_id TEXT,
        retry_attempt INTEGER DEFAULT 0,
        skip_reason TEXT,
        FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
        UNIQUE(execution_id, step_index)
      )
    `);

    // Create context table (for variables)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (
        execution_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_name);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
      CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at);
      CREATE INDEX IF NOT EXISTS idx_executions_parent ON executions(parent_execution_id);
      CREATE INDEX IF NOT EXISTS idx_steps_execution ON steps(execution_id);
      CREATE INDEX IF NOT EXISTS idx_steps_child ON steps(child_execution_id);
    `);

    // Run migrations for existing databases
    this.runMigrations();
  }

  private runMigrations(): void {
    // Check if new columns exist and add them if not
    const tableInfo = this.db.prepare("PRAGMA table_info(executions)").all() as any[];
    const columnNames = tableInfo.map((c: any) => c.name);

    // Migration: Add parent_execution_id if not exists
    if (!columnNames.includes("parent_execution_id")) {
      this.db.exec("ALTER TABLE executions ADD COLUMN parent_execution_id TEXT");
      this.db.exec("ALTER TABLE executions ADD COLUMN parent_step_index INTEGER");
      this.db.exec("ALTER TABLE executions ADD COLUMN duration INTEGER");
      this.db.exec("ALTER TABLE executions ADD COLUMN depth INTEGER DEFAULT 0");
      this.db.exec("ALTER TABLE executions ADD COLUMN trigger_type TEXT");
      this.db.exec("ALTER TABLE executions ADD COLUMN trigger_source TEXT");
      this.db.exec("ALTER TABLE executions ADD COLUMN total_steps INTEGER");
      this.db.exec("ALTER TABLE executions ADD COLUMN error_stack TEXT");
    }

    // Check steps table
    const stepsInfo = this.db.prepare("PRAGMA table_info(steps)").all() as any[];
    const stepColumns = stepsInfo.map((c: any) => c.name);

    if (!stepColumns.includes("duration")) {
      this.db.exec("ALTER TABLE steps ADD COLUMN duration INTEGER");
      this.db.exec("ALTER TABLE steps ADD COLUMN input TEXT");
      this.db.exec("ALTER TABLE steps ADD COLUMN description TEXT");
      this.db.exec("ALTER TABLE steps ADD COLUMN error_stack TEXT");
      this.db.exec("ALTER TABLE steps ADD COLUMN child_execution_id TEXT");
      this.db.exec("ALTER TABLE steps ADD COLUMN retry_attempt INTEGER DEFAULT 0");
      this.db.exec("ALTER TABLE steps ADD COLUMN skip_reason TEXT");
    }
  }

  async saveExecution(execution: WorkflowExecution): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO executions (
        id, workflow_name, status, started_at, completed_at, current_step, total_steps,
        error, error_stack, metadata, parent_execution_id, parent_step_index, duration,
        depth, trigger_type, trigger_source
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.workflowName,
      execution.status,
      execution.startedAt.getTime(),
      execution.completedAt?.getTime() ?? null,
      execution.currentStep ?? null,
      execution.totalSteps ?? null,
      execution.error ?? null,
      execution.errorStack ?? null,
      JSON.stringify(execution.metadata),
      execution.parentExecutionId ?? null,
      execution.parentStepIndex ?? null,
      execution.duration ?? null,
      execution.depth ?? 0,
      execution.trigger?.type ?? null,
      execution.trigger?.source ?? null
    );
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM executions WHERE id = ?
    `);

    const row = stmt.get(executionId) as any;
    if (!row) return null;

    return this.rowToExecution(row);
  }

  async updateExecution(
    executionId: string,
    updates: Partial<WorkflowExecution>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.completedAt !== undefined) {
      fields.push("completed_at = ?");
      values.push(updates.completedAt.getTime());
    }
    if (updates.currentStep !== undefined) {
      fields.push("current_step = ?");
      values.push(updates.currentStep);
    }
    if (updates.totalSteps !== undefined) {
      fields.push("total_steps = ?");
      values.push(updates.totalSteps);
    }
    if (updates.error !== undefined) {
      fields.push("error = ?");
      values.push(updates.error);
    }
    if (updates.errorStack !== undefined) {
      fields.push("error_stack = ?");
      values.push(updates.errorStack);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }
    if (updates.duration !== undefined) {
      fields.push("duration = ?");
      values.push(updates.duration);
    }

    if (fields.length === 0) return;

    values.push(executionId);
    const sql = `UPDATE executions SET ${fields.join(", ")} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  async saveStepResult(executionId: string, step: StepResult): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO steps (
        execution_id, step_index, step_name, action, description, status,
        started_at, completed_at, duration, input, output, error, error_stack,
        child_execution_id, retry_attempt, skip_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      executionId,
      step.stepIndex,
      step.stepName,
      step.action,
      step.description ?? null,
      step.status,
      step.startedAt.getTime(),
      step.completedAt?.getTime() ?? null,
      step.duration ?? null,
      step.input ? JSON.stringify(step.input) : null,
      step.output !== undefined ? JSON.stringify(step.output) : null,
      step.error ?? null,
      step.errorStack ?? null,
      step.childExecutionId ?? null,
      step.retryAttempt ?? 0,
      step.skipReason ?? null
    );
  }

  async updateStepResult(
    executionId: string,
    stepIndex: number,
    updates: Partial<StepResult>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.completedAt !== undefined) {
      fields.push("completed_at = ?");
      values.push(updates.completedAt.getTime());
    }
    if (updates.duration !== undefined) {
      fields.push("duration = ?");
      values.push(updates.duration);
    }
    if (updates.output !== undefined) {
      fields.push("output = ?");
      values.push(JSON.stringify(updates.output));
    }
    if (updates.error !== undefined) {
      fields.push("error = ?");
      values.push(updates.error);
    }
    if (updates.errorStack !== undefined) {
      fields.push("error_stack = ?");
      values.push(updates.errorStack);
    }
    if (updates.childExecutionId !== undefined) {
      fields.push("child_execution_id = ?");
      values.push(updates.childExecutionId);
    }
    if (updates.skipReason !== undefined) {
      fields.push("skip_reason = ?");
      values.push(updates.skipReason);
    }

    if (fields.length === 0) return;

    values.push(executionId, stepIndex);
    const sql = `UPDATE steps SET ${fields.join(", ")} WHERE execution_id = ? AND step_index = ?`;
    this.db.prepare(sql).run(...values);
  }

  async getSteps(executionId: string): Promise<StepResult[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM steps WHERE execution_id = ? ORDER BY step_index ASC
    `);

    const rows = stmt.all(executionId) as any[];
    return rows.map(this.rowToStep);
  }

  async saveContext(
    executionId: string,
    context: Record<string, any>
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO contexts (execution_id, data, updated_at)
      VALUES (?, ?, unixepoch())
    `);

    stmt.run(executionId, JSON.stringify(context));
  }

  async getContext(executionId: string): Promise<Record<string, any>> {
    const stmt = this.db.prepare(`
      SELECT data FROM contexts WHERE execution_id = ?
    `);

    const row = stmt.get(executionId) as any;
    if (!row) return {};

    return JSON.parse(row.data);
  }

  async queryExecutions(
    filters?: ExecutionFilters
  ): Promise<WorkflowExecution[]> {
    let sql = "SELECT * FROM executions WHERE 1=1";
    const params: any[] = [];

    if (filters?.workflowName) {
      sql += " AND workflow_name = ?";
      params.push(filters.workflowName);
    }
    if (filters?.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    if (filters?.startedAfter) {
      sql += " AND started_at >= ?";
      params.push(filters.startedAfter.getTime());
    }
    if (filters?.startedBefore) {
      sql += " AND started_at <= ?";
      params.push(filters.startedBefore.getTime());
    }
    if (filters?.rootOnly) {
      sql += " AND parent_execution_id IS NULL";
    }
    if (filters?.parentExecutionId) {
      sql += " AND parent_execution_id = ?";
      params.push(filters.parentExecutionId);
    }

    sql += " ORDER BY started_at DESC";

    if (filters?.limit) {
      sql += " LIMIT ?";
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(this.rowToExecution);
  }

  async getChildExecutions(parentExecutionId: string): Promise<WorkflowExecution[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM executions 
      WHERE parent_execution_id = ? 
      ORDER BY started_at ASC
    `);

    const rows = stmt.all(parentExecutionId) as any[];
    return rows.map(this.rowToExecution);
  }

  async getExecutionTree(executionId: string): Promise<ExecutionTree> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const steps = await this.getSteps(executionId);
    const childExecutions = await this.getChildExecutions(executionId);

    // Recursively get children
    const children: ExecutionTree[] = [];
    for (const child of childExecutions) {
      const childTree = await this.getExecutionTree(child.id);
      children.push(childTree);
    }

    return {
      execution,
      steps,
      children,
    };
  }

  async cleanup(olderThan: Date): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM executions WHERE started_at < ?
    `);

    const result = stmt.run(olderThan.getTime());
    return result.changes;
  }

  private rowToExecution(row: any): WorkflowExecution {
    return {
      id: row.id,
      workflowName: row.workflow_name,
      status: row.status,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      currentStep: row.current_step ?? undefined,
      totalSteps: row.total_steps ?? undefined,
      error: row.error ?? undefined,
      errorStack: row.error_stack ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      parentExecutionId: row.parent_execution_id ?? undefined,
      parentStepIndex: row.parent_step_index ?? undefined,
      duration: row.duration ?? undefined,
      depth: row.depth ?? 0,
      trigger: row.trigger_type ? {
        type: row.trigger_type,
        source: row.trigger_source ?? undefined,
      } : undefined,
    };
  }

  private rowToStep(row: any): StepResult {
    return {
      stepIndex: row.step_index,
      stepName: row.step_name,
      action: row.action,
      description: row.description ?? undefined,
      status: row.status,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      duration: row.duration ?? undefined,
      input: row.input ? JSON.parse(row.input) : undefined,
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error ?? undefined,
      errorStack: row.error_stack ?? undefined,
      childExecutionId: row.child_execution_id ?? undefined,
      retryAttempt: row.retry_attempt ?? 0,
      skipReason: row.skip_reason ?? undefined,
    };
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}
