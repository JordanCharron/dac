import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import env from '../lib/env.js';
import { availableStock, recordMovement } from '../services/stock.js';
import {
  nextOrderNumber,
  recomputeLineTotal,
  recomputeOrderTotals,
  generateAcceptanceToken,
} from '../services/orders.js';
import { streamPdf, renderBonDeCommandeSync, renderFactureSync } from '../services/pdf.js';
import { sendMail } from '../services/mail.js';
import { quoteEmail, invoiceEmail, readyEmail } from '../services/emailTemplates.js';
import { audit } from '../services/audit.js';
import { processUploadedImage } from '../services/images.js';
import { publishAdminEvent, addAdminSubscriber } from '../services/eventBus.js';
(globalThis as any).__dac_addSub = addAdminSubscriber;

const router = Router();
router.use(requireAuth('admin'));

const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return cb(new Error('bad_type'));
    cb(null, true);
  },
});

/* -------------------- AUDIT LOG -------------------- */
router.get('/audit', (req, res) => {
  const { entity, user_id, q, limit } = req.query as Record<string, string>;
  const where: string[] = [];
  const vals: any[] = [];
  if (entity) { where.push('a.entity = ?'); vals.push(entity); }
  if (user_id) { where.push('a.user_id = ?'); vals.push(user_id); }
  if (q) { where.push('(a.action LIKE ? OR a.entity LIKE ? OR u.username LIKE ?)'); vals.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `SELECT a.*, u.username FROM audit_log a
               LEFT JOIN users u ON u.id = a.user_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY a.id DESC LIMIT ?`;
  vals.push(Math.min(Number(limit) || 200, 1000));
  res.json(db.prepare(sql).all(...vals));
});

/* -------------------- REAL-TIME EVENT STREAM -------------------- */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`event: hello\ndata: {"ok":true}\n\n`);
  const unsubscribe = (globalThis as any).__dac_addSub?.(res, req.user!.id) ?? (() => {});
  const hb = setInterval(() => res.write(`: ping\n\n`), 25_000);
  req.on('close', () => {
    clearInterval(hb);
    unsubscribe();
  });
});

/* -------------------- DASHBOARD -------------------- */
router.get('/dashboard/metrics', (req, res) => {
  const days = Math.max(1, Math.min(180, Number((req.query.days as string) || 30)));
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const revenueByDay = db
    .prepare(
      `SELECT substr(delivered_at,1,10) AS day, SUM(total) AS revenue, COUNT(*) AS orders
       FROM orders WHERE status='delivered' AND delivered_at >= ?
       GROUP BY day ORDER BY day`,
    )
    .all(since);

  const topClients = db
    .prepare(
      `SELECT c.id, c.company_name, SUM(o.total) AS revenue, COUNT(o.id) AS orders
       FROM orders o JOIN clients c ON c.id = o.client_id
       WHERE o.status IN ('accepted','delivered') AND COALESCE(o.delivered_at, o.accepted_at) >= ?
       GROUP BY c.id ORDER BY revenue DESC LIMIT 10`,
    )
    .all(since);

  const topProducts = db
    .prepare(
      `SELECT p.id, p.name_fr, p.name_en, SUM(oi.line_total) AS revenue,
              SUM(COALESCE(oi.quantity_confirmed, oi.quantity_requested)) AS qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.status IN ('accepted','delivered') AND COALESCE(o.delivered_at, o.accepted_at) >= ?
       GROUP BY p.id ORDER BY revenue DESC LIMIT 10`,
    )
    .all(since);

  const summary = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE status IN ('submitted','quoted')) AS open_orders,
         (SELECT SUM(total) FROM orders WHERE status='delivered' AND delivered_at >= ?) AS revenue_period,
         (SELECT AVG(total) FROM orders WHERE status='delivered' AND delivered_at >= ?) AS avg_basket,
         (SELECT COUNT(DISTINCT client_id) FROM orders WHERE status='delivered' AND delivered_at >= ?) AS active_clients,
         (SELECT COUNT(*) FROM orders WHERE status='quoted') AS awaiting_acceptance`,
    )
    .get(since, since, since);

  res.json({ since, days, revenueByDay, topClients, topProducts, summary });
});

router.get('/dashboard', (_req, res) => {
  const lowStock = db
    .prepare(
      `SELECT id, code, name_fr, name_en, unit, stock_qty, low_stock_threshold
       FROM products WHERE active = 1 AND stock_qty <= low_stock_threshold
       ORDER BY (stock_qty - low_stock_threshold) ASC LIMIT 20`,
    )
    .all();
  const pendingCount = (db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'submitted'`).get() as { n: number }).n;
  const expiringSoon = db
    .prepare(
      `SELECT id, code, name_fr, name_en, expires_at
       FROM products WHERE active = 1 AND expires_at IS NOT NULL AND date(expires_at) <= date('now','+7 day')
       ORDER BY expires_at ASC LIMIT 20`,
    )
    .all();
  const recentMovements = db
    .prepare(
      `SELECT sm.*, p.name_fr AS product_name
       FROM stock_movements sm JOIN products p ON p.id = sm.product_id
       ORDER BY sm.id DESC LIMIT 10`,
    )
    .all();
  const pendingOrders = db
    .prepare(
      `SELECT o.id, o.order_number, o.submitted_at, o.total, c.company_name
       FROM orders o JOIN clients c ON c.id = o.client_id
       WHERE o.status = 'submitted' ORDER BY o.submitted_at ASC LIMIT 10`,
    )
    .all();
  res.json({ lowStock, pendingCount, expiringSoon, recentMovements, pendingOrders });
});

