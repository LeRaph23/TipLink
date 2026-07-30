// Typed content registries.
//
// Metadata lives here, separately from article bodies, because the hub pages,
// the sitemap, the JSON-LD builders and the OG image routes all need to
// enumerate content cheaply without pulling in every article's markup.
//
// Bodies are plain .tsx components rather than MDX: MDX would need
// @next/mdx plus remark/rehype plugins wired through Turbopack, and this
// registry indirection means the body format can change later without touching
// routes, sitemap or schema. Not worth the build-tooling risk today.
//
// The required fields are load-bearing: __tests__/seo/content-registry.test.ts
// enforces title length, description length, slug shape, date ordering and
// resolvable `related` slugs, so a half-finished article cannot ship.

export type FaqEntry = { question: string; answer: string };

/** A cited source, rendered on the page so claims stay checkable. */
export type SourceRef = {
  label: string;
  url: string;
  /** ISO date the URL was last checked. */
  verifiedOn: string;
};

export type ContentMeta = {
  slug: string;
  /** ≤60 chars — longer titles get truncated in the SERP. */
  title: string;
  /** 120–160 chars. */
  description: string;
  /** On-page H1; may differ from the SEO title. */
  h1: string;
  /** ISO date, YYYY-MM-DD. */
  datePublished: string;
  dateModified: string;
  faq: FaqEntry[];
  sources: SourceRef[];
  /** Slugs of sibling content to cross-link. */
  related: string[];
};

export type GuideMeta = ContentMeta & {
  /** Short label for hub cards and breadcrumbs. */
  cardTitle: string;
  /** One-line hook shown on the hub card. */
  cardSummary: string;
};

export type SolutionMeta = ContentMeta & {
  /** Trade name as shown in nav and headings, e.g. "Restaurant". */
  trade: string;
  /** Plural, for body copy: "les restaurants". */
  tradePlural: string;
  cardSummary: string;
};
