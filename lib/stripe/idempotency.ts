import { createHash } from 'crypto';

interface IdempotencyInput {
  staffId: string;
  amount: number;
  nonce: string; // UUID generated client-side per page load
}

export function generateIdempotencyKey(input: IdempotencyInput): string {
  const raw = `${input.staffId}:${input.amount}:${input.nonce}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 40);
}
