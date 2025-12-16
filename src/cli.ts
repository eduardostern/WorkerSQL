#!/usr/bin/env node

/**
 * WorkerSQL CLI
 *
 * Interactive SQL and AI interface for WorkerSQL databases.
 * Inspired by Claude Code's beautiful interface.
 */

import * as readline from 'node:readline';
import { WorkerSQL } from './index.js';
import { AIClient } from './ai/client.js';

// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const GRAY = '\x1b[90m';
const WHITE = '\x1b[37m';
const BG_GRAY = '\x1b[48;5;236m';
const BG_CYAN = '\x1b[48;5;24m';
const BG_YELLOW = '\x1b[48;5;136m';

interface Config {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  dbPath: string;
  memory: boolean;
}

const config: Config = {
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  dbPath: './wsql-data',
  memory: false,
};

let currentMode: 'sql' | 'ai' = 'sql';
let db: WorkerSQL;
let aiClient: AIClient | null = null;
let rl: readline.Interface;
let terminalHeight = process.stdout.rows || 24;
let terminalWidth = process.stdout.columns || 80;

function parseArgs(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--ai' || arg === '-a') {
      currentMode = 'ai';
    } else if (arg === '--api-key' || arg === '-k') {
      config.apiKey = args[++i];
    } else if (arg === '--base-url' || arg === '-u') {
      config.baseUrl = args[++i];
    } else if (arg === '--model' || arg === '-m') {
      config.model = args[++i];
    } else if (arg === '--memory') {
      config.memory = true;
    } else if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      config.dbPath = arg;
    }
  }
}

function showHelp(): void {
  console.log(`
${BOLD}WorkerSQL CLI${RESET} - Interactive SQL and AI database interface

${BOLD}Usage:${RESET}
  wsql [options] [database-path]

${BOLD}Options:${RESET}
  --ai, -a              Start in AI mode
  --api-key, -k <key>   OpenAI API key
  --base-url, -u <url>  OpenAI-compatible base URL
  --model, -m <model>   Model name (default: gpt-4o-mini)
  --memory              Use in-memory storage
  -h, --help            Show this help

${BOLD}Controls:${RESET}
  ${CYAN}Tab${RESET}                   Switch between SQL and AI modes
  ${CYAN}Ctrl+C${RESET}                Exit
`);
}

function showCommands(): void {
  console.log(`
${BOLD}Slash Commands:${RESET}

${CYAN}Configuration:${RESET}
  ${BOLD}/model${RESET} <name>         Set AI model (e.g., gpt-4o, claude-3-sonnet)
  ${BOLD}/api-key${RESET} <key>        Set OpenAI-compatible API key
  ${BOLD}/base-url${RESET} <url>       Set API base URL (for Ollama, Together, etc.)
  ${BOLD}/storage${RESET} <path>       Switch to filesystem storage at <path>
  ${BOLD}/storage${RESET} memory       Switch to in-memory storage
  ${BOLD}/config${RESET}               Show current configuration

${CYAN}Database:${RESET}
  ${BOLD}/tables${RESET}               List all tables in the database
  ${BOLD}/schema${RESET} <table>       Show schema for a table
  ${BOLD}/status${RESET}               Show database status and statistics

${CYAN}Interface:${RESET}
  ${BOLD}/clear${RESET}                Clear the screen
  ${BOLD}/help${RESET}                 Show CLI help and options
  ${BOLD}/commands${RESET}             Show this command list
  ${BOLD}/quit${RESET}                 Exit the CLI
`);
}

function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

function moveCursor(row: number, col: number): void {
  process.stdout.write(`\x1b[${row};${col}H`);
}

function saveCursor(): void {
  process.stdout.write('\x1b[s');
}

function restoreCursor(): void {
  process.stdout.write('\x1b[u');
}

