# How AI Works in Hackflow

This document explains the architecture and flow of AI features in Hackflow.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│         User / CLI                       │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│         HackflowAgent                    │
│  - Creates AI provider (optional)        │
│  - Passes to executor & prompt handler   │
└────────────────┬────────────────────────┘
                 │
        ┌────────┼────────┐
        ↓        ↓        ↓
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │Executor  │ │ Prompt   │ │Security  │
  │          │ │ Handler  │ │          │
  │Has AI    │ │Has AI    │ │          │
  └────┬─────┘ └────┬─────┘ └──────────┘
       │            │
       └────────┬───┘
                ↓
      ┌──────────────────┐
      │   AI Provider     │
      │  (Claude, etc.)   │
      └──────────────────┘
```

## 🔌 Components

### 1. AI Provider Interface (`IModelProvider`)

Located in: `src/types/index.ts`

```typescript
export interface IModelProvider {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateOptions,
  ): Promise<void>;
}
```

**Purpose**: Defines the contract for AI providers
**Benefit**: Any AI provider can be swapped in

### 2. Claude Provider (`ClaudeProvider`)

Located in: `src/ai/claude.ts`

**What it does**:

- Connects to Anthropic's API
- Implements `IModelProvider` interface
- Handles streaming responses
- Provides cost estimation

**Initialization**:

```typescript
const provider = new ClaudeProvider(apiKey, "claude-3-5-sonnet-20241022");
```

### 3. AI Factory (`createAIProvider`)

Located in: `src/ai/index.ts`

**Purpose**: Creates AI providers based on configuration

```typescript
const config = loadAIConfig(); // Loads from env
const provider = createAIProvider(config);
```

**Supports**:

- `claude` - Anthropic Claude (implemented)
- `openai` - OpenAI GPT (coming soon)
- `custom` - Your own provider

### 4. Integration Points

#### A. In Workflow Executor

Located in: `src/core/executor.ts`

The executor receives the AI provider and uses it for `ai.*` actions:

```typescript
class WorkflowExecutor {
  constructor(
    storage,
    security,
    mcpClient,
    promptHandler,
    aiProvider, // ← AI provider passed in
  ) {}

  private async executeAIAction(action, params) {
    if (!this.aiProvider) {
      throw new Error("AI provider not available");
    }

    switch (action) {
      case "generate":
        return this.aiProvider.generate(params.prompt, options);
      case "interpret":
      // ... interpretation logic
      case "summarize":
      // ... summarization logic
    }
  }
}
```

#### B. In Prompt Handler

Located in: `src/core/prompt.ts`

The prompt handler uses AI for dynamic prompts:

```typescript
class CLIPromptHandler {
  constructor(private aiProvider?: IModelProvider) {}

  private async askText(prompt: PromptRequest) {
    const value = await this.question(prompt.message);

    // Use AI if dynamic mode and provider available
    if (prompt.dynamic && this.aiProvider) {
      const interpreted = await this.aiProvider.generate(
        `Interpret: "${value}"...`,
        { temperature: 0.3 },
      );
      return { value, interpreted };
    }

    return { value };
  }
}
```

### 5. CLI Integration

Located in: `src/cli/index.ts`

The CLI creates everything and wires it together:

```typescript
async function createAgent() {
  const storage = createStorage({ type: "sqlite" });

  // Try to load AI provider (optional)
  let aiProvider;
  try {
    const aiConfig = loadAIConfig(); // Reads ANTHROPIC_API_KEY
    if (aiConfig) {
      aiProvider = createAIProvider(aiConfig);
    }
  } catch (error) {
    console.log("ℹ️  AI features disabled (no API key)");
  }

  // Pass AI to components that need it
  const promptHandler = new CLIPromptHandler(aiProvider);
  const agent = new HackflowAgent(
    storage,
    security,
    mcpClient,
    promptHandler,
    aiProvider,
  );

  return agent;
}
```

## 🔄 Execution Flow

### Scenario 1: User Runs Workflow with `ai.generate`

```
1. CLI loads workflow YAML
   ↓
