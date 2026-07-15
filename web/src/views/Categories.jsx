import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../context.jsx';
import { Empty } from '../components/ui.jsx';

// Pastel presets echoing the design system's badge colors.
const PRESETS = ['#8b5cf6', '#3b82f6', '#fb923c', '#ec4899', '#34d399', '#f59e0b', '#ef4444', '#6b7280'];

export default function Categories() {
  const { categories, refreshCategories, showToast } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createCategory({ name, color });
      setName('');
      await refreshCategories();
      showToast('Category created');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function update(id, patch) {
    try {
      await api.updateCategory(id, patch);
      await refreshCategories();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function remove(id) {
    if (!confirm('Delete this category? Existing entries are kept but become uncategorized.')) return;
    try {
      await api.deleteCategory(id);
      await refreshCategories();
      showToast('Category deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Categories</h1>
        <p>Group your tracked time. Deleting a category keeps its entries — they simply become uncategorized.</p>
      </div>

      <div className="card-outline" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>New category</h3>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client work"
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <div>
            <label>Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <button className="btn btn-primary" onClick={create} disabled={busy} style={{ flex: '0 0 auto' }}>
            Add category
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <Empty>No categories yet.</Empty>
      ) : (
        <div className="grid grid-2">
          {categories.map((c) => (
            <div className="card-outline" key={c.id} style={{ opacity: c.archived ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ColorPicker value={c.color} onChange={(color) => update(c.id, { color })} compact />
                <input
                  className="input"
                  defaultValue={c.name}
                  onBlur={(e) => e.target.value !== c.name && update(c.id, { name: e.target.value })}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="icon-btn" onClick={() => update(c.id, { archived: !c.archived })}>
                  {c.archived ? 'Unarchive' : 'Archive'}
                </button>
                <button className="icon-btn danger" onClick={() => remove(c.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ColorPicker({ value, onChange, compact }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {PRESETS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          style={{
            width: compact ? 22 : 28,
            height: compact ? 22 : 28,
            borderRadius: '50%',
            background: c,
            border: value === c ? '2px solid var(--ink)' : '2px solid transparent',
            cursor: 'pointer',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}
