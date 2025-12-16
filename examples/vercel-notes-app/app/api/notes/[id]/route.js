import { NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db';

// GET /api/notes/:id - Get single note
export async function GET(request, { params }) {
  try {
    const db = await getDatabase();
    const id = parseInt(params.id);
    const result = await db.query('SELECT * FROM notes WHERE id = ?', [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/notes/:id - Update a note
export async function PUT(request, { params }) {
  try {
    const db = await getDatabase();
    const id = parseInt(params.id);
    const body = await request.json();
    const { title, content, color, pinned } = body;

    // Check if note exists
    const existing = await db.query('SELECT * FROM notes WHERE id = ?', [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    const note = existing.rows[0];
    await db.query(
      'UPDATE notes SET title = ?, content = ?, color = ?, pinned = ?, updated_at = ? WHERE id = ?',
      [
        title !== undefined ? title : note.title,
        content !== undefined ? content : note.content,
        color !== undefined ? color : note.color,
        pinned !== undefined ? (pinned ? 1 : 0) : note.pinned,
        new Date().toISOString(),
        id,
      ]
    );

    const updated = await db.query('SELECT * FROM notes WHERE id = ?', [id]);
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/notes/:id - Delete a note
export async function DELETE(request, { params }) {
  try {
    const db = await getDatabase();
    const id = parseInt(params.id);

    const result = await db.query('DELETE FROM notes WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Note deleted', id });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
