-- Add 'invoiced' status (for orders exported to Sage accounting) and invoiced_at column.
-- SQLite requires rebuilding the table to modify a CHECK constraint.

PRAGMA foreign_keys = OFF;

CREATE TABLE orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','quoted','accepted','ready','delivered','invoiced','cancelled')),
  fulfillment_method TEXT NOT NULL DEFAULT 'delivery'
    CHECK (fulfillment_method IN ('delivery','pickup')),
  requested_delivery_date TEXT,
  submitted_at TEXT,
  quoted_at TEXT,
  accepted_at TEXT,
  delivered_at TEXT,
  invoiced_at TEXT,
  acceptance_token TEXT UNIQUE,
  acceptance_token_expires_at TEXT,
  invoice_sent_at TEXT,
  quote_sent_at TEXT,
  ready_at TEXT,
  ready_notified_at TEXT,
  paid_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  due_date TEXT,
  returned_amount REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  gst REAL NOT NULL DEFAULT 0,
  qst REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO orders_new (
  id, client_id, order_number, status, fulfillment_method, requested_delivery_date,
  submitted_at, quoted_at, accepted_at, delivered_at, invoiced_at,
  acceptance_token, acceptance_token_expires_at, invoice_sent_at, quote_sent_at,
  ready_at, ready_notified_at, paid_amount, payment_status, due_date, returned_amount,
  subtotal, gst, qst, total, notes, created_at, updated_at
)
SELECT
  id, client_id, order_number, status, fulfillment_method, requested_delivery_date,
  submitted_at, quoted_at, accepted_at, delivered_at, NULL,
  acceptance_token, acceptance_token_expires_at, invoice_sent_at, quote_sent_at,
  ready_at, ready_notified_at, paid_amount, payment_status, due_date, returned_amount,
  subtotal, gst, qst, total, notes, created_at, updated_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

PRAGMA foreign_keys = ON;
