import { readFileSync } from "fs";
import yaml from "js-yaml";
import type { WorkflowDefinition } from "../types/index.js";

export class WorkflowLoader {
  /**
   * Load a workflow from a YAML file
   */
  static loadFromFile(filePath: string): WorkflowDefinition {
    try {
      const content = readFileSync(filePath, "utf-8");
      return this.loadFromString(content, filePath);
    } catch (error) {
      throw new Error(
        `Failed to load workflow from ${filePath}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Load a workflow from a YAML string
   */
  static loadFromString(
    content: string,
    source: string = "string"
  ): WorkflowDefinition {
    try {
      const parsed = yaml.load(content) as any;

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid workflow definition: not an object");
      }

      return this.validate(parsed);
    } catch (error) {
      throw new Error(
        `Failed to parse workflow from ${source}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Validate workflow definition
   */
  static validate(data: any): WorkflowDefinition {
    const errors: string[] = [];

    // Required fields
    if (!data.name || typeof data.name !== "string") {
      errors.push("Missing or invalid 'name' field");
    }

    if (!Array.isArray(data.steps)) {
      errors.push("Missing or invalid 'steps' field (must be array)");
    } else {
      // Validate each step
      data.steps.forEach((step: any, index: number) => {
        if (!step.action || typeof step.action !== "string") {
          errors.push(`Step ${index}: missing or invalid 'action' field`);
        }
      });
    }

    // Validate prompt_mode if present
    if (data.prompt_mode) {
      const validModes = ["static", "dynamic", "both"];
      if (!validModes.includes(data.prompt_mode)) {
        errors.push(
          `Invalid prompt_mode: ${data.prompt_mode}. Must be one of: ${validModes.join(", ")}`
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Workflow validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`
      );
    }

    return data as WorkflowDefinition;
  }

  /**
   * Convert workflow to YAML string
   */
  static toYAML(workflow: WorkflowDefinition): string {
    return yaml.dump(workflow, {
      indent: 2,
      lineWidth: 100,
      noRefs: true,
    });
  }
}
