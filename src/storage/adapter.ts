export interface Row {
  [column: string]: unknown;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  primaryKey?: string;
  autoIncrementColumn?: string;
  autoIncrementValue?: number;
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: unknown;
  primaryKey: boolean;
  autoIncrement: boolean;
  unique: boolean;
}

export interface StorageAdapter {
  /**
   * Initialize the storage adapter
   */
  init(): Promise<void>;

  /**
   * Get all rows from a table
   */
  getTable(tableName: string): Promise<Row[] | null>;

  /**
   * Set all rows for a table (overwrite)
   */
  setTable(tableName: string, rows: Row[]): Promise<void>;

  /**
   * Get table schema
   */
  getSchema(tableName: string): Promise<TableSchema | null>;

  /**
   * Set table schema
   */
  setSchema(tableName: string, schema: TableSchema): Promise<void>;

  /**
   * Delete a table entirely
   */
  deleteTable(tableName: string): Promise<void>;

  /**
   * List all table names
   */
  listTables(): Promise<string[]>;

  /**
   * Commit any pending changes to persistent storage
   */
  commit(): Promise<void>;

  /**
   * Check if a table exists
   */
  hasTable(tableName: string): Promise<boolean>;
}
