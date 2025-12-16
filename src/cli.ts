#!/usr/bin/env node

/**
 * WorkerSQL CLI
 *
 * Interactive SQL and AI interface for WorkerSQL databases.
 *
 * Usage:
 *   wsql [options] [database-path]
 *
 * Options:
 *   --ai                 Enable AI mode
 *   --api-key <key>      OpenAI API key (or set OPENAI_API_KEY env)
 *   --base-url <url>     OpenAI-compatible base URL (or set OPENAI_BASE_URL env)
 *   --model <model>      Model name (default: gpt-4o-mini)
 *   --memory             Use in-memory storage (no persistence)
 *   -h, --help           Show help
 *
 * Environment:
 *   OPENAI_API_KEY       API key for AI mode
 *   OPENAI_BASE_URL      Base URL for OpenAI-compatible API
 *   OPENAI_MODEL         Model name
 */

import * as readline from 'node:readline';
import { WorkerSQL } from './index.js';
import { AIClient } from './ai/client.js';

interface CliOptions {
  aiMode: boolean;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  dbPath: string;
  memory: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    aiMode: false,
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    dbPath: './wsql-data',
    memory: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--ai' || arg === '-a') {
      options.aiMode = true;
    } else if (arg === '--api-key' || arg === '-k') {
      options.apiKey = args[++i];
    } else if (arg === '--base-url' || arg === '-u') {
      options.baseUrl = args[++i];
    } else if (arg === '--model' || arg === '-m') {
      options.model = args[++i];
    } else if (arg === '--memory') {
      options.memory = true;
    } else if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      options.dbPath = arg;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
WorkerSQL CLI - Interactive SQL and AI database interface

Usage:
  wsql [options] [database-path]

Options:
  --ai, -a              Enable AI mode (natural language queries)
  --api-key, -k <key>   OpenAI API key (or set OPENAI_API_KEY env)
  --base-url, -u <url>  OpenAI-compatible base URL (or set OPENAI_BASE_URL env)
  --model, -m <model>   Model name (default: gpt-4o-mini)
  --memory              Use in-memory storage (no persistence)
  -h, --help            Show this help

Environment Variables:
  OPENAI_API_KEY        API key for AI mode
  OPENAI_BASE_URL       Base URL for OpenAI-compatible API (e.g., Ollama, Together)
  OPENAI_MODEL          Model name

Examples:
  wsql                          # Start with filesystem storage in ./wsql-data
  wsql ./mydb                   # Use ./mydb as database directory
  wsql --memory                 # Use in-memory storage
  wsql --ai                     # Enable AI mode
  wsql --ai --base-url http://localhost:11434/v1  # Use Ollama

Commands (in SQL mode):
  .tables                       List all tables
  .schema <table>               Show table schema
  .ai                           Switch to AI mode
  .sql                          Switch to SQL mode
  .quit                         Exit

Commands (in AI mode):
  .sql                          Switch to SQL mode
  .quit                         Exit
  Any text                      Natural language query
`);
}

function printBanner(options: CliOptions): void {
  console.log(`
