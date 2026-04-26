import env from '../lib/env.js';

const ACCENT = '#8B1C1C';
const DARK = '#1a1a1a';

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
</head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <tr><td style="background:${DARK};padding:24px 32px;">
          <div style="color:#ffffff;font-size:20px;font-weight:700;">${env.COMPANY_NAME}</div>
          <div style="color:${ACCENT};font-size:10px;font-weight:700;letter-spacing:2px;margin-top:4px;">${title.toUpperCase()}</div>
        </td></tr>
        <tr><td style="border-top:3px solid ${ACCENT};"></td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#faf7f7;padding:16px 32px;text-align:center;color:#6b7280;font-size:12px;">
          ${env.COMPANY_NAME}${env.COMPANY_ADDRESS ? '  ·  ' + env.COMPANY_ADDRESS : ''}${env.COMPANY_PHONE ? '  ·  ' + env.COMPANY_PHONE : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
    <tr><td style="background:${ACCENT};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">${label}</a>
    </td></tr></table>`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

export function quoteEmail(args: {
  company_name: string;
  contact_name: string | null;
  order_number: string;
  total: number;
  acceptance_url: string;
  fulfillment_method: 'delivery' | 'pickup';
}): { subject: string; html: string } {
  const greeting = args.contact_name ? `Bonjour ${args.contact_name},` : 'Bonjour,';
  const mode = args.fulfillment_method === 'pickup' ? 'Ramassage' : 'Livraison';
  const body = `
    <p style="font-size:15px;">${greeting}</p>
    <p>Votre bon de commande <strong>${args.order_number}</strong> est prêt à être accepté.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;background:#faf7f7;border-radius:8px;margin:16px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <div style="color:#6b7280;font-size:11px;letter-spacing:1px;font-weight:700;">TOTAL</div>
          <div style="font-size:24px;font-weight:700;color:${ACCENT};">${formatMoney(args.total)}</div>
          <div style="color:#6b7280;font-size:12px;margin-top:4px;">Mode: ${mode}</div>
        </td>
      </tr>
    </table>
    <p>Cliquez sur le bouton ci-dessous pour consulter le bon de commande détaillé et l'accepter.</p>
    ${button(args.acceptance_url, 'Voir et accepter')}
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">Si le bouton ne fonctionne pas, copiez ce lien :<br/>
    <span style="word-break:break-all;">${args.acceptance_url}</span></p>
    <p style="color:#6b7280;font-size:12px;">Ce bon de commande est valide 7 jours.</p>
  `;
  return {
    subject: `Bon de commande ${args.order_number} — ${args.company_name}`,
    html: shell('Bon de commande', body),
  };
}

export function readyEmail(args: {
  company_name: string;
  contact_name: string | null;
  order_number: string;
  fulfillment_method: 'delivery' | 'pickup';
  requested_date: string | null;
}): { subject: string; html: string } {
  const greeting = args.contact_name ? `Bonjour ${args.contact_name},` : 'Bonjour,';
  const modeText = args.fulfillment_method === 'pickup' ? 'prête au ramassage' : 'prête à être livrée';
  const body = `
    <p style="font-size:15px;">${greeting}</p>
    <p>Bonne nouvelle — votre commande <strong>${args.order_number}</strong> est maintenant <strong>${modeText}</strong>.</p>
    ${args.requested_date ? `<p>Date prévue : <strong>${args.requested_date}</strong></p>` : ''}
    <p>Nous vous contacterons pour confirmer l'heure exacte.</p>
    <p>Merci de votre confiance.</p>
  `;
  return {
    subject: `Commande ${args.order_number} ${args.fulfillment_method === 'pickup' ? 'prête au ramassage' : 'prête à être livrée'}`,
    html: shell('Commande prête', body),
  };
}

export function invoiceEmail(args: {
  company_name: string;
  contact_name: string | null;
  order_number: string;
  total: number;
  fulfillment_method: 'delivery' | 'pickup';
}): { subject: string; html: string } {
  const greeting = args.contact_name ? `Bonjour ${args.contact_name},` : 'Bonjour,';
  const mode = args.fulfillment_method === 'pickup' ? 'Ramassage' : 'Livraison';
  const body = `
    <p style="font-size:15px;">${greeting}</p>
    <p>Vous trouverez en pièce jointe la facture pour votre commande <strong>${args.order_number}</strong>.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;background:#faf7f7;border-radius:8px;margin:16px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <div style="color:#6b7280;font-size:11px;letter-spacing:1px;font-weight:700;">TOTAL FACTURÉ</div>
          <div style="font-size:24px;font-weight:700;color:${ACCENT};">${formatMoney(args.total)}</div>
          <div style="color:#6b7280;font-size:12px;margin-top:4px;">Mode: ${mode}</div>
        </td>
      </tr>
    </table>
    <p>Merci de votre confiance.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">Le paiement est dû selon les termes convenus.</p>
  `;
  return {
    subject: `Facture ${args.order_number} — ${args.company_name}`,
    html: shell('Facture', body),
  };
}
