import { StorageAdapter } from './storage/adapter.js';

export interface WorkerSQLOptions {
  /**
   * Storage backend to use
   * - 'memory': In-memory storage (default, data lost on restart)
   * - 'filesystem': File-based persistence
   * - StorageAdapter: Custom storage adapter instance
   */
  storage?: 'memory' | 'filesystem' | StorageAdapter;

  /**
   * Directory for filesystem storage (required when storage is 'filesystem')
   */
  directory?: string;
}

export interface PreparedStatementOptions {
  sql: string;
}
