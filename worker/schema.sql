-- QLBH - D1 Database Schema
-- Run: wrangler d1 execute qlbh-db --file=schema.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  store_name TEXT DEFAULT 'Cửa hàng',
  script_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  cost REAL DEFAULT 0,
  price REAL DEFAULT 0,
  profit REAL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  category TEXT DEFAULT 'Chung',
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sale_id TEXT NOT NULL,
  datetime TEXT NOT NULL,
  details TEXT,
  total REAL DEFAULT 0,
  profit REAL DEFAULT 0,
  note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_user_date ON sales(user_id, datetime);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tx_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  description TEXT,
  amount REAL DEFAULT 0,
  note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

-- Debts
CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  debt_id TEXT NOT NULL,
  sale_id TEXT,
  customer_name TEXT,
  phone TEXT,
  total REAL DEFAULT 0,
  paid REAL DEFAULT 0,
  remaining REAL DEFAULT 0,
  status TEXT DEFAULT 'Còn nợ',
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);

-- Settings (key-value per user)
CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
