import { customAlphabet } from 'nanoid';

// URL-safe alphabet without ambiguous chars (0, O, I, l)
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

// 8 chars ≈ 57^8 > 1 trillion combinations — negligible collision risk at scale
export const nanoid = customAlphabet(alphabet, 8);
