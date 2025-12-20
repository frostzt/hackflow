import type { IModelProvider } from "../types/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
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
 * Simple .env file loader
 * Loads KEY=VALUE pairs from .env file into process.env
 */
function loadDotEnv(): void {
  const envPaths = [
    join(process.cwd(), ".env"),
    join(process.cwd(), ".env.local"),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf-8");
        const lines = content.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          // Skip comments and empty lines
          if (!trimmed || trimmed.startsWith("#")) continue;

          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            let value = match[2].trim();

            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }

            // Only set if not already in environment
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      } catch {
        // Ignore .env loading errors
      }
    }
  }
}

/**
 * Load AI config from environment or config file
 * 
 * Priority:
 * 1. Environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY)
 * 2. .env file in current directory
 * 3. Config file (~/.hackflow/config.json)
 */
export function loadAIConfig(): AIConfig | null {
  // Try to load from .env file first (if exists)
  loadDotEnv();

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

  // Try to load from config file
  const configPath = join(homedir(), ".hackflow", "config.json");
  if (existsSync(configPath)) {
    try {
      const configData = JSON.parse(readFileSync(configPath, "utf-8"));

      if (configData.anthropic_api_key) {
        return {
          provider: "claude",
          apiKey: configData.anthropic_api_key,
          model: configData.anthropic_model,
        };
      }

      if (configData.openai_api_key) {
        return {
          provider: "openai",
          apiKey: configData.openai_api_key,
          model: configData.openai_model,
        };
      }
    } catch {
      // Ignore config file errors
    }
  }

  // No API keys found
  return null;
}

// Re-export providers
export { ClaudeProvider } from "./claude.js";
