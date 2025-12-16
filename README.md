# WorkerSQL

A lightweight SQL database for Node.js serverless environments with AI integration.

## Features

- **Full SQL Support**: SELECT, INSERT, UPDATE, DELETE with JOINs, GROUP BY, aggregates, subqueries
- **Zero Dependencies**: Hand-written SQL parser (~72KB bundle)
- **Multiple Storage Backends**: In-memory (default) and filesystem persistence
- **AI Integration**: OpenAI-compatible function calling for natural language queries
- **Serverless Ready**: Works in Cloudflare Workers, Vercel, and Node.js

## Installation

```bash
npm install workersql
```

## Quick Start

```javascript
import { WorkerSQL } from 'workersql';

const db = new WorkerSQL();
await db.init();

// Create a table
await db.query(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    age INTEGER
  )
`);

// Insert data
await db.query('INSERT INTO users (name, email, age) VALUES (?, ?, ?)',
  ['Alice', 'alice@example.com', 30]);

// Query data
const result = await db.query('SELECT * FROM users WHERE age > ?', [25]);
console.log(result.rows);
```

---

## Usage Modes

### 1. Local Development (In-Memory)

Best for: Testing, development, prototyping

```javascript
import { WorkerSQL } from 'workersql';

const db = new WorkerSQL(); // Default: in-memory storage
await db.init();

// Data exists only during runtime
await db.query('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)');
await db.query('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'Test']);
```

### 2. Local Development (Filesystem Persistence)

Best for: Local servers, CLI tools, data that needs to persist

```javascript
import { WorkerSQL } from 'workersql';

const db = new WorkerSQL({
  storage: 'filesystem',
  directory: './data'  // Data stored as JSON files
});
await db.init();

// Create and populate tables
await db.query('CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTO_INCREMENT, name TEXT, price FLOAT)');
await db.query('INSERT INTO products (name, price) VALUES (?, ?)', ['Widget', 9.99]);

// IMPORTANT: Call commit() to persist changes to disk
await db.commit();
```

**File structure created:**
```
./data/
├── _schemas/
│   └── products.json    # Table schema
└── products.json        # Table data
```

### 3. Cloudflare Workers

Best for: Edge computing, global distribution, low latency

```javascript
// worker.js
import { WorkerSQL } from 'workersql';

export default {
  async fetch(request, env, ctx) {
    const db = new WorkerSQL(); // In-memory per request
    await db.init();

    // Load data from KV if needed
    const savedData = await env.MY_KV.get('db_state', 'json');
    if (savedData) {
      for (const [table, rows] of Object.entries(savedData)) {
        // Restore tables...
      }
    }

    // Handle request
    const url = new URL(request.url);

    if (url.pathname === '/api/users') {
      await db.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name TEXT)');

      if (request.method === 'POST') {
        const { name } = await request.json();
        const result = await db.query('INSERT INTO users (name) VALUES (?)', [name]);
        return Response.json({ id: result.lastInsertId });
      }

      const result = await db.query('SELECT * FROM users');
      return Response.json(result.rows);
    }

    return new Response('Not Found', { status: 404 });
  }
};
```

### 4. Vercel Serverless Functions

Best for: Next.js apps, API routes, full-stack applications

```javascript
// pages/api/users.js (Next.js Pages Router)
import { WorkerSQL } from 'workersql';

let db = null;

