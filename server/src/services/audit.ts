import type { Request } from 'express';
import { db } from '../db/index.js';

export function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: number | bigint | string | null,
  diff?: Record<string, any> | null,
) {
  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, diff, ip) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      req.user?.id ?? null,
      action,
      entity,
      entityId != null ? Number(entityId) : null,
      diff ? JSON.stringify(diff) : null,
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null,
    );
  } catch (err) {
    console.warn('[audit] failed:', err);
  }
}
