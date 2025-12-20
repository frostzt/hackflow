/**
 * Hackflow UI Explorer Server
 * A lightweight web server for viewing workflow executions
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { IStorageAdapter, ExecutionTree } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface UIServerOptions {
  port?: number;
  host?: string;
  storage: IStorageAdapter;
}

export class UIServer {
  private server: ReturnType<typeof createServer> | null = null;
  private storage: IStorageAdapter;
  private port: number;
  private host: string;

  constructor(options: UIServerOptions) {
    this.storage = options.storage;
    this.port = options.port || 3333;
    this.host = options.host || "localhost";
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (error) {
          console.error("Request error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        resolve(url);
      });

      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    // Enable CORS for development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // API Routes
    if (path.startsWith("/api/")) {
      return this.handleAPI(path, url, res);
    }

    // Static files
    return this.serveStatic(path, res);
  }

  private async handleAPI(path: string, url: URL, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");

    try {
      // GET /api/executions - List executions
      if (path === "/api/executions") {
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const rootOnly = url.searchParams.get("rootOnly") !== "false";
        const workflowName = url.searchParams.get("workflow") || undefined;

        const executions = await this.storage.queryExecutions({
          limit,
          rootOnly,
          workflowName,
        });

        res.writeHead(200);
        res.end(JSON.stringify({ executions }));
        return;
      }

      // GET /api/executions/:id - Get single execution
      const execMatch = path.match(/^\/api\/executions\/([^/]+)$/);
      if (execMatch) {
        const executionId = execMatch[1];
        const execution = await this.storage.getExecution(executionId);
        
        if (!execution) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Execution not found" }));
          return;
        }

        const steps = await this.storage.getSteps(executionId);
        const context = await this.storage.getContext(executionId);

        res.writeHead(200);
        res.end(JSON.stringify({ execution, steps, context }));
        return;
      }

      // GET /api/executions/:id/tree - Get full execution tree
      const treeMatch = path.match(/^\/api\/executions\/([^/]+)\/tree$/);
      if (treeMatch) {
        const executionId = treeMatch[1];
        const tree = await this.storage.getExecutionTree(executionId);
        
        res.writeHead(200);
        res.end(JSON.stringify({ tree }));
        return;
      }

      // GET /api/executions/:id/children - Get child executions
      const childrenMatch = path.match(/^\/api\/executions\/([^/]+)\/children$/);
      if (childrenMatch) {
        const executionId = childrenMatch[1];
        const children = await this.storage.getChildExecutions(executionId);
        
        res.writeHead(200);
        res.end(JSON.stringify({ children }));
        return;
      }

      // GET /api/stats - Get execution statistics
      if (path === "/api/stats") {
        const allExecutions = await this.storage.queryExecutions({ limit: 1000, rootOnly: true });
        
        const stats = {
          total: allExecutions.length,
          completed: allExecutions.filter(e => e.status === "completed").length,
          failed: allExecutions.filter(e => e.status === "failed").length,
          running: allExecutions.filter(e => e.status === "running").length,
        };

        res.writeHead(200);
        res.end(JSON.stringify({ stats }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  }

  private serveStatic(path: string, res: ServerResponse): void {
    // Serve index.html for root and unknown paths (SPA routing)
    if (path === "/" || path === "/index.html") {
      res.setHeader("Content-Type", "text/html");
      res.writeHead(200);
      res.end(this.getIndexHTML());
      return;
    }

    // Serve CSS
    if (path === "/styles.css") {
      res.setHeader("Content-Type", "text/css");
      res.writeHead(200);
      res.end(this.getStyles());
      return;
    }

    // Serve JS
    if (path === "/app.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.writeHead(200);
      res.end(this.getAppJS());
      return;
    }

    // 404 for other static files
    res.writeHead(404);
    res.end("Not found");
  }

  private getIndexHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hackflow Explorer</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="app">
    <header>
      <div class="header-content">
        <h1>Hackflow Explorer</h1>
        <div class="stats" id="stats"></div>
      </div>
    </header>
    
    <main>
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>Executions</h2>
          <button id="refresh-btn" class="btn-icon" title="Refresh">↻</button>
        </div>
        <div class="filters">
          <input type="text" id="search" placeholder="Filter by workflow..." />
        </div>
        <div class="execution-list" id="execution-list">
          <div class="loading">Loading...</div>
        </div>
      </aside>
      
      <section class="content" id="content">
        <div class="empty-state">
          <h2>Select an execution</h2>
          <p>Choose an execution from the sidebar to view details</p>
        </div>
      </section>
    </main>
  </div>
  
  <script src="/app.js"></script>
</body>
</html>`;
  }

  private getStyles(): string {
    return `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --text-primary: #c9d1d9;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --border-color: #30363d;
  --accent-blue: #58a6ff;
  --accent-green: #3fb950;
  --accent-red: #f85149;
  --accent-yellow: #d29922;
  --accent-purple: #a371f7;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 1rem 1.5rem;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1800px;
  margin: 0 auto;
}

header h1 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stats {
  display: flex;
  gap: 1.5rem;
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.stat-value {
  font-weight: 600;
}

.stat.completed .stat-value { color: var(--accent-green); }
.stat.failed .stat-value { color: var(--accent-red); }
.stat.running .stat-value { color: var(--accent-yellow); }

main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h2 {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  font-size: 1.25rem;
  border-radius: 4px;
}

.btn-icon:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.filters {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.filters input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.875rem;
}

.filters input::placeholder {
  color: var(--text-muted);
}

.filters input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.execution-list {
  flex: 1;
  overflow-y: auto;
}

.execution-item {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}

.execution-item:hover {
  background: var(--bg-tertiary);
}

.execution-item.active {
  background: var(--bg-tertiary);
  border-left: 3px solid var(--accent-blue);
}

.execution-item .workflow-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.execution-item .workflow-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
  display: flex;
  gap: 0.75rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.completed {
  background: rgba(63, 185, 80, 0.15);
  color: var(--accent-green);
}

.status-badge.failed {
  background: rgba(248, 81, 73, 0.15);
  color: var(--accent-red);
}

.status-badge.running {
  background: rgba(210, 153, 34, 0.15);
  color: var(--accent-yellow);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
}

.empty-state h2 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.execution-detail {
  max-width: 1000px;
}

.detail-header {
  margin-bottom: 1.5rem;
}

.detail-header h2 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.detail-meta .meta-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.detail-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.detail-section-header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
  font-size: 0.875rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-section-content {
  padding: 1rem;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.step-icon {
  font-size: 1rem;
  width: 1.25rem;
  text-align: center;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.step-icon.completed { color: var(--accent-green); }
.step-icon.failed { color: var(--accent-red); }
.step-icon.skipped { color: var(--text-muted); }
.step-icon.running { color: var(--accent-yellow); }

.step-content {
  flex: 1;
  min-width: 0;
}

.step-action {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.step-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.step-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.step-error {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(248, 81, 73, 0.1);
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--accent-red);
  font-family: monospace;
}

.step-io {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.step-io pre {
  background: var(--bg-primary);
  padding: 0.5rem;
  border-radius: 4px;
  overflow-x: auto;
  color: var(--text-secondary);
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.child-workflows {
  margin-top: 0.5rem;
  padding-left: 1.5rem;
  border-left: 2px solid var(--accent-purple);
}

.child-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: rgba(163, 113, 247, 0.15);
  color: var(--accent-purple);
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}

.child-badge:hover {
  background: rgba(163, 113, 247, 0.25);
}

.loading {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.context-view {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
}
`;
  }

  private getAppJS(): string {
    return `
// Hackflow Explorer App
(function() {
  let currentExecutionId = null;
  let executions = [];

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await loadStats();
    await loadExecutions();
    
    // Event listeners
    document.getElementById('refresh-btn').addEventListener('click', refresh);
    document.getElementById('search').addEventListener('input', filterExecutions);
    
    // Auto-refresh every 5 seconds
    setInterval(refresh, 5000);
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      
      document.getElementById('stats').innerHTML = \`
        <div class="stat completed">
          <span class="stat-label">Completed:</span>
          <span class="stat-value">\${data.stats.completed}</span>
        </div>
        <div class="stat failed">
          <span class="stat-label">Failed:</span>
          <span class="stat-value">\${data.stats.failed}</span>
        </div>
        <div class="stat running">
          <span class="stat-label">Running:</span>
          <span class="stat-value">\${data.stats.running}</span>
        </div>
      \`;
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function loadExecutions() {
    try {
      const res = await fetch('/api/executions?limit=100');
      const data = await res.json();
      executions = data.executions;
      renderExecutionList(executions);
    } catch (error) {
      console.error('Failed to load executions:', error);
      document.getElementById('execution-list').innerHTML = 
        '<div class="loading">Failed to load executions</div>';
    }
  }

  function filterExecutions(e) {
    const query = e.target.value.toLowerCase();
    const filtered = executions.filter(exec => 
      exec.workflowName.toLowerCase().includes(query)
    );
    renderExecutionList(filtered);
  }

  function renderExecutionList(execs) {
    const list = document.getElementById('execution-list');
    
    if (execs.length === 0) {
      list.innerHTML = '<div class="loading">No executions found</div>';
      return;
    }

    list.innerHTML = execs.map(exec => \`
      <div class="execution-item \${exec.id === currentExecutionId ? 'active' : ''}" 
           data-id="\${exec.id}">
        <div class="workflow-name">
          <span class="status-badge \${exec.status}">
            \${getStatusIcon(exec.status)} \${exec.status}
          </span>
          \${exec.workflowName}
        </div>
        <div class="workflow-meta">
          <span>\${formatDate(exec.startedAt)}</span>
          <span>\${exec.duration ? formatDuration(exec.duration) : ''}</span>
        </div>
      </div>
    \`).join('');

    // Add click handlers
    list.querySelectorAll('.execution-item').forEach(item => {
      item.addEventListener('click', () => selectExecution(item.dataset.id));
    });
  }

  async function selectExecution(id) {
    currentExecutionId = id;
    
    // Update sidebar selection
    document.querySelectorAll('.execution-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === id);
    });

    // Load execution details
    try {
      const res = await fetch(\`/api/executions/\${id}\`);
      const data = await res.json();
      renderExecutionDetail(data);
    } catch (error) {
      console.error('Failed to load execution:', error);
    }
  }

  function renderExecutionDetail(data) {
    const { execution, steps, context } = data;
    const content = document.getElementById('content');

    content.innerHTML = \`
      <div class="execution-detail">
        <div class="detail-header">
          <h2>
            <span class="status-badge \${execution.status}">
              \${getStatusIcon(execution.status)} \${execution.status}
            </span>
            \${execution.workflowName}
          </h2>
          <div class="detail-meta">
            <div class="meta-item">
              <span>ID:</span>
              <code>\${execution.id.slice(0, 8)}...</code>
            </div>
            <div class="meta-item">
              <span>Started:</span>
              <span>\${formatDate(execution.startedAt)}</span>
            </div>
            \${execution.duration ? \`
              <div class="meta-item">
                <span>Duration:</span>
                <span>\${formatDuration(execution.duration)}</span>
              </div>
            \` : ''}
            \${execution.trigger ? \`
              <div class="meta-item">
                <span>Trigger:</span>
                <span>\${execution.trigger.type}</span>
              </div>
            \` : ''}
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-header">
            <span>Steps (\${steps.length})</span>
            <span>\${execution.currentStep || 0}/\${execution.totalSteps || steps.length}</span>
          </div>
          <div class="detail-section-content">
            <div class="step-list">
              \${steps.map(step => renderStep(step)).join('')}
            </div>
          </div>
        </div>

        \${execution.error ? \`
          <div class="detail-section">
            <div class="detail-section-header">Error</div>
            <div class="detail-section-content">
              <div class="step-error">\${execution.error}</div>
            </div>
          </div>
        \` : ''}

        <div class="detail-section">
          <div class="detail-section-header">Context</div>
          <div class="detail-section-content">
            <div class="context-view">\${JSON.stringify(context, null, 2)}</div>
          </div>
        </div>
      </div>
    \`;

    // Add click handlers for child workflows
    content.querySelectorAll('.child-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        selectExecution(badge.dataset.childId);
      });
    });
  }

  function renderStep(step) {
    return \`
      <div class="step-item">
        <div class="step-icon \${step.status}">\${getStatusIcon(step.status)}</div>
        <div class="step-content">
          <div class="step-action">\${step.action}</div>
          \${step.description ? \`<div class="step-description">\${step.description}</div>\` : ''}
          <div class="step-meta">
            \${step.duration ? \`Duration: \${formatDuration(step.duration)}\` : ''}
            \${step.childExecutionId ? \`
              <span class="child-badge" data-child-id="\${step.childExecutionId}">
                → Child workflow
              </span>
            \` : ''}
          </div>
          \${step.error ? \`<div class="step-error">\${step.error}</div>\` : ''}
          \${step.input ? \`
            <div class="step-io">
              <strong>Input:</strong>
              <pre>\${JSON.stringify(step.input, null, 2)}</pre>
            </div>
          \` : ''}
          \${step.output ? \`
            <div class="step-io">
              <strong>Output:</strong>
              <pre>\${truncate(JSON.stringify(step.output, null, 2), 500)}</pre>
            </div>
          \` : ''}
        </div>
      </div>
    \`;
  }

  async function refresh() {
    await loadStats();
    await loadExecutions();
    if (currentExecutionId) {
      await selectExecution(currentExecutionId);
    }
  }

  // Helpers
  function getStatusIcon(status) {
    switch (status) {
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'running': return '◐';
      case 'skipped': return '○';
      default: return '?';
    }
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
    return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
  }

  function truncate(str, len) {
    if (str.length <= len) return str;
    return str.slice(0, len) + '...';
  }
})();
`;
  }
}
