'use client';

import { useState, useEffect } from 'react';

const COLORS = ['yellow', 'blue', 'green', 'purple', 'pink', 'orange'];

export default function NotesApp() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', content: '', color: 'yellow' });

  useEffect(() => {
    fetchNotes();
  }, []);

  async function fetchNotes() {
    try {
      const res = await fetch('/api/notes');
      const data = await res.json();
      setNotes(data.notes || []);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createNote(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setFormData({ title: '', content: '', color: 'yellow' });
        setShowForm(false);
        fetchNotes();
      }
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }

  async function updateNote(id, updates) {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setEditingId(null);
        fetchNotes();
      }
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  }

  async function deleteNote(id) {
    if (!confirm('Delete this note?')) return;
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchNotes();
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }

  async function togglePin(note) {
    await updateNote(note.id, { pinned: !note.pinned });
  }

  return (
    <div style={styles.container}>
      <style>{globalStyles}</style>

      <header style={styles.header}>
        <h1 style={styles.title}>📝 Notes</h1>
        <p style={styles.subtitle}>Powered by WorkerSQL</p>
        <button style={styles.addButton} onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Note'}
        </button>
      </header>

      {showForm && (
        <form onSubmit={createNote} style={styles.form}>
          <input
            type="text"
            placeholder="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            style={styles.input}
            required
          />
          <textarea
            placeholder="Content"
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            style={styles.textarea}
            rows={4}
          />
          <div style={styles.colorPicker}>
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setFormData({ ...formData, color })}
                style={{
                  ...styles.colorButton,
                  backgroundColor: getColor(color),
                  border: formData.color === color ? '3px solid #333' : '3px solid transparent',
                }}
              />
            ))}
          </div>
          <button type="submit" style={styles.submitButton}>Create Note</button>
        </form>
      )}

      {loading ? (
        <p style={styles.loading}>Loading notes...</p>
      ) : notes.length === 0 ? (
        <p style={styles.empty}>No notes yet. Create one!</p>
      ) : (
        <div style={styles.grid}>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isEditing={editingId === note.id}
              onEdit={() => setEditingId(note.id)}
              onSave={(updates) => updateNote(note.id, updates)}
              onCancel={() => setEditingId(null)}
              onDelete={() => deleteNote(note.id)}
              onTogglePin={() => togglePin(note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, isEditing, onEdit, onSave, onCancel, onDelete, onTogglePin }) {
  const [editData, setEditData] = useState({ title: note.title, content: note.content, color: note.color });

  useEffect(() => {
    setEditData({ title: note.title, content: note.content, color: note.color });
  }, [note]);

  function handleSave(e) {
    e.preventDefault();
    onSave(editData);
  }

  return (
    <div style={{ ...styles.card, backgroundColor: getColor(note.color) }}>
      {note.pinned ? <span style={styles.pin}>📌</span> : null}

      {isEditing ? (
        <form onSubmit={handleSave}>
          <input
            type="text"
            value={editData.title}
            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
            style={styles.editInput}
          />
          <textarea
            value={editData.content}
            onChange={(e) => setEditData({ ...editData, content: e.target.value })}
            style={styles.editTextarea}
            rows={4}
          />
          <div style={styles.colorPicker}>
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setEditData({ ...editData, color })}
                style={{
                  ...styles.colorButtonSmall,
                  backgroundColor: getColor(color),
                  border: editData.color === color ? '2px solid #333' : '2px solid transparent',
                }}
              />
            ))}
          </div>
          <div style={styles.editActions}>
            <button type="submit" style={styles.saveButton}>Save</button>
            <button type="button" onClick={onCancel} style={styles.cancelButton}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <h3 style={styles.cardTitle}>{note.title}</h3>
          <p style={styles.cardContent}>{note.content || '(no content)'}</p>
          <div style={styles.cardMeta}>
            {note.created_at && (
              <span style={styles.date}>
                {new Date(note.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <div style={styles.cardActions}>
            <button onClick={onTogglePin} style={styles.iconButton} title={note.pinned ? 'Unpin' : 'Pin'}>
              {note.pinned ? '📌' : '📍'}
            </button>
            <button onClick={onEdit} style={styles.iconButton} title="Edit">✏️</button>
            <button onClick={onDelete} style={styles.iconButton} title="Delete">🗑️</button>
          </div>
        </>
      )}
    </div>
  );
}

function getColor(name) {
  const colors = {
    yellow: '#fff9c4',
    blue: '#bbdefb',
    green: '#c8e6c9',
    purple: '#e1bee7',
    pink: '#f8bbd9',
    orange: '#ffe0b2',
  };
  return colors[name] || colors.yellow;
}

const globalStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
`;

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '2.5rem',
    color: '#333',
    marginBottom: '5px',
  },
  subtitle: {
    color: '#666',
    marginBottom: '20px',
  },
  addButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  form: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '30px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '10px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '10px',
    resize: 'vertical',
  },
  colorPicker: {
    display: 'flex',
    gap: '8px',
    marginBottom: '15px',
  },
  colorButton: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    cursor: 'pointer',
  },
  colorButtonSmall: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    cursor: 'pointer',
  },
  submitButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    padding: '40px',
  },
  empty: {
    textAlign: 'center',
    color: '#666',
    padding: '40px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
  card: {
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    position: 'relative',
    minHeight: '150px',
  },
  pin: {
    position: 'absolute',
    top: '10px',
    right: '10px',
  },
  cardTitle: {
    fontSize: '1.2rem',
    marginBottom: '10px',
    color: '#333',
  },
  cardContent: {
    color: '#555',
    whiteSpace: 'pre-wrap',
    marginBottom: '15px',
  },
  cardMeta: {
    marginTop: 'auto',
  },
  date: {
    fontSize: '0.8rem',
    color: '#888',
  },
  cardActions: {
    display: 'flex',
    gap: '5px',
    marginTop: '10px',
  },
  iconButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '5px',
    opacity: 0.7,
  },
  editInput: {
    width: '100%',
    padding: '8px',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
    marginBottom: '8px',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  editTextarea: {
    width: '100%',
    padding: '8px',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
    marginBottom: '8px',
    resize: 'vertical',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  editActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
  },
  saveButton: {
    padding: '6px 16px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '6px 16px',
    backgroundColor: '#999',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
