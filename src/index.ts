import { Lexer, Parser, Statement } from './parser/index.js';
import { QueryExecutor, QueryResult } from './engine/index.js';
import { StorageAdapter, Row, TableSchema, MemoryAdapter, FileSystemAdapter } from './storage/index.js';
import { WorkerSQLOptions } from './types.js';

export type { QueryResult } from './engine/index.js';
export type { Row, TableSchema, ColumnSchema, StorageAdapter } from './storage/index.js';
export type { WorkerSQLOptions } from './types.js';

export class WorkerSQL {
  private storage: StorageAdapter;
  private executor: QueryExecutor;
  private initialized: boolean = false;

  constructor(options: WorkerSQLOptions = {}) {
    this.storage = this.createStorage(options);
    this.executor = new QueryExecutor(this.storage);
  }

  private createStorage(options: WorkerSQLOptions): StorageAdapter {
    if (!options.storage || options.storage === 'memory') {
      return new MemoryAdapter();
    }

    if (options.storage === 'filesystem') {
      if (!options.directory) {
        throw new Error('directory option is required for filesystem storage');
      }
      return new FileSystemAdapter({ directory: options.directory });
    }

    // Custom adapter
    return options.storage;
  }

  /**
   * Initialize the database. Must be called before any queries.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.storage.init();
    this.initialized = true;
  }

  /**
   * Execute a SQL query and return results
   */
  async query<T = Row>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    this.ensureInitialized();

    const tokens = new Lexer(sql).tokenize();
    const ast = new Parser(tokens).parse();
    const result = await this.executor.execute(ast, params);

    return result as QueryResult<T>;
  }

  /**
   * Execute multiple SQL statements separated by semicolons
   */
  async exec(sql: string): Promise<void> {
    this.ensureInitialized();

    const tokens = new Lexer(sql).tokenize();
    const statements = new Parser(tokens).parseMultiple();

    for (const stmt of statements) {
      await this.executor.execute(stmt, []);
    }
  }

  /**
   * Create a prepared statement for repeated execution
   */
  prepare(sql: string): PreparedStatement {
    this.ensureInitialized();

    const tokens = new Lexer(sql).tokenize();
    const ast = new Parser(tokens).parse();

    return new PreparedStatement(this.executor, ast);
  }

  /**
   * Commit any pending changes to persistent storage
   */
  async commit(): Promise<void> {
    this.ensureInitialized();
    await this.storage.commit();
  }

  /**
   * Get access to table operations
   */
  get tables(): TableAccessor {
    this.ensureInitialized();
    return new TableAccessor(this.storage);
  }

  /**
   * Get the underlying storage adapter
   */
  getStorage(): StorageAdapter {
    return this.storage;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call init() first.');
    }
  }
}

/**
 * Prepared statement for repeated execution with different parameters
 */
export class PreparedStatement {
  private executor: QueryExecutor;
  private ast: Statement;

  constructor(executor: QueryExecutor, ast: Statement) {
    this.executor = executor;
    this.ast = ast;
  }

  /**
   * Execute the prepared statement with given parameters
   */
  async execute<T = Row>(params: unknown[] = []): Promise<QueryResult<T>> {
    return this.executor.execute(this.ast, params) as Promise<QueryResult<T>>;
  }

  /**
   * Execute and return all rows
   */
  async all<T = Row>(params: unknown[] = []): Promise<T[]> {
    const result = await this.execute<T>(params);
    return result.rows;
  }

  /**
   * Execute and return the first row or null
   */
  async first<T = Row>(params: unknown[] = []): Promise<T | null> {
    const result = await this.execute<T>(params);
    return result.rows[0] ?? null;
  }

  /**
   * Execute and return a single scalar value
   */
  async scalar<T = unknown>(params: unknown[] = []): Promise<T | null> {
    const result = await this.execute(params);
    if (result.rows.length === 0) return null;
    const firstRow = result.rows[0];
    const firstColumn = result.columns[0];
    return (firstRow[firstColumn] as T) ?? null;
  }
}

/**
 * Direct access to table operations
 */
export class TableAccessor {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  /**
   * List all table names
   */
  async list(): Promise<string[]> {
    return this.storage.listTables();
  }

  /**
   * Check if a table exists
   */
  async exists(tableName: string): Promise<boolean> {
    return this.storage.hasTable(tableName);
  }

  /**
   * Get table schema
   */
  async describe(tableName: string): Promise<TableSchema | null> {
    return this.storage.getSchema(tableName);
  }

  /**
   * Get all rows from a table
   */
  async getAll(tableName: string): Promise<Row[] | null> {
    return this.storage.getTable(tableName);
  }

  /**
   * Drop a table
   */
  async drop(tableName: string): Promise<void> {
    return this.storage.deleteTable(tableName);
  }
}

// Default export
export default WorkerSQL;
