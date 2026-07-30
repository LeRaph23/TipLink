// Re-export surface so `@/lib/seo` keeps working for existing call sites.
// The JsonLd component is NOT re-exported here: this module is imported by
// sitemap.ts and robots.ts, which must stay free of JSX/React. Import it
// directly from '@/lib/seo/JsonLd'.
export { BASE_URL, pageAlternates } from './base';
export { buildPageMetadata, type BuildPageMetadataInput } from './metadata';
export * from './json-ld';
export { PUBLIC_PATHS, NOINDEX_PREFIXES, robotsDisallow, type PublicPath } from './routes';
