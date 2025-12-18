# AI Features in Hackflow

Hackflow includes AI capabilities powered by Claude (Anthropic) or other AI providers. These features are **optional** and require an API key.

## 🚀 Quick Start

### 1. Set up your API key

```bash
# For Claude (Anthropic)
export ANTHROPIC_API_KEY=your_api_key_here

# Optional: specify model
export ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### 2. Run an AI-powered workflow

```bash
hackflow run examples/ai-commit-message.yaml
```

## 🎯 AI Features

### 1. Dynamic Prompts

When `dynamic: true` is set on a prompt, AI interprets the user's natural language response:

```yaml
steps:
  - action: prompt.ask
    params:
      message: "Describe what you changed"
      dynamic: true # AI will interpret the response
    output: description
```

**Example:**

- User says: "I fixed that annoying bug with the login button"
- AI interprets: "Fixed login button bug"

### 2. AI Actions

Use `ai.*` actions to leverage AI capabilities in your workflows:

#### `ai.generate`

Generate text using AI:

```yaml
- action: ai.generate
  params:
    prompt: "Write a commit message for: {{changes}}"
    temperature: 0.7 # Optional, default 1.0
    max_tokens: 100 # Optional, default 1024
    model: "claude-3-5-sonnet-20241022" # Optional
  output: generated_text
```

**Parameters:**

- `prompt` (required): The prompt to send to the AI
- `temperature` (optional): Creativity (0.0 = deterministic, 1.0 = creative)
- `max_tokens` (optional): Maximum response length
- `model` (optional): Specific model to use
- `system` (optional): System prompt for behavior control

#### `ai.interpret`

Interpret user input in context:

```yaml
- action: ai.interpret
  params:
    input: "{{user_input}}"
    context: "We're creating a commit message"
  output: interpreted
```

#### `ai.summarize`

Summarize long text:

```yaml
- action: ai.summarize
  params:
    text: "{{long_content}}"
    max_length: 200 # Optional
  output: summary
```

## 📝 Example Workflows

### AI Commit Message Generator

```yaml
name: ai-commit-message
mcps_required:
  - git

steps:
  # Ask user in natural language
  - action: prompt.ask
    params:
      message: "What did you change?"
      dynamic: true
    output: description

  # Generate professional commit message
  - action: ai.generate
    params:
      prompt: |
        Create a git commit message for:
        {{description}}

        Use conventional commits format.
      temperature: 0.7
    output: commit_msg

  # Commit
  - action: git.commit
    params:
      message: "{{commit_msg}}"
```

### AI Code Reviewer

````yaml
name: ai-code-review
mcps_required:
  - filesystem

steps:
  # Read file
  - action: filesystem.read
    params:
      path: "{{file}}"
    output: code

  # Review with AI
  - action: ai.generate
    params:
      prompt: |
        Review this code:
        ```
        {{code}}
        ```

        Provide constructive feedback.
      temperature: 0.5
    output: review

  # Show review
  - action: log.info
    params:
      message: "{{review}}"
````

## 🔧 Configuration

### Environment Variables

```bash
# Required for Claude
ANTHROPIC_API_KEY=sk-ant-...

# Optional
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # Default model
```

### Programmatic Configuration

```typescript
import { createAIProvider, HackflowAgent } from "hackflow";

// Create AI provider
const aiProvider = createAIProvider({
  provider: "claude",
  apiKey: "your_key",
  model: "claude-3-5-sonnet-20241022",
});

// Create agent with AI
const agent = new HackflowAgent(
  storage,
  security,
  mcpClient,
  promptHandler,
  aiProvider, // Pass AI provider
);
```

## 🔌 Swappable AI Providers

Hackflow's AI layer is interface-based - you can swap providers easily:

### Current Providers

- ✅ **Claude** (Anthropic) - Implemented
- 🚧 **OpenAI** - Coming soon
- 🔧 **Custom** - Bring your own

### Creating a Custom Provider

Implement the `IModelProvider` interface:

```typescript
import { IModelProvider, GenerateOptions } from "hackflow";

