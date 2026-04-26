import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import env from './lib/env.js';
import { runMigrations } from './db/index.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import clientRoutes from './routes/client.js';
import publicRoutes from './routes/public.js';

runMigrations();

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(authenticate);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
// Catch-all 404 for unknown admin paths (prevents falling through to client routes)
app.use('/api/admin', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.use('/api/public', publicRoutes);
app.use('/api', clientRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api error]', err);
  if (err?.message === 'bad_type') return res.status(400).json({ error: 'invalid_image_type' });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
  res.status(500).json({ error: 'server_error' });
});

app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT}`);
});
