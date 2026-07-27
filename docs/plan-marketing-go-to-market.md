# Digitip — Plan go-to-market (analyse neutre, juillet 2026)

> Document écrit **sans reprendre les hypothèses des plans précédents**. Tout est
> reconstruit à partir de trois sources : (1) les données réelles de la base de
> production, (2) le code du produit, (3) des sources externes vérifiées.
> Objectif : dire ce qui va marcher, et surtout **pourquoi ce qui a été tenté n'a pas marché**.

---

## 0. Le diagnostic, chiffres en main

J'ai interrogé la base de production avant d'écrire quoi que ce soit. Voici l'état réel :

| Indicateur | Valeur réelle |
|---|---|
| Commandes SmartTag payées (`smarttag_orders`) | **0** |
| Chiffre d'affaires matériel | **0 €** |
| Transactions de pourboire | **2** — 1,25 € (4 juin) et 5,25 € (21 juin) |
| Revenu commission cumulé | **0,80 €** |
| Établissements en base | 12 — **tous les tiens** (VolteFace, « Salon test », adresses Jettingen / Rixheim / Rivoli) |
| Établissements ayant terminé l'onboarding | **0 / 12** |
| Staff avec Stripe connecté | 5 sur 24 |
| Ambassadeurs | 2 — **0 vente** |
| Cold emails réellement envoyés | **0** sur 1 089 prospects chargés |
| Visites terrain enregistrées | **0** |
| SmartTags fabriqués et en stock | **200** |
| Base de prospection | **29 913 établissements géolocalisés** |

### Ce que ça dit

Le produit est **fini et sur-construit** : dashboard multi-niveaux, programme ambassadeurs
complet (contrats, PIN, paliers, challenges mensuels, bonus), programme commerciaux,
moteur de cold email, import OSM/SIRENE, mode démo, avis Google, ledger de transferts.
C'est du travail de plusieurs mois, et c'est propre.

Et **il n'a jamais rien vendu. Pas une fois.**

C'est un diagnostic important, parce qu'il disqualifie la question posée. « Comment mieux
marketer mon produit » suppose qu'il existe un moteur qui tourne trop lentement. Il n'y a
pas de moteur. Il y a un très beau châssis, et l'énergie est partie dans la construction
d'une **force de vente** (ambassadeurs, commerciaux, cold email) **avant d'avoir prouvé
qu'une seule vente était possible**.

Un plan « ultra agressif » qui multiplie les canaux sur cette base multiplie zéro par
sept. Ce document part donc de l'endroit où ça bloque vraiment.

---

## 1. Pourquoi le porte-à-porte, LinkedIn et le cold MP ont échoué

Tu attribues l'échec au canal. Les trois canaux que tu cites sont très différents les uns
des autres (physique, social pro, messagerie) et ils ont tous échoué de la même façon.
Quand trois canaux hétérogènes échouent identiquement, **le problème n'est pas le canal,
c'est le message ou l'offre**.

### Le défaut structurel : celui qui paie n'est pas celui qui en profite

C'est le cœur du problème, et il est invisible tant qu'on regarde le produit et pas la
transaction :

| | Qui décide | Qui paie | Qui en profite |
|---|---|---|---|
| Digitip aujourd'hui | Le patron | Le patron (69–99 €) | **Ses salariés** |

Tu demandes à un gérant de restaurant ou de salon de **sortir 99 € de sa trésorerie, de
prendre une décision, d'installer un truc, et de gérer les questions de son équipe** —
pour un bénéfice qui atterrit intégralement sur le compte bancaire de quelqu'un d'autre.

Le patron n'a aucune urgence. Il n'a pas de douleur. Il a une friction. Il dit « je vais
réfléchir » — non pas parce qu'il hésite, mais parce que **c'est un non poli à une
proposition qui ne le concerne pas**.

Aucun canal ne répare ça. Tu peux frapper à 500 portes, envoyer 5 000 MP LinkedIn, faire
2 000 appels : tu obtiendras le même taux de conversion catastrophique, parce que le
problème se situe avant le canal.

### Les trois causes secondaires

1. **Le segment coiffure est saturé — tu l'as constaté, et les chiffres le confirment.**
   OneTip vise 1 000 salons équipés d'ici fin 2026, Sunday et Yavin couvrent la
   restauration par la caisse, TipsYou et Tap Tiiip attaquent le même marché. Le coiffeur
   parisien a déjà reçu 4 pitchs identiques. Ton produit est bon, mais il arrive
   quatrième dans une conversation où le patron a déjà dit non trois fois.

2. **LinkedIn est le mauvais endroit.** Un patron de salon de coiffure ou de bistrot
   n'a pas de vie LinkedIn. Il est sur Instagram, sur WhatsApp, et derrière son comptoir.
   L'échec LinkedIn n'est pas un signal marché, c'est une erreur d'adressage.

