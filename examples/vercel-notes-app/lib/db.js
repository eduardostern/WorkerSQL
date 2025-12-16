import { WorkerSQL } from 'workersql';

let db = null;
let initialized = false;

export async function getDatabase() {
  if (!db) {
    db = new WorkerSQL({
      storage: 'memory', // Use memory for Vercel (stateless)
    });
  }

  if (!initialized) {
    await db.init();

    // Create notes table
    await db.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        color TEXT DEFAULT 'yellow',
        pinned INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    // Seed with sample notes
    const count = await db.query('SELECT COUNT(*) as count FROM notes');
    if (count.rows[0].count === 0) {
      const sampleNotes = [
        { title: 'Welcome to Notes!', content: 'This is a simple notes app built with WorkerSQL and Next.js.', color: 'blue', pinned: 1 },
        { title: 'Shopping List', content: '- Milk\n- Bread\n- Eggs\n- Coffee', color: 'green', pinned: 0 },
        { title: 'Ideas', content: 'Build something awesome with WorkerSQL!', color: 'purple', pinned: 0 },
      ];

      for (const note of sampleNotes) {
        await db.query(
          'INSERT INTO notes (title, content, color, pinned, created_at) VALUES (?, ?, ?, ?, ?)',
          [note.title, note.content, note.color, note.pinned, new Date().toISOString()]
        );
      }
    }

    initialized = true;
  }

  return db;
}
