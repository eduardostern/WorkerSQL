import { NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/db';

// GET /api/notes - List all notes
export async function GET() {
  try {
    const db = await getDatabase();
    const result = await db.query(
      'SELECT * FROM notes ORDER BY pinned DESC, created_at DESC'
    );
    return NextResponse.json({ notes: result.rows });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/notes - Create a note
export async function POST(request) {
  try {
    const db = await getDatabase();
    const body = await request.json();
    const { title, content, color } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const result = await db.query(
      'INSERT INTO notes (title, content, color, created_at) VALUES (?, ?, ?, ?)',
      [title, content || '', color || 'yellow', new Date().toISOString()]
    );

    const created = await db.query('SELECT * FROM notes WHERE id = ?', [result.lastInsertId]);
    return NextResponse.json(created.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
