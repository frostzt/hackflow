/**
 * Simple template engine for variable interpolation
 * Supports {{variable}} syntax
 */
export class TemplateEngine {
  /**
   * Replace template variables in a string
   * Example: "Hello {{name}}" with {name: "World"} => "Hello World"
   */
  static interpolate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = this.getNestedValue(context, trimmedKey);

      if (value === undefined || value === null) {
        throw new Error(
          `Template variable not found: ${trimmedKey}. Available: ${Object.keys(context).join(", ")}`
        );
      }

      return String(value);
    });
  }

  /**
   * Replace template variables in an object (recursively)
   */
  static interpolateObject(
    obj: any,
    context: Record<string, any>
  ): any {
    if (typeof obj === "string") {
      return this.interpolate(obj, context);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.interpolateObject(item, context));
    }

    if (obj && typeof obj === "object") {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObject(value, context);
      }
      return result;
    }

    return obj;
  }

  /**
   * Evaluate a condition string
   * Example: "{{branch}} != 'main'" with {branch: "dev"} => true
   */
  static evaluateCondition(
    condition: string,
    context: Record<string, any>
  ): boolean {
    try {
      // First interpolate variables
      let interpolated = condition;

      // Replace {{var}} with actual values
      interpolated = interpolated.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const trimmedKey = key.trim();
        const value = this.getNestedValue(context, trimmedKey);
        
        // Return JSON-stringified value for safe evaluation
        return JSON.stringify(value);
      });

      // Simple evaluation (can be extended with a proper expression parser)
      // For now, support basic comparisons
      return this.evaluateExpression(interpolated);
    } catch (error) {
      throw new Error(
        `Failed to evaluate condition "${condition}": ${(error as Error).message}`
      );
    }
  }

  /**
   * Get nested value from object using dot notation
   * Example: getNestedValue({user: {name: "John"}}, "user.name") => "John"
   */
  private static getNestedValue(
    obj: Record<string, any>,
    path: string
  ): any {
    const keys = path.split(".");
    let current = obj;

    for (const key of keys) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Evaluate a simple boolean expression
   * Supports: ==, !=, >, <, >=, <=, &&, ||
   */
  private static evaluateExpression(expr: string): boolean {
    // Remove extra whitespace
    expr = expr.trim();

    // Handle logical operators (&&, ||)
    if (expr.includes("||")) {
      const parts = expr.split("||");
      return parts.some((part) => this.evaluateExpression(part.trim()));
    }

    if (expr.includes("&&")) {
      const parts = expr.split("&&");
      return parts.every((part) => this.evaluateExpression(part.trim()));
    }

    // Handle comparison operators
    const operators = ["===", "!==", "==", "!=", ">=", "<=", ">", "<"];
    
    for (const op of operators) {
      if (expr.includes(op)) {
        const [left, right] = expr.split(op).map((s) => s.trim());
        return this.compare(this.parseValue(left), this.parseValue(right), op);
      }
    }

    // If no operator, treat as boolean
    return this.parseValue(expr) === true;
  }

  /**
   * Parse a value from string (handles JSON values)
   */
  private static parseValue(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Compare two values using an operator
   */
  private static compare(left: any, right: any, operator: string): boolean {
    switch (operator) {
      case "==":
      case "===":
        return left === right;
      case "!=":
      case "!==":
        return left !== right;
      case ">":
        return left > right;
      case "<":
        return left < right;
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Check if a string contains template variables
   */
  static hasTemplateVars(str: string): boolean {
    return /\{\{[^}]+\}\}/.test(str);
  }

  /**
   * Extract all template variable names from a string
   */
  static extractVars(str: string): string[] {
    const matches = str.matchAll(/\{\{([^}]+)\}\}/g);
    return Array.from(matches, (m) => m[1].trim());
  }
}
