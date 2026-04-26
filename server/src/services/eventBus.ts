import type { Response } from 'express';

type Client = { res: Response; userId: number };
const clients = new Set<Client>();

export function addAdminSubscriber(res: Response, userId: number): () => void {
  const client: Client = { res, userId };
  clients.add(client);
  return () => clients.delete(client);
}

export interface AdminEvent {
  type: string;
  [k: string]: any;
}

export function publishAdminEvent(event: AdminEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) {
    try {
      c.res.write(payload);
    } catch {
      clients.delete(c);
    }
  }
}
