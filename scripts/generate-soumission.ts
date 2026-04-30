/**
 * Génère la soumission PDF — Portail B2B Distribution Alimentaire Chevalier.
 * Même style visuel que les bons de commande / factures du portail.
 *
 * Usage:
 *   npx tsx scripts/generate-soumission.ts
 *
 * Sortie: ./soumission-DAC.pdf à la racine du projet.
 *
 * Modifiez les constantes PROVIDER ci-dessous avec vos informations,
 * puis relancez le script.
 */

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

/* ========== À PERSONNALISER ========== */
const PROVIDER = {
  name: '[Nom de votre entreprise]',
  contact: '[Votre nom]',
  address: '[Adresse, ville, code postal]',
  phone: '[Téléphone]',
  email: '[Courriel]',
  neq: '[NEQ ou numéro d’entreprise]',
};

const CLIENT = {
  name: 'Distribution Alimentaire Chevalier Inc.',
  contact: '[Personne-contact chez DAC]',
  address: '[Adresse de DAC]',
  phone: '[Téléphone de DAC]',
  email: '[Courriel de DAC]',
};

const SOUMISSION = {
  number: 'SOUM-2026-001',
  date: new Date(),
  validityDays: 30, // jours de validité
};
/* ===================================== */

// Palette identique au PDF du portail (server/src/services/pdf.ts)
const ACCENT = '#8B1C1C';
const DARK = '#1a1a1a';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const BG_ALT = '#faf7f7';

const PAGE_MARGIN = 40;
const HEADER_H = 96;
const FOOTER_H = 56;

interface Line {
  label: string;
  description?: string;
  amount: number;
}

const LINES: Line[] = [
  {
    label: 'Développement complet du portail B2B',
    description:
      'React + Vite + TypeScript (frontend) · Node.js + Express + SQLite (backend). Authentification JWT, ' +
      'inventaire avec lots et péremption, listes de prix multiples, comptes clients gérés par admin, ' +
      'flux de commande complet (soumission → bon de commande → acceptation → prête → livrée → facturée), ' +
      'génération PDF brandée (bon de commande + facture), courriels automatiques, ' +
      'tableau de bord avec graphiques, journal d’audit, impersonation admin, mode bilingue FR/EN, ' +
      'thème clair/foncé, responsive mobile.',
    amount: 4000,
  },
  {
    label: 'Installation et mise en ligne',
    description:
      'Déploiement sur serveur via Docker, configuration du nom de domaine, certificat HTTPS (Let’s Encrypt), ' +
      'configuration SMTP pour courriels, mise en place des sauvegardes automatisées de la base de données.',
    amount: 500,
  },
  {
    label: 'Formation initiale',
    description:
      'Deux sessions de formation : une pour l’administrateur (gestion inventaire, prix, clients, commandes, ' +
      'export Sage Simple Comptable) et une pour les premiers clients (catalogue, panier, commandes).',
    amount: 300,
  },
  {
    label: 'Support et corrections de bogues — 90 jours',
    description:
      'Garantie de 90 jours après livraison : corrections sans frais des bogues découverts dans le périmètre livré. ' +
      'Réponse sous 48 h ouvrables.',
    amount: 200,
  },
];

function money(n: number): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

function shortDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(d);
}

function drawHeader(doc: PDFKit.PDFDocument) {
  const W = doc.page.width;
  doc.rect(0, 0, W, HEADER_H).fill(DARK);

  // Provider block (left)
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(PROVIDER.name, PAGE_MARGIN, 24, { width: W - PAGE_MARGIN - 240 });
  doc
    .fillColor('#cccccc')
    .font('Helvetica')
    .fontSize(9)
    .text('Solutions web sur mesure', PAGE_MARGIN, 44, {
      width: W - PAGE_MARGIN - 240,
    });

  // Title + number (right)
  const rightX = W - PAGE_MARGIN - 200;
  doc
    .fillColor(ACCENT)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('SOUMISSION', rightX, 24, { width: 200, align: 'right', characterSpacing: 2 });
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(SOUMISSION.number, rightX, 42, { width: 200, align: 'right' });

  doc.moveTo(0, HEADER_H).lineTo(W, HEADER_H).lineWidth(3).strokeColor(ACCENT).stroke();
  doc.fillColor(DARK).strokeColor(BORDER).lineWidth(1);
}

