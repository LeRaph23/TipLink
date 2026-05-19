import { createHash } from 'crypto';

interface IdempotencyInput {
  // Discriminates the payment context (staff id, establishment id, or a pack
  // scope like `pack-express`) so unrelated checkouts never collide.
  scope: string;
  amount: number;
  nonce: string; // UUID generated client-side per page load
}

// Deterministic key used for the transactions / payin_contexts idempotency_key
// unique column so a retried checkout never creates a duplicate PayIn.
export function generateIdempotencyKey(input: IdempotencyInput): string {
  const raw = `${input.scope}:${input.amount}:${input.nonce}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 40);
}