3. **Le cold MP arrive sans permission ni preuve.** Sans un seul client réel à citer, tu
   n'as rien à mettre dans le message qui déclenche une réponse.

---

## 2. Les trois repositionnements qui débloquent tout

Aucun de ces trois ne demande de développement lourd. Deux sont déjà codés.

### 2.1 — Repositionnement A : vendre à ceux qui sont à la fois acheteur ET bénéficiaire

**C'est le levier n°1. Il fait disparaître le défaut structurel au lieu de le contourner.**

Il existe en France une population énorme de professionnels qui sont **leur propre
patron, leur propre équipe et leur propre bénéficiaire** :

| Segment | Taille France | Pourquoi ça marche |
|---|---|---|
| **Chauffeurs VTC** | ~71 300 chauffeurs actifs sur plateformes en 2024, **+27 % en un an**, 2/3 en Île-de-France | Décision solo, 10 secondes. Le pourboire cash a totalement disparu en VTC. Communautés Facebook massives et faciles à toucher. |
| **Coiffeurs / barbiers en location de fauteuil** | Secteur coiffure : 111 000 établissements, 178 000 actifs ; **plus de 60 % des gérants travaillent seuls** | Ils encaissent pour eux-mêmes. Le pitch « c'est ton argent » fonctionne directement. |
| **Barbershops** | 1 617 établissements, +6 %/an, 400 M€ | Culture du pourboire forte, clientèle jeune, 100 % CB. |
| Tatoueurs, prothésistes ongulaires, esthéticiennes à domicile, masseurs, toiletteurs, guides touristiques, moniteurs | dizaines de milliers | Même logique : indépendants, encaissement personnel. |

Pour ces gens-là, le tableau devient :

| | Qui décide | Qui paie | Qui en profite |
|---|---|---|---|
| Digitip — segment indépendants | **Lui** | **Lui (69 €)** | **Lui** |

Conséquences directes, et elles sont énormes :

- **Le prix cesse d'être une objection.** Un VTC qui gagne 2 800 € net/mois et prend
  5 pourboires de 2 € par jour récupère ~300 €/mois. Un tag à 69 € se rembourse en une
  semaine. Ce n'est plus une dépense, c'est un investissement à ROI évident.
- **Le cycle de vente passe de 3 semaines à 3 minutes.** Pas de gatekeeper, pas de
  « j'en parle à mon associé », pas de devis.
- **La pub payante redevient possible.** C'est le point critique : le ciblage B2B local
  sur Meta est mauvais (tu ne sais pas atteindre « gérant de salon à Lille »), mais le
  ciblage d'un chauffeur VTC ou d'un barbier via ses centres d'intérêt, ses groupes et
  ses apps est excellent. **Tu passes d'un marché non-adressable en publicité à un
  marché adressable.**
- **Tu sors frontalement de la zone où Sunday, Yavin et OneTip te battent.** Aucun d'eux
  ne s'adresse à l'individu : ils vendent à l'établissement, souvent via la caisse.

> **Le produit le supporte déjà.** Un `staff_profile` a son propre `stripe_account_id`
> et sa propre page `/pay/[staffId]`. Un indépendant = un établissement d'une personne.
> Rien à construire, juste un parcours d'inscription à simplifier et une page d'atterrissage
> dédiée.

**C'est ici que doit aller ton budget d'acquisition.** C'est le seul segment où
« marketing agressif » a un sens mécanique, parce que c'est le seul où une pub peut
mener directement à un paiement sans intermédiaire humain.

### 2.2 — Repositionnement B : au patron, vendre l'avis Google, pas le pourboire

Tu as codé en mai/juin (`00070_establishment_google_review`, PR #101/#103) un flux qui,
**après un pourboire, propose au client de laisser un avis Google**. Le super-admin a même
une vue de suivi par établissement.

C'est, de loin, **la fonctionnalité la plus vendable du produit — et elle est enterrée**.
Elle n'apparaît nulle part sur la landing page, ni dans le pitch.

Réfléchis à qui tu parles :

- Un pourboire à son serveur : le patron s'en fiche poliment.
- **Un avis Google 5 étoiles : le patron en rêve la nuit.** C'est sa première source de
  clients. Il en parle à son comptable. Il paie déjà des agences pour ça.

Et le mécanisme est redoutablement bon : tu demandes l'avis **au moment exact où le client
vient de faire un geste positif volontaire**. Le taux de conversion à cet instant écrase
tout ce qu'un QR code sur l'addition peut produire. Tu as par construction le meilleur
timing du marché pour capter un avis — parce qu'un client qui laisse un pourboire est,
par définition, un client content.

**Le nouveau pitch au patron :**

> « Vos clients contents ne laissent jamais d'avis. Ceux qui râlent, si. On inverse ça :
> le client laisse un pourboire à votre équipe — et juste après, on lui propose de laisser
> son avis Google. Vous récupérez des avis 5 étoiles de vos meilleurs clients, et votre
> équipe est mieux payée sans que ça vous coûte un centime. »

Là, **le patron est bénéficiaire**. Le défaut structurel disparaît sans changer une ligne
de code — juste le discours.

⚠️ **Cadre à respecter** : ne conditionne jamais le pourboire à l'avis, ne filtre pas les
clients mécontents avant l'étape avis (le « review gating » est interdit par Google et
sanctionnable côté DGCCRF au titre des avis en ligne, art. L111-7-2 du Code de la
consommation). Tu proposes l'avis à **tout le monde** après le pourboire, sans tri.
Le tri se fait naturellement en amont : seuls les clients contents tippent.

