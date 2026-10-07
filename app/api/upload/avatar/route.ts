import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyTeamJoinToken } from '@/lib/auth/team-join-token';
import { readTeamJoinVersion } from '@/lib/auth/team-join-link';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Max 2 MB
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AllowedType = typeof ALLOWED_TYPES[number];

// Verify actual file magic bytes — file.type is client-controlled and easily spoofed.
function detectImageType(bytes: Uint8Array): AllowedType | null {
  // JPEG: FF D8
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47
  ) return 'image/png';
  // WebP: RIFF????WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 &&
    bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

const EXT_MAP: Record<AllowedType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = await rateLimit(`upload:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  // Only someone joining a real team may store a photo in the public bucket:
  // a signed-in user (emailed invitation, existing account) or a holder of the
  // establishment's signed team link. Anonymous uploads made the bucket free
  // public image hosting for anyone.
  const establishmentId = String(formData.get('establishmentId') ?? '');
  const teamToken = formData.get('teamToken');
  if (!UUID_RE.test(establishmentId)) {
    return NextResponse.json({ error: 'Missing establishment' }, { status: 400 });
  }
  const supabase = createServiceClient();
  const { data: { user } } = await (await createClient()).auth.getUser();
  const hasTeamLink = typeof teamToken === 'string' && verifyTeamJoinToken(
    teamToken,
    establishmentId,
    await readTeamJoinVersion(supabase, establishmentId),
  ).valid;
  if (!user && !hasTeamLink) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 2 MB)' }, { status: 400 });
  }

  // Read once, validate magic bytes rather than trusting client-supplied Content-Type.
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detectedType = detectImageType(bytes);

  if (!detectedType) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const ext = EXT_MAP[detectedType];
  const path = `avatars/join/${establishmentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('public-media')
    .upload(path, buffer, {
      contentType: detectedType,
      upsert: false,
    });

  if (error || !data) {
    console.error('[upload/avatar] storage upload failed', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage
    .from('public-media')
    .getPublicUrl(data.path);

  return NextResponse.json({ url: publicUrl });
}