function drawMetaBlock(doc: PDFKit.PDFDocument): number {
  const W = doc.page.width;
  const top = HEADER_H + 20;
  const leftX = PAGE_MARGIN;
  const rightX = W / 2 + 10;
  const colW = W / 2 - PAGE_MARGIN - 10;

  // LEFT — Client (POUR)
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('SOUMIS À', leftX, top, { characterSpacing: 1.5 });
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text(CLIENT.name, leftX, top + 14, { width: colW });

  let ly = top + 32;
  doc.font('Helvetica').fontSize(9).fillColor(DARK);
  if (CLIENT.contact) { doc.text(CLIENT.contact, leftX, ly, { width: colW }); ly += 12; }
  if (CLIENT.phone) { doc.text(CLIENT.phone, leftX, ly, { width: colW }); ly += 12; }
  if (CLIENT.email) { doc.text(CLIENT.email, leftX, ly, { width: colW }); ly += 12; }
  if (CLIENT.address) {
    ly += 2;
    doc.fillColor(MUTED);
    for (const line of CLIENT.address.split('\n')) {
      doc.text(line, leftX, ly, { width: colW });
      ly += 11;
    }
    doc.fillColor(DARK);
  }

  // RIGHT — Détails de la soumission
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('DÉTAILS', rightX, top, { characterSpacing: 1.5 });

  const validUntil = new Date(SOUMISSION.date);
  validUntil.setDate(validUntil.getDate() + SOUMISSION.validityDays);

  const labels: Array<[string, string]> = [
    ['Date', shortDate(SOUMISSION.date)],
    ['Validité', `${SOUMISSION.validityDays} jours (jusqu’au ${shortDate(validUntil)})`],
    ['Modalités', 'Net 30 jours après livraison'],
    ['Devise', 'CAD'],
  ];

  let ry = top + 14;
  const labelW = 90;
  const valueW = colW - labelW - 6;
  for (const [label, value] of labels) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, rightX, ry, { width: labelW });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text(value, rightX + labelW + 6, ry, { width: valueW });
    ry += 14;
  }

  return Math.max(ly, ry) + 16;
}

function drawItemsTable(doc: PDFKit.PDFDocument, startY: number): number {
  const W = doc.page.width;
  const left = PAGE_MARGIN;
  const right = W - PAGE_MARGIN;
  const tableW = right - left;

  let y = startY;
  const headerH = 22;
  doc.rect(left, y, tableW, headerH).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('DESCRIPTION', left + 10, y + 7, { characterSpacing: 0.5 });
  doc.text('MONTANT', right - 110, y + 7, { width: 100, align: 'right', characterSpacing: 0.5 });
  y += headerH;

  let alt = false;
  for (const line of LINES) {
    const descColW = tableW - 130;
    const titleH = 16;
    const descLines = line.description
      ? doc.font('Helvetica').fontSize(9).heightOfString(line.description, { width: descColW - 10 })
      : 0;
    const rowH = Math.max(28, titleH + descLines + 12);

    if (alt) doc.rect(left, y, tableW, rowH).fill(BG_ALT);
    alt = !alt;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10);
    doc.text(line.label, left + 10, y + 7, { width: descColW - 10 });

    if (line.description) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5);
      doc.text(line.description, left + 10, y + 7 + titleH, {
        width: descColW - 10,
        lineGap: 1,
      });
    }

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10);
    doc.text(money(line.amount), right - 110, y + 7, { width: 100, align: 'right' });

    y += rowH;
  }

  doc.strokeColor(BORDER).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
  return y;
}

