import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db/index.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import env from '../lib/env.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

router.post('/login', loginLimiter, (req, res) => {
  const parsed = z.object({ username: z.string().min(1), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const { username, password } = parsed.data;
  const user = db
    .prepare('SELECT id, password_hash, active FROM users WHERE username = ?')
    .get(username) as { id: number; password_hash: string; active: number } | undefined;
  if (!user || !user.active) return res.status(401).json({ error: 'invalid_credentials' });
  if (!bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'invalid_credentials' });
  const token = signToken(user.id);
  res.cookie('dac_token', token, cookieOpts);
  res.json({ ok: true });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('dac_token', { ...cookieOpts, maxAge: 0 });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  res.json(req.user);
});

router.post('/change-password', requireAuth(), (req, res) => {
  const parsed = z
    .object({ current_password: z.string().min(1), new_password: z.string().min(6) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as
    | { password_hash: string }
    | undefined;
  if (!row || !bcrypt.compareSync(parsed.data.current_password, row.password_hash))
    return res.status(401).json({ error: 'invalid_credentials' });
  const newHash = bcrypt.hashSync(parsed.data.new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    newHash,
    req.user!.id,
  );
  res.json({ ok: true });
});

export default router;