### 2.3 — Repositionnement C : l'argument à 0 € pour le patron (exonération 2028)

Vérifié : **l'article 5 de la loi de finances pour 2026 (loi n° 2026-103 du 19 février
2026) prolonge l'exonération d'impôt sur le revenu et de cotisations sociales sur les
pourboires jusqu'au 31 décembre 2028**, pour les salariés en contact avec la clientèle
rémunérés sous 1,6 SMIC.

Traduction en argument commercial, et c'est un argument en euros, pas en confort :

> « Pour donner 100 € net de plus à votre serveur, il faut lui verser environ 180 à 200 €
> en salaire chargé. Par le pourboire : 100 € arrivent, 0 € de charges, 0 € d'impôt,
> et **ça ne sort pas de votre poche** — ce sont vos clients qui paient. C'est la seule
> augmentation qui vous coûte zéro. Et c'est garanti par la loi jusqu'à fin 2028. »

Pour un patron de CHR qui n'arrive pas à recruter — et c'est **la** douleur n°1 du secteur,
devant tout le reste — c'est un outil de rétention gratuit. Tu vends de la rétention de
personnel, pas un gadget NFC.

La date de fin (31/12/2028) donne en plus une urgence honnête, sans avoir à inventer un
faux compte à rebours.

---

## 3. Sortir de la coiffure : ce que dit ta propre base

Tu as importé 29 913 établissements. Regarde la répartition — tu as prospecté le plus
petit segment de ta propre base :

| Catégorie | Nombre | Avec téléphone |
|---|---|---|
| **Restaurant** | **16 178** | 6 813 |
| Coiffure | 5 936 | 1 883 |
| **Café** | **3 738** | 765 |
| **Bar** | **2 984** | 1 134 |
| Esthétique | 1 044 | 386 |

**22 900 restaurants / cafés / bars contre 7 000 salons.** Et la restauration est
structurellement meilleure pour toi :

- **Fréquence** : un serveur voit 30 à 80 clients par service ; un coiffeur en voit 8 à 12
  par jour. Le volume de pourboires par tag est sans commune mesure.
- **Culture** : le pourboire est une norme sociale en restauration, une exception en salon.
- **Taille d'équipe** : plus de bénéficiaires par établissement, donc plus de tags par vente.
- **L'exonération légale du §2.3 vise explicitement le CHR.**

Répartition géographique : **Paris 15 051**, Strasbourg 1 370, Lille 487, plus la petite
couronne, Colmar 260, Mulhouse 211.

> **Décision de terrain :** concentre-toi sur **l'Alsace** (Strasbourg + Colmar + Mulhouse
> ≈ 1 840 établissements) pour la phase de preuve, pas sur Paris. Tu y es physiquement, le
> marché n'est pas encore travaillé par les concurrents, et tu peux repasser voir tes
> clients — ce qui est indispensable quand tu n'as encore aucune référence. Paris vient
> après, quand tu as des chiffres à montrer.

**Anomalie technique à corriger** : `actions/onboarding.ts:397` et le webhook Stripe
(`app/api/webhooks/stripe/route.ts:788,1000`) forcent `business_type: 'beauty'` à la
création. Si tu bascules sur la restauration, toutes tes données de segmentation seront
fausses dès le premier client.

---

## 4. Ce qu'il faut corriger AVANT de dépenser un euro d'acquisition

Ces points sont bloquants. Envoyer du trafic sur la landing actuelle, c'est payer pour
faire fuir des gens.

### 4.1 🔴 La preuve sociale est fabriquée — et c'est un risque juridique réel

La landing page affiche aujourd'hui, avec **0 client** en base :

- `landing.hero.social` → « **Adopté par 400+ équipes** »
- `landing.product.reviewCount` → « **+150 avis vérifiés** »
- `landing.hero.badge` / `landing.product.rating` → « **4.8 / 5** »
- Trois témoignages nominatifs et détaillés : Sophie L. (Restaurant Le Comptoir), Karim B.
  (Groupe Harmonie, 3 établissements), Aurélie M. (Salon Éclat Beauté)

