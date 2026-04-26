import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import env from '../lib/env.js';
import { db } from '../db/index.js';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'client';
  must_change_password: boolean;
  client_id: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: number) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d' });
}

function loadUser(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.must_change_password, u.active, c.id AS client_id
       FROM users u LEFT JOIN clients c ON c.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(userId) as
    | {
        id: number;
        username: string;
        role: 'admin' | 'client';
        must_change_password: number;
        active: number;
        client_id: number | null;
      }
    | undefined;
  if (!row || !row.active) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    must_change_password: !!row.must_change_password,
    client_id: row.client_id,
  };
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.['dac_token'];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: number };
    const user = loadUser(Number(payload.sub));
    if (user) req.user = user;
  } catch {
    // invalid token ignored
  }
  next();
}

export function requireAuth(role?: 'admin' | 'client') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (role && req.user.role !== role) return res.status(403).json({ error: 'forbidden' });
    if (req.user.must_change_password && req.path !== '/change-password' && req.path !== '/me' && req.path !== '/logout') {
      return res.status(403).json({ error: 'must_change_password' });
    }
    next();
  };
}
