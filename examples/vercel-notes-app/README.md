# Notes App - Vercel + Next.js

A complete notes web application demonstrating WorkerSQL with Next.js on Vercel.

## Setup

```bash
cd examples/vercel-notes-app
npm install
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

## Features

- Create, read, update, delete notes
- Color-coded notes (yellow, blue, green, purple, pink, orange)
- Pin important notes to the top
- Responsive grid layout
- Real-time UI updates

## Architecture

```
app/
├── layout.js           # Root layout
├── page.js             # Main React component (client-side)
└── api/
    └── notes/
        ├── route.js    # GET /api/notes, POST /api/notes
        └── [id]/
            └── route.js # GET, PUT, DELETE /api/notes/:id

lib/
└── db.js               # WorkerSQL initialization
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notes | List all notes |
| POST | /api/notes | Create a note |
| GET | /api/notes/:id | Get single note |
| PUT | /api/notes/:id | Update a note |
| DELETE | /api/notes/:id | Delete a note |

## Notes About Vercel

This example uses **in-memory storage** which resets on each cold start. For production:

1. **Vercel KV** - Use Vercel KV (Redis) for persistence
2. **Vercel Postgres** - Use Vercel Postgres for a real database
3. **External DB** - Connect to any external database

WorkerSQL is ideal for:
- Prototyping and demos
- Temporary/session data
- Read-heavy workloads with caching
- Edge functions with local computation

## Screenshot

```
┌─────────────────────────────────────────────┐
│            📝 Notes                          │
│         Powered by WorkerSQL                 │
│            [+ New Note]                      │
├──────────┬──────────┬──────────┬────────────┤
│ 📌       │          │          │            │
│ Welcome! │ Shopping │ Ideas    │            │
│          │ List     │          │            │
│ This is  │ - Milk   │ Build    │            │
│ a notes  │ - Bread  │ something│            │
│ app...   │ - Eggs   │ awesome! │            │
└──────────┴──────────┴──────────┴────────────┘
```
