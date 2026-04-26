import 'dotenv/config';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const JWT_SECRET = process.env.JWT_SECRET;

if (NODE_ENV === 'production' && !JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const env = {
  PORT: Number(process.env.API_PORT ?? 3001),
  JWT_SECRET: JWT_SECRET ?? 'dev-secret-change-me',
  NODE_ENV,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  DB_FILE: process.env.DB_FILE ?? './data/dac.db',
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? './uploads',
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'DAC <no-reply@dac.local>',
  COMPANY_NAME: process.env.COMPANY_NAME ?? 'Distribution Alimentaire Chevalier',
  COMPANY_ADDRESS: process.env.COMPANY_ADDRESS ?? '',
  COMPANY_PHONE: process.env.COMPANY_PHONE ?? '',
  COMPANY_EMAIL: process.env.COMPANY_EMAIL ?? '',
  COMPANY_GST: process.env.COMPANY_GST ?? '',
  COMPANY_QST: process.env.COMPANY_QST ?? '',
};

export default env;
