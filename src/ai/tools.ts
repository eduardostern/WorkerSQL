import { OpenAITool } from './types.js';

/**
 * Generate OpenAI-compatible tool definitions for database operations
 */
export function getToolDefinitions(): OpenAITool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'list_tables',
        description: 'List all tables in the database. Use this to discover what data is available.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'describe_table',
        description: 'Get the schema of a table including column names, types, and constraints. Use this to understand the structure of a table before querying it.',
        parameters: {
          type: 'object',
          properties: {
            table_name: {
              type: 'string',
              description: 'The name of the table to describe',
            },
          },
          required: ['table_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'execute_sql',
        description: 'Execute a SQL query against the database. Supports SELECT, INSERT, UPDATE, DELETE, and DDL statements. Use parameterized queries with ? placeholders for user-provided values to prevent SQL injection.',
        parameters: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'The SQL query to execute. Use ? as placeholders for parameters.',
            },
            params: {
              type: 'array',
              description: 'Array of parameter values to substitute for ? placeholders in the SQL query',
              items: { type: 'string' },
            },
          },
          required: ['sql'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'sample_data',
        description: 'Get a sample of rows from a table to understand its content and data patterns. Useful before writing complex queries.',
        parameters: {
          type: 'object',
          properties: {
            table_name: {
              type: 'string',
              description: 'The name of the table to sample',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of rows to return (default: 5)',
              default: 5,
            },
          },
          required: ['table_name'],
        },
      },
    },
  ];
}

/**
 * Get the default system prompt for AI database interactions
 */
export function getDefaultSystemPrompt(): string {
  return `You are a helpful database assistant. You have access to a SQL database and can execute queries to answer user questions.

When answering questions:
1. First use list_tables to see what tables are available
2. Use describe_table to understand the structure of relevant tables
3. Use sample_data to see example data if needed
4. Use execute_sql to run queries and get results
5. Always explain what you found in natural language

Important guidelines:
- Use parameterized queries (? placeholders) for any user-provided values
- Start with simple queries and refine if needed
- If a query fails, explain why and try an alternative approach
- Be concise but thorough in your explanations
- Format results in a readable way (tables, lists, etc.)`;
}
