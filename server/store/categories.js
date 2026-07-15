import { badRequest, notFound } from '../errors.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = '#8b5cf6';

function normalizeName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw badRequest('Category name is required');
  if (trimmed.length > 60) throw badRequest('Category name is too long (max 60 characters)');
  return trimmed;
}

function normalizeColor(color) {
  if (color === undefined || color === null || color === '') return DEFAULT_COLOR;
  const value = String(color);
  if (!HEX_COLOR.test(value)) throw badRequest('Color must be a hex value like #8b5cf6');
  return value.toLowerCase();
}

export function listCategories(db, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived = 0';
  return db.all(
    `SELECT id, name, color, archived, created_at AS createdAt
       FROM categories ${where}
       ORDER BY archived ASC, name COLLATE NOCASE ASC`,
  );
}

export function getCategory(db, id) {
  const row = db.get(
    `SELECT id, name, color, archived, created_at AS createdAt FROM categories WHERE id = ?`,
    id,
  );
  if (!row) throw notFound('Category not found');
  return row;
}

export function createCategory(db, { name, color } = {}) {
  const cleanName = normalizeName(name);
  const cleanColor = normalizeColor(color);
  const info = db.run(
    `INSERT INTO categories (name, color, archived, created_at) VALUES (?, ?, 0, ?)`,
    cleanName,
    cleanColor,
    Date.now(),
  );
  return getCategory(db, Number(info.lastInsertRowid));
}

export function updateCategory(db, id, { name, color, archived } = {}) {
  const existing = getCategory(db, id);
  const cleanName = name === undefined ? existing.name : normalizeName(name);
  const cleanColor = color === undefined ? existing.color : normalizeColor(color);
  const cleanArchived =
    archived === undefined ? existing.archived : archived ? 1 : 0;
  db.run(
    `UPDATE categories SET name = ?, color = ?, archived = ? WHERE id = ?`,
    cleanName,
    cleanColor,
    cleanArchived,
    id,
  );
  return getCategory(db, id);
}

// Deleting a category leaves its time entries intact; their category_id is set
// to NULL by the foreign key rule, so no tracked time is ever lost.
export function deleteCategory(db, id) {
  getCategory(db, id);
  db.run(`DELETE FROM categories WHERE id = ?`, id);
}