En droit français, ce sont des **pratiques commerciales trompeuses** (art. L121-2 et
L121-4 du Code de la consommation). Le 21° de L121-4 vise explicitement le fait
d'affirmer que des avis sont vérifiés quand ils ne le sont pas. Les peines encourues vont
jusqu'à **2 ans d'emprisonnement et 300 000 € d'amende, portable à 10 % du chiffre
d'affaires annuel moyen**. La DGCCRF contrôle activement les avis en ligne.

Au-delà du risque légal, c'est un problème commercial immédiat : ton premier vrai
prospect qui cherche « Digitip avis » ne trouvera rien derrière ces « 150 avis vérifiés ».
La contradiction se voit en 30 secondes, et elle tue la vente.

**À faire maintenant** : retirer ces quatre éléments et les trois témoignages. Remplacer
par un cadrage « early adopter », qui convertit **mieux** à ce stade :

> « Digitip démarre. On équipe nos 50 premiers établissements en Alsace — matériel offert,
> installation faite par nos soins, et on reprend tout si ça ne marche pas chez vous. »

L'honnêteté du lancement est un argument. Le faux « 400+ équipes » n'en est pas un, il ne
fait que t'empêcher de raconter la vraie histoire, qui est meilleure.

### 4.2 🔴 Landing et CGU se contredisent sur l'abonnement

- Landing : « **Sans aucun abonnement** — payez une fois, à vie » ; « 0 frais mensuel ».
- CGU art. 3 (`legal.terms.s3Body`) : « Les packs SmartTag sont vendus comme un achat
  matériel unique **auquel s'ajoute un abonnement logiciel mensuel**. »

Le client lit ça au moment de payer. C'est un abandon de panier garanti, et une clause
abusive potentielle. Aligne les deux sur la réalité (il n'y a pas d'abonnement dans le
code : `PACKS` = paiement unique + commission 5 %). **Corrige les CGU, pas la landing.**

### 4.3 🔴 Le vrai trou noir : 0 onboarding terminé sur 12

C'est le chiffre le plus alarmant du diagnostic, et personne ne le regarde :

- **0 / 12 établissements** ont `onboarding_status = 'complete'`.
- **16 / 24 staff** sont à `not_started`, sans compte Stripe.

Ce sont pourtant tes propres tests — donc des gens motivés, avec toi derrière. Si **toi**
tu n'arrives pas à faire passer tes propres établissements de test à travers le KYC
Stripe Connect, un patron de bistrot ne le fera jamais.

**Un tag qui n'est pas activé ne rapporte rien, et déclenche un remboursement.** Tant que
tu n'as pas mesuré et réparé ce taux, chaque euro d'acquisition fuit par ce trou.

Actions :
1. Fais passer **un** établissement réel de bout en bout, chronomètre chaque étape,
   note où ça bloque.
2. Instrumente le funnel d'onboarding (tu as déjà Vercel Analytics).
3. Objectif : **> 80 % d'activation sous 48 h**. En dessous, ne dépense rien en acquisition.
4. Prévois une **activation assistée** : tu fais le Stripe Connect avec le client, au
   téléphone ou sur place. À ce stade de volume, c'est faisable et ça change tout.

### 4.4 🟠 La page ambassadeur se contredit sur le SIRET

Le titre, l'aperçu de partage et la FAQ annoncent « SIRET requis », le formulaire dit
l'inverse. Le « SIRET requis » est ce qui remonte dans Google et dans les partages : il
élimine les candidats avant qu'ils lisent la suite. Point mineur tant que le programme
ambassadeur n'est pas la priorité (voir §7), mais c'est 10 minutes de correction.

---

## 5. Les deux moteurs — et pourquoi il en faut exactement deux

Arrête de chercher **le** canal. Il te faut deux moteurs de nature différente, parce que
tu as deux problèmes différents : encaisser vite, et construire de la valeur.

### Moteur A — Indépendants : le moteur de cash et de vitesse

- **Cible** : VTC, barbiers, coiffeurs en location de fauteuil, tatoueurs, esthétique à domicile.
- **Offre** : SmartTag à 69 €, plein tarif, acheté en ligne, livré. **Aucune remise.**
  Ils achètent pour eux, le ROI est évident, le prix n'est pas le sujet.
- **Vente** : 100 % self-service. Pub → landing dédiée → checkout. Zéro humain.
- **Pourquoi ça marche** : acheteur = bénéficiaire, décision solo, ciblage publicitaire
  réellement possible.
- **Ce que ça t'apporte** : du cash immédiat, et surtout **tes premiers vrais utilisateurs,
  donc tes premiers vrais témoignages** — qui débloquent le Moteur B.

### Moteur B — Établissements : le moteur de valeur

