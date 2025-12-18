import type { IModelProvider } from "../types/index.js";
import { ClaudeProvider } from "./claude.js";

export type AIProviderType = "claude" | "openai" | "custom";

export interface AIConfig {
  provider: AIProviderType;
  apiKey?: string;
  model?: string;
  customProvider?: IModelProvider;
}

/**
 * Factory function to create AI model providers
 * Makes it easy to swap between different AI providers
 */
export function createAIProvider(config: AIConfig): IModelProvider {
  switch (config.provider) {
    case "claude": {
      if (!config.apiKey) {
        throw new Error(
          "API key required for Claude. Set ANTHROPIC_API_KEY environment variable or provide in config.",
        );
      }
      return new ClaudeProvider(config.apiKey, config.model);
    }

    case "openai": {
      // TODO: Implement OpenAI provider
      throw new Error("OpenAI provider not yet implemented. Coming soon!");
    }

    case "custom": {
      if (!config.customProvider) {
        throw new Error("Custom provider type requires customProvider");
      }
      return config.customProvider;
    }

    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

/**
 * Load AI config from environment or config file
 */
export function loadAIConfig(): AIConfig | null {
  // Try to load from environment
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    return {
      provider: "claude",
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL,
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL,
    };
  }

  // No API keys found
  return null;
}

// Re-export providers
export { ClaudeProvider } from "./claude.js";
