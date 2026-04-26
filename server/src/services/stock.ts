import { db } from '../db/index.js';

export function availableStock(productId: number, excludeOrderId?: number): number {
  const sql = `SELECT
       p.stock_qty -
       COALESCE((
         SELECT SUM(oi.quantity_requested)
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = p.id
           AND o.status IN ('submitted','quoted')
           ${excludeOrderId != null ? 'AND o.id != ?' : ''}
       ), 0) AS available
     FROM products p WHERE p.id = ?`;
  const params = excludeOrderId != null ? [excludeOrderId, productId] : [productId];
  const row = db.prepare(sql).get(...params) as { available: number } | undefined;
  return row?.available ?? 0;
}

export function recordMovement(args: {
  product_id: number;
  delta: number;
  reason: string;
  note?: string | null;
  order_id?: number | null;
  user_id?: number | null;
}) {
  db.prepare(
    `INSERT INTO stock_movements (product_id, delta, reason, note, order_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    args.product_id,
    args.delta,
    args.reason,
    args.note ?? null,
    args.order_id ?? null,
    args.user_id ?? null,
  );
  db.prepare('UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    args.delta,
    args.product_id,
  );
}
