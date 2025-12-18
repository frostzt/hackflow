import type { IStorageAdapter } from "../types/index.js";
import { SQLiteStorageAdapter } from "./sqlite/index.js";
import { homedir } from "os";
import { join } from "path";

export type StorageType = "sqlite" | "memory" | "durable-objects" | "custom";

export interface StorageConfig {
  type: StorageType;
  path?: string;
  customAdapter?: IStorageAdapter;
}

/**
 * Factory function to create storage adapters
 * This makes it easy to swap storage backends without changing application code
 */
export function createStorage(config: StorageConfig): IStorageAdapter {
  switch (config.type) {
    case "sqlite": {
      const dbPath =
        config.path ?? join(homedir(), ".hackflow", "hackflow.db");
      return new SQLiteStorageAdapter(dbPath);
    }

    case "memory": {
      // TODO: Implement in-memory storage for testing
      throw new Error("Memory storage not yet implemented");
    }

    case "durable-objects": {
      // TODO: Implement Cloudflare Durable Objects adapter
      throw new Error("Durable Objects storage not yet implemented");
    }

    case "custom": {
      if (!config.customAdapter) {
        throw new Error("Custom storage type requires customAdapter");
      }
      return config.customAdapter;
    }

    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

// Re-export storage implementations
export { SQLiteStorageAdapter } from "./sqlite/index.js";
