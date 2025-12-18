import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type {
  IStorageAdapter,
  WorkflowExecution,
  StepResult,
  ExecutionFilters,
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
    // Create executions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        current_step INTEGER,
        error TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // Create steps table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        step_name TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        output TEXT,
        error TEXT,
        FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
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
      CREATE INDEX IF NOT EXISTS idx_steps_execution ON steps(execution_id);
    `);
  }

  async saveExecution(execution: WorkflowExecution): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO executions (id, workflow_name, status, started_at, completed_at, current_step, error, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.workflowName,
      execution.status,
      execution.startedAt.getTime(),
      execution.completedAt?.getTime() ?? null,
      execution.currentStep ?? null,
      execution.error ?? null,
      JSON.stringify(execution.metadata)
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
    if (updates.error !== undefined) {
      fields.push("error = ?");
      values.push(updates.error);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) return;

    values.push(executionId);
    const sql = `UPDATE executions SET ${fields.join(", ")} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  async saveStepResult(executionId: string, step: StepResult): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO steps (execution_id, step_index, step_name, action, status, started_at, completed_at, output, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      executionId,
      step.stepIndex,
      step.stepName,
      step.action,
      step.status,
      step.startedAt.getTime(),
      step.completedAt?.getTime() ?? null,
      step.output ? JSON.stringify(step.output) : null,
      step.error ?? null
    );
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

    sql += " ORDER BY started_at DESC";

    if (filters?.limit) {
      sql += " LIMIT ?";
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(this.rowToExecution);
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
      error: row.error ?? undefined,
      metadata: JSON.parse(row.metadata),
    };
  }

  private rowToStep(row: any): StepResult {
    return {
      stepIndex: row.step_index,
      stepName: row.step_name,
      action: row.action,
      status: row.status,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error ?? undefined,
    };
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}
