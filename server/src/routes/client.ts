import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { availableStock } from '../services/stock.js';
import {
  getOrCreateDraftCart,
  nextOrderNumber,
  recomputeOrderTotals,
  resolveUnitPrice,
} from '../services/orders.js';
import { publishAdminEvent } from '../services/eventBus.js';
import { audit } from '../services/audit.js';

const router = Router();

function requireClientContext(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (req.user.must_change_password) return res.status(403).json({ error: 'must_change_password' });

  if (req.user.role === 'admin') {
    const raw = req.headers['x-acting-as-client-id'];
    const asId = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isFinite(asId) || asId <= 0) return res.status(400).json({ error: 'missing_acting_client' });
    const exists = db.prepare('SELECT 1 FROM clients WHERE id = ?').get(asId);
    if (!exists) return res.status(404).json({ error: 'client_not_found' });
    (req as any).actingClientId = asId;
    (req as any).isAdminActing = true;
    // Audit impersonation only on state-changing operations
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      audit(req, 'impersonate_action', 'client', asId, { method: req.method, path: req.path });
    }
    return next();
  }

  if (req.user.role === 'client' && req.user.client_id) {
    (req as any).actingClientId = req.user.client_id;
    (req as any).isAdminActing = false;
    return next();
  }
  return res.status(403).json({ error: 'forbidden' });
}

router.use(requireClientContext);

function currentClient(req: Request): number {
  return (req as any).actingClientId as number;
}

/* -------------------- CATALOG -------------------- */
router.get('/products', (req, res) => {
  const clientId = currentClient(req);
  const client = db
    .prepare('SELECT pricing_mode, price_list_id, min_order_amount FROM clients WHERE id = ?')
    .get(clientId) as { pricing_mode: string; price_list_id: number | null; min_order_amount: number | null };
  const quoteMode = client.pricing_mode === 'quote' || !client.price_list_id;

  const rows = db
    .prepare(
      `SELECT p.id, p.code, p.category_id, p.name_fr, p.name_en, p.description_fr, p.description_en,
              p.unit, p.stock_qty, p.low_stock_threshold, p.cut_grade, p.variable_weight, p.taxable,
              p.image_path, p.lot_number, p.packed_at, p.expires_at,
              c.name_fr AS category_name_fr, c.name_en AS category_name_en,
              COALESCE(pp.price, NULL) AS price,
              p.stock_qty - COALESCE((
                SELECT SUM(oi.quantity_requested) FROM order_items oi
                JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('submitted','quoted')
              ), 0) AS available
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.price_list_id = ?
       WHERE p.active = 1 ORDER BY c.sort_order, p.name_fr`,
    )
    .all(client.price_list_id ?? -1) as any[];

  const products = rows.map((r) => ({
    ...r,
    price: quoteMode ? null : r.price,
    quote_mode: quoteMode,
  }));
  res.json({ products, client: { ...client, quote_mode: quoteMode } });
});

router.get('/categories', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order, name_fr').all());
});

/* -------------------- CART -------------------- */
router.get('/cart', (req, res) => {
  const clientId = currentClient(req);
  const orderId = getOrCreateDraftCart(clientId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const items = db
    .prepare(
      `SELECT oi.*, p.image_path FROM order_items oi
       JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id`,
    )
    .all(orderId);
  res.json({ order, items });
});

router.post('/cart/items', (req, res) => {
  const clientId = currentClient(req);
  const p = z
    .object({ product_id: z.number().int(), quantity: z.number().positive() })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });

  const orderId = getOrCreateDraftCart(clientId);
  const product = db
    .prepare('SELECT id, name_fr, unit, taxable, variable_weight, active FROM products WHERE id = ?')
    .get(p.data.product_id) as any;
  if (!product || !product.active) return res.status(404).json({ error: 'product_not_found' });

  const unitPrice = resolveUnitPrice(clientId, p.data.product_id);
  const existing = db
    .prepare('SELECT id, quantity_requested FROM order_items WHERE order_id = ? AND product_id = ?')
    .get(orderId, p.data.product_id) as { id: number; quantity_requested: number } | undefined;

  const tx = db.transaction(() => {
    if (existing) {
      const newQty = existing.quantity_requested + p.data.quantity;
      const lineTotal = unitPrice != null ? Math.round(newQty * unitPrice * 100) / 100 : 0;
      db.prepare(
        'UPDATE order_items SET quantity_requested = ?, line_total = ?, unit_price_snapshot = ? WHERE id = ?',
      ).run(newQty, lineTotal, unitPrice, existing.id);
    } else {
      const lineTotal = unitPrice != null ? Math.round(p.data.quantity * unitPrice * 100) / 100 : 0;
      db.prepare(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, unit_snapshot,
           taxable_snapshot, variable_weight_snapshot, quantity_requested, unit_price_snapshot, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        orderId,
        product.id,
        product.name_fr,
        product.unit,
        product.taxable,
        product.variable_weight,
        p.data.quantity,
        unitPrice,
        lineTotal,
      );
    }
    recomputeOrderTotals(orderId);
  });
  tx();
  res.json({ ok: true });
});

