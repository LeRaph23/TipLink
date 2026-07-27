import { ImageResponse } from 'next/og';

// Social preview card. Replaces the previous setup, which pointed every share
// at app/icon.jpg — a 2000×2000 square declared as 1200×630, so every preview
// was cropped wrong.
//
// Deliberately uses only system-ish font stacks and plain divs: loading a
// custom font binary here would add a fetch to every OG render for a card
// nobody sees at high resolution.

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Digitip — le pourboire sans contact';

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isFr = locale !== 'en';

  const headline = isFr ? 'Le pourboire, sans contact' : 'Tipping, contactless';
  const sub = isFr
    ? 'Une plaque NFC. Le client approche son téléphone. La somme part sur le compte du bénéficiaire.'
    : 'One NFC plaque. The customer taps their phone. The tip lands in the recipient’s account.';
  const footer = isFr
    ? 'Achat unique · Sans abonnement · digitip.app'
    : 'One-time purchase · No subscription · digitip.app';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #C95578 0%, #E57A97 55%, #EC97B0 100%)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Digitip
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 74,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              marginBottom: 22,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              lineHeight: 1.4,
              opacity: 0.92,
              maxWidth: 900,
            }}
          >
            {sub}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 24, opacity: 0.85 }}>{footer}</div>
      </div>
    ),
    size
  );
}
