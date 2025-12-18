import Anthropic from "@anthropic-ai/sdk";
import type { IModelProvider, GenerateOptions } from "../types/index.js";

/**
 * Claude AI Provider using Anthropic API
 */
export class ClaudeProvider implements IModelProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(
    apiKey: string,
    defaultModel: string = "claude-3-5-sonnet-20241022",
  ) {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 1024;
    const temperature = options?.temperature ?? 1.0;

    try {
      const message = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: options?.systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type === "text") {
        return content.text;
      }

      throw new Error("Unexpected response type from Claude");
    } catch (error) {
      throw new Error(`Claude API error: ${(error as Error).message}`);
    }
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateOptions,
  ): Promise<void> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 1024;
    const temperature = options?.temperature ?? 1.0;

    try {
      const stream = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: options?.systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: true,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          onChunk(event.delta.text);
        }
      }
    } catch (error) {
      throw new Error(`Claude streaming error: ${(error as Error).message}`);
    }
  }

  /**
   * Estimate cost for a generation (approximate)
   */
  estimateCost(inputTokens: number, outputTokens: number): number {
    // Approximate costs per million tokens (as of 2025)
    const costs: Record<string, { input: number; output: number }> = {
      "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
      "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
      "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
    };

    const modelCost =
      costs[this.defaultModel] ?? costs["claude-3-5-sonnet-20241022"];
    const inputCost = (inputTokens / 1_000_000) * modelCost.input;
    const outputCost = (outputTokens / 1_000_000) * modelCost.output;

    return inputCost + outputCost;
  }
}