function drawTotals(doc: PDFKit.PDFDocument, y: number) {
  const W = doc.page.width;
  const right = W - PAGE_MARGIN;
  const boxW = 240;
  const boxX = right - boxW;
  let ty = y + 14;

  const total = LINES.reduce((s, l) => s + l.amount, 0);

  // Sous-total
  doc.fillColor(DARK).font('Helvetica').fontSize(10);
  doc.text('Sous-total', boxX + 12, ty);
  doc.text(money(total), boxX + 12, ty, { width: boxW - 24, align: 'right' });
  ty += 18;

  // Taxes en sus (mention)
  doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9);
  doc.text('Taxes applicables en sus', boxX + 12, ty);
  ty += 16;

  // TOTAL
  const totalH = 28;
  doc.rect(boxX, ty, boxW, totalH).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13);
  doc.text('TOTAL', boxX + 12, ty + 9);
  doc.text(money(total), boxX + 12, ty + 9, { width: boxW - 24, align: 'right' });
  ty += totalH + 24;

  // Conditions section
  const left = PAGE_MARGIN;
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('CONDITIONS', left, ty, { characterSpacing: 1.5 });
  ty += 14;

  const conditions: Array<[string, string]> = [
    ['Validité', `Cette soumission est valide ${SOUMISSION.validityDays} jours à compter de la date émise.`],
    [
      'Modalités de paiement',
      'Net 30 jours suivant la livraison du portail. Aucun acompte requis. ' +
        'Une facture détaillée sera émise à la livraison.',
    ],
    [
      'Inclusions',
      'Code source complet livré avec droits d’utilisation perpétuels. ' +
        'Documentation technique et guide de déploiement (DEPLOY.md, README.md). ' +
        'Sauvegardes automatisées configurées.',
    ],
    [
      'Garantie',
      '90 jours après livraison : corrections de bogues sans frais dans le périmètre livré. ' +
        'Toute évolution ou nouvelle fonctionnalité hors périmètre fera l’objet d’une nouvelle soumission.',
    ],
    [
      'Hébergement et frais récurrents',
      'Non inclus. Le client fournit le serveur ou le service d’hébergement (estimation : 10–25 $/mois sur un VPS standard) ' +
        'ainsi que le nom de domaine. Configuration et déploiement initial inclus.',
    ],
  ];

  doc.font('Helvetica').fontSize(9);
  for (const [label, text] of conditions) {
    if (ty > doc.page.height - FOOTER_H - 60) {
      doc.addPage();
      drawHeader(doc);
      ty = HEADER_H + 20;
    }
    doc.fillColor(DARK).font('Helvetica-Bold').text(label, left, ty);
    ty += 12;
    doc.fillColor(MUTED).font('Helvetica').text(text, left, ty, {
      width: doc.page.width - 2 * PAGE_MARGIN,
      lineGap: 1,
    });
    ty += doc.heightOfString(text, { width: doc.page.width - 2 * PAGE_MARGIN, lineGap: 1 }) + 8;
  }

  // Signatures
  ty += 8;
  if (ty > doc.page.height - FOOTER_H - 100) {
    doc.addPage();
    drawHeader(doc);
    ty = HEADER_H + 20;
  }

  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('ACCEPTATION', left, ty, { characterSpacing: 1.5 });
  ty += 14;
  doc.fillColor(DARK).font('Helvetica').fontSize(9);
  doc.text(
    'L’acceptation de cette soumission tient lieu de mandat. Veuillez signer et retourner par courriel à ' +
      PROVIDER.email +
      ' ou contresigner et conserver pour vos dossiers.',
    left,
    ty,
    { width: doc.page.width - 2 * PAGE_MARGIN, lineGap: 1 },
  );
  ty += 36;

  // Signature blocks (two columns)
  const sigW = (doc.page.width - 2 * PAGE_MARGIN - 30) / 2;
  drawSignatureBlock(doc, left, ty, sigW, 'Soumissionnaire', PROVIDER.contact, PROVIDER.name);
  drawSignatureBlock(doc, left + sigW + 30, ty, sigW, 'Pour le client', '', CLIENT.name);
}

function drawSignatureBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  role: string,
  name: string,
  org: string,
) {
  doc.strokeColor(DARK).lineWidth(0.6).moveTo(x, y + 28).lineTo(x + w, y + 28).stroke();
  doc.fillColor(MUTED).font('Helvetica').fontSize(8);
  doc.text('Signature', x, y + 32);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9);
  doc.text(role, x, y + 50);
  doc.fillColor(DARK).font('Helvetica').fontSize(9);
  if (name) doc.text(name, x, y + 62);
  doc.fillColor(MUTED).fontSize(9);
  doc.text(org, x, y + 74, { width: w });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8);
  doc.text('Date : ____ / ____ / ________', x, y + 92);
}

function drawCompanyFooter(doc: PDFKit.PDFDocument) {
  const W = doc.page.width;
  const H = doc.page.height;
  const y = H - FOOTER_H;

  doc.strokeColor(BORDER).lineWidth(0.5).moveTo(PAGE_MARGIN, y).lineTo(W - PAGE_MARGIN, y).stroke();
  doc.fillColor(MUTED).font('Helvetica').fontSize(8);
  const line1 = [PROVIDER.name, PROVIDER.address, PROVIDER.phone, PROVIDER.email]
    .filter(Boolean)
    .join('  ·  ');
  if (line1) doc.text(line1, PAGE_MARGIN, y + 8, { width: W - 2 * PAGE_MARGIN, align: 'center' });
  if (PROVIDER.neq) {
    doc.text(`NEQ : ${PROVIDER.neq}`, PAGE_MARGIN, y + 22, { width: W - 2 * PAGE_MARGIN, align: 'center' });
  }
  doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8);
  doc.text(`Soumission ${SOUMISSION.number}`, PAGE_MARGIN, y + 36, {
    width: W - 2 * PAGE_MARGIN,
    align: 'center',
  });
}

const out = path.resolve('soumission-DAC.pdf');
const stream = fs.createWriteStream(out);
const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true });
doc.pipe(stream);

drawHeader(doc);
const afterMeta = drawMetaBlock(doc);
const afterTable = drawItemsTable(doc, afterMeta);
drawTotals(doc, afterTable);

// Footer on all pages
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  drawCompanyFooter(doc);
}

doc.end();

stream.on('finish', () => {
  console.log(`[soumission] généré: ${out}`);
  console.log(`[soumission] total: ${money(LINES.reduce((s, l) => s + l.amount, 0))}`);
});