- **Cible** : restaurants, bars, cafés, brasseries. 5 à 30 salariés. Pas les coiffeurs.
- **Offre** : **matériel offert**. Oui, offert. Tu gardes la commission de 5 %.
- **Vente** : téléphone + placement physique, avec activation assistée.
- **Pitch** : avis Google (§2.2) + exonération jusqu'en 2028 (§2.3). Le pourboire est
  l'argument n°3, pas n°1.

**L'économie du tag offert, chiffrée honnêtement :**

Ton revenu net est de **~3 % du volume de pourboires** (sur 10 € tippés : 0,50 € de
commission + 0,25 € de frais fixes = 0,75 € collectés, dont 0,45 € pour Stripe → **0,30 €
pour toi**).

| Scénario établissement | Volume pourboires/mois | Ton revenu net/mois | Amortissement d'un tag (~4 € COGS) |
|---|---|---|---|
| Restaurant 5 couverts/service actifs | 800 € | ~24 € | < 1 semaine |
| Bar/brasserie actif | 1 500 € | ~45 € | quelques jours |
| Petit établissement | 300 € | ~9 € | 2 semaines |

Vendre le tag 69 € te rapporte 69 € **une fois**, et ferme la porte à 90 % des prospects.
Offrir le tag te coûte ~4 € et t'ouvre une rente de 20 à 45 €/mois par établissement.
**Au-delà de 3 mois de rétention, le tag offert rapporte plus que le tag vendu** — et il
convertit un ordre de grandeur plus souvent.

Le risque est réel et il faut le nommer : **le tag mort**. Un établissement qui prend le
tag gratuit, ne l'installe pas, ne l'active pas → tu perds 4 € et un slot de stock.
Trois garde-fous :

1. **Qualification** : seulement les établissements où le pourboire existe déjà (bar,
   brasserie, resto avec service en salle). Pas de vente à emporter, pas de fast-food.
2. **Caution de 20 €, remboursée au 10ᵉ pourboire encaissé.** Filtre les non-sérieux sans
   réintroduire une objection prix.
3. **Activation faite sur place par toi.** Tag posé + Stripe Connect fait dans la foulée =
   pas de tag mort. C'est non négociable (cf. §4.3).

Avec 200 tags en stock : ~150 pour le Moteur B (offerts, en Alsace), ~50 vendus au
Moteur A. Ça te donne exactement de quoi valider les deux moteurs sans réassort.

---

## 6. Les canaux, classés par rendement réel

### 🥇 Canal 1 — Publicité Meta / TikTok vers les indépendants

**Le seul canal réellement scalable de ce document.** Il n'a de sens que grâce au
repositionnement §2.1 — c'est le passage de « B2B local non-ciblable » à « quasi-B2C
ciblable ».

- **Ciblage VTC** : centres d'intérêt Uber/Bolt/Heetch, « chauffeur VTC », apps
  concurrentes, géo Île-de-France (2/3 des chauffeurs y sont).
- **Ciblage barbiers/coiffeurs indépendants** : intérêts barbershop, marques pro
  (Wahl, BaByliss PRO), « location de fauteuil ».
- **Créa qui marche** : vidéo verticale 15 s, filmée au téléphone, **pas de production**.
  Un vrai chauffeur, un vrai tag sur l'appuie-tête, un vrai pourboire qui tombe, la
  notification à l'écran. La preuve visuelle du pourboire qui arrive **est** la publicité.
- **Accroche** : « Tes clients te laisseraient un pourboire s'ils avaient du cash. Ils
  n'en ont plus. 69 €, une fois. »
- **Budget de test** : 1 500 € sur 3 semaines, 3 segments × 3 créas. Objectif CAC < 25 €
  pour un produit à 69 € HT.
- **Critère d'arrêt** : si après 800 € dépensés le CAC dépasse 45 €, tu coupes le segment.

### 🥈 Canal 2 — Communautés d'indépendants (gratuit, immédiat)

Les chauffeurs VTC français vivent dans des groupes Facebook de plusieurs dizaines de
milliers de membres, sur des forums, sur WhatsApp. Idem pour les barbiers sur Instagram.

- Ne poste pas une pub. Poste un **résultat** : « J'ai testé un truc pendant 3 semaines,
  voilà ce que ça a donné » avec la capture des pourboires reçus.
- Contacte les **admins de groupes** : un post épinglé ou un partenariat rémunéré coûte
  100–300 € et touche 30 000 chauffeurs ciblés. Rendement bien supérieur à la pub froide.
- Micro-influenceurs VTC/barbier sur TikTok (5–50 k abonnés) : 100–300 € le post, ou un
  tag offert + commission. C'est le meilleur rapport coût/crédibilité disponible.

### 🥉 Canal 3 — Téléphone vers les établissements (avec l'offre gratuite)

