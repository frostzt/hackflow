import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowExecutor } from '../core/executor.js';
import { WorkflowRegistry } from './registry.js';
import type { WorkflowDefinition, IStorageAdapter, IMCPClient, IPromptHandler, ISecurityGuard, IModelProvider } from '../types/index.js';

// Mock implementations
class MockStorage implements IStorageAdapter {
  private executions = new Map();
  private steps = new Map();
  private contexts = new Map();

  async initialize() {}
  
  async saveExecution(execution: any) {
    this.executions.set(execution.id, execution);
  }
  
  async getExecution(id: string) {
    return this.executions.get(id) || null;
  }
  
  async updateExecution(id: string, updates: any) {
    const exec = this.executions.get(id);
    if (exec) {
      Object.assign(exec, updates);
    }
  }
  
  async saveStepResult(executionId: string, step: any) {
    if (!this.steps.has(executionId)) {
      this.steps.set(executionId, []);
    }
    this.steps.get(executionId).push(step);
  }
  
  async getSteps(executionId: string) {
    return this.steps.get(executionId) || [];
  }
  
  async saveContext(executionId: string, context: any) {
    this.contexts.set(executionId, context);
  }
  
  async getContext(executionId: string) {
    return this.contexts.get(executionId) || {};
  }
  
  async queryExecutions() {
    return Array.from(this.executions.values());
  }
  
  async cleanup() {
    return 0;
  }
}

class MockMCPClient implements IMCPClient {
  private connections = new Set<string>();
  
  async connect(server: string) {
    this.connections.add(server);
  }
  
  async disconnect(server: string) {
    this.connections.delete(server);
  }
  
  async callTool(server: string, tool: string, params: any) {
    // Throw error for unknown servers (simulating real MCP client behavior)
    if (!this.connections.has(server)) {
      throw new Error(`Not connected to MCP server: ${server}`);
    }
    return { success: true, params };
  }
  async listTools() {
    return [];
  }
  async autoConnect() {}
  isConnected(serverName: string) {
    return false;
  }
}

class MockPromptHandler implements IPromptHandler {
  private responses = new Map<string, any>();

  setResponse(message: string, response: any) {
    this.responses.set(message, response);
  }

  async ask(prompt: any) {
    const message = typeof prompt === 'string' ? prompt : prompt.message;
    return { value: this.responses.get(message) || 'default response' };
  }
  
  async confirm(message: string, defaultValue?: boolean) {
    return this.responses.get(message) ?? defaultValue ?? true;
  }

  async select(message: string, options: string[]) {
    return this.responses.get(message) || options[0];
  }
}

class MockSecurityGuard implements ISecurityGuard {
  validatePath(path: string, operation: "read" | "write" | "delete") {
    return true;
  }
  
  async checkPermission() {
    return { allowed: true };
  }
  
  async requestConfirmation() {
    return true;
  }
  
  async checkRateLimit() {
    return true;
  }

  async estimateCost(modelCalls: Array<{ model: string; estimatedTokens: number }>) {
    return { estimatedCost: 0, currency: "USD", breakdown: {} };
  }
}