2. CLI creates AI provider (if API key exists)
   ↓
3. CLI creates Agent with AI provider
   ↓
4. Agent creates Executor with AI provider
   ↓
5. Executor runs workflow steps
   ↓
6. When it hits `ai.generate` step:
   - Calls executeAIAction()
   - Checks if aiProvider exists
   - Calls aiProvider.generate(prompt, options)
   ↓
7. ClaudeProvider sends request to Anthropic
   ↓
8. Response returned, stored in workflow context
   ↓
9. Next steps can use {{output}} variable
```

### Scenario 2: User Uses Dynamic Prompt

```
1. Workflow has: prompt.ask with dynamic: true
   ↓
2. Executor calls executePromptAction()
   ↓
3. Executor calls promptHandler.ask()
   ↓
4. PromptHandler asks user for input
   ↓
5. User types: "I fixed that annoying bug"
   ↓
6. PromptHandler checks if dynamic && aiProvider
   ↓
7. If yes, calls aiProvider.generate() with interpretation prompt
   ↓
8. AI returns: "Fixed bug"
   ↓
9. Returns { value: "I fixed...", interpreted: "Fixed bug" }
   ↓
10. Workflow gets clean, interpreted version
```

## 🔧 Configuration

### Environment Variables

AI provider loaded from environment:

```bash
# For Claude (Anthropic)
export ANTHROPIC_API_KEY=sk-ant-...

# Optional: specific model
export ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### Programmatic Configuration

```typescript
import { createAIProvider, HackflowAgent } from "hackflow";

// Option 1: Use environment
const aiConfig = loadAIConfig();
const aiProvider = aiConfig ? createAIProvider(aiConfig) : undefined;

// Option 2: Explicit config
const aiProvider = createAIProvider({
  provider: "claude",
  apiKey: "sk-ant-...",
  model: "claude-3-5-sonnet-20241022",
});

// Option 3: Custom provider
class MyAI implements IModelProvider {
  async generate(prompt: string) {
    return "response";
  }
  async stream(prompt: string, onChunk: (c: string) => void) {}
}

const aiProvider = createAIProvider({
  provider: "custom",
  customProvider: new MyAI(),
});

// Pass to agent
const agent = new HackflowAgent(
  storage,
  security,
  mcpClient,
  promptHandler,
  aiProvider, // ← Here!
);
```

## 🎯 Workflow Actions

### `ai.generate`

**Purpose**: Generate text with AI

**Parameters**:

- `prompt` (required): The prompt to send
- `temperature` (optional): 0.0-1.0, creativity level
- `max_tokens` (optional): Max response length
- `model` (optional): Specific model to use
- `system` (optional): System prompt

**Example**:

```yaml
- action: ai.generate
  params:
    prompt: "Write a commit message for: {{changes}}"
    temperature: 0.7
    max_tokens: 100
  output: commit_msg
```

**Implementation**: `src/core/executor.ts` → `executeAIAction()`

### `ai.interpret`

**Purpose**: Interpret user input in context

**Parameters**:

- `input` (required): User input to interpret
- `context` (optional): Additional context

**Example**:

```yaml
- action: ai.interpret
  params:
    input: "{{user_input}}"
    context: "We're creating a commit message"
  output: interpreted
```

### `ai.summarize`

**Purpose**: Summarize long text

**Parameters**:

- `text` (required): Text to summarize
- `max_length` (optional): Max summary length

**Example**:

```yaml
- action: ai.summarize
  params:
    text: "{{long_content}}"
    max_length: 200
  output: summary
```

## 🛡️ Error Handling

### No API Key

**What happens**: AI actions fail gracefully

```typescript
if (!this.aiProvider) {
  throw new Error("AI provider not available. Set ANTHROPIC_API_KEY...");
}
```

**Solution**: Set environment variable

### API Error

**What happens**: Step fails, can retry

