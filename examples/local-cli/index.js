/**
 * Task Manager CLI
 *
 * A simple command-line task manager using WorkerSQL with filesystem persistence.
 *
 * Usage:
 *   node index.js add "Buy groceries"
 *   node index.js add "Call mom" --priority high
 *   node index.js list
 *   node index.js list --status pending
 *   node index.js done 1
 *   node index.js delete 1
 *   node index.js stats
 */

import { WorkerSQL } from 'workersql';

// Initialize database with filesystem storage
const db = new WorkerSQL({
  storage: 'filesystem',
  directory: './data'
});

async function initDatabase() {
  await db.init();

  // Create tasks table if it doesn't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      title TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      created_at TEXT,
      completed_at TEXT
    )
  `);

  await db.commit();
}

async function addTask(title, priority = 'normal') {
  const result = await db.query(
    'INSERT INTO tasks (title, priority, created_at) VALUES (?, ?, ?)',
    [title, priority, new Date().toISOString()]
  );
  await db.commit();

  console.log(`Task #${result.lastInsertId} added: "${title}" [${priority}]`);
}

async function listTasks(filterStatus = null) {
  let sql = 'SELECT * FROM tasks';
  const params = [];

  if (filterStatus) {
    sql += ' WHERE status = ?';
    params.push(filterStatus);
  }

  sql += ' ORDER BY CASE priority WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 WHEN \'low\' THEN 3 END, id';

  const result = await db.query(sql, params);

  if (result.rows.length === 0) {
    console.log('No tasks found.');
    return;
  }

  console.log('\n Tasks:');
  console.log('─'.repeat(60));

  for (const task of result.rows) {
    const statusIcon = task.status === 'done' ? '✓' : '○';
    const priorityLabel = task.priority === 'high' ? ' [HIGH]' : task.priority === 'low' ? ' [low]' : '';
    console.log(`  ${statusIcon} #${task.id} ${task.title}${priorityLabel}`);
  }

  console.log('─'.repeat(60));
  console.log(`  Total: ${result.rows.length} task(s)\n`);
}

async function markDone(id) {
  const result = await db.query(
    'UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?',
    ['done', new Date().toISOString(), id]
  );
  await db.commit();

  if (result.affectedRows > 0) {
    console.log(`Task #${id} marked as done!`);
  } else {
    console.log(`Task #${id} not found.`);
  }
}

async function deleteTask(id) {
  const result = await db.query('DELETE FROM tasks WHERE id = ?', [id]);
  await db.commit();

  if (result.affectedRows > 0) {
    console.log(`Task #${id} deleted.`);
  } else {
    console.log(`Task #${id} not found.`);
  }
}

async function showStats() {
  const total = await db.query('SELECT COUNT(*) as count FROM tasks');
  const pending = await db.query('SELECT COUNT(*) as count FROM tasks WHERE status = ?', ['pending']);
  const done = await db.query('SELECT COUNT(*) as count FROM tasks WHERE status = ?', ['done']);
  const byPriority = await db.query(`
    SELECT priority, COUNT(*) as count
    FROM tasks
    WHERE status = 'pending'
    GROUP BY priority
  `);

  console.log('\n Statistics:');
  console.log('─'.repeat(40));
  console.log(`  Total tasks:    ${total.rows[0].count}`);
  console.log(`  Pending:        ${pending.rows[0].count}`);
  console.log(`  Completed:      ${done.rows[0].count}`);

  if (byPriority.rows.length > 0) {
    console.log('\n  Pending by priority:');
    for (const row of byPriority.rows) {
      console.log(`    ${row.priority}: ${row.count}`);
    }
  }

  console.log('─'.repeat(40) + '\n');
}

function showHelp() {
  console.log(`
Task Manager CLI - Using WorkerSQL

Commands:
  add <title> [--priority high|normal|low]   Add a new task
  list [--status pending|done]               List tasks
  done <id>                                  Mark task as done
  delete <id>                                Delete a task
  stats                                      Show statistics
  help                                       Show this help

Examples:
  node index.js add "Buy groceries"
  node index.js add "Urgent meeting" --priority high
  node index.js list
  node index.js list --status pending
  node index.js done 1
  node index.js stats
`);
}

// Parse command line arguments
async function main() {
  await initDatabase();

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'add': {
      const title = args[1];
      if (!title) {
        console.log('Error: Task title is required');
        process.exit(1);
      }
      const priorityIndex = args.indexOf('--priority');
      const priority = priorityIndex !== -1 ? args[priorityIndex + 1] : 'normal';
      await addTask(title, priority);
      break;
    }

    case 'list': {
      const statusIndex = args.indexOf('--status');
      const status = statusIndex !== -1 ? args[statusIndex + 1] : null;
      await listTasks(status);
      break;
    }

    case 'done': {
      const id = parseInt(args[1]);
      if (isNaN(id)) {
        console.log('Error: Valid task ID is required');
        process.exit(1);
      }
      await markDone(id);
      break;
    }

    case 'delete': {
      const id = parseInt(args[1]);
      if (isNaN(id)) {
        console.log('Error: Valid task ID is required');
        process.exit(1);
      }
      await deleteTask(id);
      break;
    }

    case 'stats':
      await showStats();
      break;

    case 'help':
    default:
      showHelp();
      break;
  }
}

main().catch(console.error);