/* -------------------- CATEGORIES -------------------- */
router.get('/categories', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order, name_fr').all());
});
router.post('/categories', (req, res) => {
  const p = z.object({ name_fr: z.string().min(1), name_en: z.string().min(1), sort_order: z.number().int().default(0) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const r = db
    .prepare('INSERT INTO categories (name_fr, name_en, sort_order) VALUES (?, ?, ?)')
    .run(p.data.name_fr, p.data.name_en, p.data.sort_order);
  res.json({ id: r.lastInsertRowid });
});
router.patch('/categories/:id', (req, res) => {
  const p = z.object({ name_fr: z.string().optional(), name_en: z.string().optional(), sort_order: z.number().int().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const fields: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(p.data)) { fields.push(`${k} = ?`); vals.push(v); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});
router.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* -------------------- PRODUCTS -------------------- */
router.get('/products', (req, res) => {
  const { category_id, q, low_stock, include_inactive } = req.query as Record<string, string>;
  const where: string[] = [];
  const vals: any[] = [];
  if (!include_inactive) where.push('p.active = 1');
  if (category_id) { where.push('p.category_id = ?'); vals.push(category_id); }
  if (q) { where.push('(p.name_fr LIKE ? OR p.name_en LIKE ? OR p.code LIKE ?)'); vals.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (low_stock === '1') where.push('p.stock_qty <= p.low_stock_threshold');
  const sql = `SELECT p.*, c.name_fr AS category_name_fr, c.name_en AS category_name_en
               FROM products p LEFT JOIN categories c ON c.id = p.category_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY p.name_fr`;
  res.json(db.prepare(sql).all(...vals));
});

router.get('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : /^(true|1|on|yes)$/i.test(v)));

const productSchema = z.object({
  code: z.string().min(1),
  category_id: z.coerce.number().int().nullable().optional(),
  name_fr: z.string().min(1),
  name_en: z.string().min(1),
  description_fr: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  unit: z.enum(['kg', 'caisse', 'unite']),
  stock_qty: z.coerce.number().nonnegative().default(0),
  low_stock_threshold: z.coerce.number().nonnegative().default(0),
  cut_grade: z.string().nullable().optional(),
  variable_weight: boolish.default(false),
  taxable: boolish.default(false),
  supplier: z.string().nullable().optional(),
  lot_number: z.string().nullable().optional(),
  packed_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  active: boolish.default(true),
});

function bodyFromMultipart(req: any) {
  // multer leaves fields as strings; coerce handled by zod
  return req.body;
}

router.post('/products', upload.single('image'), async (req, res) => {
  const p = productSchema.safeParse(bodyFromMultipart(req));
  if (!p.success) return res.status(400).json({ error: 'invalid_input', detail: p.error.flatten() });
  const d = p.data;
  const imagePath = (req as any).file ? await processUploadedImage((req as any).file.path, (req as any).file.filename) : null;
  const r = db
    .prepare(
      `INSERT INTO products (code, category_id, name_fr, name_en, description_fr, description_en, unit, stock_qty,
         low_stock_threshold, cut_grade, variable_weight, taxable, supplier, image_path, lot_number, packed_at, expires_at, active)
       VALUES (@code,@category_id,@name_fr,@name_en,@description_fr,@description_en,@unit,@stock_qty,
         @low_stock_threshold,@cut_grade,@variable_weight,@taxable,@supplier,@image_path,@lot_number,@packed_at,@expires_at,@active)`,
    )
    .run({
      ...d,
      category_id: d.category_id ?? null,
      description_fr: d.description_fr ?? null,
      description_en: d.description_en ?? null,
      cut_grade: d.cut_grade ?? null,
      supplier: d.supplier ?? null,
      lot_number: d.lot_number ?? null,
      packed_at: d.packed_at ?? null,
      expires_at: d.expires_at ?? null,
      image_path: imagePath,
      variable_weight: d.variable_weight ? 1 : 0,
      taxable: d.taxable ? 1 : 0,
      active: d.active ? 1 : 0,
    });
  audit(req, 'create', 'product', r.lastInsertRowid, { code: d.code, name_fr: d.name_fr });
  res.json({ id: r.lastInsertRowid });
});

router.patch('/products/:id', upload.single('image'), async (req, res) => {
  const p = productSchema.partial().safeParse(bodyFromMultipart(req));
  if (!p.success) return res.status(400).json({ error: 'invalid_input', detail: p.error.flatten() });
  const d = p.data;
  const fields: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  if ((req as any).file) {
    const imagePath = await processUploadedImage((req as any).file.path, (req as any).file.filename);
    fields.push('image_path = ?');
    vals.push(imagePath);
  }
  fields.push(`updated_at = datetime('now')`);
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  audit(req, 'update', 'product', req.params.id, d);
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  audit(req, 'deactivate', 'product', req.params.id);
  res.json({ ok: true });
});

router.post('/products/:id/adjust-stock', (req, res) => {
  const p = z
    .object({
      delta: z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, { message: 'zero_or_nan' }),
      reason: z.enum(['manual_loss', 'manual_return', 'manual_correction', 'restock']),
      note: z.string().optional(),
      lot_number: z.string().optional(),
      packed_at: z.string().optional(),
      expires_at: z.string().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const productId = Number(req.params.id);
  const tx = db.transaction(() => {
    recordMovement({
      product_id: productId,
      delta: p.data.delta,
      reason: p.data.reason,
      note: p.data.note ?? null,
      user_id: req.user!.id,
    });
    // On restock, capture lot/packed/expires on the product (latest received lot)
    if (p.data.reason === 'restock') {
      const fields: string[] = [];
      const vals: any[] = [];
      if (p.data.lot_number) { fields.push('lot_number = ?'); vals.push(p.data.lot_number); }
      if (p.data.packed_at) { fields.push('packed_at = ?'); vals.push(p.data.packed_at); }
      if (p.data.expires_at) { fields.push('expires_at = ?'); vals.push(p.data.expires_at); }
      if (fields.length) {
        fields.push(`updated_at = datetime('now')`);
        vals.push(productId);
        db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
      }
    }
  });
  tx();
  res.json({ ok: true });
});

router.get('/products/:id/movements', (req, res) => {
  const rows = db
    .prepare(
      `SELECT sm.*, u.username FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.user_id
       WHERE product_id = ? ORDER BY id DESC LIMIT 200`,
    )
    .all(req.params.id);
  res.json(rows);
});

/* -------------------- PRICE LISTS -------------------- */
router.get('/price-lists', (_req, res) => {
  res.json(db.prepare('SELECT * FROM price_lists ORDER BY is_default DESC, name').all());
});
router.post('/price-lists', (req, res) => {
  const p = z.object({ name: z.string().min(1), is_default: z.boolean().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const tx = db.transaction(() => {
    if (p.data.is_default) db.prepare('UPDATE price_lists SET is_default = 0').run();
    return db
      .prepare('INSERT INTO price_lists (name, is_default) VALUES (?, ?)')
      .run(p.data.name, p.data.is_default ? 1 : 0);
  });
  const r = tx.immediate();
  audit(req, 'create', 'price_list', r.lastInsertRowid, { name: p.data.name, is_default: !!p.data.is_default });
  res.json({ id: r.lastInsertRowid });
});
router.patch('/price-lists/:id', (req, res) => {
  const p = z.object({ name: z.string().optional(), is_default: z.boolean().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const tx = db.transaction(() => {
    if (p.data.is_default) db.prepare('UPDATE price_lists SET is_default = 0').run();
    const fields: string[] = [];
    const vals: any[] = [];
    if (p.data.name !== undefined) { fields.push('name = ?'); vals.push(p.data.name); }
    if (p.data.is_default !== undefined) { fields.push('is_default = ?'); vals.push(p.data.is_default ? 1 : 0); }
    if (!fields.length) return;
    vals.push(req.params.id);
    db.prepare(`UPDATE price_lists SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  });
  tx.immediate();
  audit(req, 'update', 'price_list', req.params.id, p.data);
  res.json({ ok: true });
});
router.delete('/price-lists/:id', (req, res) => {
  db.prepare('DELETE FROM price_lists WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/price-lists/:id/prices', (req, res) => {
  const id = Number(req.params.id);
  const rows = db
    .prepare(
      `SELECT p.id AS product_id, p.code, p.name_fr, p.name_en, p.unit,
              pp.price FROM products p
       LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.price_list_id = ?
       WHERE p.active = 1 ORDER BY p.name_fr`,
    )
    .all(id);
  res.json(rows);
});
router.put('/price-lists/:id/prices', (req, res) => {
  const id = Number(req.params.id);
  const p = z.object({ prices: z.array(z.object({ product_id: z.number().int(), price: z.number().nonnegative().nullable() })) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const tx = db.transaction(() => {
    const del = db.prepare('DELETE FROM product_prices WHERE price_list_id = ? AND product_id = ?');
    const ins = db.prepare('INSERT INTO product_prices (price_list_id, product_id, price) VALUES (?, ?, ?)');
    for (const row of p.data.prices) {
      del.run(id, row.product_id);
      if (row.price != null && row.price >= 0) ins.run(id, row.product_id, row.price);
    }
  });
  tx();
  audit(req, 'update', 'price_list_prices', id, { count: p.data.prices.length });
  res.json({ ok: true });
});

// Bulk edit prices: percentage change, fixed delta, set value, or copy from another list
router.post('/price-lists/:id/bulk-update', (req, res) => {
  const id = Number(req.params.id);
  const p = z
    .object({
      operation: z.enum(['percent', 'delta', 'set', 'copy_from']),
      value: z.number().optional(),
      source_price_list_id: z.number().int().optional(),
      product_ids: z.array(z.number().int()).optional(),
      category_id: z.number().int().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const { operation, value, source_price_list_id, product_ids, category_id } = p.data;

  let targetProductIds: number[];
  if (product_ids && product_ids.length) {
    targetProductIds = product_ids;
  } else if (category_id) {
    targetProductIds = (db.prepare('SELECT id FROM products WHERE category_id = ? AND active = 1').all(category_id) as Array<{ id: number }>).map((r) => r.id);
  } else {
    targetProductIds = (db.prepare('SELECT id FROM products WHERE active = 1').all() as Array<{ id: number }>).map((r) => r.id);
  }

  const getCurrent = db.prepare('SELECT price FROM product_prices WHERE price_list_id = ? AND product_id = ?');
  const upsert = db.prepare(
    `INSERT INTO product_prices (price_list_id, product_id, price) VALUES (?, ?, ?)
     ON CONFLICT(price_list_id, product_id) DO UPDATE SET price = excluded.price`,
  );

  let updated = 0;
  const tx = db.transaction(() => {
    for (const pid of targetProductIds) {
      let newPrice: number | null = null;
      if (operation === 'copy_from') {
        if (!source_price_list_id) continue;
        const src = getCurrent.get(source_price_list_id, pid) as { price: number } | undefined;
        if (src) newPrice = src.price;
      } else {
        const current = getCurrent.get(id, pid) as { price: number } | undefined;
        if (operation === 'set') {
          if (value == null || value < 0) continue;
          newPrice = value;
        } else if (operation === 'percent') {
          if (value == null || current == null) continue;
          newPrice = Math.max(0, Math.round(current.price * (1 + value / 100) * 100) / 100);
        } else if (operation === 'delta') {
          if (value == null || current == null) continue;
          newPrice = Math.max(0, Math.round((current.price + value) * 100) / 100);
        }
      }
      if (newPrice != null) {
        upsert.run(id, pid, newPrice);
        updated++;
      }
    }
  });
  tx();
  audit(req, 'bulk_update', 'price_list_prices', id, { operation, value, updated });
  res.json({ ok: true, updated });
});

/* -------------------- CLIENTS -------------------- */
router.get('/clients', (req, res) => {
  const q = (req.query.q as string | undefined) ?? '';
  const rows = db
    .prepare(
      `SELECT c.*, u.username, u.must_change_password, u.active AS user_active, pl.name AS price_list_name
       FROM clients c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN price_lists pl ON pl.id = c.price_list_id
       ${q ? `WHERE c.company_name LIKE ? OR u.username LIKE ?` : ''}
       ORDER BY c.company_name`,
    )
    .all(...(q ? [`%${q}%`, `%${q}%`] : []));
  res.json(rows);
});

router.post('/clients', (req, res) => {
  const p = z
    .object({
      username: z.string().min(3),
      password: z.string().min(6),
      company_name: z.string().min(1),
      contact_name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      delivery_address: z.string().optional(),
      notes: z.string().optional(),
      pricing_mode: z.enum(['price_list', 'quote']).default('price_list'),
      price_list_id: z.number().int().nullable().optional(),
      min_order_amount: z.number().nonnegative().nullable().optional(),
      gst_number: z.string().nullable().optional(),
      qst_number: z.string().nullable().optional(),
      tax_exempt: z.boolean().optional(),
      exempt_reason: z.string().nullable().optional(),
      payment_terms_days: z.number().int().nonnegative().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input', detail: p.error.flatten() });
  const d = p.data;
  const tx = db.transaction(() => {
    const userR = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'client', 1)`,
      )
      .run(d.username, bcrypt.hashSync(d.password, 10));
    const clientR = db
      .prepare(
        `INSERT INTO clients (user_id, company_name, contact_name, phone, email, delivery_address, notes,
           pricing_mode, price_list_id, min_order_amount, gst_number, qst_number, tax_exempt, exempt_reason, payment_terms_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userR.lastInsertRowid,
        d.company_name,
        d.contact_name ?? null,
        d.phone ?? null,
        d.email || null,
        d.delivery_address ?? null,
        d.notes ?? null,
        d.pricing_mode,
        d.price_list_id ?? null,
        d.min_order_amount ?? null,
        d.gst_number ?? null,
        d.qst_number ?? null,
        d.tax_exempt ? 1 : 0,
        d.exempt_reason ?? null,
        d.payment_terms_days ?? 30,
      );
    return clientR.lastInsertRowid;
  });
  try {
    const id = tx();
    audit(req, 'create', 'client', id, { company_name: d.company_name, username: d.username });
    res.json({ id });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'username_taken' });
    throw e;
  }
});

// TS workaround: skip original -> audit after update
router.patch('/clients/:id', (req, res, next) => {
  (res as any).on('finish', () => audit(req, 'update', 'client', req.params.id, req.body));
  next();
}, (req, res) => {
  const p = z
    .object({
      company_name: z.string().optional(),
      contact_name: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      delivery_address: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      pricing_mode: z.enum(['price_list', 'quote']).optional(),
      price_list_id: z.number().int().nullable().optional(),
      min_order_amount: z.number().nonnegative().nullable().optional(),
      gst_number: z.string().nullable().optional(),
      qst_number: z.string().nullable().optional(),
      tax_exempt: z.boolean().optional(),
      exempt_reason: z.string().nullable().optional(),
      payment_terms_days: z.number().int().nonnegative().optional(),
      user_active: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const d = p.data;
  const client = db.prepare('SELECT user_id FROM clients WHERE id = ?').get(req.params.id) as { user_id: number } | undefined;
  if (!client) return res.status(404).json({ error: 'not_found' });
  const tx = db.transaction(() => {
    const fields: string[] = [];
    const vals: any[] = [];
    const cols = ['company_name','contact_name','phone','email','delivery_address','notes','pricing_mode','price_list_id','min_order_amount','gst_number','qst_number','exempt_reason','payment_terms_days'] as const;
    for (const k of cols) if ((d as any)[k] !== undefined) { fields.push(`${k} = ?`); vals.push((d as any)[k]); }
    if (d.tax_exempt !== undefined) { fields.push('tax_exempt = ?'); vals.push(d.tax_exempt ? 1 : 0); }
    if (fields.length) {
      vals.push(req.params.id);
      db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    }
    if (d.user_active !== undefined) {
      db.prepare('UPDATE users SET active = ? WHERE id = ?').run(d.user_active ? 1 : 0, client.user_id);
    }
  });
  tx();
  res.json({ ok: true });
});

router.post('/clients/:id/reset-password', (req, res) => {
  const p = z.object({ password: z.string().min(6) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const row = db.prepare('SELECT user_id FROM clients WHERE id = ?').get(req.params.id) as { user_id: number } | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
    bcrypt.hashSync(p.data.password, 10),
    row.user_id,
  );
  res.json({ ok: true });
});

router.delete('/clients/:id', (req, res) => {
  const row = db.prepare('SELECT user_id FROM clients WHERE id = ?').get(req.params.id) as { user_id: number } | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(row.user_id);
  res.json({ ok: true });
});

/* -------------------- ORDERS -------------------- */
router.get('/orders', (req, res) => {
  const { status, client_id, from, to, q } = req.query as Record<string, string>;
  const where: string[] = ["o.status != 'draft'"];
  const vals: any[] = [];
  if (status) { where.push('o.status = ?'); vals.push(status); }
  if (client_id) { where.push('o.client_id = ?'); vals.push(client_id); }
  if (from) { where.push('date(o.submitted_at) >= date(?)'); vals.push(from); }
  if (to) { where.push('date(o.submitted_at) <= date(?)'); vals.push(to); }
  if (q) { where.push('(o.order_number LIKE ? OR c.company_name LIKE ?)'); vals.push(`%${q}%`, `%${q}%`); }
  const sql = `SELECT o.*, c.company_name FROM orders o
               JOIN clients c ON c.id = o.client_id
               WHERE ${where.join(' AND ')}
               ORDER BY o.submitted_at DESC, o.id DESC LIMIT 500`;
  res.json(db.prepare(sql).all(...vals));
});

/* -------------------- SAGE EXPORT (Simple Comptable / Sage 50 CA) -------------------- */
// Generates a tab-delimited .IMP file — format d'import Sage Simple Comptable.
// Exports all delivered (non-invoiced) orders and marks them as "invoiced" after download.
// Pass ?include_invoiced=1 to regenerate previously exported invoices (e.g. file lost).
// Pass ?dry_run=1 to preview without marking status.
router.get('/export/sage.imp', (req, res) => {
  const { from, to, include_invoiced, dry_run } = req.query as Record<string, string>;
  const includeInvoiced = include_invoiced === '1' || include_invoiced === 'true';
  const dryRun = dry_run === '1' || dry_run === 'true';

  const statusClause = includeInvoiced
    ? "o.status IN ('delivered','invoiced')"
    : "o.status = 'delivered'";
  const where: string[] = [statusClause];
  const vals: any[] = [];
  if (from) { where.push("date(o.delivered_at) >= date(?)"); vals.push(from); }
  if (to) { where.push("date(o.delivered_at) <= date(?)"); vals.push(to); }

  const rows = db
    .prepare(
      `SELECT
         strftime('%Y%m%d', o.delivered_at) AS invoice_date,
         o.order_number AS invoice_number,
         c.company_name AS customer_name,
         COALESCE(c.contact_name, '') AS contact_name,
         COALESCE(REPLACE(REPLACE(c.delivery_address, CHAR(10), ' '), CHAR(13), ''), '') AS address,
         COALESCE(c.phone, '') AS phone,
         COALESCE(c.email, '') AS email,
         COALESCE(c.gst_number, '') AS gst_number,
         COALESCE(c.qst_number, '') AS qst_number,
         CASE WHEN c.tax_exempt = 1 THEN 'O' ELSE 'N' END AS tax_exempt,
         c.payment_terms_days,
         strftime('%Y%m%d', date(o.delivered_at, '+' || c.payment_terms_days || ' days')) AS due_date,
         CASE WHEN o.fulfillment_method = 'pickup' THEN 'RAM' ELSE 'LIV' END AS delivery_code,
         printf('%.2f', ROUND(o.subtotal, 2)) AS subtotal,
         printf('%.2f', ROUND(o.gst, 2)) AS gst_5,
         printf('%.2f', ROUND(o.qst, 2)) AS qst_9975,
         printf('%.2f', ROUND(o.total, 2)) AS total,
         REPLACE(REPLACE(COALESCE(o.notes, ''), CHAR(10), ' '), CHAR(13), '') AS notes
       FROM orders o
       JOIN clients c ON c.id = o.client_id
       WHERE ${where.join(' AND ')}
       ORDER BY o.delivered_at ASC, o.id ASC`,
    )
    .all(...vals) as any[];

  // Tab-delimited (Sage Simple Comptable classic format)
  const headers = [
    'DATE',
    'NUM_FACTURE',
    'CLIENT',
    'CONTACT',
    'ADRESSE',
    'TELEPHONE',
    'COURRIEL',
    'NO_TPS',
    'NO_TVQ',
    'EXEMPTE',
    'CONDITIONS_J',
    'DATE_ECHEANCE',
    'MODE',
    'SOUS_TOTAL',
    'TPS',
    'TVQ',
    'TOTAL',
    'NOTES',
  ];

  function clean(v: any): string {
    return String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
  }

  const lines: string[] = [];
  lines.push(headers.join('\t'));
  for (const r of rows) {
    lines.push(
      [
        r.invoice_date,
        r.invoice_number,
        r.customer_name,
        r.contact_name,
        r.address,
        r.phone,
        r.email,
        r.gst_number,
        r.qst_number,
        r.tax_exempt,
        r.payment_terms_days,
        r.due_date,
        r.delivery_code,
        r.subtotal,
        r.gst_5,
        r.qst_9975,
        r.total,
        r.notes,
      ]
        .map(clean)
        .join('\t'),
    );
  }

  const content = lines.join('\r\n') + '\r\n';

  // After successfully generating the file, mark the exported orders as 'invoiced'.
  // This prevents duplicate exports on subsequent runs.
  let markedCount = 0;
  if (!dryRun && rows.length > 0) {
    const ids = rows.map((r) => r.invoice_number);
    const placeholders = ids.map(() => '?').join(',');
    const upd = db
      .prepare(
        `UPDATE orders
         SET status = 'invoiced', invoiced_at = datetime('now'), updated_at = datetime('now')
         WHERE status = 'delivered' AND order_number IN (${placeholders})`,
      )
      .run(...ids);
    markedCount = upd.changes;
  }

  audit(req, 'export', 'sage_imp', null, { rows: rows.length, marked: markedCount, from, to, include_invoiced: includeInvoiced });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Dac-Exported', String(rows.length));
  res.setHeader('X-Dac-Marked-Invoiced', String(markedCount));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="sage-ventes-${new Date().toISOString().slice(0, 10)}.imp"`,
  );
  // UTF-8 BOM so Sage Simple Comptable (FR) reads accents correctly
  res.send('\uFEFF' + content);
});

/* -------------------- ORDER TEMPLATES (admin view across all) -------------------- */
router.get('/templates', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, c.company_name FROM order_templates t JOIN clients c ON c.id = t.client_id ORDER BY t.created_at DESC`,
    )
    .all();
  res.json(rows);
});

/* -------------------- RETURNS -------------------- */
router.post('/orders/:id/return', (req, res) => {
  const orderId = Number(req.params.id);
  const p = z
    .object({
      reason: z.string().optional(),
      items: z.array(z.object({ order_item_id: z.number().int(), quantity: z.number().positive() })).min(1),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'delivered') return res.status(400).json({ error: 'invalid_state' });

  let returnId = 0;
  let totalAmount = 0;
  const tx = db.transaction(() => {
    const r = db.prepare('INSERT INTO returns (order_id, reason, user_id) VALUES (?, ?, ?)').run(
      orderId,
      p.data.reason ?? null,
      req.user!.id,
    );
    returnId = Number(r.lastInsertRowid);

    const insItem = db.prepare('INSERT INTO return_items (return_id, order_item_id, quantity, amount) VALUES (?, ?, ?, ?)');
    for (const it of p.data.items) {
      const orderItem = db
        .prepare('SELECT product_id, unit_price_snapshot FROM order_items WHERE id = ? AND order_id = ?')
        .get(it.order_item_id, orderId) as any;
      if (!orderItem) continue;
      const amount = Math.round(it.quantity * (orderItem.unit_price_snapshot ?? 0) * 100) / 100;
      totalAmount += amount;
      insItem.run(returnId, it.order_item_id, it.quantity, amount);
      // restore stock
      recordMovement({
        product_id: orderItem.product_id,
        delta: it.quantity,
        reason: 'order_adjust',
        order_id: orderId,
        user_id: req.user!.id,
        note: `return #${returnId}`,
      });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    db.prepare('UPDATE returns SET total_amount = ? WHERE id = ?').run(totalAmount, returnId);
    db.prepare('UPDATE orders SET returned_amount = returned_amount + ? WHERE id = ?').run(totalAmount, orderId);
  });
  tx();
  audit(req, 'create', 'return', returnId, { order_id: orderId, total_amount: totalAmount });
  res.json({ ok: true, return_id: returnId, total_amount: totalAmount });
});

router.get('/orders/:id/returns', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*,
         (SELECT json_group_array(json_object('id', ri.id, 'order_item_id', ri.order_item_id, 'quantity', ri.quantity, 'amount', ri.amount, 'product_name', oi.product_name_snapshot))
          FROM return_items ri JOIN order_items oi ON oi.id = ri.order_item_id WHERE ri.return_id = r.id) AS items_json
       FROM returns r WHERE r.order_id = ? ORDER BY r.id DESC`,
    )
    .all(req.params.id) as any[];
  for (const r of rows) {
    try { r.items = r.items_json ? JSON.parse(r.items_json) : []; } catch { r.items = []; }
    delete r.items_json;
  }
  res.json(rows);
});

/* -------------------- PARTIAL SHIPMENT -------------------- */
router.post('/orders/:id/ship-partial', (req, res) => {
  const orderId = Number(req.params.id);
  const p = z
    .object({
      items: z.array(z.object({ id: z.number().int(), quantity_shipped: z.number().nonnegative() })).min(1),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const order = db.prepare('SELECT status, fulfillment_method FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (!['accepted', 'ready'].includes(order.status)) return res.status(400).json({ error: 'invalid_state' });

  const tx = db.transaction(() => {
    for (const it of p.data.items) {
      db.prepare('UPDATE order_items SET quantity_shipped = ? WHERE id = ? AND order_id = ?').run(
        it.quantity_shipped,
        it.id,
        orderId,
      );
    }
    // Check if all items fully shipped
    const items = db.prepare('SELECT quantity_requested, quantity_confirmed, quantity_shipped FROM order_items WHERE order_id = ?').all(orderId) as any[];
    const allShipped = items.every((i) => {
      const target = i.quantity_confirmed ?? i.quantity_requested;
      return i.quantity_shipped != null && i.quantity_shipped >= target - 0.001;
    });
    if (allShipped) {
      db.prepare(`UPDATE orders SET status='delivered', delivered_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(orderId);
    }
  });
  tx();
  audit(req, 'ship_partial', 'order', orderId, { items: p.data.items.length });
  res.json({ ok: true });
});

router.get('/orders/export.csv', (req, res) => {
  const { status, client_id, from, to } = req.query as Record<string, string>;
  const where: string[] = ["o.status != 'draft'"];
  const vals: any[] = [];
  if (status) { where.push('o.status = ?'); vals.push(status); }
  if (client_id) { where.push('o.client_id = ?'); vals.push(client_id); }
  if (from) { where.push('date(o.submitted_at) >= date(?)'); vals.push(from); }
  if (to) { where.push('date(o.submitted_at) <= date(?)'); vals.push(to); }
  const rows = db
    .prepare(
      `SELECT o.order_number, c.company_name, o.status, o.fulfillment_method,
              o.submitted_at, o.quoted_at, o.accepted_at, o.delivered_at,
              o.requested_delivery_date, o.subtotal, o.gst, o.qst, o.total
       FROM orders o JOIN clients c ON c.id = o.client_id
       WHERE ${where.join(' AND ')} ORDER BY o.submitted_at DESC`,
    )
    .all(...vals);
  const csv = csvStringify(rows as any, { header: true });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csv);
});

router.get('/orders/:id', (req, res) => {
  const order = db
    .prepare(
      `SELECT o.*, c.company_name, c.contact_name, c.delivery_address, c.phone
       FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
    )
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(req.params.id);
  res.json({ ...order, items });
});

// PATCH an item to override price or quantity (while quote-pending)
router.patch('/orders/:id/items/:itemId', (req, res) => {
  const orderId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const p = z
    .object({
      quantity_requested: z.number().positive().optional(),
      quantity_confirmed: z.number().nonnegative().nullable().optional(),
      unit_price_snapshot: z.number().nonnegative().nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string } | undefined;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'submitted' && order.status !== 'quoted')
    return res.status(400).json({ error: 'invalid_state' });
  const tx = db.transaction(() => {
    const fields: string[] = [];
    const vals: any[] = [];
    if (p.data.quantity_requested !== undefined) { fields.push('quantity_requested = ?'); vals.push(p.data.quantity_requested); }
    if (p.data.quantity_confirmed !== undefined) { fields.push('quantity_confirmed = ?'); vals.push(p.data.quantity_confirmed); }
    if (p.data.unit_price_snapshot !== undefined) { fields.push('unit_price_snapshot = ?'); vals.push(p.data.unit_price_snapshot); }
    if (fields.length) {
      vals.push(itemId, orderId);
      db.prepare(`UPDATE order_items SET ${fields.join(', ')} WHERE id = ? AND order_id = ?`).run(...vals);
      recomputeLineTotal(itemId);
    }
    recomputeOrderTotals(orderId);
  });
  tx();
  res.json({ ok: true });
});

// Send bon de commande (quote) to client for acceptance
router.post('/orders/:id/send-quote', async (req, res, next) => {
  (res as any).on('finish', () => audit(req, 'send_quote', 'order', req.params.id));
  next();
}, async (req, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare(
      `SELECT o.*, c.company_name, c.contact_name, c.email FROM orders o
       JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
    )
    .get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'submitted' && order.status !== 'quoted')
    return res.status(400).json({ error: 'invalid_state' });
  if (!order.email) return res.status(400).json({ error: 'no_client_email' });

  const token = order.acceptance_token ?? generateAcceptanceToken();
  db.prepare(
    `UPDATE orders SET status='quoted', quote_sent_at=datetime('now'), quoted_at=COALESCE(quoted_at, datetime('now')),
       acceptance_token=?, acceptance_token_expires_at=datetime('now','+7 days'), updated_at=datetime('now') WHERE id=?`,
  ).run(token, orderId);

  const totals = recomputeOrderTotals(orderId);
  const acceptanceUrl = `${env.CLIENT_ORIGIN}/accept/${token}`;
  const { subject, html } = quoteEmail({
    company_name: order.company_name,
    contact_name: order.contact_name,
    order_number: order.order_number ?? `#${orderId}`,
    total: totals.total,
    acceptance_url: acceptanceUrl,
    fulfillment_method: order.fulfillment_method,
  });

  let pdf: Buffer | null = null;
  try {
    pdf = await renderBonDeCommandeSync(orderId);
  } catch (err) {
    console.warn('[send-quote] PDF generation failed:', err);
  }

  try {
    await sendMail({
      to: order.email,
      subject,
      html,
      attachments: pdf
        ? [{ filename: `bon-de-commande-${order.order_number ?? orderId}.pdf`, content: pdf, contentType: 'application/pdf' }]
        : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'mail_failed', detail: err?.message });
  }
  res.json({ ok: true, acceptance_url: acceptanceUrl });
});

// Mark as ready (optional step between accepted and delivered) — notifies client
router.post('/orders/:id/mark-ready', async (req, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare(
      `SELECT o.*, c.company_name, c.contact_name, c.email FROM orders o
       JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
    )
    .get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'accepted') return res.status(400).json({ error: 'invalid_state' });

  db.prepare(
    `UPDATE orders SET status='ready', ready_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
  ).run(orderId);

  let notified = false;
  if (order.email) {
    try {
      const { subject, html } = readyEmail({
        company_name: order.company_name,
        contact_name: order.contact_name,
        order_number: order.order_number ?? `#${orderId}`,
        fulfillment_method: order.fulfillment_method,
        requested_date: order.requested_delivery_date,
      });
      await sendMail({ to: order.email, subject, html });
      db.prepare(`UPDATE orders SET ready_notified_at = datetime('now') WHERE id = ?`).run(orderId);
      notified = true;
    } catch (err) {
      console.warn('[mark-ready] email failed:', err);
    }
  }
  audit(req, 'mark_ready', 'order', orderId, { notified });
  res.json({ ok: true, notified });
});

// Mark as delivered (or picked up) and send invoice
router.post('/orders/:id/deliver', async (req, res, next) => {
  (res as any).on('finish', () => audit(req, 'deliver', 'order', req.params.id));
  next();
}, async (req, res) => {
  const orderId = Number(req.params.id);
  const p = z.object({ send_invoice: z.boolean().optional() }).safeParse(req.body ?? {});
  const sendInvoice = p.data?.send_invoice ?? true;

  const order = db
    .prepare(
      `SELECT o.*, c.company_name, c.contact_name, c.email FROM orders o
       JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
    )
    .get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'accepted' && order.status !== 'ready') return res.status(400).json({ error: 'invalid_state' });

  db.prepare(
    `UPDATE orders SET status='delivered', delivered_at=datetime('now'), updated_at=datetime('now') WHERE id = ?`,
  ).run(orderId);

  let invoiceSent = false;
  if (sendInvoice && order.email) {
    try {
      const pdf = await renderFactureSync(orderId);
      const { subject, html } = invoiceEmail({
        company_name: order.company_name,
        contact_name: order.contact_name,
        order_number: order.order_number ?? `#${orderId}`,
        total: order.total,
        fulfillment_method: order.fulfillment_method,
      });
      await sendMail({
        to: order.email,
        subject,
        html,
        attachments: [{ filename: `facture-${order.order_number ?? orderId}.pdf`, content: pdf, contentType: 'application/pdf' }],
      });
      db.prepare(`UPDATE orders SET invoice_sent_at = datetime('now') WHERE id = ?`).run(orderId);
      invoiceSent = true;
    } catch (err) {
      console.warn('[deliver] invoice email failed:', err);
    }
  }
  res.json({ ok: true, invoice_sent: invoiceSent });
});