function drawStatusBar(): void {
  saveCursor();

  // Move to bottom line
  moveCursor(terminalHeight, 1);

  // Build status bar content
  const modeLabel = currentMode === 'ai'
    ? `${BG_CYAN}${WHITE}${BOLD} AI ${RESET}`
    : `${BG_YELLOW}${WHITE}${BOLD} SQL ${RESET}`;

  const tabHint = `${DIM}Tab${RESET}${GRAY} to switch${RESET}`;
  const storageInfo = `${GRAY}${config.memory ? 'memory' : config.dbPath}${RESET}`;
  const modelInfo = currentMode === 'ai' && config.apiKey ? `${GRAY}${config.model}${RESET}` : '';

  // Calculate spacing
  const leftPart = ` ${modeLabel} ${tabHint}`;
  const rightPart = modelInfo ? `${modelInfo}  ${storageInfo} ` : `${storageInfo} `;

  // Get visible length (without ANSI codes)
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
  const leftLen = stripAnsi(leftPart).length;
  const rightLen = stripAnsi(rightPart).length;
  const padding = Math.max(0, terminalWidth - leftLen - rightLen);

  // Draw the status bar
  process.stdout.write(`${BG_GRAY}${leftPart}${' '.repeat(padding)}${rightPart}${RESET}`);

  restoreCursor();
}

function printBanner(): void {
  console.log(`
${BOLD}┌─────────────────────────────────────────┐${RESET}
${BOLD}│${RESET}           ${CYAN}WorkerSQL CLI${RESET}                 ${BOLD}│${RESET}
${BOLD}│${RESET}   ${DIM}Lightweight SQL + AI Database${RESET}         ${BOLD}│${RESET}
${BOLD}└─────────────────────────────────────────┘${RESET}
`);
  console.log(`${DIM}Type ${RESET}/help${DIM} for commands${RESET}\n`);
}

function getPrompt(): string {
  if (currentMode === 'ai') {
    return `${CYAN}>${RESET} `;
  }
  return `${YELLOW}>${RESET} `;
}

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `${DIM}(empty result set)${RESET}`;

  const columns = Object.keys(rows[0]);
  const colWidths: Record<string, number> = {};

  for (const col of columns) {
    colWidths[col] = col.length;
    for (const row of rows) {
      const val = String(row[col] ?? 'NULL');
      colWidths[col] = Math.max(colWidths[col], Math.min(val.length, 40));
    }
  }

  const lines: string[] = [];
  const separator = `${DIM}+${columns.map(c => '-'.repeat(colWidths[c] + 2)).join('+')}+${RESET}`;
  const header = `${DIM}|${RESET}${columns.map(c => ` ${BOLD}${c.padEnd(colWidths[c])}${RESET} `).join(`${DIM}|${RESET}`)}${DIM}|${RESET}`;

  lines.push(separator);
  lines.push(header);
  lines.push(separator);

  for (const row of rows) {
    const rowStr = `${DIM}|${RESET}` + columns.map(c => {
      let val = String(row[c] ?? `${DIM}NULL${RESET}`);
      if (val.length > 40) val = val.substring(0, 37) + '...';
      return ` ${val.padEnd(colWidths[c])} `;
    }).join(`${DIM}|${RESET}`) + `${DIM}|${RESET}`;
    lines.push(rowStr);
  }

  lines.push(separator);
  lines.push(`${DIM}${rows.length} row(s)${RESET}`);

  return lines.join('\n');
}

function reinitAIClient(): void {
  if (config.apiKey) {
    aiClient = new AIClient({
      db,
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      model: config.model,
    });
  }
}

