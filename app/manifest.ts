import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Digitip — Pourboires cashless par NFC',
    short_name: 'Digitip',
    description:
      'Digitip : la solution de pourboires cashless par NFC. SmartTags pré-configurés pour coiffeurs, restaurants et hôtels — vos clients laissent un pourboire en un tap.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9f9f7',
    theme_color: '#E57A97',
    lang: 'fr',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      {
        src: '/icon.jpg',
        sizes: 'any',
        type: 'image/jpeg',
      },
    ],
  };
}
