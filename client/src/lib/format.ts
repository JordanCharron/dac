export function formatMoney(value: number | null | undefined, lang: string) {
  if (value == null) return '—';
  return new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value);
}

export function formatQty(value: number, unit: string, lang: string) {
  const n = new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', { maximumFractionDigits: 2 }).format(value);
  return `${n} ${unit}`;
}

export function formatDate(value: string | null | undefined, lang: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-CA' : 'fr-CA', { dateStyle: 'medium' }).format(d);
}
