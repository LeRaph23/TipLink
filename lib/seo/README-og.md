# The Open Graph image is a static PNG on purpose

`app/opengraph-image.png` is a committed 1200×630 file, not a dynamic
`ImageResponse` route. That is a deliberate constraint, not laziness.

## Why

`next/og` pulls in `@vercel/og`, roughly 400 KB plus two WASM binaries. Three
routes in this app run on the Edge runtime:

- `app/[locale]/pay/[staffId]`
- `app/[locale]/pay/group/[establishmentId]`
- `app/[locale]/pay/group/[establishmentId]/team`

With an `opengraph-image.tsx` anywhere in the `app/[locale]` segment, Turbopack
bundled `@vercel/og` into the shared chunk graph those Edge Functions draw
from. `[locale]/pay/group/[establishmentId]/team` reached **1.32 MB** against a
**1 MB** Edge Function limit and Vercel rejected the deployment.

The trap: `next build` succeeded every time. The size limit is enforced at
deploy, not at build, so this is invisible locally and only shows up as an
`ERROR` deployment on Vercel.

Two fixes were tried and did not work:

1. `export const runtime = 'nodejs'` on the OG route — the module still shared
   the segment graph.
2. Moving the route to `app/opengraph-image.tsx`, outside `[locale]` — the
   `@vercel/og` chunk still landed in `.next/server/edge/chunks/`.

Only removing the dependency entirely took it out of the build.

## If you want a dynamic OG image back

Check, in this order:

1. Whether those three pages still need `runtime = 'edge'`. On the Node
   runtime the size limit does not apply and this whole problem disappears.
2. Whether the plan's Edge Function limit has been raised.

Then verify with a real deployment, not a local build:

```bash
# must print nothing
npm run build && find .next -name '*vercel_og*'
```

## Regenerating the PNG

The card is plain text on a brand gradient. Regenerate with `sharp`, which is
already a transitive dependency:

```js
// node gen-og.mjs, run from the repo root
import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"> … </svg>`;
await sharp(Buffer.from(svg)).png().toFile('app/opengraph-image.png');
```

Keep it 1200×630. `lib/seo/metadata.ts` declares those dimensions, and a
mismatch is what made every share crop badly before (the old setup pointed at
`icon.jpg`, a 2000×2000 square declared as 1200×630).

Reference it as `/opengraph-image.png` **with** the extension: the
extensionless path 307-redirects into the locale prefix, and social crawlers
routinely refuse to follow redirects for images.