export class MyAIProvider implements IModelProvider {
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    // Your implementation
    return "Generated text";
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateOptions
  ): Promise<void> {
    // Your streaming implementation
  }
}

// Use it
const aiProvider = new MyAIProvider();
const agent = new HackflowAgent(..., aiProvider);
```

## 💡 Best Practices

### 1. Temperature Settings

- **0.0-0.3**: Deterministic, consistent (commit messages, code generation)
- **0.5-0.7**: Balanced (general text, summaries)
- **0.8-1.0**: Creative (brainstorming, varied outputs)

### 2. Prompt Engineering

**Good prompt:**

```yaml
- action: ai.generate
  params:
    prompt: |
      Generate a commit message for these changes:
      {{changes}}

      Requirements:
      - Use conventional commits format
      - Be specific and concise
      - Under 72 characters

      Return ONLY the commit message.
```

**Why it's good:**

- Clear context
- Specific requirements
- Explicit output format

### 3. Error Handling

Always add retry logic for AI actions:

```yaml
- action: ai.generate
  params:
    prompt: "{{prompt}}"
  retry:
    attempts: 3
    delay: 1000
  output: result
```

### 4. Cost Management

AI calls cost money! Be mindful:

```yaml
# Use lower max_tokens when possible
- action: ai.generate
  params:
    prompt: "Summarize: {{text}}"
    max_tokens: 100 # Shorter = cheaper
```

## 🚨 Troubleshooting

### "AI provider not available"

**Cause**: No API key configured

**Solution**:

```bash
export ANTHROPIC_API_KEY=your_key
hackflow run workflow.yaml
```

### "API key invalid"

**Cause**: Wrong or expired API key

**Solution**: Check your API key at https://console.anthropic.com/

### AI features work slowly

**Cause**: Network latency or model loading

**Tips**:

- Use smaller `max_tokens` values
- Choose faster models (e.g., claude-3-haiku)
- Add retry logic for reliability

### Dynamic prompts not interpreting

**Cause**: AI provider not configured

**Solution**: Ensure `ANTHROPIC_API_KEY` is set. Without AI, `dynamic: true` falls back to static mode.

## 📊 Cost Estimation

Approximate costs per workflow (as of 2025):

| Workflow Type  | Tokens Used | Est. Cost (Claude 3.5 Sonnet) |
| -------------- | ----------- | ----------------------------- |
| Commit message | ~500        | $0.002                        |
| Code review    | ~2000       | $0.008                        |
| Documentation  | ~1500       | $0.006                        |

**Note**: Actual costs vary based on prompt length and response size.

## 🔐 Security

### API Key Storage

- Store keys in environment variables
- **Never** commit API keys to git
- Use `.env` files (add to `.gitignore`)

### Rate Limiting

Hackflow includes rate limiting to prevent runaway costs:

```typescript
// Rate limits are configured in SecurityGuard
const security = new SecurityGuard({
  rateLimits: {
    "ai.generate": { maxRequests: 100, windowMs: 60000 },
  },
});
```

## 🎯 Integration with OpenCode

Hackflow was built in OpenCode! Here's how they complement each other:

**OpenCode**: Interactive coding assistant
**Hackflow**: Automated workflow execution

### Example Integration

```yaml
# Workflow to get OpenCode's help
name: ask-opencode
description: Use OpenCode for coding help

steps:
  - action: prompt.ask
    params:
      message: "What do you need help with?"
    output: question

  - action: ai.generate
    params:
      prompt: |
        You are OpenCode, a helpful coding assistant.

        User question: {{question}}

        Provide a helpful, technical answer.
    output: answer

  - action: log.info
    params:
      message: "{{answer}}"
```

## 📚 More Examples

Check out `examples/` directory:

- `ai-commit-message.yaml` - Generate commit messages
- `ai-code-reviewer.yaml` - Review code with AI
- More coming soon!

## 🤝 Contributing

Want to add OpenAI support? Gemini? Local models?

1. Implement `IModelProvider` interface
2. Add to `src/ai/` directory
3. Update factory in `src/ai/index.ts`
4. Submit a PR!

---

**AI features make Hackflow workflows smarter, not harder to use.**
