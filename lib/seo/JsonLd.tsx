import type { JsonLdNode } from './json-ld';

/**
 * Renders a schema.org graph as a single JSON-LD script tag.
 *
 * `<` is escaped so a string coming from translated content can never close
 * the script element early. The CSP in next.config.ts currently allows
 * 'unsafe-inline' for scripts; if that is ever tightened to nonces, this tag
 * needs the nonce threaded through.
 */
export function JsonLd({ data }: { data: JsonLdNode }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