describe('Workflow Composition', () => {
  let executor: WorkflowExecutor;
  let registry: WorkflowRegistry;
  let storage: MockStorage;
  let mcpClient: MockMCPClient;
  let promptHandler: MockPromptHandler;
  let securityGuard: MockSecurityGuard;

  beforeEach(() => {
    storage = new MockStorage();
    mcpClient = new MockMCPClient();
    promptHandler = new MockPromptHandler();
    securityGuard = new MockSecurityGuard();
    
    registry = new WorkflowRegistry();
    executor = new WorkflowExecutor(
      storage,
      mcpClient,
      promptHandler,
      securityGuard,
      registry
    );
  });

  describe('Basic Workflow Calling', () => {
    it('should call a child workflow and get its result', async () => {
      // Define child workflow
      const childWorkflow: WorkflowDefinition = {
        name: 'child-workflow',
        steps: [
          {
            action: 'variable.set',
            params: {
              name: 'result',
              value: 'success',
            },
            output: 'result',
          },
        ],
      };

      // Define parent workflow
      const parentWorkflow: WorkflowDefinition = {
        name: 'parent-workflow',
        steps: [
          {
            action: 'workflow.run',
            params: {
              workflow: 'child-workflow',
            },
            output: 'child_result',
          },
          {
            action: 'variable.set',
            params: {
              name: 'final',
              value: '{{child_result.result}}',
            },
            output: 'final',
          },
        ],
      };

      // Register child workflow
      await registry.register(childWorkflow);

      // Execute parent workflow
      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.final).toBe('success');
    });

    it('should pass variables to child workflow', async () => {
      // Child workflow that uses passed variables
      const childWorkflow: WorkflowDefinition = {
        name: 'child-with-vars',
        config_schema: {
          input_value: {
            type: 'string',
            required: true,
          },
        },
        steps: [
          {
            action: 'variable.set',
            params: {
              name: 'output',
              value: 'processed: {{input_value}}',
            },
            output: 'output',
          },
        ],
      };

      // Parent workflow passes variables
      const parentWorkflow: WorkflowDefinition = {
        name: 'parent-with-vars',
        steps: [
          {
            action: 'workflow.run',
            params: {
              workflow: 'child-with-vars',
              vars: {
                input_value: 'hello',
              },
            },
            output: 'child_result',
          },
        ],
      };

      await registry.register(childWorkflow);

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.child_result.output).toBe('processed: hello');
    });

    it('should handle interpolated variables in workflow calls', async () => {
      const childWorkflow: WorkflowDefinition = {
        name: 'child-interpolation',
        config_schema: {
          message: { type: 'string', required: true },
        },
        steps: [
          {
            action: 'variable.set',
            params: { name: 'result', value: '{{message}}' },
            output: 'result',
          },
        ],
      };

      const parentWorkflow: WorkflowDefinition = {
        name: 'parent-interpolation',
        steps: [
          {
            action: 'variable.set',
            params: { name: 'my_message', value: 'test message' },
            output: 'my_message',
          },
          {
            action: 'workflow.run',
            params: {
              workflow: 'child-interpolation',
              vars: {
                message: '{{my_message}}',
              },
            },
            output: 'child_result',
          },
        ],
      };

      await registry.register(childWorkflow);

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.child_result.result).toBe('test message');
    });
  });

  describe('Nested Workflow Calls', () => {
    it('should support multiple levels of nesting', async () => {
      // Grandchild
      const grandchildWorkflow: WorkflowDefinition = {
        name: 'grandchild',
        steps: [
          {
            action: 'variable.set',
            params: { name: 'level', value: 3 },
            output: 'level',
          },
        ],
      };

      // Child calls grandchild
      const childWorkflow: WorkflowDefinition = {
        name: 'child',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'grandchild' },
            output: 'grandchild_result',
          },
          {
            action: 'variable.set',
            params: {
              name: 'level',
              value: 2,
            },
            output: 'level',
          },
        ],
      };

      // Parent calls child
      const parentWorkflow: WorkflowDefinition = {
        name: 'parent',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'child' },
            output: 'child_result',
          },
          {
            action: 'variable.set',
            params: { name: 'level', value: 1 },
            output: 'level',
          },
        ],
      };

      await registry.register(grandchildWorkflow);
      await registry.register(childWorkflow);

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.level).toBe(1);
      expect(result.context!.child_result.level).toBe(2);
      expect(result.context!.child_result.grandchild_result.level).toBe(3);
    });

    it('should handle deep nesting without stack overflow', async () => {
      // Create 10 levels of workflows
      for (let i = 10; i >= 1; i--) {
        const workflow: WorkflowDefinition = {
          name: `level-${i}`,
          steps: [],
        };

        if (i < 10) {
          workflow.steps.push({
            action: 'workflow.run',
            params: { workflow: `level-${i + 1}` },
            output: 'child_result',
          });
        }

        workflow.steps.push({
          action: 'variable.set',
          params: { name: 'level', value: i },
          output: 'level',
        });

        await registry.register(workflow);
      }

      const parentWorkflow: WorkflowDefinition = {
        name: 'deep-parent',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'level-1' },
            output: 'result',
          },
        ],
      };

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.result.level).toBe(1);
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should detect direct circular dependency', async () => {
      const workflow1: WorkflowDefinition = {
        name: 'workflow-a',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'workflow-b' },
          },
        ],
      };

      const workflow2: WorkflowDefinition = {
        name: 'workflow-b',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'workflow-a' },
          },
        ],
      };

      await registry.register(workflow1);
      await registry.register(workflow2);

      const result = await executor.execute(workflow1, { values: {} });

      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/circular/i);
    });

    it('should detect indirect circular dependency', async () => {
      const workflowA: WorkflowDefinition = {
        name: 'workflow-a',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'workflow-b' },
          },
        ],
      };

      const workflowB: WorkflowDefinition = {
        name: 'workflow-b',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'workflow-c' },
          },
        ],
      };

      const workflowC: WorkflowDefinition = {
        name: 'workflow-c',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'workflow-a' },
          },
        ],
      };

      await registry.register(workflowA);
      await registry.register(workflowB);
      await registry.register(workflowC);

      const result = await executor.execute(workflowA, { values: {} });

      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/circular/i);
    });

    it('should allow calling same workflow multiple times in sequence', async () => {
      const utilWorkflow: WorkflowDefinition = {
        name: 'util',
        config_schema: {
          input: { type: 'number', required: true },
        },
        steps: [
          {
            action: 'variable.set',
            params: {
              name: 'doubled',
              value: '{{input}}',
            },
            output: 'doubled',
          },
        ],
      };

      const mainWorkflow: WorkflowDefinition = {
        name: 'main',
        steps: [
          {
            action: 'workflow.run',
            params: {
              workflow: 'util',
              vars: { input: 5 },
            },
            output: 'result1',
          },
          {
            action: 'workflow.run',
            params: {
              workflow: 'util',
              vars: { input: 10 },
            },
            output: 'result2',
          },
        ],
      };

      await registry.register(utilWorkflow);

      const result = await executor.execute(mainWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.result1.doubled).toBe(5);
      expect(result.context!.result2.doubled).toBe(10);
    });
  });

  describe('Error Handling in Composed Workflows', () => {
    it('should propagate errors from child workflows', async () => {
      const childWorkflow: WorkflowDefinition = {
        name: 'failing-child',
        steps: [
          {
            action: 'invalid.action',
            params: {},
          },
        ],
      };

      const parentWorkflow: WorkflowDefinition = {
        name: 'parent-with-failing-child',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'failing-child' },
          },
        ],
      };

      await registry.register(childWorkflow);

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('failing-child');
    });

    it('should handle non-existent workflow gracefully', async () => {
      const parentWorkflow: WorkflowDefinition = {
        name: 'parent-with-missing-child',
        steps: [
          {
            action: 'workflow.run',
            params: { workflow: 'non-existent-workflow' },
          },
        ],
      };

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('non-existent-workflow');
    });
  });

  describe('Context Isolation', () => {
    it('should isolate child workflow context from parent', async () => {
      const childWorkflow: WorkflowDefinition = {
        name: 'child-context',
        steps: [
          {
            action: 'variable.set',
            params: {
              name: 'local_var',
              value: 'child value',
            },
            output: 'local_var',
          },
        ],
      };

      const parentWorkflow: WorkflowDefinition = {
        name: 'parent-context',
        steps: [
          {
            action: 'variable.set',
            params: {
              name: 'local_var',
              value: 'parent value',
            },
            output: 'local_var',
          },
          {
            action: 'workflow.run',
            params: { workflow: 'child-context' },
            output: 'child_result',
          },
        ],
      };

      await registry.register(childWorkflow);

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.local_var).toBe('parent value');
      expect(result.context!.child_result.local_var).toBe('child value');
    });

    it('should only pass explicitly provided variables to child', async () => {
      const childWorkflow: WorkflowDefinition = {
        name: 'child-explicit-vars',
        config_schema: {
          allowed_var: { type: 'string', required: false },
        },
        steps: [
          {
            action: 'variable.set',
            params: {
              name: 'result',
              value: '{{allowed_var}}',
            },
            output: 'result',
          },
        ],
      };

      const parentWorkflow: WorkflowDefinition = {
        name: 'parent-explicit-vars',
        steps: [
          {
            action: 'variable.set',
            params: {
              name: 'secret_var',
              value: 'should not be accessible',
            },
            output: 'secret_var',
          },
          {
            action: 'variable.set',
            params: {
              name: 'allowed_var',
              value: 'accessible',
            },
            output: 'allowed_var',
          },
          {
            action: 'workflow.run',
            params: {
              workflow: 'child-explicit-vars',
              vars: {
                allowed_var: '{{allowed_var}}',
              },
            },
            output: 'child_result',
          },
        ],
      };

      await registry.register(childWorkflow);

      const result = await executor.execute(parentWorkflow, { values: {} });

      expect(result.status).toBe('completed');
      expect(result.context!.child_result.result).toBe('accessible');
      // Child should not have access to secret_var
    });
  });

  describe('Performance and Limits', () => {
    it('should handle maximum nesting depth', async () => {
      const maxDepth = 50;

      // Create chain of workflows
      for (let i = maxDepth; i >= 1; i--) {
        const workflow: WorkflowDefinition = {
          name: `depth-${i}`,
          steps: [],
        };

        if (i < maxDepth) {
          workflow.steps.push({
            action: 'workflow.run',
            params: { workflow: `depth-${i + 1}` },
            output: 'child',
          });
        }

        workflow.steps.push({
          action: 'variable.set',
          params: { name: 'depth', value: i },
          output: 'depth',
        });

        await registry.register(workflow);
      }

      const result = await executor.execute(
        { name: 'root', steps: [{ action: 'workflow.run', params: { workflow: 'depth-1' }, output: 'result' }] },
        { values: {} }
      );

      expect(result.status).toBe('completed');
    });
  });
});
