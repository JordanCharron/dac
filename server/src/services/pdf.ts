import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import env from '../lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '..', '..', 'assets', 'dac-logo.png');

// Palette
const ACCENT = '#8B1C1C';
const DARK = '#1a1a1a';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const BG_ALT = '#faf7f7';
const SUCCESS = '#166534';

// Layout constants (Letter 612 x 792 pt)
const PAGE_MARGIN = 40;
const HEADER_H = 96;
const FOOTER_H = 56;

type Variant = 'bon' | 'facture';

interface OrderRow {
  id: number;
  order_number: string | null;
  status: string;
  fulfillment_method: string;
  requested_delivery_date: string | null;
  submitted_at: string | null;
  quoted_at: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  subtotal: number;
  gst: number;
  qst: number;
  total: number;
  paid_amount: number;
  returned_amount: number;
  payment_status: string;
  due_date: string | null;
  notes: string | null;
  // joined client fields
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  delivery_address: string | null;
  gst_number: string | null;
  qst_number: string | null;
  tax_exempt: number;
  exempt_reason: string | null;
  payment_terms_days: number;
}

interface OrderItem {
  id: number;
  product_name_snapshot: string;
  unit_snapshot: string;
  taxable_snapshot: number;
  variable_weight_snapshot: number;
  quantity_requested: number;
  quantity_confirmed: number | null;
  quantity_shipped: number | null;
  unit_price_snapshot: number | null;
  line_total: number;
}

