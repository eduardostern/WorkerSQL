import { WorkerSQL } from '../index.js';
import { OpenAITool, ToolExecutionResult } from './types.js';
import { getToolDefinitions, getCompactToolDefinitions } from './tools.js';

export interface AIBridgeOptions {
  /**
   * Additional custom tools to include
   */
  customTools?: OpenAITool[];
  /**
   * Use compact tool definitions (fewer tokens)
   */
  compact?: boolean;
}

/**
 * Bridge between WorkerSQL and AI function calling.
 * Provides tool definitions and executes tool calls from AI responses.
 */
export class AIBridge {
  private db: WorkerSQL;
  private customTools: OpenAITool[];
  private compact: boolean;

  constructor(db: WorkerSQL, options: AIBridgeOptions = {}) {
    this.db = db;
    this.customTools = options.customTools ?? [];
    this.compact = options.compact ?? false;
  }

  /**
   * Get all tool definitions in OpenAI function calling format
   */
  getTools(): OpenAITool[] {
    const tools = this.compact ? getCompactToolDefinitions() : getToolDefinitions();
    return [...tools, ...this.customTools];
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
      // Schema discovery
      case 'list_tables':
        return this.listTables();

      case 'describe_table':
        return this.describeTable((args.table ?? args.table_name) as string);

      // Record-level operations
      case 'get_record':
        return this.getRecord(args.table as string, args.id as number);

      case 'find_records':
        return this.findRecords(
          args.table as string,
          args.where as Record<string, unknown> | undefined,
          {
            orderBy: args.order_by as string | undefined,
            order: args.order as 'asc' | 'desc' | undefined,
            limit: args.limit as number | undefined,
          }
        );

      case 'count_records':
        return this.countRecords(args.table as string, args.where as Record<string, unknown> | undefined);

      case 'insert_record':
        return this.insertRecord(args.table as string, args.data as Record<string, unknown>);

      case 'update_record':
        return this.updateRecord(args.table as string, args.id as number, args.data as Record<string, unknown>);

      case 'delete_record':
        return this.deleteRecord(args.table as string, args.id as number);

      // SQL (for complex queries)
      case 'execute_sql':
        return this.executeSql(args.sql as string, args.params as unknown[] | undefined);

      // Legacy support
      case 'sample_data':
        return this.findRecords(args.table_name as string, undefined, { limit: args.limit as number ?? 5 });

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

  private async getRecord(table: string, id: number): Promise<unknown> {
    const result = await this.db.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return result.rows[0] ?? null;
  }

  private async findRecords(
    table: string,
    where?: Record<string, unknown>,
    options?: { orderBy?: string; order?: 'asc' | 'desc'; limit?: number }
  ): Promise<unknown> {
    let sql = `SELECT * FROM ${table}`;
    const params: unknown[] = [];

    // Build WHERE clause
    if (where && Object.keys(where).length > 0) {
      const conditions: string[] = [];
      for (const [column, value] of Object.entries(where)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Handle operators: {column: {gt: 100}}
          const ops = value as Record<string, unknown>;
          for (const [op, val] of Object.entries(ops)) {
            const sqlOp = this.mapOperator(op);
            if (op === 'like') {
              conditions.push(`${column} LIKE ?`);
              params.push(`%${val}%`);
            } else {
              conditions.push(`${column} ${sqlOp} ?`);
              params.push(val);
            }
          }
        } else {
          // Simple equality
          conditions.push(`${column} = ?`);
          params.push(value);
        }
      }
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    // ORDER BY
    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy} ${options.order?.toUpperCase() ?? 'ASC'}`;
    }

    // LIMIT
    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    const result = await this.db.query(sql, params);
    return { rows: result.rows, count: result.rowCount };
  }

  private async countRecords(table: string, where?: Record<string, unknown>): Promise<unknown> {
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    const params: unknown[] = [];

    if (where && Object.keys(where).length > 0) {
      const conditions: string[] = [];
      for (const [column, value] of Object.entries(where)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const ops = value as Record<string, unknown>;
          for (const [op, val] of Object.entries(ops)) {
            const sqlOp = this.mapOperator(op);
            if (op === 'like') {
              conditions.push(`${column} LIKE ?`);
              params.push(`%${val}%`);
            } else {
              conditions.push(`${column} ${sqlOp} ?`);
              params.push(val);
            }
          }
        } else {
          conditions.push(`${column} = ?`);
          params.push(value);
        }
      }
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    const result = await this.db.query(sql, params);
    return { count: result.rows[0]?.count ?? 0 };
  }

  private async insertRecord(table: string, data: Record<string, unknown>): Promise<unknown> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.db.query(sql, values);

    return { id: result.lastInsertId, success: true };
  }

  private async updateRecord(table: string, id: number, data: Record<string, unknown>): Promise<unknown> {
    const sets = Object.keys(data).map(col => `${col} = ?`).join(', ');
    const values = [...Object.values(data), id];

    const sql = `UPDATE ${table} SET ${sets} WHERE id = ?`;
    const result = await this.db.query(sql, values);
    const affected = result.affectedRows ?? 0;

    return { affected, success: affected > 0 };
  }

  private async deleteRecord(table: string, id: number): Promise<unknown> {
    const result = await this.db.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    const affected = result.affectedRows ?? 0;
    return { affected, success: affected > 0 };
  }

  private mapOperator(op: string): string {
    const operators: Record<string, string> = {
      eq: '=',
      ne: '!=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      like: 'LIKE',
    };
    return operators[op] ?? '=';
  }

  /**
   * Process a tool call from an AI response and return formatted result
   */
  async processToolCall(toolCall: { name: string; arguments: string }): Promise<string> {
    const args = JSON.parse(toolCall.arguments);
    const result = await this.executeTool(toolCall.name, args);

    if (result.success) {
      // Compact mode: no pretty-printing to save tokens
      return this.compact
        ? JSON.stringify(result.result)
        : JSON.stringify(result.result, null, 2);
    } else {
      return JSON.stringify({ error: result.error });
    }
  }

  /**
   * Enable or disable compact mode
   */
  setCompact(compact: boolean): void {
    this.compact = compact;
  }
}
