// Initials on a soft tint picked from the name, for people without a photo.
// A grey silhouette read as an empty profile (UI/UX audit, UX-16).

const AVATAR_TINTS = ['#FDE2E8', '#E4ECFD', '#E3F5EA', '#FDF0D9', '#EDE4FB', '#DFF3F4'];

/** Text colour that reads on every tint above, in light and dark themes. */
export const AVATAR_INK = '#2a2a33';

export function avatarTint(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}