function loadOrder(orderId: number): { order: OrderRow; items: OrderItem[] } {
  const order = db
    .prepare(
      `SELECT o.*, c.company_name, c.contact_name, c.delivery_address, c.phone, c.email,
              c.gst_number, c.qst_number, c.tax_exempt, c.exempt_reason, c.payment_terms_days
       FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
    )
    .get(orderId) as OrderRow | undefined;
  if (!order) throw new Error('order_not_found');
  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
    .all(orderId) as OrderItem[];
  return { order, items };
}

function money(n: number | null | undefined): string {
  if (n == null) return 'Sur demande';
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

function shortDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' }).format(d);
}

function computeDueDate(order: OrderRow): string | null {
  if (order.due_date) return order.due_date;
  if (order.delivered_at && order.payment_terms_days != null) {
    const d = new Date(order.delivered_at);
    d.setDate(d.getDate() + Number(order.payment_terms_days));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Brouillon',
    submitted: 'Soumise',
    quoted: 'Bon de commande envoyé',
    accepted: 'Acceptée',
    ready: 'Prête',
    delivered: 'Livrée',
    invoiced: 'Facturée',
    cancelled: 'Annulée',
  };
  return map[status] ?? status;
}

/* -------------------- DRAW HELPERS -------------------- */

function drawHeader(doc: PDFKit.PDFDocument, variant: Variant, order: OrderRow) {
  const W = doc.page.width;

  // Dark header band
  doc.rect(0, 0, W, HEADER_H).fill(DARK);

  // Logo
  if (fs.existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, PAGE_MARGIN, 18, { fit: [60, 60] });
    } catch {
      /* ignore */
    }
  }

  // Company name + tagline
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(env.COMPANY_NAME, PAGE_MARGIN + 70, 24, { width: W - PAGE_MARGIN - 240 });
  doc
    .fillColor('#cccccc')
    .font('Helvetica')
    .fontSize(9)
    .text('Le choix judicieux pour un repas goûteux', PAGE_MARGIN + 70, 44, {
      width: W - PAGE_MARGIN - 240,
    });

  // Right: document title + number
  const title = variant === 'bon' ? 'BON DE COMMANDE' : 'FACTURE';
  const rightX = W - PAGE_MARGIN - 180;
  doc
    .fillColor(ACCENT)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, rightX, 24, { width: 180, align: 'right', characterSpacing: 2 });
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(order.order_number ?? '—', rightX, 42, { width: 180, align: 'right' });

  // Bottom accent line
  doc.moveTo(0, HEADER_H).lineTo(W, HEADER_H).lineWidth(3).strokeColor(ACCENT).stroke();

  // Reset
  doc.fillColor(DARK).strokeColor(BORDER).lineWidth(1);
}

function drawMetaBlock(
  doc: PDFKit.PDFDocument,
  variant: Variant,
  order: OrderRow,
): number {
  const W = doc.page.width;
  const top = HEADER_H + 20;
  const leftX = PAGE_MARGIN;
  const rightX = W / 2 + 10;
  const colW = W / 2 - PAGE_MARGIN - 10;

  // LEFT — client block
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('FACTURÉ À', leftX, top, { characterSpacing: 1.5 });
  doc
    .fillColor(DARK)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(order.company_name, leftX, top + 14, { width: colW });

  let ly = top + 32;
  doc.font('Helvetica').fontSize(9).fillColor(DARK);
  if (order.contact_name) { doc.text(order.contact_name, leftX, ly, { width: colW }); ly += 12; }
  if (order.phone) { doc.text(order.phone, leftX, ly, { width: colW }); ly += 12; }
  if (order.email) { doc.text(order.email, leftX, ly, { width: colW }); ly += 12; }
  if (order.delivery_address) {
    ly += 2;
    const lines = order.delivery_address.split('\n');
    doc.fillColor(MUTED);
    for (const ln of lines) { doc.text(ln, leftX, ly, { width: colW }); ly += 11; }
    doc.fillColor(DARK);
  }
  if (order.gst_number || order.qst_number) {
    ly += 4;
    doc.fillColor(MUTED).fontSize(8);
    if (order.gst_number) { doc.text(`N° TPS : ${order.gst_number}`, leftX, ly, { width: colW }); ly += 10; }
    if (order.qst_number) { doc.text(`N° TVQ : ${order.qst_number}`, leftX, ly, { width: colW }); ly += 10; }
    doc.fillColor(DARK).fontSize(9);
  }

  // RIGHT — metadata table
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('DÉTAILS', rightX, top, { characterSpacing: 1.5 });

  const labels: Array<[string, string | null | undefined]> = [];
  if (variant === 'bon') {
    labels.push(['Date', shortDate(order.quoted_at ?? order.submitted_at)]);
    labels.push([
      order.fulfillment_method === 'pickup' ? 'Ramassage souhaité' : 'Livraison souhaitée',
      shortDate(order.requested_delivery_date),
    ]);
    labels.push(['Mode', order.fulfillment_method === 'pickup' ? 'Ramassage' : 'Livraison']);
    labels.push(['Statut', statusLabel(order.status)]);
  } else {
    labels.push(['Date de facturation', shortDate(order.delivered_at ?? order.accepted_at)]);
    labels.push(['Date de commande', shortDate(order.submitted_at)]);
    labels.push(['Mode', order.fulfillment_method === 'pickup' ? 'Ramassage' : 'Livraison']);
    const due = computeDueDate(order);
    if (due) labels.push(['Échéance de paiement', shortDate(due)]);
    if (order.payment_terms_days != null) labels.push(['Conditions', `Net ${order.payment_terms_days} jours`]);
  }

  let ry = top + 14;
  const labelW = 130;
  const valueW = colW - labelW - 6;
  for (const [label, value] of labels) {
    if (!value) continue;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, rightX, ry, { width: labelW });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text(value, rightX + labelW + 6, ry, { width: valueW });
    ry += 14;
  }

  if (order.tax_exempt) {
    ry += 4;
    doc
      .fillColor('#92400e')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(
        `CLIENT EXEMPTÉ DE TAXES${order.exempt_reason ? ` — ${order.exempt_reason}` : ''}`,
        rightX,
        ry,
        { width: colW, characterSpacing: 0.5 },
      );
    ry += 12;
  }

  return Math.max(ly, ry) + 16;
}

interface Column {
  header: string;
  width: number;
  align: 'left' | 'right' | 'center';
  pad?: number;
}

function drawItemsTable(
  doc: PDFKit.PDFDocument,
  items: OrderItem[],
  startY: number,
  variant: Variant,
  order: OrderRow,
): number {
  const W = doc.page.width;
  const left = PAGE_MARGIN;
  const right = W - PAGE_MARGIN;
  const tableW = right - left;

  // Column definitions (widths sum to tableW = 532 on Letter)
  // Columns: description (flex), unité, qté demandée, qté confirmée (facture only), prix unitaire, total
  const showConfirmed = variant === 'facture';
  const cols: Column[] = showConfirmed
    ? [
        { header: 'DESCRIPTION', width: 220, align: 'left' },
        { header: 'UNITÉ', width: 50, align: 'left' },
        { header: 'QTÉ', width: 50, align: 'right' },
        { header: 'LIVRÉ', width: 52, align: 'right' },
        { header: 'PRIX UNIT.', width: 78, align: 'right' },
        { header: 'TOTAL', width: 82, align: 'right' },
      ]
    : [
        { header: 'DESCRIPTION', width: 260, align: 'left' },
        { header: 'UNITÉ', width: 56, align: 'left' },
        { header: 'QTÉ', width: 56, align: 'right' },
        { header: 'PRIX UNIT.', width: 80, align: 'right' },
        { header: 'TOTAL', width: 80, align: 'right' },
      ];

  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  const scale = tableW / totalWidth;
  const xOf = (idx: number) => left + cols.slice(0, idx).reduce((s, c) => s + c.width * scale, 0);
  const wOf = (idx: number) => cols[idx].width * scale - 6; // 6px gap

  // Header row
  let y = startY;
  const headerH = 22;
  doc.rect(left, y, tableW, headerH).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  cols.forEach((c, i) => {
    doc.text(c.header, xOf(i) + 6, y + 7, { width: wOf(i), align: c.align, characterSpacing: 0.5 });
  });
  y += headerH;

  // Body
  const lineH = 14;
  const padY = 7;
  let alt = false;
  for (const it of items) {
    const flags: string[] = [];
    if (it.variable_weight_snapshot) flags.push('poids variable');
    if (!it.taxable_snapshot) flags.push('non taxable');
    const rowH = flags.length ? 32 : 22;

    if (y + rowH > doc.page.height - FOOTER_H - 20) {
      doc.addPage();
      drawHeader(doc, variant, order);
      y = HEADER_H + 20;
      // redraw table header on new page
      doc.rect(left, y, tableW, headerH).fill(ACCENT);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
      cols.forEach((c, i) => {
        doc.text(c.header, xOf(i) + 6, y + 7, { width: wOf(i), align: c.align, characterSpacing: 0.5 });
      });
      y += headerH;
      alt = false;
    }

    if (alt) {
      doc.rect(left, y, tableW, rowH).fill(BG_ALT);
    }
    alt = !alt;

    doc.fillColor(DARK).font('Helvetica').fontSize(9);

    // Description
    doc.font('Helvetica-Bold').text(it.product_name_snapshot, xOf(0) + 6, y + padY, {
      width: wOf(0),
      lineBreak: false,
      ellipsis: true,
    });
    if (flags.length) {
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(7);
      doc.text(flags.join(' · '), xOf(0) + 6, y + padY + lineH, { width: wOf(0), characterSpacing: 0.3 });
    }

    // Other columns
    doc.fillColor(DARK).font('Helvetica').fontSize(9);
    if (showConfirmed) {
      doc.text(it.unit_snapshot, xOf(1) + 6, y + padY, { width: wOf(1), align: cols[1].align });
      doc.text(fmtQty(it.quantity_requested), xOf(2) + 6, y + padY, { width: wOf(2), align: cols[2].align });
      const shippedQty =
        it.quantity_shipped != null
          ? it.quantity_shipped
          : it.quantity_confirmed != null
          ? it.quantity_confirmed
          : it.quantity_requested;
      doc.text(fmtQty(shippedQty), xOf(3) + 6, y + padY, { width: wOf(3), align: cols[3].align });
      doc.text(money(it.unit_price_snapshot), xOf(4) + 6, y + padY, { width: wOf(4), align: cols[4].align });
      doc.font('Helvetica-Bold').text(money(it.line_total), xOf(5) + 6, y + padY, { width: wOf(5), align: cols[5].align });
    } else {
      doc.text(it.unit_snapshot, xOf(1) + 6, y + padY, { width: wOf(1), align: cols[1].align });
      doc.text(fmtQty(it.quantity_requested), xOf(2) + 6, y + padY, { width: wOf(2), align: cols[2].align });
      doc.text(money(it.unit_price_snapshot), xOf(3) + 6, y + padY, { width: wOf(3), align: cols[3].align });
      doc.font('Helvetica-Bold').text(money(it.line_total), xOf(4) + 6, y + padY, { width: wOf(4), align: cols[4].align });
    }

    y += rowH;
  }

  // Bottom rule
  doc.strokeColor(BORDER).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
  return y;
}

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 2 }).format(n);
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  order: OrderRow,
  variant: Variant,
  startY: number,
) {
  const W = doc.page.width;
  const right = W - PAGE_MARGIN;
  const boxW = 240;
  const boxX = right - boxW;
  let y = startY + 14;

  // Ensure enough room
  const neededSpace = variant === 'facture' ? 170 : 110;
  if (y + neededSpace > doc.page.height - FOOTER_H - 20) {
    doc.addPage();
    y = HEADER_H + 20;
  }

  const rowH = 18;

  // Subtotal
  drawTotalRow(doc, boxX, boxW, y, 'Sous-total', money(order.subtotal), false);
  y += rowH;

  if (order.tax_exempt) {
    drawTotalRow(doc, boxX, boxW, y, 'Taxes', 'Exempté', false);
    y += rowH;
  } else {
    drawTotalRow(doc, boxX, boxW, y, 'TPS (5 %)', money(order.gst), false);
    y += rowH;
    drawTotalRow(doc, boxX, boxW, y, 'TVQ (9,975 %)', money(order.qst), false);
    y += rowH;
  }

  // Returns (facture only, if applicable)
  if (variant === 'facture' && (order.returned_amount ?? 0) > 0) {
    drawTotalRow(doc, boxX, boxW, y, 'Retour / crédit', `- ${money(order.returned_amount)}`, false, MUTED);
    y += rowH;
  }

  // TOTAL (highlight)
  const totalH = 28;
  doc.rect(boxX, y, boxW, totalH).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13);
  doc.text('TOTAL', boxX + 12, y + 9);
  doc.text(money(order.total), boxX + 12, y + 9, { width: boxW - 24, align: 'right' });
  y += totalH;

  // Payment block (facture only)
  if (variant === 'facture') {
    y += 6;
    const netTotal = (order.total ?? 0) - (order.returned_amount ?? 0);
    const paid = order.paid_amount ?? 0;
    const balance = netTotal - paid;

    if (paid > 0) {
      drawTotalRow(doc, boxX, boxW, y, 'Payé à ce jour', money(paid), false, SUCCESS);
      y += rowH;
    }
    if (balance > 0.009) {
      drawTotalRow(doc, boxX, boxW, y, 'Solde à payer', money(balance), true, ACCENT);
      y += rowH + 2;
    } else if (paid > 0) {
      drawTotalRow(doc, boxX, boxW, y, 'Statut', 'PAYÉE', true, SUCCESS);
      y += rowH + 2;
    }
  }

  // Notes on the left
  if (order.notes) {
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('NOTES', PAGE_MARGIN, startY + 14, { characterSpacing: 1.5 });
    doc
      .fillColor(DARK)
      .font('Helvetica')
      .fontSize(9)
      .text(order.notes, PAGE_MARGIN, startY + 28, { width: boxX - PAGE_MARGIN - 20 });
  }
}

function drawTotalRow(
  doc: PDFKit.PDFDocument,
  x: number,
  w: number,
  y: number,
  label: string,
  value: string,
  bold: boolean,
  color: string = DARK,
) {
  doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10);
  doc.text(label, x + 12, y);
  doc.text(value, x + 12, y, { width: w - 24, align: 'right' });
}

function drawCompanyFooter(doc: PDFKit.PDFDocument, variant: Variant) {
  const W = doc.page.width;
  const H = doc.page.height;
  const y = H - FOOTER_H;

  doc.strokeColor(BORDER).lineWidth(0.5).moveTo(PAGE_MARGIN, y).lineTo(W - PAGE_MARGIN, y).stroke();

  // Footer content
  doc.fillColor(MUTED).font('Helvetica').fontSize(8);
  const companyLine = [env.COMPANY_ADDRESS, env.COMPANY_PHONE, env.COMPANY_EMAIL]
    .filter(Boolean)
    .join('  ·  ');
  if (companyLine) {
    doc.text(companyLine, PAGE_MARGIN, y + 8, { width: W - 2 * PAGE_MARGIN, align: 'center' });
  }

  const taxLine = [
    env.COMPANY_GST && `TPS ${env.COMPANY_GST}`,
    env.COMPANY_QST && `TVQ ${env.COMPANY_QST}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (taxLine) {
    doc.text(taxLine, PAGE_MARGIN, y + 20, { width: W - 2 * PAGE_MARGIN, align: 'center' });
  }

  // Disclaimer
  doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8);
  const disclaimer =
    variant === 'bon'
      ? 'Bon de commande valide 7 jours — les prix et la disponibilité peuvent varier au-delà de ce délai.'
      : 'Merci de votre confiance. Paiement selon les termes convenus.';
  doc.text(disclaimer, PAGE_MARGIN, y + 34, { width: W - 2 * PAGE_MARGIN, align: 'center' });
}

/* -------------------- PUBLIC RENDER -------------------- */

function renderToDoc(doc: PDFKit.PDFDocument, variant: Variant, orderId: number) {
  const { order, items } = loadOrder(orderId);
  drawHeader(doc, variant, order);
  const afterMeta = drawMetaBlock(doc, variant, order);
  const afterTable = drawItemsTable(doc, items, afterMeta, variant, order);
  drawTotals(doc, order, variant, afterTable);
  drawCompanyFooter(doc, variant);
}

export function streamPdf(variant: Variant, orderId: number, stream: NodeJS.WritableStream) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true });
  doc.pipe(stream);
  renderToDoc(doc, variant, orderId);
  doc.end();
}

function bufferPdf(variant: Variant, orderId: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      renderToDoc(doc, variant, orderId);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function renderBonDeCommandeSync(orderId: number): Promise<Buffer> {
  return bufferPdf('bon', orderId);
}

export function renderFactureSync(orderId: number): Promise<Buffer> {
  return bufferPdf('facture', orderId);
}
