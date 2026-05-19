import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay } from './client';
import { serverEnv } from '@/lib/env';

// Hook event types the platform subscribes to. Mangopay delivers each as an
// HTTP GET notification carrying only EventType + RessourceId + Date.
export const HOOK_EVENT_TYPES: Mangopay.event.EventType[] = [
  'PAYIN_NORMAL_SUCCEEDED',
  'PAYIN_NORMAL_FAILED',
  'PAYOUT_NORMAL_SUCCEEDED',
  'PAYOUT_NORMAL_FAILED',
  'TRANSFER_NORMAL_SUCCEEDED',
  'TRANSFER_NORMAL_FAILED',
  'TRANSFER_REFUND_SUCCEEDED',
  'PAYIN_REFUND_SUCCEEDED',
  'KYC_SUCCEEDED',
  'KYC_FAILED',
  'DISPUTE_CREATED',
  'DISPUTE_ACTION_REQUIRED',
  'DISPUTE_CLOSED',
  'PAYIN_REPUDIATION_CREATED',
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

// Matches an IPv4 address against one allowlist entry (exact IP or CIDR).
function matchesEntry(ip: string, entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;
  const slash = trimmed.indexOf('/');
  if (slash === -1) return ip === trimmed;
  const base = ipv4ToInt(trimmed.slice(0, slash));
  const bits = Number(trimmed.slice(slash + 1));
  const addr = ipv4ToInt(ip);
  if (base === null || addr === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (base & mask) === (addr & mask);
}

// Verifies a webhook request IP against MANGOPAY_WEBHOOK_ALLOWED_IPS. Hooks are
// unsigned, so this allowlist is the only authentication.
export function isAllowedWebhookIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  // Normalise an IPv4-mapped IPv6 address (::ffff:1.2.3.4).
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const entries = serverEnv().MANGOPAY_WEBHOOK_ALLOWED_IPS.split(',');
  return entries.some((entry) => entry.trim() === ip || matchesEntry(v4, entry));
}

// Idempotently registers/updates the Hooks. Used by `npm run setup:mangopay`.
export async function registerHooks(notificationUrl: string): Promise<void> {
  const mango = mangopay();
  const existing = await mango.Hooks.getAll();
  for (const eventType of HOOK_EVENT_TYPES) {
    const hook = existing.find((h) => h.EventType === eventType);
    if (hook) {
      await mango.Hooks.update({ Id: hook.Id, Url: notificationUrl, Status: 'ENABLED' });
    } else {
      await mango.Hooks.create({ EventType: eventType, Url: notificationUrl });
    }
  }
}
