import type { Response } from "express";

const clients = new Map<number, Set<Response>>();

export function addSseClient(businessId: number, res: Response): void {
  if (!clients.has(businessId)) clients.set(businessId, new Set());
  clients.get(businessId)!.add(res);
}

export function removeSseClient(businessId: number, res: Response): void {
  const set = clients.get(businessId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(businessId);
}

export function broadcastBusinessEvent(businessId: number, eventType: string = "data-changed"): void {
  const set = clients.get(businessId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify({ type: eventType })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
    }
  }
}
