import { WorkerSQL } from '../index.js';
import { OpenAITool, ToolExecutionResult } from './types.js';
import { getToolDefinitions } from './tools.js';

export interface AIBridgeOptions {
  /**
   * Additional custom tools to include
   */
  customTools?: OpenAITool[];
}

/**
 * Bridge between WorkerSQL and AI function calling.
 * Provides tool definitions and executes tool calls from AI responses.
 */
export class AIBridge {
  private db: WorkerSQL;
  private customTools: OpenAITool[];

  constructor(db: WorkerSQL, options: AIBridgeOptions = {}) {
    this.db = db;
    this.customTools = options.customTools ?? [];
  }

  /**
   * Get all tool definitions in OpenAI function calling format
   */
  getTools(): OpenAITool[] {
    return [...getToolDefinitions(), ...this.customTools];
  }

  /**
   * Execute a tool call and return the result
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    try {
      const result = await this.executeToolInternal(toolName, args);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeToolInternal(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'list_tables':
        return this.listTables();

      case 'describe_table':
        return this.describeTable(args.table_name as string);

      case 'execute_sql':
        return this.executeSql(args.sql as string, args.params as unknown[] | undefined);

      case 'sample_data':
        return this.sampleData(args.table_name as string, args.limit as number | undefined);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async listTables(): Promise<{ tables: string[] }> {
    const tables = await this.db.tables.list();
    return { tables };
  }

  private async describeTable(tableName: string): Promise<unknown> {
    const schema = await this.db.tables.describe(tableName);
    if (!schema) {
      throw new Error(`Table '${tableName}' not found`);
    }

    return {
      name: schema.name,
      columns: schema.columns.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        primaryKey: col.primaryKey,
        autoIncrement: col.autoIncrement,
        unique: col.unique,
        defaultValue: col.defaultValue,
      })),
      primaryKey: schema.primaryKey,
    };
  }

  private async executeSql(sql: string, params?: unknown[]): Promise<unknown> {
    const result = await this.db.query(sql, params ?? []);

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      columns: result.columns,
      affectedRows: result.affectedRows,
      lastInsertId: result.lastInsertId,
    };
  }

  private async sampleData(tableName: string, limit: number = 5): Promise<unknown> {
    const result = await this.db.query(`SELECT * FROM ${tableName} LIMIT ?`, [limit]);

    return {
      tableName,
      sampleRows: result.rows,
      rowCount: result.rowCount,
      columns: result.columns,
    };
  }

  /**
   * Process a tool call from an AI response and return formatted result
   */
  async processToolCall(toolCall: { name: string; arguments: string }): Promise<string> {
    const args = JSON.parse(toolCall.arguments);
    const result = await this.executeTool(toolCall.name, args);

    if (result.success) {
      return JSON.stringify(result.result, null, 2);
    } else {
      return JSON.stringify({ error: result.error });
    }
  }
}
