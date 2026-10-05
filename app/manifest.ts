import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Digitip, les pourboires par carte',
    short_name: 'Digitip',
    description:
      'Vos clients laissent un pourboire par carte en approchant leur téléphone d’une plaque. Pour les restaurants, bars, cafés, salons, hôtels et tous les commerces de proximité.',
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
