# Task Manager CLI

A simple command-line task manager demonstrating WorkerSQL with filesystem persistence.

## Setup

```bash
cd examples/local-cli
npm install
```

## Usage

```bash
# Add tasks
node index.js add "Buy groceries"
node index.js add "Call mom" --priority high
node index.js add "Read a book" --priority low

# List all tasks
node index.js list

# List only pending tasks
node index.js list --status pending

# Mark task as done
node index.js done 1

# Delete a task
node index.js delete 2

# View statistics
node index.js stats
```

## Data Storage

Data is persisted in the `./data` directory as JSON files:

```
./data/
├── _schemas/
│   └── tasks.json    # Table schema
└── tasks.json        # Task data
```

## Features Demonstrated

- Filesystem storage adapter
- CREATE TABLE IF NOT EXISTS
- INSERT with AUTO_INCREMENT
- UPDATE with WHERE clause
- DELETE with WHERE clause
- SELECT with ORDER BY
- Aggregate functions (COUNT)
- GROUP BY queries
- Parameterized queries (? placeholders)
