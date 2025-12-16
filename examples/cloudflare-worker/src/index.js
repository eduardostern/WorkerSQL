/**
 * Bookmarks API - Cloudflare Worker
 *
 * A REST API for managing bookmarks using WorkerSQL.
 *
 * Endpoints:
 *   GET    /api/bookmarks         - List all bookmarks
 *   GET    /api/bookmarks/:id     - Get a bookmark
 *   POST   /api/bookmarks         - Create a bookmark
 *   PUT    /api/bookmarks/:id     - Update a bookmark
 *   DELETE /api/bookmarks/:id     - Delete a bookmark
 *   GET    /api/bookmarks/search  - Search bookmarks
 *   GET    /api/tags              - List all tags
 */

import { WorkerSQL } from 'workersql';

// Sample data for demonstration
const SAMPLE_BOOKMARKS = [
  { url: 'https://github.com', title: 'GitHub', description: 'Code hosting platform', tags: 'dev,code' },
  { url: 'https://cloudflare.com', title: 'Cloudflare', description: 'Web performance & security', tags: 'hosting,cdn' },
  { url: 'https://news.ycombinator.com', title: 'Hacker News', description: 'Tech news aggregator', tags: 'news,tech' },
];

async function initDatabase(db) {
  await db.init();

  await db.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // Check if we need to seed data
  const count = await db.query('SELECT COUNT(*) as count FROM bookmarks');
  if (count.rows[0].count === 0) {
    for (const bookmark of SAMPLE_BOOKMARKS) {
      await db.query(
        'INSERT INTO bookmarks (url, title, description, tags, created_at) VALUES (?, ?, ?, ?, ?)',
        [bookmark.url, bookmark.title, bookmark.description, bookmark.tags, new Date().toISOString()]
      );
    }
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Initialize database (in-memory for this example)
    const db = new WorkerSQL();
    await initDatabase(db);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Routes
      // GET /api/bookmarks - List all bookmarks
      if (path === '/api/bookmarks' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');

        const result = await db.query(
          'SELECT * FROM bookmarks ORDER BY created_at DESC LIMIT ? OFFSET ?',
          [limit, offset]
        );

        const total = await db.query('SELECT COUNT(*) as count FROM bookmarks');

        return json({
          bookmarks: result.rows,
          total: total.rows[0].count,
          limit,
          offset,
        });
      }

      // GET /api/bookmarks/search - Search bookmarks
      if (path === '/api/bookmarks/search' && method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const tag = url.searchParams.get('tag');

        let sql = 'SELECT * FROM bookmarks WHERE 1=1';
        const params = [];

        if (q) {
          sql += ' AND (title LIKE ? OR description LIKE ? OR url LIKE ?)';
          const searchPattern = `%${q}%`;
          params.push(searchPattern, searchPattern, searchPattern);
        }

        if (tag) {
          sql += ' AND tags LIKE ?';
          params.push(`%${tag}%`);
        }

        sql += ' ORDER BY created_at DESC';

        const result = await db.query(sql, params);
        return json({ bookmarks: result.rows, count: result.rowCount });
      }

      // GET /api/bookmarks/:id - Get single bookmark
      const getMatch = path.match(/^\/api\/bookmarks\/(\d+)$/);
      if (getMatch && method === 'GET') {
        const id = parseInt(getMatch[1]);
        const result = await db.query('SELECT * FROM bookmarks WHERE id = ?', [id]);

        if (result.rows.length === 0) {
          return error('Bookmark not found', 404);
        }

        return json(result.rows[0]);
      }

      // POST /api/bookmarks - Create bookmark
      if (path === '/api/bookmarks' && method === 'POST') {
        const body = await request.json();
        const { url: bookmarkUrl, title, description, tags } = body;

        if (!bookmarkUrl || !title) {
          return error('URL and title are required');
        }

        const result = await db.query(
          'INSERT INTO bookmarks (url, title, description, tags, created_at) VALUES (?, ?, ?, ?, ?)',
          [bookmarkUrl, title, description || '', tags || '', new Date().toISOString()]
        );

        const created = await db.query('SELECT * FROM bookmarks WHERE id = ?', [result.lastInsertId]);

        return json(created.rows[0], 201);
      }

      // PUT /api/bookmarks/:id - Update bookmark
      const putMatch = path.match(/^\/api\/bookmarks\/(\d+)$/);
      if (putMatch && method === 'PUT') {
        const id = parseInt(putMatch[1]);
        const body = await request.json();
        const { url: bookmarkUrl, title, description, tags } = body;

        // Check if bookmark exists
        const existing = await db.query('SELECT * FROM bookmarks WHERE id = ?', [id]);
        if (existing.rows.length === 0) {
          return error('Bookmark not found', 404);
        }

        await db.query(
          'UPDATE bookmarks SET url = ?, title = ?, description = ?, tags = ?, updated_at = ? WHERE id = ?',
          [
            bookmarkUrl || existing.rows[0].url,
            title || existing.rows[0].title,
            description !== undefined ? description : existing.rows[0].description,
            tags !== undefined ? tags : existing.rows[0].tags,
            new Date().toISOString(),
            id,
          ]
        );

        const updated = await db.query('SELECT * FROM bookmarks WHERE id = ?', [id]);
        return json(updated.rows[0]);
      }

      // DELETE /api/bookmarks/:id - Delete bookmark
      const deleteMatch = path.match(/^\/api\/bookmarks\/(\d+)$/);
      if (deleteMatch && method === 'DELETE') {
        const id = parseInt(deleteMatch[1]);

        const result = await db.query('DELETE FROM bookmarks WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
          return error('Bookmark not found', 404);
        }

        return json({ message: 'Bookmark deleted', id });
      }

      // GET /api/tags - List all unique tags
      if (path === '/api/tags' && method === 'GET') {
        const result = await db.query('SELECT tags FROM bookmarks WHERE tags IS NOT NULL AND tags != \'\'');

        // Extract and count unique tags
        const tagCounts = {};
        for (const row of result.rows) {
          const tags = row.tags.split(',').map(t => t.trim()).filter(Boolean);
          for (const tag of tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }

        const tags = Object.entries(tagCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        return json({ tags });
      }

      // GET / - API info
      if (path === '/' || path === '/api') {
        return json({
          name: 'Bookmarks API',
          version: '1.0.0',
          endpoints: {
            'GET /api/bookmarks': 'List all bookmarks',
            'GET /api/bookmarks/:id': 'Get a bookmark',
            'POST /api/bookmarks': 'Create a bookmark',
            'PUT /api/bookmarks/:id': 'Update a bookmark',
            'DELETE /api/bookmarks/:id': 'Delete a bookmark',
            'GET /api/bookmarks/search?q=&tag=': 'Search bookmarks',
            'GET /api/tags': 'List all tags',
          },
        });
      }

      return error('Not found', 404);
    } catch (err) {
      console.error(err);
      return error(err.message || 'Internal server error', 500);
    }
  },
};
