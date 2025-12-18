import { createInterface } from "readline";
import type {
  IPromptHandler,
  IModelProvider,
  PromptRequest,
  PromptResponse,
} from "../types/index.js";

/**
 * CLI Prompt Handler - handles user interactions in the terminal
 */
export class CLIPromptHandler implements IPromptHandler {
  private readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  constructor(private aiProvider?: IModelProvider) {}

  async ask(prompt: PromptRequest): Promise<PromptResponse> {
    switch (prompt.type) {
      case "text":
        return this.askText(prompt);

      case "confirm":
        return this.askConfirm(prompt);

      case "select":
        return this.askSelect(prompt);

      default:
        throw new Error(`Unknown prompt type: ${(prompt as any).type}`);
    }
  }

  async confirm(
    message: string,
    defaultValue: boolean = false,
  ): Promise<boolean> {
    const response = await this.askConfirm({
      message,
      type: "confirm",
      default: defaultValue,
    });
    return response.value as boolean;
  }

  async select(message: string, options: string[]): Promise<string> {
    const response = await this.askSelect({
      message,
      type: "select",
      options,
    });
    return response.value as string;
  }

  close(): void {
    this.readline.close();
  }

  // Private methods

  private async askText(prompt: PromptRequest): Promise<PromptResponse> {
    const defaultText = prompt.default ? ` (${prompt.default})` : "";
    const answer = await this.question(`${prompt.message}${defaultText}: `);

    const value = answer.trim() || prompt.default || "";

    // For dynamic mode, use AI to interpret the response
    if (prompt.dynamic && this.aiProvider) {
      try {
        const interpretPrompt = `The user was asked: "${prompt.message}"
        
They responded: "${value}"

Please interpret their response and provide a clean, processed version.
If they provided a natural language description, convert it to the appropriate format.
Return ONLY the interpreted value, no explanation.

Examples:
- "make it say we added some cool features" → "Added cool features"
- "something about fixing bugs" → "Fixed bugs"
- "updated the readme file" → "Updated README"`;

        const interpreted = await this.aiProvider.generate(interpretPrompt, {
          temperature: 0.3,
          maxTokens: 200,
        });

        return {
          value,
          interpreted: interpreted.trim(),
        };
      } catch (error) {
        console.warn(
          `[AI] Failed to interpret response: ${(error as Error).message}`,
        );
        // Fall back to raw value
        return { value, interpreted: value };
      }
    }

    return { value };
  }

  private async askConfirm(prompt: PromptRequest): Promise<PromptResponse> {
    const defaultText = prompt.default ? " (Y/n)" : " (y/N)";
    const answer = await this.question(`${prompt.message}${defaultText}: `);

    const normalized = answer.trim().toLowerCase();

    let value: boolean;
    if (normalized === "") {
      value = prompt.default ?? false;
    } else {
      value = normalized === "y" || normalized === "yes";
    }

    return { value };
  }

  private async askSelect(prompt: PromptRequest): Promise<PromptResponse> {
    if (!prompt.options || prompt.options.length === 0) {
      throw new Error("Select prompt requires options");
    }

    console.log(prompt.message);
    prompt.options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option}`);
    });

    let answer: string;
    let selectedIndex: number;

    while (true) {
      answer = await this.question(
        "Select (1-" + prompt.options.length + "): ",
      );
      selectedIndex = parseInt(answer.trim()) - 1;

      if (selectedIndex >= 0 && selectedIndex < prompt.options.length) {
        break;
      }

      console.log("Invalid selection, please try again.");
    }

    return { value: prompt.options[selectedIndex] };
  }

  private question(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.readline.question(query, resolve);
    });
  }
}