┌─────────────────────────────────────────┐
│           WorkerSQL CLI                 │
│   Lightweight SQL + AI Database         │
└─────────────────────────────────────────┘
`);
  console.log(`Storage: ${options.memory ? 'memory' : options.dbPath}`);
  console.log(`Mode: ${options.aiMode ? 'AI' : 'SQL'}`);
  if (options.aiMode) {
    console.log(`Model: ${options.model}`);
    console.log(`API: ${options.baseUrl || 'https://api.openai.com/v1'}`);
  }
  console.log(`\nType .help for commands, .quit to exit\n`);
}

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(empty result set)';

  const columns = Object.keys(rows[0]);
  const colWidths: Record<string, number> = {};

  // Calculate column widths
  for (const col of columns) {
    colWidths[col] = col.length;
    for (const row of rows) {
      const val = String(row[col] ?? 'NULL');
      colWidths[col] = Math.max(colWidths[col], val.length);
    }
  }

  // Build table
  const lines: string[] = [];
  const separator = '+' + columns.map(c => '-'.repeat(colWidths[c] + 2)).join('+') + '+';
  const header = '|' + columns.map(c => ` ${c.padEnd(colWidths[c])} `).join('|') + '|';

  lines.push(separator);
  lines.push(header);
  lines.push(separator);

  for (const row of rows) {
    const rowStr = '|' + columns.map(c => {
      const val = String(row[c] ?? 'NULL');
      return ` ${val.padEnd(colWidths[c])} `;
    }).join('|') + '|';
    lines.push(rowStr);
  }

  lines.push(separator);
  lines.push(`${rows.length} row(s)`);

  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Initialize database
  const db = new WorkerSQL({
    storage: options.memory ? 'memory' : 'filesystem',
    directory: options.memory ? undefined : options.dbPath,
  });
  await db.init();

  // Initialize AI if needed
  let aiClient: AIClient | null = null;

  if (options.aiMode) {
    if (!options.apiKey) {
      console.error('Error: AI mode requires an API key.');
      console.error('Set OPENAI_API_KEY environment variable or use --api-key flag.');
      process.exit(1);
    }
    aiClient = new AIClient({
      db,
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      model: options.model,
    });
  }

  printBanner(options);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentMode = options.aiMode ? 'ai' : 'sql';

  const prompt = (): string => currentMode === 'ai' ? 'ai> ' : 'sql> ';

  const askQuestion = (): void => {
    rl.question(prompt(), async (input) => {
      const line = input.trim();

      if (!line) {
        askQuestion();
        return;
      }

      // Handle commands
      if (line === '.quit' || line === '.exit' || line === 'exit') {
        console.log('Goodbye!');
        rl.close();
        process.exit(0);
      }

      if (line === '.help') {
        showHelp();
        askQuestion();
        return;
      }

      if (line === '.ai') {
        if (!options.apiKey) {
          console.log('Error: AI mode requires an API key. Restart with --api-key or set OPENAI_API_KEY.');
        } else {
          currentMode = 'ai';
          if (!aiClient) {
            aiClient = new AIClient({
              db,
              apiKey: options.apiKey!,
              baseURL: options.baseUrl,
              model: options.model,
            });
          }
          console.log('Switched to AI mode. Ask questions in natural language.');
        }
        askQuestion();
        return;
      }

      if (line === '.sql') {
        currentMode = 'sql';
        console.log('Switched to SQL mode. Enter SQL statements.');
        askQuestion();
        return;
      }

      if (line === '.tables') {
        try {
          const tables = await db.tables.list();
          if (tables.length === 0) {
            console.log('No tables.');
          } else {
            console.log('Tables:');
            for (const t of tables) {
              console.log(`  ${t}`);
            }
          }
        } catch (err) {
          console.error('Error:', (err as Error).message);
        }
        askQuestion();
        return;
      }

      if (line.startsWith('.schema')) {
        const tableName = line.split(/\s+/)[1];
        if (!tableName) {
          console.log('Usage: .schema <table_name>');
        } else {
          try {
            const schema = await db.tables.describe(tableName);
            if (!schema) {
              console.log(`Table '${tableName}' not found.`);
            } else {
              console.log(`Table: ${tableName}`);
              console.log('Columns:');
              for (const col of schema.columns) {
                const pk = col.primaryKey ? ' PRIMARY KEY' : '';
                const auto = col.autoIncrement ? ' AUTO_INCREMENT' : '';
                const nn = !col.nullable ? ' NOT NULL' : '';
                const def = col.defaultValue !== undefined ? ` DEFAULT ${col.defaultValue}` : '';
                console.log(`  ${col.name} ${col.type}${pk}${auto}${nn}${def}`);
              }
            }
          } catch (err) {
            console.error('Error:', (err as Error).message);
          }
        }
        askQuestion();
        return;
      }

      // Execute based on mode
      if (currentMode === 'sql') {
        try {
          const result = await db.query(line);
          if (result.rows && result.rows.length > 0) {
            console.log(formatTable(result.rows));
          } else if (result.affectedRows !== undefined) {
            console.log(`Query OK, ${result.affectedRows} row(s) affected`);
            if (result.lastInsertId) {
              console.log(`Last insert ID: ${result.lastInsertId}`);
            }
          } else {
            console.log('Query OK');
          }
        } catch (err) {
          console.error('Error:', (err as Error).message);
        }
      } else {
        // AI mode
        if (!aiClient) {
          console.log('AI client not initialized.');
          askQuestion();
          return;
        }

        try {
          process.stdout.write('Thinking...');
          const response = await aiClient.chat(line);
          process.stdout.write('\r' + ' '.repeat(20) + '\r');
          console.log(response);
        } catch (err) {
          process.stdout.write('\r' + ' '.repeat(20) + '\r');
          console.error('AI Error:', (err as Error).message);
        }
      }

      askQuestion();
    });
  };

  // Handle SIGINT gracefully
  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });

  askQuestion();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