// Manual re-send of invoice
router.post('/orders/:id/send-invoice', async (req, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare(
      `SELECT o.*, c.company_name, c.contact_name, c.email FROM orders o
       JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
    )
    .get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'delivered' && order.status !== 'accepted')
    return res.status(400).json({ error: 'invalid_state' });
  if (!order.email) return res.status(400).json({ error: 'no_client_email' });

  try {
    const pdf = await renderFactureSync(orderId);
    const { subject, html } = invoiceEmail({
      company_name: order.company_name,
      contact_name: order.contact_name,
      order_number: order.order_number ?? `#${orderId}`,
      total: order.total,
      fulfillment_method: order.fulfillment_method,
    });
    await sendMail({
      to: order.email,
      subject,
      html,
      attachments: [{ filename: `facture-${order.order_number ?? orderId}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    db.prepare(`UPDATE orders SET invoice_sent_at = datetime('now') WHERE id = ?`).run(orderId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: 'mail_failed', detail: err?.message });
  }
});

router.post('/orders/:id/cancel', (req, res, next) => {
  (res as any).on('finish', () => audit(req, 'cancel', 'order', req.params.id));
  next();
}, (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string } | undefined;
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status === 'cancelled' || order.status === 'delivered')
    return res.status(400).json({ error: 'invalid_state' });
  const tx = db.transaction(() => {
    if (order.status === 'accepted') {
      const items = db
        .prepare('SELECT product_id, quantity_requested, quantity_confirmed FROM order_items WHERE order_id = ?')
        .all(orderId) as Array<{ product_id: number; quantity_requested: number; quantity_confirmed: number | null }>;
      for (const it of items) {
        const qty = it.quantity_confirmed ?? it.quantity_requested;
        recordMovement({
          product_id: it.product_id,
          delta: qty,
          reason: 'order_adjust',
          order_id: orderId,
          user_id: req.user!.id,
          note: 'cancel restore',
        });
      }
    }
    db.prepare(`UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(orderId);
  });
  tx();
  res.json({ ok: true });
});

router.get('/orders/:id/pdf', (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId)) return res.status(400).json({ error: 'invalid_id' });
  const variant = (req.query.variant === 'facture' ? 'facture' : 'bon') as 'bon' | 'facture';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${variant === 'facture' ? 'facture' : 'bon-de-commande'}-${orderId}.pdf"`,
  );
  try {
    streamPdf(variant, orderId, res);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

export default router;
