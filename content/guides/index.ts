import type { GuideMeta } from '@/content/types';

// FR-only by design: these target French tax and payroll queries
// ("exonération pourboires", "déclarer les pourboires"), which have no English
// equivalent. Translating them would be duplication with no query behind it.

export const GUIDES: GuideMeta[] = [
  {
    slug: 'exoneration-pourboires-2026',
    title: 'Exonération des pourboires 2026-2028 : le guide',
    description:
      "L'exonération d'impôt et de cotisations sur les pourboires est prolongée jusqu'au 31 décembre 2028. Conditions, plafond 1,6 SMIC et traitement en paie.",
    h1: "Exonération des pourboires : ce qui change jusqu'en 2028",
    cardTitle: 'Exonération des pourboires 2026-2028',
    cardSummary:
      "Prolongée jusqu'au 31 décembre 2028 par la loi de finances pour 2026. Qui y a droit, sous quelles conditions, et ce que ça change concrètement pour un employeur.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['declarer-les-pourboires', 'pourboire-dematerialise'],
    faq: [
      {
        question: "Jusqu'à quand les pourboires sont-ils exonérés ?",
        answer:
          "Jusqu'au 31 décembre 2028. L'article 5 de la loi de finances pour 2026 (loi n° 2026-103 du 19 février 2026) a prolongé de trois ans un dispositif créé par la loi de finances pour 2022 et reconduit chaque année depuis.",
      },
      {
        question: 'Quels salariés sont concernés ?',
        answer:
          "Les salariés en contact avec la clientèle dont la rémunération mensuelle ne dépasse pas 1,6 SMIC. Au-delà de ce plafond, l'exonération de cotisations ne s'applique plus.",
      },
      {
        question: 'Les pourboires par carte bancaire sont-ils concernés ?',
        answer:
          "Oui. Le dispositif ne distingue pas l'espèce du paiement dématérialisé : ce qui compte est que le pourboire soit remis volontairement par le client et destiné au personnel en contact avec la clientèle.",
      },
      {
        question: "L'exonération coûte-t-elle quelque chose à l'employeur ?",
        answer:
          "Non. Les sommes proviennent des clients, pas de l'entreprise. C'est précisément ce qui rend le pourboire intéressant en matière de rétention : il augmente le net perçu sans peser sur la masse salariale.",
      },
    ],
    sources: [
      {
        label: 'Loi de finances pour 2026 — prolongation de l\'exonération des pourboires',
        url: 'https://www.lhotellerie-restauration.fr/sos-experts/plf-2026-les-deputes-prolongent-l-exoneration-des-pourboires-jusqu-en-2028',
        verifiedOn: '2026-07-27',
      },
      {
        label: 'Service-Public Entreprendre — prolongation des mesures d\'exonération',
        url: 'https://entreprendre.service-public.gouv.fr/actualites/A18726',
        verifiedOn: '2026-07-27',
      },
      {
        label: 'Exonération 2026-2028 : conditions, plafond 1,6 SMIC, paie et DSN',
        url: 'https://www.socic.fr/ressources-comptabilite/articles/exoneration-des-pourboires-2026-2028-ir-et-cotisations-sociales-plafond-16-smic-paie-dsn',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'declarer-les-pourboires',
    title: 'Déclarer les pourboires : obligations employeur',
    description:
      'Ce que vous devez déclarer, ce que vous ne devez pas, et comment tracer les pourboires par carte en paie et en DSN sans alourdir votre comptabilité.',
    h1: 'Déclarer les pourboires : ce qui incombe vraiment à l\'employeur',
    cardTitle: 'Déclarer les pourboires',
    cardSummary:
      "Exonéré ne veut pas dire invisible. Ce qu'il faut tracer, ce qui passe en DSN, et pourquoi le pourboire dématérialisé simplifie la vie du comptable.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['exoneration-pourboires-2026', 'pourboire-dematerialise'],
    faq: [
      {
        question: 'Un pourboire exonéré doit-il quand même apparaître en paie ?',
        answer:
          "Une exonération n'est pas une dispense de traçabilité. Les sommes remises via l'employeur doivent pouvoir être identifiées et justifiées, et leur traitement en DSN dépend du circuit d'encaissement. Faites valider le paramétrage par votre expert-comptable.",
      },
      {
        question: "Qui déclare quand le pourboire va directement au salarié ?",
        answer:
          "Lorsque le client verse directement au bénéficiaire, sans que la somme transite par les comptes de l'entreprise, l'employeur n'intervient pas dans le flux. Il reste tenu de respecter ses obligations propres, mais ne reverse pas une somme qu'il n'a jamais encaissée.",
      },
      {
        question: 'Faut-il un justificatif par pourboire ?',
        answer:
          "Un relevé périodique par bénéficiaire suffit en pratique à documenter les montants. C'est l'intérêt principal du pourboire dématérialisé face aux espèces : chaque somme est horodatée et attribuée nominativement.",
      },
    ],
    sources: [
      {
        label: 'Service-Public Entreprendre — frais de transport et pourboires',
        url: 'https://entreprendre.service-public.gouv.fr/actualites/A18726',
        verifiedOn: '2026-07-27',
      },
      {
        label: 'Exonération des pourboires : mise en œuvre en paie et DSN',
        url: 'https://www.socic.fr/ressources-comptabilite/articles/exoneration-des-pourboires-2026-2028-ir-et-cotisations-sociales-plafond-16-smic-paie-dsn',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'pourboire-dematerialise',
    title: 'Pourboire dématérialisé : comment ça marche',
    description:
      'QR code, NFC, terminal de paiement : les trois façons de recevoir un pourboire par carte, ce qu\'elles coûtent vraiment et laquelle convient à votre établissement.',
    h1: 'Le pourboire dématérialisé, sans jargon',
    cardTitle: 'Le pourboire dématérialisé',
    cardSummary:
      "Le cash a disparu, le pourboire avec. Les trois solutions techniques, leurs coûts réels, et comment choisir selon votre métier.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['exoneration-pourboires-2026', 'declarer-les-pourboires'],
    faq: [
      {
        question: 'Faut-il une application pour le client ?',
        answer:
          "Non, et c'est le critère décisif. Toute solution qui demande au client d'installer quelque chose perd la quasi-totalité des pourboires. Un tag NFC ou un QR code ouvre une page web ordinaire dans le navigateur du téléphone.",
      },
      {
        question: 'Le NFC fonctionne-t-il sur tous les téléphones ?',
        answer:
          "La grande majorité des smartphones récents lisent le NFC sans réglage. Pour les autres, un QR code imprimé sur la même plaque assure le repli, ce qui couvre l'ensemble des appareils.",
      },
      {
        question: 'Qui reçoit l\'argent ?',
        answer:
          "Cela dépend de la solution. Certaines versent à l'établissement, à charge pour lui de redistribuer. D'autres versent directement au bénéficiaire désigné par le client. Le second circuit évite à l'employeur de manipuler des sommes qui ne lui reviennent pas.",
      },
      {
        question: 'Combien ça coûte ?',
        answer:
          "Deux modèles coexistent : un abonnement mensuel, ou une commission prélevée uniquement sur les pourboires encaissés. Sans volume, le premier coûte de l'argent tous les mois, le second ne coûte rien.",
      },
    ],
    sources: [
      {
        label: 'France Num — mettre en place le pourboire par carte bancaire',
        url: 'https://www.francenum.gouv.fr/guides-et-conseils/developpement-commercial/solutions-de-paiement/mettre-en-place-le-pourboire-par',
        verifiedOn: '2026-07-27',
      },
      {
        label: "L'Hôtellerie Restauration — comment passer au pourboire dématérialisé",
        url: 'https://www.lhotellerie-restauration.fr/actualite/comment-passer-au-pourboire-dematerialise',
        verifiedOn: '2026-07-27',
      },
    ],
  },
];

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export function getGuide(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
