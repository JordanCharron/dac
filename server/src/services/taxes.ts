export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export interface TaxableLine {
  line_total: number;
  taxable: boolean;
}

export function computeTaxes(lines: TaxableLine[], opts?: { exempt?: boolean }) {
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  if (opts?.exempt) {
    return { subtotal: round2(subtotal), gst: 0, qst: 0, total: round2(subtotal) };
  }
  const taxableBase = lines.filter((l) => l.taxable).reduce((s, l) => s + l.line_total, 0);
  const gst = round2(taxableBase * GST_RATE);
  const qst = round2(taxableBase * QST_RATE);
  const total = round2(subtotal + gst + qst);
  return { subtotal: round2(subtotal), gst, qst, total };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
