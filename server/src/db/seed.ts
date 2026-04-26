import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, runMigrations } from './index.js';
import { computeTaxes } from '../services/taxes.js';

runMigrations();

type Row = Record<string, any>;

const ADMIN_PWD = 'password';
const CLIENT_PWD = 'password';

function hash(pwd: string) {
  return bcrypt.hashSync(pwd, 10);
}

function isoDaysAgo(days: number, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function isoDateAhead(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const rng = seeded(42);

console.log('[seed] resetting data…');
db.exec('BEGIN');
try {
  db.exec(`
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM stock_movements;
    DELETE FROM product_prices;
    DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM clients;
    DELETE FROM price_lists;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

/* ---------- USERS ---------- */
const adminId = Number(
  db
    .prepare(
      `INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'admin', 0)`,
    )
    .run('admin', hash(ADMIN_PWD)).lastInsertRowid,
);
console.log('[seed] admin:', 'admin', '/', ADMIN_PWD);

/* ---------- CATEGORIES ---------- */
const categoriesData: Array<[string, string]> = [
  ['Bœuf', 'Beef'],
  ['Porc', 'Pork'],
  ['Volaille', 'Poultry'],
  ['Agneau', 'Lamb'],
  ['Veau', 'Veal'],
  ['Charcuterie', 'Deli meats'],
  ['Poisson & fruits de mer', 'Fish & seafood'],
  ['Autre', 'Other'],
];
const catIds: Record<string, number> = {};
const insCat = db.prepare('INSERT INTO categories (name_fr, name_en, sort_order) VALUES (?, ?, ?)');
categoriesData.forEach(([fr, en], i) => {
  const r = insCat.run(fr, en, i);
  catIds[fr] = Number(r.lastInsertRowid);
});

/* ---------- PRICE LISTS ---------- */
const plStandard = Number(db.prepare('INSERT INTO price_lists (name, is_default) VALUES (?, 1)').run('Standard').lastInsertRowid);
const plPremium = Number(db.prepare('INSERT INTO price_lists (name, is_default) VALUES (?, 0)').run('Restaurants haut de gamme').lastInsertRowid);
const plVolume = Number(db.prepare('INSERT INTO price_lists (name, is_default) VALUES (?, 0)').run('Volume / chaîne').lastInsertRowid);

/* ---------- PRODUCTS ---------- */
type P = {
  code: string;
  cat: string;
  name_fr: string;
  name_en: string;
  unit: 'kg' | 'caisse' | 'unite';
  stock: number;
  low: number;
  taxable: boolean;
  variable_weight: boolean;
  cut_grade?: string;
  supplier?: string;
  lot?: string;
  packedDaysAgo?: number;
  expiresDaysAhead?: number;
  price_standard: number;
  price_premium?: number;
  price_volume?: number;
};

// At Quebec: raw meat/fish/basic groceries are zero-rated (non-taxable). Only prepared/snack items are taxable.
// Stocks set high enough for 2 months of demo data without going negative.
const products: P[] = [
  // BŒUF (non-taxable — viande crue)
  { code: 'BF-BAV-AAA', cat: 'Bœuf', name_fr: 'Bavette de bœuf', name_en: 'Beef skirt steak', unit: 'kg', stock: 720, low: 120, taxable: false, variable_weight: true, cut_grade: 'AAA désossé', supplier: 'Boucherie Nord-Est', lot: 'L-2026-042', packedDaysAgo: 5, expiresDaysAhead: 18, price_standard: 24.5, price_premium: 27.0, price_volume: 22.0 },
  { code: 'BF-FLA-AAA', cat: 'Bœuf', name_fr: 'Filet mignon', name_en: 'Beef tenderloin', unit: 'kg', stock: 72, low: 24, taxable: false, variable_weight: true, cut_grade: 'AAA centre', supplier: 'Boucherie Nord-Est', lot: 'L-2026-043', packedDaysAgo: 4, expiresDaysAhead: 16, price_standard: 62.0, price_premium: 68.0, price_volume: 57.0 },
  { code: 'BF-CTE-AA', cat: 'Bœuf', name_fr: 'Côte de bœuf', name_en: 'Rib steak', unit: 'kg', stock: 120, low: 30, taxable: false, variable_weight: true, cut_grade: 'AA avec os', supplier: 'Les Viandes du Québec', packedDaysAgo: 3, expiresDaysAhead: 14, price_standard: 38.0, price_premium: 42.0, price_volume: 34.5 },
  { code: 'BF-HAC-EXT', cat: 'Bœuf', name_fr: 'Bœuf haché extra-maigre', name_en: 'Extra-lean ground beef', unit: 'kg', stock: 340, low: 75, taxable: false, variable_weight: false, supplier: 'Les Viandes du Québec', packedDaysAgo: 2, expiresDaysAhead: 7, price_standard: 11.75, price_premium: 12.5, price_volume: 10.5 },
  { code: 'BF-ROS-AA', cat: 'Bœuf', name_fr: 'Rôti de palette', name_en: 'Chuck roast', unit: 'kg', stock: 88, low: 24, taxable: false, variable_weight: true, cut_grade: 'AA', supplier: 'Les Viandes du Québec', packedDaysAgo: 4, expiresDaysAhead: 12, price_standard: 14.5, price_premium: 16.0, price_volume: 13.0 },
  { code: 'BF-CUB-AA', cat: 'Bœuf', name_fr: 'Bœuf en cubes à mijoter', name_en: 'Stewing beef cubes', unit: 'kg', stock: 112, low: 30, taxable: false, variable_weight: false, supplier: 'Les Viandes du Québec', packedDaysAgo: 3, expiresDaysAhead: 8, price_standard: 12.0, price_premium: 13.5, price_volume: 10.75 },

  // PORC (non-taxable)
  { code: 'PC-FIL', cat: 'Porc', name_fr: 'Filet de porc', name_en: 'Pork tenderloin', unit: 'kg', stock: 144, low: 36, taxable: false, variable_weight: true, supplier: 'Ferme Dumoulin', packedDaysAgo: 3, expiresDaysAhead: 10, price_standard: 16.5, price_premium: 18.0, price_volume: 14.75 },
  { code: 'PC-COT', cat: 'Porc', name_fr: 'Côtelettes de porc', name_en: 'Pork chops', unit: 'kg', stock: 192, low: 45, taxable: false, variable_weight: true, cut_grade: 'avec os', supplier: 'Ferme Dumoulin', packedDaysAgo: 2, expiresDaysAhead: 9, price_standard: 13.75, price_premium: 15.0, price_volume: 12.5 },
  { code: 'PC-EPP', cat: 'Porc', name_fr: 'Épaule de porc désossée', name_en: 'Boneless pork shoulder', unit: 'kg', stock: 160, low: 36, taxable: false, variable_weight: true, supplier: 'Ferme Dumoulin', packedDaysAgo: 4, expiresDaysAhead: 11, price_standard: 9.5, price_premium: 10.5, price_volume: 8.75 },
  { code: 'PC-BAC', cat: 'Porc', name_fr: 'Bacon tranché', name_en: 'Sliced bacon', unit: 'caisse', stock: 72, low: 15, taxable: false, variable_weight: false, supplier: 'Salaisons Olymel', packedDaysAgo: 6, expiresDaysAhead: 28, price_standard: 54.0, price_premium: 58.0, price_volume: 50.0 },

  // VOLAILLE (non-taxable)
  { code: 'VL-POI-ENT', cat: 'Volaille', name_fr: 'Poulet entier', name_en: 'Whole chicken', unit: 'unite', stock: 240, low: 60, taxable: false, variable_weight: false, supplier: 'Ferme St-Antoine', packedDaysAgo: 2, expiresDaysAhead: 5, price_standard: 14.0, price_premium: 15.5, price_volume: 12.5 },
  { code: 'VL-POI-POI', cat: 'Volaille', name_fr: 'Poitrines de poulet désossées', name_en: 'Boneless chicken breasts', unit: 'kg', stock: 220, low: 60, taxable: false, variable_weight: false, supplier: 'Ferme St-Antoine', packedDaysAgo: 1, expiresDaysAhead: 6, price_standard: 16.25, price_premium: 17.5, price_volume: 14.75 },
  { code: 'VL-POI-HAU', cat: 'Volaille', name_fr: 'Hauts de cuisses de poulet', name_en: 'Chicken thighs', unit: 'kg', stock: 180, low: 45, taxable: false, variable_weight: false, supplier: 'Ferme St-Antoine', packedDaysAgo: 2, expiresDaysAhead: 5, price_standard: 10.5, price_premium: 11.75, price_volume: 9.25 },
  { code: 'VL-DIN', cat: 'Volaille', name_fr: 'Dinde entière', name_en: 'Whole turkey', unit: 'kg', stock: 88, low: 24, taxable: false, variable_weight: true, supplier: 'Dindon du Québec', packedDaysAgo: 5, expiresDaysAhead: 30, price_standard: 8.75, price_premium: 9.5, price_volume: 7.95 },
  { code: 'VL-CAN-MAG', cat: 'Volaille', name_fr: 'Magret de canard', name_en: 'Duck breast', unit: 'kg', stock: 56, low: 15, taxable: false, variable_weight: true, supplier: 'Canard du Lac Brome', packedDaysAgo: 3, expiresDaysAhead: 12, price_standard: 34.0, price_premium: 37.5, price_volume: 31.0 },

  // AGNEAU (non-taxable)
  { code: 'AG-CAR', cat: 'Agneau', name_fr: "Carré d'agneau", name_en: 'Rack of lamb', unit: 'kg', stock: 48, low: 12, taxable: false, variable_weight: true, supplier: 'Bergerie Charlevoix', packedDaysAgo: 4, expiresDaysAhead: 14, price_standard: 48.0, price_premium: 54.0, price_volume: 43.5 },
  { code: 'AG-GIG', cat: 'Agneau', name_fr: "Gigot d'agneau", name_en: 'Leg of lamb', unit: 'kg', stock: 64, low: 15, taxable: false, variable_weight: true, supplier: 'Bergerie Charlevoix', packedDaysAgo: 5, expiresDaysAhead: 12, price_standard: 28.5, price_premium: 32.0, price_volume: 26.0 },

  // VEAU (non-taxable)
  { code: 'VE-ESC', cat: 'Veau', name_fr: 'Escalope de veau', name_en: 'Veal scaloppine', unit: 'kg', stock: 72, low: 18, taxable: false, variable_weight: true, supplier: 'Veau Charlevoix', packedDaysAgo: 2, expiresDaysAhead: 7, price_standard: 32.0, price_premium: 36.0, price_volume: 29.0 },
  { code: 'VE-JAR', cat: 'Veau', name_fr: 'Jarret de veau', name_en: 'Veal shank', unit: 'kg', stock: 40, low: 9, taxable: false, variable_weight: true, supplier: 'Veau Charlevoix', packedDaysAgo: 3, expiresDaysAhead: 10, price_standard: 22.0, price_premium: 24.5, price_volume: 20.0 },

  // CHARCUTERIE (taxable — produits préparés)
  { code: 'CH-JAM-CRU', cat: 'Charcuterie', name_fr: 'Jambon cru italien', name_en: 'Italian prosciutto', unit: 'kg', stock: 32, low: 9, taxable: true, variable_weight: true, supplier: 'Salumeria Romana', packedDaysAgo: 7, expiresDaysAhead: 45, price_standard: 58.0, price_premium: 64.0, price_volume: 52.0 },
  { code: 'CH-SAL', cat: 'Charcuterie', name_fr: 'Saucisson sec', name_en: 'Dry sausage', unit: 'kg', stock: 56, low: 12, taxable: true, variable_weight: true, supplier: 'Salumeria Romana', packedDaysAgo: 10, expiresDaysAhead: 60, price_standard: 32.5, price_premium: 36.0, price_volume: 29.0 },
  { code: 'CH-PAT', cat: 'Charcuterie', name_fr: 'Pâté de campagne', name_en: 'Country pâté', unit: 'unite', stock: 100, low: 24, taxable: true, variable_weight: false, supplier: 'Charcuterie Leclerc', packedDaysAgo: 4, expiresDaysAhead: 18, price_standard: 9.25, price_premium: 10.5, price_volume: 8.5 },

  // POISSON & FRUITS DE MER (non-taxable — aliments de base)
  { code: 'PO-SAU-FR', cat: 'Poisson & fruits de mer', name_fr: 'Filet de saumon frais', name_en: 'Fresh salmon fillet', unit: 'kg', stock: 80, low: 18, taxable: false, variable_weight: true, supplier: 'Poissonnerie Gaspé', packedDaysAgo: 1, expiresDaysAhead: 4, price_standard: 26.0, price_premium: 29.0, price_volume: 23.5 },
  { code: 'PO-MOR', cat: 'Poisson & fruits de mer', name_fr: 'Morue salée', name_en: 'Salt cod', unit: 'kg', stock: 48, low: 12, taxable: false, variable_weight: true, supplier: 'Poissonnerie Gaspé', packedDaysAgo: 6, expiresDaysAhead: 90, price_standard: 19.5, price_premium: 22.0, price_volume: 17.75 },
  { code: 'PO-CRE-NOR', cat: 'Poisson & fruits de mer', name_fr: 'Crevettes nordiques', name_en: 'Nordic shrimp', unit: 'caisse', stock: 60, low: 15, taxable: false, variable_weight: false, supplier: 'Poissonnerie Gaspé', packedDaysAgo: 3, expiresDaysAhead: 21, price_standard: 48.0, price_premium: 52.5, price_volume: 44.0 },

  // AUTRE (non taxables pour démonstration: légumes d'accompagnement)
  { code: 'AU-OIG', cat: 'Autre', name_fr: "Oignons jaunes (sac 10 kg)", name_en: 'Yellow onions (10 kg bag)', unit: 'caisse', stock: 120, low: 30, taxable: false, variable_weight: false, supplier: 'Les Jardins du Québec', packedDaysAgo: 3, expiresDaysAhead: 21, price_standard: 12.0, price_premium: 13.5, price_volume: 11.0 },
  { code: 'AU-POM', cat: 'Autre', name_fr: 'Pommes de terre Russet (sac 10 kg)', name_en: 'Russet potatoes (10 kg bag)', unit: 'caisse', stock: 160, low: 45, taxable: false, variable_weight: false, supplier: 'Les Jardins du Québec', packedDaysAgo: 4, expiresDaysAhead: 28, price_standard: 9.5, price_premium: 10.5, price_volume: 8.75 },
  { code: 'AU-BEU', cat: 'Autre', name_fr: 'Beurre non salé (caisse 20 lb)', name_en: 'Unsalted butter (20 lb case)', unit: 'caisse', stock: 32, low: 9, taxable: false, variable_weight: false, supplier: 'Laiterie de Charlevoix', packedDaysAgo: 7, expiresDaysAhead: 60, price_standard: 88.0, price_premium: 92.0, price_volume: 84.0 },
];

const productIds: Record<string, number> = {};
const insertProduct = db.prepare(
  `INSERT INTO products (code, category_id, name_fr, name_en, unit, stock_qty, low_stock_threshold,
     cut_grade, variable_weight, taxable, supplier, lot_number, packed_at, expires_at, active, description_fr, description_en)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
);
const insertPrice = db.prepare('INSERT INTO product_prices (price_list_id, product_id, price) VALUES (?, ?, ?)');

for (const p of products) {
  const id = Number(
    insertProduct.run(
      p.code,
      catIds[p.cat],
      p.name_fr,
      p.name_en,
      p.unit,
      p.stock,
      p.low,
      p.cut_grade ?? null,
      p.variable_weight ? 1 : 0,
      p.taxable ? 1 : 0,
      p.supplier ?? null,
      p.lot ?? null,
      p.packedDaysAgo != null ? isoDaysAgo(p.packedDaysAgo).slice(0, 10) : null,
      p.expiresDaysAhead != null ? isoDateAhead(p.expiresDaysAhead) : null,
      `${p.name_fr} — ${p.supplier ?? ''}`,
      `${p.name_en} — ${p.supplier ?? ''}`,
    ).lastInsertRowid,
  );
  productIds[p.code] = id;
  insertPrice.run(plStandard, id, p.price_standard);
  if (p.price_premium != null) insertPrice.run(plPremium, id, p.price_premium);
  if (p.price_volume != null) insertPrice.run(plVolume, id, p.price_volume);
}

/* ---------- CLIENTS ---------- */
type ClientDef = {
  username: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  delivery_address: string;
  pricing_mode: 'price_list' | 'quote';
  price_list_id: number | null;
  min_order_amount: number | null;
  notes?: string;
};

const clientDefs: ClientDef[] = [
  {
    username: 'bistrole21',
    company_name: 'Bistro Le 21',
    contact_name: 'Marc Tremblay',
    phone: '418-555-0121',
    email: 'marc@bistrole21.ca',
    delivery_address: '21 rue Saint-Jean\nQuébec, QC G1R 1N8',
    pricing_mode: 'price_list',
    price_list_id: plPremium,
    min_order_amount: 200,
    notes: 'Livraison matin avant 10h. Demande facture électronique.',
  },
  {
    username: 'auberge_charlevoix',
    company_name: 'Auberge de Charlevoix',
    contact_name: 'Sophie Bouchard',
    phone: '418-555-0342',
    email: 'commandes@auberge-charlevoix.ca',
    delivery_address: '445 chemin des Falaises\nBaie-Saint-Paul, QC G3Z 2Y5',
    pricing_mode: 'price_list',
    price_list_id: plPremium,
    min_order_amount: 350,
    notes: 'Menu saisonnier — privilégier produits locaux.',
  },
  {
    username: 'bouchdugoulet',
    company_name: 'Boucherie du Goulet',
    contact_name: 'Jean-François Roy',
    phone: '514-555-0876',
    email: 'jf@bouchdugoulet.ca',
    delivery_address: '1276 rue Beaubien E\nMontréal, QC H2G 1L3',
    pricing_mode: 'price_list',
    price_list_id: plStandard,
    min_order_amount: 150,
  },
  {
    username: 'resto_nord',
    company_name: 'Restaurant Le Nord',
    contact_name: 'Isabelle Gagnon',
    phone: '819-555-0219',
    email: 'isabelle@restolenord.ca',
    delivery_address: '88 rue Principale\nSaguenay, QC G7H 4K7',
    pricing_mode: 'price_list',
    price_list_id: plStandard,
    min_order_amount: 100,
  },
  {
    username: 'marche_ledoux',
    company_name: 'Marché Ledoux (chaîne 4 succursales)',
    contact_name: 'Pierre Ledoux',
    phone: '450-555-0440',
    email: 'commandes@marcheledoux.ca',
    delivery_address: '1100 boul. Industriel\nLaval, QC H7L 4R7',
    pricing_mode: 'price_list',
    price_list_id: plVolume,
    min_order_amount: 500,
    notes: 'Livraisons hebdomadaires le mardi + jeudi.',
  },
  {
    username: 'traiteur_rose',
    company_name: 'Traiteur La Rose',
    contact_name: 'Mélanie Dubois',
    phone: '438-555-0812',
    email: 'melanie@traiteurlarose.ca',
    delivery_address: '67 av. du Parc\nMontréal, QC H2W 1E1',
    pricing_mode: 'quote',
    price_list_id: null,
    min_order_amount: null,
    notes: 'Mode soumission — prix sur devis par commande.',
  },
  {
    username: 'hotel_centre',
    company_name: "Hôtel du Centre-Ville",
    contact_name: 'Sylvain Morin',
    phone: '514-555-0901',
    email: 'achats@hotelducentre.ca',
    delivery_address: '900 rue Sherbrooke O\nMontréal, QC H3A 2R7',
    pricing_mode: 'price_list',
    price_list_id: plPremium,
    min_order_amount: 400,
  },
];

const insClient = db.prepare(
  `INSERT INTO clients (user_id, company_name, contact_name, phone, email, delivery_address, notes,
     pricing_mode, price_list_id, min_order_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insUser = db.prepare(
  `INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'client', 0)`,
);

const clientIds: Record<string, number> = {};
for (const c of clientDefs) {
  const uid = Number(insUser.run(c.username, hash(CLIENT_PWD)).lastInsertRowid);
  const cid = Number(
    insClient.run(
      uid,
      c.company_name,
      c.contact_name,
      c.phone,
      c.email,
      c.delivery_address,
      c.notes ?? null,
      c.pricing_mode,
      c.price_list_id,
      c.min_order_amount,
    ).lastInsertRowid,
  );
  clientIds[c.username] = cid;
  console.log('[seed] client:', c.username, '/', CLIENT_PWD, '→', c.company_name);
}

/* ---------- ORDERS (2 months of history) ---------- */
const allProductCodes = Object.keys(productIds);
const insertOrder = db.prepare(
  `INSERT INTO orders (client_id, order_number, status, fulfillment_method, requested_delivery_date,
     submitted_at, quoted_at, quote_sent_at, accepted_at, delivered_at, invoice_sent_at, acceptance_token,
     subtotal, gst, qst, total, notes, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertItem = db.prepare(
  `INSERT INTO order_items (order_id, product_id, product_name_snapshot, unit_snapshot, taxable_snapshot,
     variable_weight_snapshot, quantity_requested, quantity_confirmed, unit_price_snapshot, line_total)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertMovement = db.prepare(
  `INSERT INTO stock_movements (product_id, delta, reason, note, order_id, user_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

function getProductSnapshot(code: string) {
  const id = productIds[code];
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
  return { id, ...row };
}

function priceFor(plId: number | null, productId: number): number | null {
  if (!plId) return null;
  const r = db
    .prepare('SELECT price FROM product_prices WHERE price_list_id = ? AND product_id = ?')
    .get(plId, productId) as { price: number } | undefined;
  return r?.price ?? null;
}

// Order number generator per year
const orderCounters: Record<number, number> = {};
function makeOrderNumber(submittedAt: string): string {
  const year = new Date(submittedAt).getFullYear();
  orderCounters[year] = (orderCounters[year] ?? 0) + 1;
  return `DAC-${year}-${String(orderCounters[year]).padStart(4, '0')}`;
}

let totalOrders = 0;
const clientUsernames = Object.keys(clientIds);

// Target distribution: 3 submitted, 5 quoted, 5 accepted, 28 delivered, 4 cancelled
const statusPlan: Array<'submitted' | 'quoted' | 'accepted' | 'delivered' | 'cancelled'> = [
  ...Array(3).fill('submitted'),
  ...Array(5).fill('quoted'),
  ...Array(5).fill('accepted'),
  ...Array(28).fill('delivered'),
  ...Array(4).fill('cancelled'),
];

// Generate 45 orders over 60 days with forced status distribution
for (let i = 0; i < statusPlan.length; i++) {
  const status = statusPlan[i];
  let daysAgo: number;
  if (status === 'submitted') daysAgo = Math.floor(rng() * 2); // 0–1
  else if (status === 'quoted') daysAgo = 1 + Math.floor(rng() * 3); // 1–3
  else if (status === 'accepted') daysAgo = 2 + Math.floor(rng() * 4); // 2–5
  else daysAgo = 3 + Math.floor(rng() * 57); // 3–59

  const hour = 7 + Math.floor(rng() * 10);
  const minute = Math.floor(rng() * 60);
  const submittedAt = isoDaysAgo(daysAgo, hour, minute);

  const username = pick(clientUsernames, rng);
  const clientId = clientIds[username];
  const client = clientDefs.find((c) => c.username === username)!;

  const itemCount = 3 + Math.floor(rng() * 6);
  const codes = [...allProductCodes].sort(() => rng() - 0.5).slice(0, itemCount);

  const fulfillment: 'delivery' | 'pickup' = rng() < 0.65 ? 'delivery' : 'pickup';

  const quoteSentAt =
    status === 'submitted' ? null : isoDaysAgo(Math.max(0, daysAgo), 11, 30);
  const quotedAt = quoteSentAt;
  const acceptedAt =
    status === 'accepted' || status === 'delivered'
      ? isoDaysAgo(Math.max(0, daysAgo - 1), 14, 0)
      : null;
  const deliveredAt = status === 'delivered' ? isoDaysAgo(Math.max(0, daysAgo - 2), 9, 0) : null;
  const invoiceSentAt = status === 'delivered' ? deliveredAt : null;
  const acceptanceToken = status === 'quoted' ? crypto.randomBytes(18).toString('base64url') : null;

  const orderNumber = makeOrderNumber(submittedAt);
  const requestedDelivery = isoDaysAgo(Math.max(-14, daysAgo - 2 - Math.floor(rng() * 3))).slice(0, 10);

  // Collect items + compute totals
  const items: Array<{
    productId: number;
    name: string;
    unit: string;
    taxable: number;
    variable_weight: number;
    quantity_requested: number;
    quantity_confirmed: number | null;
    unit_price: number | null;
    line_total: number;
  }> = [];

  for (const code of codes) {
    const prod = getProductSnapshot(code);
    // quantity depends on unit
    let qtyReq: number;
    if (prod.unit === 'kg') qtyReq = 1 + Math.floor(rng() * 15) + rng() * 0.5;
    else if (prod.unit === 'caisse') qtyReq = 1 + Math.floor(rng() * 5);
    else qtyReq = 1 + Math.floor(rng() * 10);
    qtyReq = Math.round(qtyReq * 2) / 2; // nearest 0.5
    const unitPrice = priceFor(client.price_list_id, prod.id);

    let qtyConf: number | null = null;
    if (status === 'accepted' || status === 'delivered') {
      if (prod.variable_weight) {
        qtyConf = Math.round(qtyReq * (0.95 + rng() * 0.08) * 100) / 100;
      } else {
        qtyConf = qtyReq;
      }
    }

    const effectiveQty = qtyConf ?? qtyReq;
    const lineTotal = unitPrice != null ? Math.round(effectiveQty * unitPrice * 100) / 100 : 0;

    items.push({
      productId: prod.id,
      name: prod.name_fr,
      unit: prod.unit,
      taxable: prod.taxable,
      variable_weight: prod.variable_weight,
      quantity_requested: qtyReq,
      quantity_confirmed: qtyConf,
      unit_price: unitPrice,
      line_total: lineTotal,
    });
  }

  const taxLines = items.map((it) => ({ line_total: it.line_total, taxable: !!it.taxable }));
  const { subtotal, gst, qst, total } = computeTaxes(taxLines);

  const orderId = Number(
    insertOrder.run(
      clientId,
      orderNumber,
      status,
      fulfillment,
      requestedDelivery,
      submittedAt,
      quotedAt,
      quoteSentAt,
      acceptedAt,
      deliveredAt,
      invoiceSentAt,
      acceptanceToken,
      subtotal,
      gst,
      qst,
      total,
      null,
      submittedAt,
      deliveredAt ?? acceptedAt ?? quoteSentAt ?? submittedAt,
    ).lastInsertRowid,
  );
  // Zero-total orders (quote-mode without priced items) are auto-paid
  if (total <= 0.005 && status === 'delivered') {
    db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(orderId);
  }

  for (const it of items) {
    insertItem.run(
      orderId,
      it.productId,
      it.name,
      it.unit,
      it.taxable,
      it.variable_weight,
      it.quantity_requested,
      it.quantity_confirmed,
      it.unit_price,
      it.line_total,
    );
    if (status === 'accepted' || status === 'delivered') {
      const qty = it.quantity_confirmed ?? it.quantity_requested;
      insertMovement.run(
        it.productId,
        -qty,
        'order_confirm',
        null,
        orderId,
        adminId,
        acceptedAt ?? submittedAt,
      );
    }
  }

  totalOrders++;
}

// A few restocks and manual corrections over the period
for (let i = 0; i < 15; i++) {
  const daysAgo = Math.floor(rng() * 60);
  const code = pick(allProductCodes, rng);
  const pid = productIds[code];
  const reasons = ['restock', 'manual_correction', 'manual_loss', 'manual_return'] as const;
  const reason = pick([...reasons], rng);
  let delta: number;
  if (reason === 'restock') delta = Math.floor(rng() * 40) + 10;
  else if (reason === 'manual_correction') delta = Math.floor(rng() * 10) - 5;
  else if (reason === 'manual_loss') delta = -(Math.floor(rng() * 6) + 1);
  else delta = Math.floor(rng() * 4) + 1;

  insertMovement.run(pid, delta, reason, null, null, adminId, isoDaysAgo(daysAgo, 8, 30));
}

console.log('[seed] orders created:', totalOrders);
console.log('[seed] products:', products.length);
console.log('[seed] clients:', clientDefs.length);
console.log('[seed] price lists: Standard, Restaurants haut de gamme, Volume / chaîne');
console.log('[seed] done.');
process.exit(0);
