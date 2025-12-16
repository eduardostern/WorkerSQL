import { StorageAdapter, Row, TableSchema } from './adapter.js';

export class MemoryAdapter implements StorageAdapter {
  private tables: Map<string, Row[]> = new Map();
  private schemas: Map<string, TableSchema> = new Map();

  async init(): Promise<void> {
    // No initialization needed for memory storage
  }

  async getTable(tableName: string): Promise<Row[] | null> {
    const rows = this.tables.get(tableName.toLowerCase());
    return rows ? [...rows.map(row => ({ ...row }))] : null;
  }

  async setTable(tableName: string, rows: Row[]): Promise<void> {
    this.tables.set(tableName.toLowerCase(), [...rows.map(row => ({ ...row }))]);
  }

  async getSchema(tableName: string): Promise<TableSchema | null> {
    return this.schemas.get(tableName.toLowerCase()) ?? null;
  }

  async setSchema(tableName: string, schema: TableSchema): Promise<void> {
    this.schemas.set(tableName.toLowerCase(), { ...schema });
  }

  async deleteTable(tableName: string): Promise<void> {
    const name = tableName.toLowerCase();
    this.tables.delete(name);
    this.schemas.delete(name);
  }

  async listTables(): Promise<string[]> {
    return Array.from(this.schemas.keys());
  }

  async commit(): Promise<void> {
    // No-op for memory adapter - data is always "committed"
  }

  async hasTable(tableName: string): Promise<boolean> {
    return this.schemas.has(tableName.toLowerCase());
  }
}
