import { OpenAITool } from './types.js';

/**
 * Generate OpenAI-compatible tool definitions for database operations
 */
export function getToolDefinitions(): OpenAITool[] {
  return [
    // Schema discovery tools
    {
      type: 'function',
      function: {
        name: 'list_tables',
        description: 'List all tables in the database.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'describe_table',
        description: 'Get table schema (columns, types).',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
          },
          required: ['table'],
        },
      },
    },

    // Record-level tools (simple, token-efficient)
    {
      type: 'function',
      function: {
        name: 'get_record',
        description: 'Get a single record by ID. Fast direct lookup.',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            id: { type: 'number', description: 'Record ID' },
          },
          required: ['table', 'id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'find_records',
        description: 'Find records matching filters. Use for simple queries.',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            where: {
              type: 'object',
              description: 'Filter conditions as {column: value} or {column: {op: value}} where op is eq/ne/gt/gte/lt/lte/like',
            },
            order_by: { type: 'string', description: 'Column to sort by' },
            order: { type: 'string', description: 'asc or desc' },
            limit: { type: 'number', description: 'Max rows to return' },
          },
          required: ['table'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'count_records',
        description: 'Count records matching filters. Fast count operation.',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            where: { type: 'object', description: 'Filter conditions' },
          },
          required: ['table'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'insert_record',
        description: 'Insert a new record.',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            data: { type: 'object', description: 'Record data as {column: value}' },
          },
          required: ['table', 'data'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_record',
        description: 'Update a record by ID.',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            id: { type: 'number', description: 'Record ID' },
            data: { type: 'object', description: 'Fields to update' },
          },
          required: ['table', 'id', 'data'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_record',
        description: 'Delete a record by ID.',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            id: { type: 'number', description: 'Record ID' },
          },
          required: ['table', 'id'],
        },
      },
    },

    // SQL tool (for complex queries: JOINs, GROUP BY, aggregations)
    {
      type: 'function',
      function: {
        name: 'execute_sql',
        description: 'Execute raw SQL. Use for complex queries (JOINs, GROUP BY, aggregations). Use ? placeholders for params.',
        parameters: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'SQL query' },
            params: { type: 'array', items: { type: 'string' }, description: 'Parameter values' },
          },
          required: ['sql'],
        },
      },
    },
  ];
}

/**
 * Get the default system prompt for AI database interactions
 */
export function getDefaultSystemPrompt(): string {
  return `You are a database assistant with access to these tools:

Record-level (use for simple operations):
- list_tables: See available tables
- describe_table: Get table schema
- get_record: Get single record by ID
- find_records: Query with filters
- count_records: Count matching records
- insert_record, update_record, delete_record: Modify data

SQL (use for complex queries):
- execute_sql: JOINs, GROUP BY, aggregations, subqueries

Choose the simplest tool for each task. Be concise.`;
}

/**
 * Compact system prompt for token-efficient mode
 */
export function getCompactSystemPrompt(): string {
  return `DB assistant. Tools: list_tables, describe_table, get_record, find_records, count_records, execute_sql. Be brief.`;
}

/**
 * Generate compact tool definitions (fewer tokens)
 */
export function getCompactToolDefinitions(): OpenAITool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'list_tables',
        description: 'List tables',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'describe_table',
        description: 'Get schema',
        parameters: {
          type: 'object',
          properties: { table: { type: 'string' } },
          required: ['table'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_record',
        description: 'Get by ID',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string' },
            id: { type: 'number' },
          },
          required: ['table', 'id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'find_records',
        description: 'Query records',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string' },
            where: { type: 'object' },
            limit: { type: 'number' },
          },
          required: ['table'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'count_records',
        description: 'Count records',
        parameters: {
          type: 'object',
          properties: {
            table: { type: 'string' },
            where: { type: 'object' },
          },
          required: ['table'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'execute_sql',
        description: 'Run SQL',
        parameters: {
          type: 'object',
          properties: {
            sql: { type: 'string' },
            params: { type: 'array', items: { type: 'string' } },
          },
          required: ['sql'],
        },
      },
    },
  ];
}
