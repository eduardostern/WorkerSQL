# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorkerSQL is a lightweight SQL database library for Node.js serverless environments (Cloudflare Workers/Pages, Vercel) with AI integration for natural language database access.

## Build and Development Commands

```bash
npm install       # Install dependencies
npm run build     # Build the library (outputs to dist/)
npm run dev       # Build in watch mode
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
npm run typecheck # Check TypeScript types
```

## Architecture

```
src/
├── index.ts            # Main WorkerSQL class and exports
├── types.ts            # TypeScript type definitions
├── parser/             # SQL Parser (hand-written recursive descent)
│   ├── lexer.ts        # Tokenizer - converts SQL string to tokens
│   ├── parser.ts       # Parser - converts tokens to AST
│   ├── ast.ts          # AST node type definitions
│   └── tokens.ts       # Token type definitions
├── storage/            # Storage Adapters
│   ├── adapter.ts      # StorageAdapter interface
│   ├── memory.ts       # In-memory storage (default)
│   └── filesystem.ts   # File-based persistence
├── engine/             # Query Execution
│   └── executor.ts     # Executes AST against storage
└── ai/                 # AI Integration (separate import)
    ├── bridge.ts       # AIBridge - tool definitions and executor
    ├── client.ts       # AIClient - OpenAI-compatible chat client
    ├── tools.ts        # Tool definition generator
    └── types.ts        # AI-specific types
```

## Key Implementation Details

**Parser**: Hand-written lexer and recursive descent parser for small bundle size and fast cold starts. Located in `src/parser/`.

**Storage**: Pluggable storage adapters implementing `StorageAdapter` interface. Memory adapter is default; filesystem adapter persists JSON files.

**Executor**: `src/engine/executor.ts` handles all SQL statement types. Query execution flow:
1. Parse SQL → AST
2. Get table rows (with table name prefixing for JOINs)
3. Apply JOINs, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT
4. Project columns

**AI Module**: Separate entry point (`workersql/ai`) to keep core bundle small. Provides:
- `AIBridge`: Tool definitions for function calling + tool executor
- `AIClient`: Full chat client with automatic tool calling loop

## SQL Support

- SELECT with WHERE, ORDER BY, GROUP BY, HAVING, LIMIT, OFFSET, DISTINCT
- JOINs: INNER, LEFT, RIGHT, CROSS
- Aggregate functions: COUNT, SUM, AVG, MIN, MAX
- INSERT, UPDATE, DELETE
- CREATE TABLE, DROP TABLE, ALTER TABLE
- Prepared statements with `?` placeholders
- Functions: UPPER, LOWER, LENGTH, CONCAT, COALESCE, etc.
