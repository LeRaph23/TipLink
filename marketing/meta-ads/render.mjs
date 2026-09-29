// Renders the ads to 1080×1920 MP4 (H.264, 30 fps, silent AAC track).
//   node marketing/meta-ads/render.mjs                 → every ad
//   node marketing/meta-ads/render.mjs 01-pas-de-liquide → one ad
//   node marketing/meta-ads/render.mjs 01 --stills 1.2,5  → PNG stills only
//   add --organic for the organic-post cut (short end card, no price) in out/organique/
// Needs Playwright (Chromium) and ffmpeg; set FFMPEG=/path/to/ffmpeg if it
// is not on PATH.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const organic = process.argv.includes('--organic');
const out = join(here, 'out', organic ? 'organique' : '');
const FPS = 30;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
const filters = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--stills');
const ads = readdirSync(here).filter((f) => /^\d\d-.*\.html$/.test(f))
  .filter((f) => !filters.length || filters.some((p) => f.startsWith(p)));

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

for (const file of ads) {
  const name = file.replace(/\.html$/, '');
  await page.goto('file://' + join(here, file) + '?capture' + (organic ? '&organic' : ''));
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.videoDuration());

  if (stillsArg) {
    for (const s of stillsArg.split(',').map(Number)) {
      await page.evaluate((ms) => window.seek(ms), s * 1000);
      await page.screenshot({ path: join(out, `${name}@${s}s.png`) });
    }
    console.log(`${name}: stills written`);
    continue;
  }

  // Sound effects: a page may list cues in <script type="application/json" id="sfx">.
  const cues = await page.evaluate(() => document.getElementById('sfx')?.textContent || null);
  let audio = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  if (cues) {
    const wav = join(out, `${name}.wav`);
    execFileSync('python3', [join(here, 'sfx.py'), wav, String(duration), JSON.stringify(JSON.parse(cues))]);
    audio = ['-i', wav];
  }

  const enc = spawn(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    ...audio,
    '-shortest', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart', join(out, `${name}.mp4`),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => enc.on('close', (c) => (c ? rej(new Error(`ffmpeg ${c}`)) : res())));

  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((ms) => window.seek(ms), (i * 1000) / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
  }
  enc.stdin.end();
  await done;
  console.log(`${name}.mp4: ${duration}s, ${frames} frames`);
}

await browser.close();