Tu as **11 000 numéros déjà en base**. Le téléphone n'a jamais échoué chez toi : il n'a
jamais été essayé (0 appel enregistré, 0 visite).

Ce qui change tout : tu n'appelles plus pour vendre 99 €, tu appelles pour **offrir**.

> « Bonjour, Raphaël de Digitip, je suis à Strasbourg. On équipe 50 établissements du
> secteur gratuitement ce mois-ci — une plaque sans contact, vos clients laissent un
> pourboire à votre équipe en 3 secondes, et surtout ils vous laissent un avis Google
> juste après. Le matériel est offert, je passe l'installer moi-même en 10 minutes. Vous
> êtes là jeudi matin ? »

Pas de prix, pas de décision financière, pas de risque : le taux de rendez-vous n'a rien
à voir avec ce que tu as connu. Objectif : 60 appels/jour → 6–10 RDV → 4–6 poses.

**Créneaux** : 9 h 30–11 h 30 et 14 h 30–17 h. Jamais en plein service.

### Canal 4 — L'inversion par les salariés (le plus sous-estimé)

Tu essaies de convaincre le patron. **Fais-toi réclamer par son équipe.**

Un serveur qui découvre qu'il peut recevoir 200 €/mois de pourboires CB **va le demander à
son patron lui-même**. Et un patron dit beaucoup plus facilement oui à son équipe qu'à un
inconnu à la porte.

- **TikTok/Instagram à destination des serveurs**, pas des patrons. C'est un public
  jeune, massif, qui partage énormément le contenu métier. Angle : « Combien tu perds
  chaque mois parce que plus personne n'a de cash ».
- **Écoles hôtelières et lycées pro** (CFA, écoles Ferrandi/Vatel et équivalents
  régionaux) : les élèves partent en stage dans des centaines d'établissements et
  emportent l'idée avec eux.
- **Groupes Facebook « serveurs/serveuses »**, très actifs.
- Prévois une page dédiée « je suis serveur, je veux que mon établissement l'ait » avec
  un message pré-rédigé à transférer à son patron. C'est ce lien qui transforme l'envie
  en demande.

Ce canal met du temps à démarrer et devient ensuite le moins cher de tous.

### Canal 5 — Distribution : arrêter de vendre un établissement à la fois

Un seul accord peut valoir 6 mois de terrain. À lancer dès maintenant, en parallèle,
parce que les cycles sont longs :

