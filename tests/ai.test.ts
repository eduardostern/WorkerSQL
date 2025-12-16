import { describe, it, expect, beforeEach } from 'vitest';
import { WorkerSQL } from '../src/index.js';
import { AIBridge, getToolDefinitions, getDefaultSystemPrompt } from '../src/ai/index.js';

describe('AI Integration', () => {
  let db: WorkerSQL;
  let bridge: AIBridge;

  beforeEach(async () => {
    db = new WorkerSQL();
    await db.init();
    bridge = new AIBridge(db);

    // Set up test data
    await db.query(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        age INTEGER
      )
    `);
    await db.query(`
      INSERT INTO users (name, email, age) VALUES
        (?, ?, ?),
        (?, ?, ?),
        (?, ?, ?)
    `, ['Alice', 'alice@example.com', 30, 'Bob', 'bob@example.com', 25, 'Charlie', 'charlie@example.com', 35]);
  });

  describe('Tool Definitions', () => {
    it('should return tool definitions', () => {
      const tools = getToolDefinitions();
      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.function.name)).toEqual([
        'list_tables',
        'describe_table',
        'execute_sql',
        'sample_data',
      ]);
    });

    it('should have correct tool structure', () => {
      const tools = getToolDefinitions();
      for (const tool of tools) {
        expect(tool.type).toBe('function');
        expect(tool.function.name).toBeDefined();
        expect(tool.function.description).toBeDefined();
        expect(tool.function.parameters).toBeDefined();
      }
    });
  });

  describe('AIBridge', () => {
    it('should get tools', () => {
      const tools = bridge.getTools();
      expect(tools).toHaveLength(4);
    });

    it('should execute list_tables tool', async () => {
      const result = await bridge.executeTool('list_tables', {});
      expect(result.success).toBe(true);
      expect((result.result as { tables: string[] }).tables).toContain('users');
    });

    it('should execute describe_table tool', async () => {
      const result = await bridge.executeTool('describe_table', { table_name: 'users' });
      expect(result.success).toBe(true);

      const schema = result.result as { name: string; columns: { name: string }[] };
      expect(schema.name).toBe('users');
      expect(schema.columns.map(c => c.name)).toEqual(['id', 'name', 'email', 'age']);
    });

    it('should execute execute_sql tool', async () => {
      const result = await bridge.executeTool('execute_sql', {
        sql: 'SELECT * FROM users WHERE age > ?',
        params: [28],
      });
      expect(result.success).toBe(true);

      const data = result.result as { rows: { name: string }[] };
      expect(data.rows).toHaveLength(2);
      expect(data.rows.map(r => r.name)).toContain('Alice');
      expect(data.rows.map(r => r.name)).toContain('Charlie');
    });

    it('should execute sample_data tool', async () => {
      const result = await bridge.executeTool('sample_data', {
        table_name: 'users',
        limit: 2,
      });
      expect(result.success).toBe(true);

      const data = result.result as { sampleRows: unknown[] };
      expect(data.sampleRows).toHaveLength(2);
    });

    it('should handle errors gracefully', async () => {
      const result = await bridge.executeTool('describe_table', {
        table_name: 'nonexistent',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle unknown tools', async () => {
      const result = await bridge.executeTool('unknown_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('should process tool calls', async () => {
      const resultJson = await bridge.processToolCall({
        name: 'list_tables',
        arguments: '{}',
      });

      const result = JSON.parse(resultJson);
      expect(result.tables).toContain('users');
    });
  });

  describe('Default System Prompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = getDefaultSystemPrompt();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('database');
      expect(prompt).toContain('SQL');
    });
  });
});
