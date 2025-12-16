# Bookmarks API - Cloudflare Worker

A REST API for managing bookmarks, running on Cloudflare Workers with WorkerSQL.

## Setup

```bash
cd examples/cloudflare-worker
npm install
```

## Development

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`.

## Deploy to Cloudflare

```bash
npm run deploy
```

## API Endpoints

### List Bookmarks

```bash
# List all bookmarks
curl http://localhost:8787/api/bookmarks

# With pagination
curl "http://localhost:8787/api/bookmarks?limit=10&offset=0"
```

### Get Bookmark

```bash
curl http://localhost:8787/api/bookmarks/1
```

### Create Bookmark

```bash
curl -X POST http://localhost:8787/api/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "title": "Example", "tags": "example,test"}'
```

### Update Bookmark

```bash
curl -X PUT http://localhost:8787/api/bookmarks/1 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'
```

### Delete Bookmark

```bash
curl -X DELETE http://localhost:8787/api/bookmarks/1
```

### Search Bookmarks

```bash
# Search by text
curl "http://localhost:8787/api/bookmarks/search?q=github"

# Filter by tag
curl "http://localhost:8787/api/bookmarks/search?tag=dev"

# Combined
curl "http://localhost:8787/api/bookmarks/search?q=code&tag=dev"
```

### List Tags

```bash
curl http://localhost:8787/api/tags
```

## Features Demonstrated

- In-memory storage (stateless per request)
- Full CRUD operations
- Search with LIKE queries
- Parameterized queries (SQL injection prevention)
- REST API design patterns
- CORS headers

## Notes

- Data is seeded with sample bookmarks on each request
- For persistence, connect to Cloudflare KV or D1
- In production, implement authentication