```yaml
- action: ai.generate
  params:
    prompt: "..."
  retry:
    attempts: 3 # Retry on failure
    delay: 1000
```

### Dynamic Prompts Without AI

**What happens**: Falls back to static mode

```typescript
if (prompt.dynamic && this.aiProvider) {
  // Use AI interpretation
} else {
  // Return raw value
  return { value };
}
```

## 🔌 Adding New AI Providers

### Step 1: Implement Interface

```typescript
// src/ai/openai.ts
import { IModelProvider, GenerateOptions } from "../types";

export class OpenAIProvider implements IModelProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    // Call OpenAI API
    return "generated text";
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateOptions,
  ): Promise<void> {
    // Stream from OpenAI
  }
}
```

### Step 2: Add to Factory

```typescript
// src/ai/index.ts
export function createAIProvider(config: AIConfig): IModelProvider {
  switch (config.provider) {
    case "claude":
      return new ClaudeProvider(config.apiKey, config.model);

    case "openai": // Add this
      return new OpenAIProvider(config.apiKey, config.model);

    case "custom":
      return config.customProvider;
  }
}
```

### Step 3: Update loadAIConfig

```typescript
export function loadAIConfig(): AIConfig | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    return { provider: "claude", apiKey: anthropicKey };
  }

  if (openaiKey) {
    // Add this
    return { provider: "openai", apiKey: openaiKey };
  }

  return null;
}
```

Done! Now users can use OpenAI by setting `OPENAI_API_KEY`.

## 🚀 Testing AI Features

### Without API Key

Workflows run but AI actions fail:

```bash
npm run dev -- run examples/ai-simple-demo.yaml
# Error: AI provider not available
```

### With API Key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev -- run examples/ai-simple-demo.yaml
# Works! AI generates responses
```

### Dry Run Mode

Test workflows without calling AI:

```bash
npm run dev -- run examples/ai-simple-demo.yaml --dry-run
# Shows what would be executed, doesn't call AI API
```

## 💡 Best Practices

### 1. Optional AI

Always make AI optional in workflows:

```yaml
# ✅ Good: Workflow works without AI
- action: prompt.ask
  params:
    message: "Enter commit message"
    dynamic: false # Works without AI
  output: msg

# ⚠️  Requires AI
- action: ai.generate
  params:
    prompt: "Generate message"
```

### 2. Error Handling

Add retry for AI actions:

```yaml
- action: ai.generate
  params:
    prompt: "..."
  retry:
    attempts: 3
    delay: 1000
```

### 3. Cost Control

Use appropriate `max_tokens`:

```yaml
# Short responses
- action: ai.generate
  params:
    prompt: "Summarize: {{text}}"
    max_tokens: 100 # Cheaper!

# Long responses
- action: ai.generate
  params:
    prompt: "Write documentation for: {{code}}"
    max_tokens: 2000
```

## 🔍 Debugging

### Enable Verbose Logging

```bash
npm run dev -- run workflow.yaml --verbose
```

### Check AI Provider

```typescript
// In code
if (aiProvider) {
  console.log("AI provider available");
} else {
  console.log("No AI provider");
}
```

### Test AI Directly

```typescript
import { ClaudeProvider } from "hackflow";

const ai = new ClaudeProvider("your-key");
const result = await ai.generate("Hello!");
console.log(result);
```

## 📚 Summary

**AI in Hackflow**:

1. Optional - workflows work without it
2. Swappable - any provider via `IModelProvider`
3. Integrated - available in executor & prompts
4. Graceful - falls back when unavailable

**Key Files**:

- `src/types/index.ts` - IModelProvider interface
- `src/ai/claude.ts` - Claude implementation
- `src/ai/index.ts` - Factory and config loading
- `src/core/executor.ts` - AI actions
- `src/core/prompt.ts` - Dynamic prompts
- `src/cli/index.ts` - Wiring it all together

The AI layer is fully swappable and designed to work with any provider!