async function getDb() {
  if (!db) {
    db = new WorkerSQL({
      storage: 'filesystem',
      directory: '/tmp/workersql'  // Vercel's writable directory
    });
    await db.init();

    // Initialize schema
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  return db;
}

export default async function handler(req, res) {
  const db = await getDb();

  if (req.method === 'GET') {
    const result = await db.query('SELECT * FROM users ORDER BY id DESC');
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { name, email } = req.body;
    const result = await db.query(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [name, email]
    );
    await db.commit();
    return res.json({ id: result.lastInsertId });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
```

---

## SQL Reference

### Data Types

| Type | Description |
|------|-------------|
| `INTEGER` / `INT` | Integer numbers |
| `FLOAT` / `REAL` / `DOUBLE` | Floating point numbers |
| `TEXT` / `VARCHAR(n)` | Text strings |
| `BOOLEAN` / `BOOL` | True/false values |
| `DATETIME` / `TIMESTAMP` | Date and time |
| `BLOB` | Binary data |

### CREATE TABLE

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  age INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  user_id INTEGER,
  total FLOAT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### SELECT

```sql
-- Basic select
SELECT * FROM users;
SELECT name, email FROM users;

-- With conditions
SELECT * FROM users WHERE age > 21;
SELECT * FROM users WHERE name LIKE '%john%';
SELECT * FROM users WHERE age BETWEEN 18 AND 65;
SELECT * FROM users WHERE status IN ('active', 'pending');
SELECT * FROM users WHERE email IS NOT NULL;

-- Sorting and limiting
SELECT * FROM users ORDER BY name ASC;
SELECT * FROM users ORDER BY created_at DESC LIMIT 10;
SELECT * FROM users LIMIT 10 OFFSET 20;

-- Distinct values
SELECT DISTINCT status FROM users;

-- Aggregates
SELECT COUNT(*) as total FROM users;
SELECT AVG(age) as avg_age FROM users;
SELECT MIN(price), MAX(price) FROM products;
SELECT SUM(total) as revenue FROM orders;

-- Group by
SELECT status, COUNT(*) as count
FROM users
GROUP BY status;

SELECT category, AVG(price) as avg_price
FROM products
GROUP BY category
HAVING AVG(price) > 100;

-- Joins
SELECT users.name, orders.total
FROM users
INNER JOIN orders ON users.id = orders.user_id;

SELECT u.name, COALESCE(SUM(o.total), 0) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;
```

### INSERT

```sql
-- Single row
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');

-- Multiple rows
INSERT INTO users (name, email) VALUES
  ('Bob', 'bob@example.com'),
  ('Charlie', 'charlie@example.com');
```

### UPDATE

```sql
UPDATE users SET name = 'Alice Smith' WHERE id = 1;
UPDATE products SET price = price * 1.1 WHERE category = 'electronics';
UPDATE users SET active = FALSE WHERE last_login < '2024-01-01';
```

### DELETE

```sql
DELETE FROM users WHERE id = 1;
DELETE FROM orders WHERE created_at < '2024-01-01';
```

### ALTER TABLE

```sql
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users DROP COLUMN phone;
```

### DROP TABLE

```sql
DROP TABLE users;
DROP TABLE IF EXISTS temp_data;
```

---

## Prepared Statements

Use `?` placeholders for parameterized queries (prevents SQL injection):

```javascript
// Create a prepared statement
const findUser = db.prepare('SELECT * FROM users WHERE id = ?');

// Execute multiple times with different values
const user1 = await findUser.first([1]);
const user2 = await findUser.first([2]);

// Different return methods
const allResults = await findUser.all([1]);      // Array of rows
const firstResult = await findUser.first([1]);   // First row or null
const count = await findUser.scalar([1]);        // Single value
```

---

## Built-in Functions

### String Functions

```sql
SELECT UPPER(name) FROM users;
SELECT LOWER(email) FROM users;
SELECT LENGTH(name) FROM users;
SELECT TRIM(name) FROM users;
SELECT CONCAT(first_name, ' ', last_name) as full_name FROM users;
SELECT SUBSTR(name, 1, 3) FROM users;
SELECT REPLACE(text, 'old', 'new') FROM posts;
```

### Math Functions

```sql
SELECT ABS(-5);           -- 5
SELECT ROUND(3.7);        -- 4
SELECT ROUND(3.14159, 2); -- 3.14
SELECT FLOOR(3.7);        -- 3
SELECT CEIL(3.2);         -- 4
SELECT SQRT(16);          -- 4
SELECT POWER(2, 3);       -- 8
```

### Date Functions

```sql
SELECT NOW();              -- Current timestamp
SELECT CURRENT_DATE;       -- Current date
SELECT CURRENT_TIME;       -- Current time
SELECT CURRENT_TIMESTAMP;  -- Current timestamp
```

### Conditional Functions

```sql
SELECT COALESCE(nickname, name, 'Anonymous') FROM users;
SELECT NULLIF(value, 0) FROM data;

SELECT
  name,
  CASE status
    WHEN 'active' THEN 'Active User'
    WHEN 'inactive' THEN 'Inactive User'
    ELSE 'Unknown'
  END as status_label
FROM users;

SELECT
  name,
  CASE
    WHEN age < 18 THEN 'Minor'
    WHEN age < 65 THEN 'Adult'
    ELSE 'Senior'
  END as age_group
FROM users;
```

---

## AI Integration

WorkerSQL can integrate with OpenAI-compatible AI providers for natural language database queries.

### Getting Tool Definitions

Use with your own AI client (OpenAI SDK, Vercel AI SDK, LangChain, etc.):

```javascript
import { WorkerSQL } from 'workersql';
import { AIBridge } from 'workersql/ai';

const db = new WorkerSQL();
await db.init();

// Create sample data
await db.query('CREATE TABLE products (id INTEGER PRIMARY KEY AUTO_INCREMENT, name TEXT, price FLOAT, category TEXT)');
await db.query('INSERT INTO products (name, price, category) VALUES (?, ?, ?)', ['Laptop', 999, 'electronics']);
await db.query('INSERT INTO products (name, price, category) VALUES (?, ?, ?)', ['Mouse', 29, 'electronics']);
await db.query('INSERT INTO products (name, price, category) VALUES (?, ?, ?)', ['Desk', 299, 'furniture']);

// Get OpenAI-compatible tool definitions
const bridge = new AIBridge(db);
const tools = bridge.getTools();

console.log(tools);
// [
//   { type: 'function', function: { name: 'list_tables', ... } },
//   { type: 'function', function: { name: 'describe_table', ... } },
//   { type: 'function', function: { name: 'execute_sql', ... } },
//   { type: 'function', function: { name: 'sample_data', ... } }
// ]

// Execute tool calls from AI response
const result = await bridge.executeTool('execute_sql', {
  sql: 'SELECT category, AVG(price) as avg_price FROM products GROUP BY category'
});
console.log(result);
// { success: true, result: { rows: [...], columns: [...] } }
```

### Using Built-in AI Client

Complete chat interface with automatic tool calling:

```javascript
import { WorkerSQL } from 'workersql';
import { AIClient } from 'workersql/ai';

const db = new WorkerSQL();
await db.init();

// Setup database with sample data...

const ai = new AIClient({
  db,
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',  // Or use Ollama, Together, etc.
  model: 'gpt-4o-mini'
});

// Natural language query
const answer = await ai.chat('What are the top 3 most expensive products?');
console.log(answer);
// "Based on the data, the top 3 most expensive products are:
//  1. Laptop - $999
//  2. Desk - $299
//  3. Mouse - $29"

// Follow-up question (maintains conversation history)
const answer2 = await ai.chat('What is the average price by category?');
console.log(answer2);
```

### Available AI Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables in the database |
| `describe_table` | Get schema of a table (columns, types) |
| `execute_sql` | Execute a SQL query |
| `sample_data` | Get sample rows from a table |

---

## API Reference

### WorkerSQL Class

```javascript
const db = new WorkerSQL(options);
```

**Options:**
- `storage`: `'memory'` (default) | `'filesystem'` | custom `StorageAdapter`
- `directory`: Path for filesystem storage (required if `storage: 'filesystem'`)

**Methods:**

| Method | Description |
|--------|-------------|
| `init()` | Initialize the database (required before queries) |
| `query(sql, params?)` | Execute SQL query, returns `QueryResult` |
| `exec(sql)` | Execute multiple SQL statements |
| `prepare(sql)` | Create a prepared statement |
| `commit()` | Persist changes to storage |
| `tables.list()` | List all table names |
| `tables.exists(name)` | Check if table exists |
| `tables.describe(name)` | Get table schema |

### QueryResult

```javascript
{
  rows: [],           // Array of row objects
  rowCount: 0,        // Number of rows returned
  columns: [],        // Array of column names
  affectedRows: 0,    // For INSERT/UPDATE/DELETE
  lastInsertId: 0     // For INSERT with AUTO_INCREMENT
}
```

### PreparedStatement

```javascript
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');

await stmt.execute([1]);  // Returns QueryResult
await stmt.all([1]);      // Returns array of rows
await stmt.first([1]);    // Returns first row or null
await stmt.scalar([1]);   // Returns first column of first row
```

---

## Examples

See the `/examples` directory for complete examples:

- **`/examples/local-cli`** - Command-line task manager
- **`/examples/cloudflare-worker`** - REST API on Cloudflare Workers
- **`/examples/vercel-notes-app`** - Complete notes web application

---

## Performance Tips

1. **Use prepared statements** for repeated queries
2. **Batch inserts** using multiple VALUES in one INSERT
3. **Call `commit()` strategically** - not after every write
4. **Use indexes** (PRIMARY KEY, UNIQUE) on frequently queried columns
5. **Limit result sets** with LIMIT clause

---

## Limitations

- No concurrent write support (single writer)
- No transactions (each query is atomic)
- Filesystem storage writes entire table on commit
- In-memory storage limited by available RAM
- No full-text search (LIKE is pattern-based)

---

## License

MIT
