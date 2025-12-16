import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { StorageAdapter, Row, TableSchema } from './adapter.js';

export interface FileSystemAdapterOptions {
  directory: string;
}

export class FileSystemAdapter implements StorageAdapter {
  private directory: string;
  private cache: Map<string, Row[]> = new Map();
  private schemaCache: Map<string, TableSchema> = new Map();
  private dirty: Set<string> = new Set();
  private initialized: boolean = false;

  constructor(options: FileSystemAdapterOptions) {
    this.directory = options.directory;
  }

  private tablePath(tableName: string): string {
    return join(this.directory, `${tableName.toLowerCase()}.json`);
  }

  private schemaPath(tableName: string): string {
    return join(this.directory, '_schemas', `${tableName.toLowerCase()}.json`);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(this.directory, { recursive: true });
    await fs.mkdir(join(this.directory, '_schemas'), { recursive: true });

    // Load existing schemas into cache
    const schemaDir = join(this.directory, '_schemas');
    try {
      const files = await fs.readdir(schemaDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const tableName = file.slice(0, -5);
          const data = await fs.readFile(join(schemaDir, file), 'utf-8');
          this.schemaCache.set(tableName, JSON.parse(data));
        }
      }
    } catch {
      // Directory might be empty or not exist yet
    }

    this.initialized = true;
  }

  async getTable(tableName: string): Promise<Row[] | null> {
    const name = tableName.toLowerCase();

    // Check cache first
    if (this.cache.has(name)) {
      const rows = this.cache.get(name)!;
      return [...rows.map(row => ({ ...row }))];
    }

    try {
      const data = await fs.readFile(this.tablePath(name), 'utf-8');
      const rows = JSON.parse(data) as Row[];
      this.cache.set(name, rows);
      return [...rows.map(row => ({ ...row }))];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async setTable(tableName: string, rows: Row[]): Promise<void> {
    const name = tableName.toLowerCase();
    this.cache.set(name, [...rows.map(row => ({ ...row }))]);
    this.dirty.add(name);
  }

  async getSchema(tableName: string): Promise<TableSchema | null> {
    const name = tableName.toLowerCase();

    if (this.schemaCache.has(name)) {
      return this.schemaCache.get(name)!;
    }

    try {
      const data = await fs.readFile(this.schemaPath(name), 'utf-8');
      const schema = JSON.parse(data) as TableSchema;
      this.schemaCache.set(name, schema);
      return schema;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async setSchema(tableName: string, schema: TableSchema): Promise<void> {
    const name = tableName.toLowerCase();
    this.schemaCache.set(name, { ...schema });

    // Write schema immediately (schemas are always persisted)
    await fs.writeFile(this.schemaPath(name), JSON.stringify(schema, null, 2), 'utf-8');
  }

  async deleteTable(tableName: string): Promise<void> {
    const name = tableName.toLowerCase();
    this.cache.delete(name);
    this.schemaCache.delete(name);
    this.dirty.delete(name);

    try {
      await fs.unlink(this.tablePath(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      await fs.unlink(this.schemaPath(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async listTables(): Promise<string[]> {
    return Array.from(this.schemaCache.keys());
  }

  async commit(): Promise<void> {
    const writes = Array.from(this.dirty).map(async (tableName) => {
      const rows = this.cache.get(tableName);
      if (rows !== undefined) {
        await fs.writeFile(this.tablePath(tableName), JSON.stringify(rows), 'utf-8');
      }
    });

    await Promise.all(writes);
    this.dirty.clear();
  }

  async hasTable(tableName: string): Promise<boolean> {
    return this.schemaCache.has(tableName.toLowerCase());
  }
}