async function handleSlashCommand(line: string): Promise<boolean> {
  const parts = line.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case '/help':
      showHelp();
      showCommands();
      return true;

    case '/commands':
      showCommands();
      return true;

    case '/status':
      try {
        const tables = await db.tables.list();
        let totalRows = 0;
        const tableInfo: { name: string; rows: number }[] = [];

        for (const tableName of tables) {
          const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          const count = result.rows[0]?.count as number || 0;
          totalRows += count;
          tableInfo.push({ name: tableName, rows: count });
        }

        console.log(`\n${BOLD}Database Status:${RESET}`);
        console.log(`  ${DIM}Storage:${RESET}  ${config.memory ? `${CYAN}memory${RESET}` : config.dbPath}`);
        console.log(`  ${DIM}Tables:${RESET}   ${tables.length}`);
        console.log(`  ${DIM}Rows:${RESET}     ${totalRows}`);

        if (tableInfo.length > 0) {
          console.log(`\n${DIM}Tables:${RESET}`);
          for (const t of tableInfo) {
            console.log(`  ${YELLOW}●${RESET} ${t.name} ${DIM}(${t.rows} rows)${RESET}`);
          }
        }
        console.log('');
      } catch (err) {
        console.error(`${BOLD}Error:${RESET} ${(err as Error).message}`);
      }
      return true;

    case '/storage':
      if (!arg) {
        console.log(`${DIM}Current storage:${RESET} ${config.memory ? 'memory' : config.dbPath}`);
        console.log(`${DIM}Usage:${RESET} /storage <path> ${DIM}or${RESET} /storage memory`);
      } else if (arg === 'memory') {
        if (config.memory) {
          console.log(`${DIM}Already using memory storage.${RESET}`);
        } else {
          config.memory = true;
          db = new WorkerSQL({ storage: 'memory' });
          await db.init();
          reinitAIClient();
          console.log(`${GREEN}✓${RESET} Switched to ${CYAN}memory${RESET} storage`);
          console.log(`${DIM}Note: Previous data is no longer accessible.${RESET}`);
        }
      } else {
        config.memory = false;
        config.dbPath = arg;
        db = new WorkerSQL({ storage: 'filesystem', directory: arg });
        await db.init();
        reinitAIClient();
        console.log(`${GREEN}✓${RESET} Switched to filesystem storage at ${BOLD}${arg}${RESET}`);
      }
      drawStatusBar();
      return true;

    case '/config':
      console.log(`\n${BOLD}Configuration:${RESET}`);
      console.log(`  ${DIM}Mode:${RESET}     ${currentMode === 'ai' ? CYAN : YELLOW}${currentMode}${RESET}`);
      console.log(`  ${DIM}Storage:${RESET}  ${config.memory ? 'memory' : config.dbPath}`);
      console.log(`  ${DIM}API Key:${RESET}  ${config.apiKey ? GREEN + '●' + RESET + ' configured' : DIM + '○ not set' + RESET}`);
      console.log(`  ${DIM}Base URL:${RESET} ${config.baseUrl || 'https://api.openai.com/v1'}`);
      console.log(`  ${DIM}Model:${RESET}    ${config.model}\n`);
      return true;

    case '/model':
      if (!arg) {
        console.log(`${DIM}Current model:${RESET} ${config.model}`);
      } else {
        config.model = arg;
        reinitAIClient();
        console.log(`${GREEN}✓${RESET} Model set to ${BOLD}${config.model}${RESET}`);
      }
      return true;

    case '/api-key':
      if (!arg) {
        console.log(`${DIM}API key:${RESET} ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'not set'}`);
      } else {
        config.apiKey = arg;
        reinitAIClient();
        console.log(`${GREEN}✓${RESET} API key updated`);
      }
      return true;

    case '/base-url':
      if (!arg) {
        console.log(`${DIM}Base URL:${RESET} ${config.baseUrl || 'https://api.openai.com/v1'}`);
      } else {
        config.baseUrl = arg;
        reinitAIClient();
        console.log(`${GREEN}✓${RESET} Base URL set to ${BOLD}${config.baseUrl}${RESET}`);
      }
      return true;

    case '/tables':
      try {
        const tables = await db.tables.list();
        if (tables.length === 0) {
          console.log(`${DIM}No tables.${RESET}`);
        } else {
          console.log(`\n${BOLD}Tables:${RESET}`);
          for (const t of tables) {
            console.log(`  ${YELLOW}●${RESET} ${t}`);
          }
          console.log('');
        }
      } catch (err) {
        console.error(`${BOLD}Error:${RESET} ${(err as Error).message}`);
      }
      return true;

    case '/schema':
      if (!arg) {
        console.log(`${DIM}Usage:${RESET} /schema <table_name>`);
      } else {
        try {
          const schema = await db.tables.describe(arg);
          if (!schema) {
            console.log(`${DIM}Table '${arg}' not found.${RESET}`);
          } else {
            console.log(`\n${BOLD}Table: ${arg}${RESET}`);
            console.log(`${DIM}Columns:${RESET}`);
            for (const col of schema.columns) {
              const flags: string[] = [];
              if (col.primaryKey) flags.push(`${CYAN}PK${RESET}`);
              if (col.autoIncrement) flags.push(`${GREEN}AUTO${RESET}`);
              if (!col.nullable) flags.push(`${YELLOW}NOT NULL${RESET}`);
              const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
              console.log(`  ${BOLD}${col.name}${RESET} ${DIM}${col.type}${RESET}${flagStr}`);
            }
            console.log('');
          }
        } catch (err) {
          console.error(`${BOLD}Error:${RESET} ${(err as Error).message}`);
        }
      }
      return true;

    case '/clear':
      clearScreen();
      printBanner();
      return true;

    case '/quit':
    case '/exit':
      console.log(`\n${DIM}Goodbye!${RESET}\n`);
      process.exit(0);

    default:
      if (line.startsWith('/')) {
        console.log(`${DIM}Unknown command:${RESET} ${cmd}`);
        console.log(`${DIM}Type${RESET} /help ${DIM}for available commands${RESET}`);
        return true;
      }
      return false;
  }
}

