import { Router } from 'express';
import { db } from '../db/index.js';
import { availableStock, recordMovement } from '../services/stock.js';
import { streamPdf } from '../services/pdf.js';
import { audit } from '../services/audit.js';

const router = Router();

function loadByToken(token: string): any {
  return db
    .prepare(
      `SELECT o.*, c.company_name, c.contact_name, c.delivery_address, c.phone, c.email FROM orders o
       JOIN clients c ON c.id = o.client_id WHERE o.acceptance_token = ?`,
    )
    .get(token);
}

function tokenExpired(order: any): boolean {
  if (!order?.acceptance_token_expires_at) return false;
  return new Date(order.acceptance_token_expires_at).getTime() < Date.now();
}

// Get order by acceptance token (for public view + accept page)
router.get('/accept/:token', (req, res) => {
  const order = loadByToken(req.params.token);
  if (!order) return res.status(404).json({ error: 'invalid_token' });
  if (tokenExpired(order) && order.status === 'quoted') return res.status(410).json({ error: 'token_expired' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const { acceptance_token, ...safe } = order;
  res.json({ ...safe, items });
});

// Download the bon de commande PDF by acceptance token
router.get('/accept/:token/pdf', (req, res) => {
  const order = loadByToken(req.params.token);
  if (!order) return res.status(404).json({ error: 'invalid_token' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="bon-de-commande-${order.order_number ?? order.id}.pdf"`);
  streamPdf('bon', order.id, res);
});

// Accept the order (transition quoted -> accepted, decrement stock)
router.post('/accept/:token', (req, res) => {
  const order = loadByToken(req.params.token);
  if (!order) return res.status(404).json({ error: 'invalid_token' });
  if (order.status === 'accepted') return res.json({ ok: true, already: true });
  if (order.status !== 'quoted') return res.status(400).json({ error: 'invalid_state' });
  if (tokenExpired(order)) return res.status(410).json({ error: 'token_expired' });

  const items = db
    .prepare('SELECT id, product_id, quantity_requested, quantity_confirmed FROM order_items WHERE order_id = ?')
    .all(order.id) as Array<{ id: number; product_id: number; quantity_requested: number; quantity_confirmed: number | null }>;

  // Verify stock still available (excluding this order's own reservation)
  for (const it of items) {
    const qty = it.quantity_confirmed ?? it.quantity_requested;
    const avail = availableStock(it.product_id, order.id);
    if (avail < qty) {
      return res.status(400).json({
        error: 'insufficient_stock',
        product_id: it.product_id,
        available: avail,
        requested: qty,
      });
    }
  }

  const tx = db.transaction(() => {
    for (const it of items) {
      const qty = it.quantity_confirmed ?? it.quantity_requested;
      recordMovement({
        product_id: it.product_id,
        delta: -qty,
        reason: 'order_confirm',
        order_id: order.id,
        user_id: null,
        note: 'client acceptance',
      });
    }
    db.prepare(
      `UPDATE orders SET status='accepted', accepted_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    ).run(order.id);
  });
  tx();
  audit(req, 'accept_public', 'order', order.id, { order_number: order.order_number });
  res.json({ ok: true });
});

// Decline
router.post('/accept/:token/decline', (req, res) => {
  const order = loadByToken(req.params.token);
  if (!order) return res.status(404).json({ error: 'invalid_token' });
  if (order.status === 'cancelled') return res.json({ ok: true, already: true });
  if (order.status !== 'quoted' && order.status !== 'submitted')
    return res.status(400).json({ error: 'invalid_state' });
  db.prepare(`UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(order.id);
  audit(req, 'decline_public', 'order', order.id, { order_number: order.order_number });
  res.json({ ok: true });
});

export default router;