router.patch('/cart/items/:id', (req, res) => {
  const clientId = currentClient(req);
  const p = z.object({ quantity: z.number().positive() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const row = db
    .prepare(
      `SELECT oi.*, o.client_id, o.status FROM order_items oi
       JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?`,
    )
    .get(req.params.id) as any;
  if (!row || row.client_id !== clientId || row.status !== 'draft')
    return res.status(404).json({ error: 'not_found' });
  const tx = db.transaction(() => {
    const lineTotal =
      row.unit_price_snapshot != null
        ? Math.round(p.data.quantity * row.unit_price_snapshot * 100) / 100
        : 0;
    db.prepare('UPDATE order_items SET quantity_requested = ?, line_total = ? WHERE id = ?').run(
      p.data.quantity,
      lineTotal,
      row.id,
    );
    recomputeOrderTotals(row.order_id);
  });
  tx();
  res.json({ ok: true });
});

router.delete('/cart/items/:id', (req, res) => {
  const clientId = currentClient(req);
  const row = db
    .prepare(
      `SELECT oi.id, oi.order_id, o.client_id, o.status FROM order_items oi
       JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?`,
    )
    .get(req.params.id) as any;
  if (!row || row.client_id !== clientId || row.status !== 'draft')
    return res.status(404).json({ error: 'not_found' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_items WHERE id = ?').run(row.id);
    recomputeOrderTotals(row.order_id);
  });
  tx();
  res.json({ ok: true });
});

router.post('/cart/submit', (req, res) => {
  const clientId = currentClient(req);
  const p = z
    .object({
      requested_delivery_date: z.string().optional(),
      fulfillment_method: z.enum(['delivery', 'pickup']).default('delivery'),
      notes: z.string().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });

  const orderId = getOrCreateDraftCart(clientId);
  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(orderId) as any[];
  if (items.length === 0) return res.status(400).json({ error: 'empty_cart' });

  for (const it of items) {
    const avail = availableStock(it.product_id);
    if (avail < it.quantity_requested) {
      return res.status(400).json({
        error: 'insufficient_stock',
        product_id: it.product_id,
        available: avail,
        requested: it.quantity_requested,
      });
    }
  }

  const client = db
    .prepare('SELECT min_order_amount FROM clients WHERE id = ?')
    .get(clientId) as { min_order_amount: number | null };
  const totals = recomputeOrderTotals(orderId);
  // Minimum order amount only applies to deliveries, not pickup
  if (
    p.data.fulfillment_method === 'delivery' &&
    client.min_order_amount != null &&
    totals.subtotal < client.min_order_amount
  ) {
    return res.status(400).json({
      error: 'min_order_not_met',
      minimum: client.min_order_amount,
      subtotal: totals.subtotal,
    });
  }

  const orderNumber = nextOrderNumber();
  db.prepare(
    `UPDATE orders SET status='submitted', submitted_at=datetime('now'),
       requested_delivery_date=?, fulfillment_method=?, notes=?, order_number=?, updated_at=datetime('now') WHERE id=?`,
  ).run(
    p.data.requested_delivery_date ?? null,
    p.data.fulfillment_method,
    p.data.notes ?? null,
    orderNumber,
    orderId,
  );

  const company = db.prepare('SELECT company_name FROM clients WHERE id = ?').get(clientId) as { company_name: string } | undefined;
  publishAdminEvent({
    type: 'order_submitted',
    order_id: orderId,
    order_number: orderNumber,
    company_name: company?.company_name ?? '',
    total: totals.total,
    fulfillment_method: p.data.fulfillment_method,
  });

  res.json({ ok: true, order_id: orderId, order_number: orderNumber });
});

/* -------------------- ORDERS HISTORY -------------------- */
router.get('/orders', (req, res) => {
  const clientId = currentClient(req);
  const rows = db
    .prepare(
      `SELECT * FROM orders WHERE client_id = ? AND status != 'draft'
       ORDER BY submitted_at DESC, id DESC`,
    )
    .all(clientId);
  res.json(rows);
});

router.get('/orders/:id', (req, res) => {
  const clientId = currentClient(req);
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND client_id = ?').get(req.params.id, clientId);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ ...order, items });
});

/* -------------------- PROFILE -------------------- */
router.get('/profile', (req, res) => {
  const clientId = currentClient(req);
  const client = db
    .prepare(
      `SELECT c.id, c.company_name, c.contact_name, c.phone, c.email, c.delivery_address, c.notes,
              c.pricing_mode, c.price_list_id, c.min_order_amount, u.username
       FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    )
    .get(clientId);
  res.json(client);
});

router.patch('/profile', (req, res) => {
  const clientId = currentClient(req);
  if ((req as any).isAdminActing) return res.status(403).json({ error: 'admin_impersonating' });
  const p = z
    .object({
      contact_name: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal('')),
      delivery_address: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const d = p.data;
  const fields: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    vals.push(v === '' ? null : v);
  }
  if (!fields.length) return res.json({ ok: true });
  vals.push(clientId);
  db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

/* -------------------- FAVORITES -------------------- */
router.get('/favorites', (req, res) => {
  const clientId = currentClient(req);
  const rows = db
    .prepare(
      `SELECT f.product_id, p.code, p.name_fr, p.name_en, p.unit, p.image_path, p.active
       FROM client_favorites f JOIN products p ON p.id = f.product_id
       WHERE f.client_id = ? AND p.active = 1 ORDER BY p.name_fr`,
    )
    .all(clientId);
  res.json(rows);
});

router.post('/favorites/:productId', (req, res) => {
  const clientId = currentClient(req);
  db.prepare('INSERT OR IGNORE INTO client_favorites (client_id, product_id) VALUES (?, ?)').run(
    clientId,
    Number(req.params.productId),
  );
  res.json({ ok: true });
});

router.delete('/favorites/:productId', (req, res) => {
  const clientId = currentClient(req);
  db.prepare('DELETE FROM client_favorites WHERE client_id = ? AND product_id = ?').run(
    clientId,
    Number(req.params.productId),
  );
  res.json({ ok: true });
});

/* -------------------- ORDER TEMPLATES -------------------- */
router.get('/templates', (req, res) => {
  const clientId = currentClient(req);
  const rows = db
    .prepare('SELECT id, name, fulfillment_method, notes, created_at, items_json FROM order_templates WHERE client_id = ? ORDER BY created_at DESC')
    .all(clientId) as any[];
  for (const r of rows) {
    try { r.items = r.items_json ? JSON.parse(r.items_json) : []; } catch { r.items = []; }
    delete r.items_json;
  }
  res.json(rows);
});

router.post('/templates', (req, res) => {
  const clientId = currentClient(req);
  const p = z
    .object({
      name: z.string().min(1),
      fulfillment_method: z.enum(['delivery', 'pickup']).default('delivery'),
      notes: z.string().optional(),
      from_order_id: z.number().int().optional(),
      items: z.array(z.object({ product_id: z.number().int(), quantity: z.number().positive() })).optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });

  let items: Array<{ product_id: number; quantity: number }> = p.data.items ?? [];
  if (p.data.from_order_id) {
    const sourceItems = db
      .prepare(
        `SELECT oi.product_id, oi.quantity_requested AS quantity FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.id = ? AND o.client_id = ?`,
      )
      .all(p.data.from_order_id, clientId) as Array<{ product_id: number; quantity: number }>;
    items = sourceItems;
  }
  if (!items.length) return res.status(400).json({ error: 'no_items' });

  const r = db
    .prepare(
      'INSERT INTO order_templates (client_id, name, items_json, fulfillment_method, notes) VALUES (?, ?, ?, ?, ?)',
    )
    .run(clientId, p.data.name, JSON.stringify(items), p.data.fulfillment_method, p.data.notes ?? null);
  res.json({ ok: true, id: r.lastInsertRowid });
});

router.delete('/templates/:id', (req, res) => {
  const clientId = currentClient(req);
  db.prepare('DELETE FROM order_templates WHERE id = ? AND client_id = ?').run(req.params.id, clientId);
  res.json({ ok: true });
});

router.post('/templates/:id/apply', (req, res) => {
  const clientId = currentClient(req);
  const tpl = db
    .prepare('SELECT items_json, fulfillment_method FROM order_templates WHERE id = ? AND client_id = ?')
    .get(req.params.id, clientId) as { items_json: string; fulfillment_method: string } | undefined;
  if (!tpl) return res.status(404).json({ error: 'not_found' });

  let items: Array<{ product_id: number; quantity: number }>;
  try {
    items = JSON.parse(tpl.items_json);
  } catch {
    return res.status(500).json({ error: 'corrupted_template' });
  }
  const draftId = getOrCreateDraftCart(clientId);
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(draftId);
  for (const it of items) {
    const product = db
      .prepare('SELECT id, name_fr, unit, taxable, variable_weight, active FROM products WHERE id = ?')
      .get(it.product_id) as any;
    if (!product || !product.active) continue;
    const unitPrice = resolveUnitPrice(clientId, it.product_id);
    const lineTotal = unitPrice != null ? Math.round(it.quantity * unitPrice * 100) / 100 : 0;
    db.prepare(
      `INSERT INTO order_items (order_id, product_id, product_name_snapshot, unit_snapshot, taxable_snapshot,
         variable_weight_snapshot, quantity_requested, unit_price_snapshot, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      draftId,
      product.id,
      product.name_fr,
      product.unit,
      product.taxable,
      product.variable_weight,
      it.quantity,
      unitPrice,
      lineTotal,
    );
  }
  recomputeOrderTotals(draftId);
  res.json({ ok: true, draft_id: draftId, applied: items.length });
});

/* -------------------- REORDER -------------------- */
router.post('/orders/:id/reorder', (req, res) => {
  const clientId = currentClient(req);
  const source = db
    .prepare('SELECT id FROM orders WHERE id = ? AND client_id = ?')
    .get(req.params.id, clientId) as { id: number } | undefined;
  if (!source) return res.status(404).json({ error: 'not_found' });

  const items = db
    .prepare(
      `SELECT oi.product_id, oi.quantity_requested, p.active FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? AND p.active = 1`,
    )
    .all(source.id) as Array<{ product_id: number; quantity_requested: number }>;

  if (!items.length) return res.status(400).json({ error: 'no_available_items' });

  const draftId = getOrCreateDraftCart(clientId);
  // Clear existing draft to replace with reorder
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(draftId);

  for (const it of items) {
    const product = db
      .prepare('SELECT id, name_fr, unit, taxable, variable_weight FROM products WHERE id = ?')
      .get(it.product_id) as any;
    if (!product) continue;
    const unitPrice = resolveUnitPrice(clientId, it.product_id);
    const lineTotal = unitPrice != null ? Math.round(it.quantity_requested * unitPrice * 100) / 100 : 0;
    db.prepare(
      `INSERT INTO order_items (order_id, product_id, product_name_snapshot, unit_snapshot, taxable_snapshot,
         variable_weight_snapshot, quantity_requested, unit_price_snapshot, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      draftId,
      product.id,
      product.name_fr,
      product.unit,
      product.taxable,
      product.variable_weight,
      it.quantity_requested,
      unitPrice,
      lineTotal,
    );
  }
  recomputeOrderTotals(draftId);
  res.json({ ok: true, draft_id: draftId, items: items.length });
});

export default router;
