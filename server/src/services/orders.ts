import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { computeTaxes } from './taxes.js';

export function generateAcceptanceToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function nextOrderNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `DAC-${year}-`;
  const row = db
    .prepare(`SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`) as { order_number: string } | undefined;
  let next = 1;
  if (row) {
    const n = parseInt(row.order_number.slice(prefix.length), 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function resolveUnitPrice(clientId: number, productId: number): number | null {
  const client = db
    .prepare('SELECT pricing_mode, price_list_id FROM clients WHERE id = ?')
    .get(clientId) as { pricing_mode: string; price_list_id: number | null } | undefined;
  if (!client || client.pricing_mode === 'quote' || !client.price_list_id) return null;
  const price = db
    .prepare('SELECT price FROM product_prices WHERE price_list_id = ? AND product_id = ?')
    .get(client.price_list_id, productId) as { price: number } | undefined;
  return price?.price ?? null;
}

export function recomputeOrderTotals(orderId: number) {
  const items = db
    .prepare('SELECT line_total, taxable_snapshot FROM order_items WHERE order_id = ?')
    .all(orderId) as Array<{ line_total: number; taxable_snapshot: number }>;
  const exempt = db
    .prepare(
      `SELECT c.tax_exempt FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
    )
    .get(orderId) as { tax_exempt: number } | undefined;
  const { subtotal, gst, qst, total } = computeTaxes(
    items.map((i) => ({ line_total: i.line_total, taxable: !!i.taxable_snapshot })),
    { exempt: !!exempt?.tax_exempt },
  );
  db.prepare('UPDATE orders SET subtotal=?, gst=?, qst=?, total=?, updated_at=datetime(\'now\') WHERE id=?').run(
    subtotal,
    gst,
    qst,
    total,
    orderId,
  );
  return { subtotal, gst, qst, total };
}

export function recomputeLineTotal(orderItemId: number) {
  const it = db
    .prepare(
      'SELECT quantity_requested, quantity_confirmed, unit_price_snapshot FROM order_items WHERE id = ?',
    )
    .get(orderItemId) as
    | { quantity_requested: number; quantity_confirmed: number | null; unit_price_snapshot: number | null }
    | undefined;
  if (!it) return;
  const qty = it.quantity_confirmed ?? it.quantity_requested;
  const price = it.unit_price_snapshot ?? 0;
  const lineTotal = Math.round(qty * price * 100) / 100;
  db.prepare('UPDATE order_items SET line_total = ? WHERE id = ?').run(lineTotal, orderItemId);
}

export function getOrCreateDraftCart(clientId: number): number {
  const existing = db
    .prepare("SELECT id FROM orders WHERE client_id = ? AND status = 'draft'")
    .get(clientId) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare("INSERT INTO orders (client_id, status) VALUES (?, 'draft')").run(clientId);
  return Number(result.lastInsertRowid);
}
