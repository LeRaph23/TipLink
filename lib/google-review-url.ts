// Google review link helpers. Pure functions, safe on the client and the server:
// the onboarding picker and the server actions must accept exactly the same links.

/**
 * Canonical "write a review" deep link. Opening this drops the customer
 * straight on the 5-star review form for the place — no search, no app.
 */
export function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * Best-effort normalisation of whatever a manager pastes into the manual review
 * field. Accepts a bare place_id, a writereview link, a maps URL carrying a
 * place_id, or a g.page short link. Returns a clean review URL, or null when the
 * input doesn't look like anything Google-related (so callers can reject it).
 */
export function normalizeGoogleReviewUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  // Bare place_id (Google IDs start with ChIJ / GhIJ and are alphanum-ish).
  if (/^[A-Za-z0-9_-]{15,}$/.test(v) && !v.includes('/') && !v.includes('.')) {
    return buildGoogleReviewUrl(v);
  }

  // Anything with a placeid / place_id query param → rebuild canonical link.
  const idMatch = v.match(/place[_]?id=([A-Za-z0-9_-]+)/i);
  if (idMatch) return buildGoogleReviewUrl(idMatch[1]);

  // g.page short links already deep-link to the business; append /review when
  // it isn't there so the form opens directly.
  if (/^https?:\/\/(www\.)?g\.page\//i.test(v)) {
    return v.replace(/\/+$/, '').endsWith('/review') ? v : `${v.replace(/\/+$/, '')}/review`;
  }

  // Any other Google/Maps URL: keep it as-is (still better than nothing).
  if (/^https?:\/\/([a-z0-9-]+\.)*google\.[a-z.]+\//i.test(v) ||
      /^https?:\/\/maps\.app\.goo\.gl\//i.test(v)) {
    return v;
  }

  return null;
}
