-- T001: books table (see specs/002-book-catalog-search/data-model.md)
-- Part of the constitution's public library surface (v1.3.0, Principle I item b):
-- unauthenticated book browse/search endpoints read from this table. No seed data in this
-- migration — a later feature owns backfilling real catalog data.
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT,
  description TEXT,
  quantity_total INTEGER NOT NULL CHECK (quantity_total >= 0),
  quantity_available INTEGER NOT NULL CHECK (quantity_available >= 0 AND quantity_available <= quantity_total),
  created_at TEXT NOT NULL
);

-- Speeds up the case-insensitive partial-match search on GET /books.
CREATE INDEX idx_books_title ON books (title COLLATE NOCASE);
CREATE INDEX idx_books_author ON books (author COLLATE NOCASE);