async function handleInput(line: string): Promise<void> {
  line = line.trim();
  if (!line) return;

  // Handle slash commands
  if (line.startsWith('/')) {
    await handleSlashCommand(line);
    return;
  }

  // Execute based on mode
  if (currentMode === 'sql') {
    try {
      const result = await db.query(line);
      if (result.rows && result.rows.length > 0) {
        console.log(formatTable(result.rows));
      } else if (result.affectedRows !== undefined) {
        console.log(`${GREEN}✓${RESET} ${result.affectedRows} row(s) affected`);
        if (result.lastInsertId) {
          console.log(`${DIM}Last insert ID:${RESET} ${result.lastInsertId}`);
        }
      } else {
        console.log(`${GREEN}✓${RESET} Query OK`);
      }
    } catch (err) {
      console.error(`${BOLD}Error:${RESET} ${(err as Error).message}`);
    }
  } else {
    // AI mode
    if (!config.apiKey) {
      console.log(`${DIM}AI mode requires an API key.${RESET}`);
      console.log(`Use ${BOLD}/api-key <key>${RESET} to set it.`);
      return;
    }

    if (!aiClient) {
      reinitAIClient();
    }

    try {
      process.stdout.write(`${DIM}Thinking...${RESET}`);
      const response = await aiClient!.chat(line);
      process.stdout.write('\r\x1b[K');
      console.log(response);
    } catch (err) {
      process.stdout.write('\r\x1b[K');
      console.error(`${BOLD}AI Error:${RESET} ${(err as Error).message}`);
    }
  }
}

function switchMode(): void {
  currentMode = currentMode === 'sql' ? 'ai' : 'sql';
  const modeLabel = currentMode === 'ai' ? `${CYAN}AI${RESET}` : `${YELLOW}SQL${RESET}`;
  console.log(`\n${DIM}Switched to${RESET} ${modeLabel} ${DIM}mode${RESET}`);
  drawStatusBar();
}

function setupTerminal(): void {
  // Handle terminal resize
  process.stdout.on('resize', () => {
    terminalHeight = process.stdout.rows || 24;
    terminalWidth = process.stdout.columns || 80;
    drawStatusBar();
  });

  // Reserve space for status bar
  process.stdout.write('\n'.repeat(1));
}

async function main(): Promise<void> {
  parseArgs(process.argv.slice(2));

  // Initialize database
  db = new WorkerSQL({
    storage: config.memory ? 'memory' : 'filesystem',
    directory: config.memory ? undefined : config.dbPath,
  });
  await db.init();

  // Initialize AI client if API key is available
  if (config.apiKey) {
    reinitAIClient();
  }

  clearScreen();
  printBanner();
  setupTerminal();

  // Set up readline with custom key handling
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Enable keypress events
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin, rl);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (_str, key) => {
      if (key && key.name === 'tab') {
        // Prevent tab from being inserted
        process.stdout.write('\r\x1b[K');
        switchMode();
        rl.prompt();
      }
    });
  }

  rl.on('line', async (line) => {
    await handleInput(line);
    drawStatusBar();
    rl.prompt();
  });

  rl.on('close', () => {
    // Clear status bar area
    moveCursor(terminalHeight, 1);
    process.stdout.write('\x1b[K');
    console.log(`\n${DIM}Goodbye!${RESET}\n`);
    process.exit(0);
  });

  // Custom prompt that updates dynamically
  rl.setPrompt(getPrompt());
  const originalPrompt = rl.prompt.bind(rl);
  rl.prompt = () => {
    rl.setPrompt(getPrompt());
    originalPrompt();
  };

  drawStatusBar();
  rl.prompt();
}

main().catch(err => {
  console.error(`${BOLD}Fatal error:${RESET} ${err.message}`);
  process.exit(1);
});