- **Éditeurs de caisse CHR** (Zelty, L'Addition, Lightspeed, Tiller…) : ils cherchent des
  modules à valeur ajoutée. Attention, Sunday et Yavin sont déjà positionnés là — ton
  angle est justement d'être **indépendant de la caisse**, donc installable partout, y
  compris chez les 60 % qui n'ont pas de caisse moderne.
- **Grossistes CHR** (Metro, Transgourmet, Promocash) : ils voient tes clients toutes les
  semaines et ont des forces de vente établies.
- **Experts-comptables spécialisés CHR** : l'angle exonération 2028 (§2.3) leur parle
  directement, et ils sont prescripteurs de confiance.
- **Franchises et groupes** : un oui du siège = 10 à 40 tags.
- **Salons professionnels** : Equip'Hôtel (Paris, novembre, années paires) et le MCB pour
  la beauté. Vérifie les dates exactes de l'édition en cours. Même sans stand, deux jours
  sur place valent 500 appels.

### Canal 6 — SEO / contenu sur l'exonération

Les gérants CHR cherchent « exonération pourboires 2026 », « pourboire carte bancaire
charges sociales », « déclarer les pourboires ». Ces requêtes sont peu concurrentielles
et à très forte intention.

Trois articles solides, à jour de la loi n° 2026-103 du 19 février 2026, avec un
simulateur simple (« combien votre équipe peut toucher en net »). C'est du trafic
gratuit, durable, qui arrive déjà convaincu. Ça met 2 à 4 mois à produire — donc à lancer
maintenant, précisément parce que c'est lent.

### Canal 7 — Cold email

Légal en B2B (adresse professionnelle, offre liée au métier, désinscription en un clic —
ton code gère déjà l'unsub). Mais : **1 089 prospects chargés, 0 envoi**. Et un domaine
neuf qui part à 1 000 emails/jour finit en spam en 48 h.

Si tu y vas : domaine secondaire dédié, warmup 2 semaines, 30–50 envois/jour au départ.
**Ne touche jamais au domaine `digitip.app`** — tu perdrais aussi tes emails
transactionnels. Canal d'appoint, pas prioritaire.

---

## 7. Le programme ambassadeurs : à mettre en pause

Tu as construit un système complet — contrats, PIN, paliers Bronze/Argent/Or, challenges
mensuels, bonus de parrainage, portail commerciaux, carte des zones. Résultat mesuré :
**2 ambassadeurs, 0 vente, 0 visite terrain enregistrée**.

Ce n'est pas un échec d'exécution, c'est une erreur de séquence. Un programme
d'ambassadeurs **distribue** un pitch qui convertit. Il ne le **découvre** pas. Tu leur as
demandé de vendre un produit dont personne — toi compris — n'avait encore réussi une seule
vente. Ils n'avaient aucune chance, et ils sont partis.

Ajoute à ça le coût caché : 40 à 60 % des recrues ne vendent jamais, chacune consomme du
temps d'onboarding, de la formation et du matériel de démo. À ton stade, ce temps est ta
ressource la plus rare.

**Décision : gel du programme jusqu'à ce que tu aies 20 clients payants signés de ta main.**

Le déclencheur de réactivation est simple et mesurable : quand **tu** convertis de façon
répétable — disons 1 vente pour 5 contacts qualifiés — tu as un pitch. À ce moment-là, le
programme reprend tout son sens, parce que tu auras quelque chose à mettre dans les mains
des ambassadeurs : un script prouvé, des chiffres réels, des références locales. Le
système que tu as codé sera alors un vrai avantage — juste 6 mois trop tôt.

---

## 8. Le plan 90 jours

### Phase 1 — J1 à J14 : réparer et prouver

**Objectif : 10 clients réels payants ou équipés, activés et encaissant.** Pas 200 tags.
Dix. Le seul but de cette phase est de sortir de zéro et de récupérer de la preuve.

Semaine 1 :
- [ ] Retirer la fausse preuve sociale (§4.1) — **avant tout le reste**.
- [ ] Corriger la contradiction CGU/landing sur l'abonnement (§4.2).
- [ ] Faire passer 1 établissement de bout en bout, chronométré, et réparer le blocage
      d'onboarding (§4.3).
- [ ] Créer 2 liens de paiement Stripe (Solo/Duo) pour closer par SMS/WhatsApp en 30 s.
- [ ] Réécrire le pitch autour de l'avis Google + exonération 2028.

Semaine 2 :
- [ ] 60 appels/jour sur les 1 883 numéros de coiffure + les 6 813 de restauration en Alsace.
- [ ] Poser 10 tags gratuits, **installation et Stripe Connect faits par toi sur place**.
- [ ] Filmer chaque pose : c'est ta matière première publicitaire pour la phase 2.

### Phase 2 — J15 à J45 : allumer le Moteur A

**Objectif : 100 ventes indépendants + 40 établissements équipés.**

- [ ] Landing dédiée indépendants (VTC en premier), checkout en 2 clics.
- [ ] Lancer la pub Meta/TikTok : 1 500 € de test, 3 segments × 3 créas (§6.1).
- [ ] Contacter 10 admins de groupes VTC + 10 micro-influenceurs barbiers.
- [ ] Publier les 3 articles SEO exonération.
- [ ] Envoyer les premiers emails de partenariat : 5 éditeurs de caisse, 3 grossistes CHR,
      10 comptables CHR.
- [ ] **Point de contrôle J30** : si le CAC pub dépasse 45 €, couper et basculer le budget
      sur les communautés et les micro-influenceurs.

### Phase 3 — J46 à J90 : industrialiser ce qui marche

**Objectif : 300 tags actifs, 5 000 €/mois de volume de pourboires traité.**

- [ ] Doubler le budget sur les seuls segments publicitaires sous les 25 € de CAC.
- [ ] Lancer le canal salariés (TikTok serveurs + écoles hôtelières).
- [ ] Ouvrir Paris **seulement maintenant**, avec des références alsaciennes à montrer.
- [ ] Réactiver les ambassadeurs **si et seulement si** le critère du §7 est atteint.
- [ ] Réassort matériel en fonction du mix réel entre les deux moteurs.

---

## 9. Budget et objectifs

### Budget sur 90 jours

| Poste | Montant |
|---|---|
| Publicité Meta / TikTok (test puis scale) | 3 000 € |
| Micro-influenceurs et partenariats groupes | 1 200 € |
| Matériel offert (150 tags × ~4 €) | 600 € |
| Domaine secondaire + outil cold email | 300 € |
| Déplacements terrain Alsace | 400 € |
| **Total** | **~5 500 €** |

Tu peux démarrer avec 2 000 € en ne faisant que la Phase 1 et le test publicitaire —
le reste ne se dépense que si les chiffres le justifient.

### Les KPI qui comptent vraiment

| KPI | Pourquoi c'est celui-là | Cible J90 |
|---|---|---|
| **Taux d'activation** (tag posé → 1er pourboire encaissé) | Le plus important. Un tag inactif vaut 0, quel que soit le canal. | **> 80 %** |
| **CAC par segment** | Décide où va chaque euro suivant | < 25 € (indé) / < 60 € (étab.) |
| **Volume de pourboires traité / mois** | Ta seule vraie métrique de revenu récurrent | 5 000 €/mois |
| **Pourboires par tag actif / mois** | Prédit la rétention et la valeur vie client | > 150 € |
| Tags vendus | Vanity metric — utile, mais ne pilote rien | 300 actifs |

**Ne pilote pas sur « tags vendus ».** Un tag vendu et jamais activé est pire qu'une vente
manquée : il consomme du stock, de la trésorerie en SAV, et il produira un remboursement.

### Critères d'arrêt

Fixe-les maintenant, à froid, pendant que tu es lucide :

- Si à J45 le taux d'activation reste sous 50 % → **arrête toute acquisition**, le
  problème est produit, pas marketing.
- Si à J45 la pub indépendants dépasse 45 € de CAC sur les 3 segments → le Moteur A ne
  fonctionne pas, tout bascule sur le Moteur B et les partenariats.
- Si à J90 tu es sous 30 établissements réellement actifs → le problème est le marché ou
  le prix, pas le canal. Il faut revoir le modèle, pas rajouter un huitième canal.

---

## 10. Le résumé en dix lignes

1. Tu n'as pas un problème de canal. Tu as **0 vente, jamais**, et un produit qui demande
   au patron de payer pour un bénéfice qui va à ses salariés.
2. Répare ça en vendant à ceux qui sont **acheteur et bénéficiaire** : VTC, barbiers,
   coiffeurs en location de fauteuil. C'est le seul segment où la pub payante fonctionne.
3. Au patron, vends **l'avis Google** (déjà codé, invisible dans ton marketing) et
   **l'exonération de charges jusqu'en 2028** (vérifiée, loi du 19 février 2026).
4. Quitte la coiffure : ta propre base contient **22 900 restaurants/bars/cafés** contre
   7 000 salons, avec 5 fois plus de clients par jour.
5. **Offre le matériel** aux établissements. Il coûte ~4 € et rapporte 20 à 45 €/mois de
   commission. Le vendre 69 € une fois te ferme 90 % des portes.
6. Concentre-toi sur **l'Alsace** d'abord. Paris quand tu auras des références.
7. Retire la fausse preuve sociale **aujourd'hui** — 400+ équipes, 150 avis vérifiés,
   4.8/5 et 3 faux témoignages sont un risque DGCCRF réel, et ça se voit en 30 secondes.
8. **0/12 de tes propres établissements ont fini l'onboarding.** Répare ça avant de
   dépenser un euro, sinon tout fuit par là.
9. **Gèle le programme ambassadeurs** jusqu'à 20 clients signés de ta main. Un ambassadeur
   distribue un pitch qui marche, il ne l'invente pas.
10. Objectif à 14 jours : **10 clients réels et actifs**. Pas 200 tags. Dix. Tout le reste
    en découle.

---

## Sources externes vérifiées

- [PLF 2026 : prolongation de l'exonération des pourboires — L'Hôtellerie Restauration](https://www.lhotellerie-restauration.fr/sos-experts/plf-2026-les-deputes-prolongent-l-exoneration-des-pourboires-jusqu-en-2028)
- [Exonération des pourboires 2026-2028 : conditions, plafond 1,6 SMIC, paie et DSN — Socic](https://www.socic.fr/ressources-comptabilite/articles/exoneration-des-pourboires-2026-2028-ir-et-cotisations-sociales-plafond-16-smic-paie-dsn)
- [Frais de transport et pourboires : prolongation des mesures d'exonération — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/actualites/A18726)
- [Les chauffeurs des plateformes de VTC en 2024 : premiers résultats — SDES, Ministère de la Transition écologique](https://www.statistiques.developpement-durable.gouv.fr/les-chauffeurs-des-plateformes-de-vtc-en-2024-premiers-resultats)
- [Coiffure en France en 2026 : les chiffres clés du secteur — Coiffure Actu](https://coiffure-actu.fr/chiffres-cles-secteur-coiffure-france-2026/)
- [Le marché des barbiers en France : chiffres et statistiques](https://modelesdebusinessplan.com/blogs/infos/marche-barbiers-france-chiffres)
- [Location de fauteuil coiffure : profil du salon idéal — HairB2B](https://www.hairb2b.fr/location-fauteuil-coiffure-salon-ideal/)
- [Comparatif des solutions de pourboire digital en France (2026) — Tap Tiiip](https://www.taptiiip.com/blog/comparatif-solutions-pourboire-digital)
- [Comparatif des solutions de paiement pour les restaurants en 2026 — Entrepreneur Hero](https://www.entrepreneurhero.fr/terminal-de-paiement/comparatif-paiement-restaurants/)

*Données produit issues d'une interrogation directe de la base de production Digitip
(projet Supabase `sislgauvdecsmsfuewpl`) le 27 juillet 2026.*
