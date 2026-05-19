# Migration Stripe → Mangopay (TipLink)

> Plan de migration. Fichier modifiable et partagé entre conversations.
> Révisé contre la doc Mangopay en ligne (`docs.mangopay.com`, mai 2026).

## Contexte

TipLink encaisse des pourboires par carte pour des staff (coiffeurs/restauration), vend
du matériel NFC « SmartTag » et gère un programme ambassadeurs. Aujourd'hui tout passe
par **Stripe Connect** : chaque staff/ambassadeur a un compte connecté *Custom*, et chaque
pourboire est un PaymentIntent avec `transfer_data.destination` qui crédite directement
le compte du staff.

Le propriétaire veut abandonner les comptes Connect pour un **modèle wallet** : TipLink
encaisse tout l'argent (pourboires **et** ventes de packs) dans un **wallet central
Mangopay**, suit les soldes staff dans sa propre base, et **reverse** les fonds au staff
qui demande un retrait (**minimum 40 €**). But : centraliser la trésorerie pour que le
revenu matériel finance les versements.

Décisions validées avec le propriétaire :
- **Migration 100 % Mangopay** — pourboires, packs matériel **et** ambassadeurs.
- Paiement carte : **SDK Checkout intégré**, UX proche de l'actuel Stripe Elements.
- **Aucune reprise de données** — uniquement des tests en prod, on part de zéro.
- Mangopay ne fournit **ni calcul de TVA ni génération de factures** → à recoder dans
  l'app pour les ventes de packs.

> Les clés API Mangopay seront fournies à la fin. Tout le développement et les tests se
> font en **sandbox** (`api.sandbox.mangopay.com`) ; le passage en prod = changement
> d'env uniquement.

---

## Décisions structurantes confirmées par la doc

Points vérifiés sur `docs.mangopay.com` qui **corrigent** ou **précisent** des hypothèses
de la première version du plan :

1. **SDK Node = `mangopay4-nodejs-sdk`**, *pas* `mangopay2-nodejs-sdk`. Mangopay a déprécié
   les anciens SDK : depuis le 25/11/2025 « seul le package contenant `mangopay4` doit être
   utilisé », et les SDK legacy ont été retirés de GitHub. Le SDK v4 cible l'API **v2.01**,
   est typé TypeScript (modèles dans `lib/models/`), Node ≥ 14.
2. **Catégorie d'utilisateur obligatoire** (`UserCategory`) sur **chaque** création/maj de
   user : `PAYER` ou `OWNER`.
   - `PAYER` : peut seulement payer (PayIn). Suffit pour les **tippeurs invités**.
   - `OWNER` : peut **recevoir des transferts, demander des payouts, passer la KYC**. Doit
     **accepter les CGU Mangopay** (`TermsAndConditionsAccepted`). Obligatoire pour
     **staff, ambassadeurs et la plateforme**. Le passage `PAYER → OWNER` est **irréversible**.
3. **Bank Account → Recipient** : l'objet *Bank Account* est remplacé par la feature
   **Recipient**. Un Bank Account créé après le **30/04/2026** ne peut **plus** servir aux
   payouts (échec `ResultCode 121018`). Comme on part de zéro **après** cette date, il faut
   intégrer **uniquement l'API Recipients** (`POST Create a Recipient`).
4. **SCA (authentification forte)** — impacts à ne pas sous-estimer :
   - **Enregistrement d'un Recipient** : déclenche un SCA (parcours hébergé Mangopay) →
     l'onboarding banque doit gérer une **redirection**.
   - **PayOut** : **exempté** de SCA (« trusted beneficiary », car le Recipient a été
     enregistré avec SCA). Aucun écran SCA au moment du retrait.
   - **Transfer** entre deux wallets dont les deux users sont `OWNER` : **soumis au SCA**,
     paramètre `ScaContext` requis (`USER_PRESENT` = défaut depuis le 15/12/2025, redirige
     l'utilisateur ; `USER_NOT_PRESENT` = la plateforme agit par procuration, exige un
     **consentement préalable** du user sinon `403`). **C'est le point dur du flux de
     retrait à deux jambes** — voir Phase 6 et Risques.
5. **Webhooks (« Hooks »)** : requête **HTTP GET** avec query params
   `?EventType=...&RessourceId=...&Date=...`. **Non signés, sans payload**. Sécurité = TLS
   1.2+ + **allowlist d'IP** (CIDR fournis par Mangopay via le Dashboard). Le endpoint doit
   répondre **200 en < 2 s** ; sinon retries (toutes les 10 min pendant 1 h, puis toutes les
   8 h pendant 3 j) ; **100 échecs consécutifs → Hook `INVALID`** (plus aucune notif). Une
   **adresse e-mail d'alerte** sur le Hook est **obligatoire pour toute intégration créée
   après le 02/04/2026** (donc pour nous).
6. **Checkout SDK** : flux carte = deux callbacks backend (`onCreateCardRegistration` puis
   `onCreatePayment`). Le SDK gère la tokenisation PCI et la **redirection 3DS en interne**
   (`SecureModeReturnURL` = `https://checkout.mangopay.com`). Le risque « CardRegistration
   manuelle » de la v1 du plan est **levé** : le SDK l'abstrait. Package React dédié :
   `@mangopay/checkout-sdk-react`.

---

## Modèle cible

- **TipLink** = un *Legal User* Mangopay, catégorie **`OWNER`**, + un **wallet central EUR**
  (« wallet de collecte »). Créés une fois par script de setup.
- **PayIn** carte → crédite toujours le wallet central (pourboires + packs). Pas de
  `transfer_data` : l'argent reste central. La commission plateforme reste un **calcul
  ledger** en base (pas de `Fees` Mangopay natifs, qui partiraient vers le *Fees Wallet*).
- **Solde staff** = ledger interne en base (`transactions`, `group_tip_transfers`,
  `staff_payouts`) — l'argent physique reste dans le wallet central.
- **Staff / ambassadeurs** = *Natural User* catégorie **`OWNER`** (CGU acceptées), avec un
  *Wallet* EUR, un *Recipient* IBAN, et une **KYC validée** (niveau REGULAR : un *Natural
  User* n'a besoin que d'une **pièce d'identité** ; pas d'UBO, réservé aux *Legal Users*
  BUSINESS).
- **Retrait staff** (≥ 40 €) en deux temps : `Transfer` wallet central → wallet du staff
  (**SCA `OWNER→OWNER`**, voir Phase 6), puis `PayOut` wallet du staff → son *Recipient*
  IBAN (exempté de SCA).
- **Ambassadeurs** : même modèle, minimum de retrait inchangé (30 €).
- **Tippeurs invités** : un PayIn carte exige un `AuthorId` → on crée un *Natural User*
  léger catégorie **`PAYER`** par tippeur (réutilisé par e-mail si fourni). Un `PAYER`
  suffit pour payer et n'exige ni CGU ni KYC.
- **Webhooks Mangopay** : GET non signés sans payload — le handler **refetch la ressource**
  via l'API à partir du `RessourceId`. Idempotence via `webhook_events`.

---

## Pré-requis

- **Accès réseau** : `docs.mangopay.com` est joignable (versions markdown via `.md` sur
  chaque URL, et `llms.txt` / `llms-full.txt` pour un dump complet). Vérifier que
  `api.sandbox.mangopay.com` et `api.mangopay.com` sont bien dans l'allowlist de
  l'environnement avant l'implémentation. Le **script du Checkout SDK** doit être chargé
  depuis `checkout.mangopay.com` (contrainte PCI — pas de bundling local) ⇒ à ajouter à la
  CSP avec `*.google.com` (cf. Phase 7).
- `node_modules/` doit être installé (`npm install`) puis **lire `node_modules/next/dist/docs/`**
  comme l'impose `AGENTS.md` (Next.js 16.2.4 a des conventions modifiées). À respecter :
  `params` async (`await params`), `headers()`/`cookies()` async, `runtime = 'nodejs'`
  sur les route handlers. Vérifier le statut de `unstable_cache` (utilisé dans
  `lib/stripe/pricing.ts` — ne sera plus nécessaire, voir Phase 1) et de `after()` /
  `unstable_after` (envisagé en Phase 4 pour le webhook).
- Dernière migration = `00052` (attention : `00043` est dupliqué). Le nouveau fichier
  sera **`00053`**.
- Côté Dashboard Mangopay (sandbox) : récupérer la **liste d'IP des Hooks** et configurer
  l'**e-mail d'alerte** obligatoire.

## Phase 0 — Dépendances & env

- **`package.json`** : retirer `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`,
  `@stripe/connect-js`, `@stripe/react-connect-js`. Ajouter **`mangopay4-nodejs-sdk`**
  (serveur), **`@mangopay/checkout-sdk-react`** (client React ; tire `@mangopay/checkout-sdk`
  en dépendance), **`pdf-lib`** (génération facture PDF — pur JS, sans dépendance native,
  adapté au serverless Vercel). Renommer le script `setup:stripe` → `setup:mangopay`.
- **`lib/env.ts`** : supprimer les vars `STRIPE_*` et `STRIPE_PRICE_PACK_*`. Ajouter
  (serveur) : `MANGOPAY_CLIENT_ID`, `MANGOPAY_API_KEY`, `MANGOPAY_BASE_URL`,
  `MANGOPAY_CENTRAL_WALLET_ID`, `MANGOPAY_PLATFORM_USER_ID`,
  `MANGOPAY_WEBHOOK_ALLOWED_IPS`. (Public) : remplacer `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  par `NEXT_PUBLIC_MANGOPAY_CLIENT_ID` (+ `NEXT_PUBLIC_MANGOPAY_ENVIRONMENT` =
  `SANDBOX`/`PRODUCTION` pour le Checkout SDK). Le prix des packs devient 100 % in-app : la
  constante `PACKS` dans `lib/env.ts` (déjà présente, `hardwareAmount`/`listAmount`)
  devient la source de vérité unique.
- Mettre à jour `scripts/check-env.ts`, `.env.example`, `__tests__/setup-env.ts`.

## Phase 1 — Module `lib/mangopay/` (remplace `lib/stripe/`)

| Fichier | Rôle |
|---|---|
| `client.ts` | Init `new mangopay({ clientId, clientApiKey, baseUrl })` (SDK v4) + constantes plateforme (wallet central, user plateforme). Remplace `lib/stripe/client.ts`. |
| `users.ts` | Création/lecture *Natural Users* avec `UserCategory` explicite : `OWNER` pour staff/ambassadeurs (+ `TermsAndConditionsAccepted`), `PAYER` pour les tippeurs invités. *Legal User* plateforme `OWNER`. Helper `getOrCreateTipperUser()`. |
| `wallets.ts` | Création wallet EUR par user `OWNER` + lecture de solde. |
| `cards.ts` | **Nouveau** — `POST Create a CardRegistration` (consommé par le callback `onCreateCardRegistration` du Checkout SDK) ; désactivation de carte si non sauvegardée. |
| `payins.ts` | Direct Card PayIn (`CardId` → wallet central). `SecureModeReturnURL` = `https://checkout.mangopay.com` (le SDK gère le retour 3DS). |
| `transfers.ts` | `Transfer` wallet central → wallet staff/ambassadeur, avec `ScaContext` (SCA `OWNER→OWNER`). |
| `payouts.ts` | `PayOut` wallet → *Recipient* (exempté de SCA). |
| `recipients.ts` | `POST Create a Recipient` (IBAN) — **API Recipients, pas Bank Accounts** ; gère la redirection SCA d'enregistrement. Réutilise `lib/banking/iban.ts` (`validateIban`, garde `ibantools`). |
| `kyc.ts` | Création document KYC, upload des pages, soumission, mapping de statut. Remplace `lib/stripe/identity.ts` — garder la validation MIME/taille de `fileToDocument`. |
| `refunds.ts` | Refund de PayIn + reverse de Transfer. Remplace `lib/stripe/refunds.ts`. ⚠ un PayIn en litige ne peut **pas** être remboursé, et un PayIn remboursé ne peut **pas** être disputé. |
| `hooks.ts` | Enregistrement/lecture des Hooks ; vérif allowlist IP ; refetch ressource par `RessourceId`. |
| `pricing.ts` | Prix packs depuis `PACKS` uniquement (plus de fetch distant → `unstable_cache` supprimé). |
| `vat.ts` | **Nouveau** — table de taux TVA standard par pays UE + reverse-charge si n° TVA UE valide (réutiliser le regex `EU_VAT_RE` de `lib/stripe/tax.ts`). Remplace Stripe Tax. |
| `invoice-pdf.ts` | **Nouveau** — génération facture PDF (`pdf-lib`), stockage dans un bucket Supabase Storage, renvoie l'URL. Remplace `lib/stripe/pack-invoice.ts`. |
| `idempotency.ts` | `generateIdempotencyKey` conservé ; Mangopay accepte une clé d'idempotence par en-tête de requête. |

## Phase 2 — Migration `supabase/migrations/00053_mangopay_migration.sql`

Aucune donnée prod → on supprime/renomme proprement (pas de colonnes mortes).

- `staff_profiles` : drop `stripe_account_id` ; add `mangopay_user_id`,
  `mangopay_wallet_id`, `mangopay_recipient_id`, `mangopay_kyc_status`.
- `ambassadors` : drop `stripe_account_id` ; add les 4 mêmes colonnes `mangopay_*`.
- `establishments` : drop `stripe_account_id` (jamais bénéficiaire d'un payout — pas de
  remplacement).
- `groups` : drop `stripe_customer_id` (pas de notion de customer ; les infos de
  facturation `legal_name`/`vat_number`/adresses suffisent).
- `transactions` : drop `stripe_payment_intent_id`, `stripe_session_id`,
  `stripe_charge_id`, `stripe_transfer_id` ; **renommer `application_fee_amount` →
  `platform_fee_amount`** (neutre, même sémantique : net staff = `amount - platform_fee_amount`) ;
  renommer `dispute_id` → `mangopay_dispute_id` ; add `mangopay_payin_id`, `mangopay_card_id`.
- `group_tip_transfers` : renommer `stripe_transfer_id` → `mangopay_transfer_id`.
- `staff_payouts` : renommer `stripe_payout_id` → `mangopay_payout_id` ; add
  `mangopay_transfer_id` (le leg central→wallet).
- `ambassador_payouts` : renommer `stripe_transfer_id`→`mangopay_transfer_id`,
  `stripe_payout_id`→`mangopay_payout_id`.
- `smarttag_orders` : drop `stripe_checkout_session_id`, `stripe_payment_intent_id`,
  `stripe_invoice_id`, `stripe_discount_id` ; add `mangopay_payin_id`, `invoice_pdf_url`.
- `promo_codes` : drop `stripe_coupon_id`, `stripe_promo_code_id` (remise déjà calculée
  in-app).
- `webhook_events` : drop `stripe_event_id` + son index unique ; add `mangopay_resource_id`,
  `mangopay_event_type` + **index unique sur `(mangopay_resource_id, mangopay_event_type)`**.
- Config plateforme (wallet central / user plateforme) → **en variables d'env** (pas de
  table, surface RLS réduite).
- Régénérer `types/database.ts` (`npm run db:types`).

## Phase 3 — Réécriture des routes API

- **`app/api/mangopay/create-card-registration/route.ts`** (**nouveau**) : sert le callback
  `onCreateCardRegistration` du Checkout SDK → appelle `lib/mangopay/cards.ts`, renvoie
  l'objet *CardRegistration* (`AccessKey`, `PreregistrationData`, `CardRegistrationURL`)
  **tel quel** au SDK.
- `app/api/stripe/create-intent/route.ts` → `app/api/mangopay/create-payin/route.ts` :
  sert le callback `onCreatePayment` → valide le staff (via `mangopay_user_id`/KYC), insère
  la ligne `transactions`, crée/réutilise le *Natural User* tippeur (`PAYER`), fait le
  Direct Card PayIn (`CardId` reçu du SDK) dans le **wallet central**. Plus de
  `transfer_data` ; la commission reste un calcul ledger (`platform_fee_amount`).
- `create-group-intent` : idem, répartition de groupe = calcul ledger seul.
- `billing/checkout` & `create-pack-intent` : TVA via `lib/mangopay/vat.ts`, PayIn dans
  le **wallet central**, MAJ des infos `groups`, suppression du customer Stripe.
- `billing/pack-tax` : recalcul synchrone via `lib/mangopay/vat.ts` (sans appel API).
- `billing/attach-pi-email` : **supprimée** — l'e-mail du reçu est stocké dans
  `transactions.metadata` à la création du PayIn et envoyé par `lib/email.ts`.
- `webhooks/stripe` → `app/api/webhooks/mangopay/route.ts` (Phase 4).
- `cron/group-transfers-reconcile` : repointé sur les statuts de Transfer Mangopay ; sert
  aussi de **filet de sécurité** si un Hook est manqué (cf. Phase 4).
- `ambassadeur/[code]/payout` : flux Transfer→PayOut (Phase 6) ; conserver le verrou
  consultatif + l'index unique partiel anti-doublon ; minimum 30 € inchangé.
- `ambassadeur/[code]/banking` : *Natural User* `OWNER` + Wallet + Recipient + KYC.

## Phase 4 — Handler webhook Mangopay

Nouveau `app/api/webhooks/mangopay/route.ts`. **Export `GET`** (les Hooks sont des requêtes
GET, pas POST). Hooks **non signés, sans payload**. Contrainte forte : répondre
**200 en moins de 2 secondes**. Étapes :
1. Vérifier l'IP de la requête contre `MANGOPAY_WEBHOOK_ALLOWED_IPS`.
2. Parser `EventType` + `RessourceId` + `Date` depuis la **query string**.
3. Idempotence : insert dans `webhook_events` ; sortir (200) si
   `(resource_id, event_type)` existe déjà.
4. **Refetcher la ressource** via l'API Mangopay (PayIn/PayOut/Transfer/KYC) — ne jamais
   se fier à la notification. Un refetch (~quelques centaines de ms) + écritures DB doit
   tenir dans le budget de 2 s. Si le traitement risque de déborder, **écrire l'event puis
   répondre 200** et déléguer le refetch+traitement à `after()` (Next.js — à confirmer dans
   `node_modules/next/dist/docs/`), avec le cron de réconciliation en filet.
5. Dispatcher. Le méga-handler actuel `payment_intent.succeeded` (branches
   `pack-express`/`pack-order`/tip/group) se mappe sur `PAYIN_NORMAL_SUCCEEDED` en
   branchant sur `transactions.metadata.source`.

Renvoyer **200 sur succès et sur doublon bénin**, **non-200 sur échec réel** (déclenche le
retry Mangopay : 10 min ×6 puis 8 h ×9). Surveiller le compteur d'échecs — **100 échecs
consécutifs invalident le Hook**.

Hooks à enregistrer : `PAYIN_NORMAL_SUCCEEDED/FAILED`, `PAYOUT_NORMAL_SUCCEEDED/FAILED`,
`TRANSFER_NORMAL_SUCCEEDED/FAILED`, `KYC_SUCCEEDED/FAILED`, événements de litige
(`DISPUTE_CREATED`, `DISPUTE_ACTION_REQUIRED`, `DISPUTE_CLOSED`…). Chaque Hook doit porter
une **adresse e-mail d'alerte** (obligatoire depuis le 02/04/2026).

## Phase 5 — Banque + KYC (onboarding)

`actions/stripe.ts` → `actions/mangopay.ts` :
- `createCustomStripeAccount`/`setupStaffBanking` → créer *Natural User* **`OWNER`**
  (`TermsAndConditionsAccepted: true`) → créer Wallet EUR → enregistrer *Recipient* (IBAN,
  **API Recipients**) → stocker les ids sur `staff_profiles`. L'enregistrement du Recipient
  **déclenche un SCA** : prévoir une **redirection** vers le parcours hébergé Mangopay puis
  une page de retour qui finalise. `onboarding_status` reste en attente tant que la KYC
  n'est pas validée **et** que le Recipient n'est pas confirmé.
- `updateBankAccountIBAN` → enregistrer un nouveau *Recipient* (re-déclenche un SCA),
  désactiver l'ancien.
- `getStaffStripeBalance`/`getStaffPayoutAvailability` → pilotés par le ledger (déjà
  largement le cas) + solde du wallet staff.
- `uploadStaffIdentityDocument` → `lib/mangopay/kyc.ts`.
- Composants : `BankingSetupForm.tsx`, `IdentityDocumentUpload.tsx`,
  `OnboardingWizard.tsx` — adapter le texte/flux (« enregistrer IBAN + envoyer pièce
  d'identité pour validation KYC »), gérer la **redirection SCA** du Recipient ; retraits
  bloqués tant que KYC ≠ validée ou Recipient ≠ confirmé.

## Phase 6 — Flux de retrait

Dans `requestPayout` (et équivalent ambassadeur) :
- Pré-conditions : `mangopay_user_id` + `mangopay_wallet_id` + `mangopay_recipient_id`
  présents, KYC validée, `payouts_frozen` faux.
- **Minimum staff = 40 €** : `MIN_PAYOUT_CENTS = 4_000` (actuellement `3_000` à
  `actions/stripe.ts:209`). Ambassadeur : 30 € inchangé.
- Conserver le **hold de 3 jours** (`PAYOUT_HOLD_DAYS`).
- Deux legs :
  1. **`Transfer`** central → wallet user. Les deux users étant `OWNER`, ce transfert est
     **soumis au SCA** : fournir `ScaContext`. Deux options à trancher avec la doc « SCA on
     transfers » :
     - `USER_NOT_PRESENT` (recommandé pour un retrait initié côté serveur) — exige que le
       **staff ait donné son consentement préalable** via le parcours SCA hébergé ; sinon
       `403`. Le consentement peut être recueilli **pendant l'onboarding** (en même temps
       que le SCA du Recipient).
     - `USER_PRESENT` — redirige le staff vers un écran SCA à chaque retrait (UX plus
       lourde).
  2. **`PayOut`** wallet user → *Recipient* — **exempté de SCA** (trusted beneficiary).
- Stocker `mangopay_transfer_id` puis `mangopay_payout_id`. Si le Transfer réussit mais le
  PayOut échoue : persister le transfer id et marquer `failed` pour qu'un retry ne
  re-transfère pas (la route ambassadeur fait déjà exactement ça).

## Phase 7 — Frontend (Checkout SDK)

`TipCheckout.tsx`, `GroupTipCheckout.tsx`, `PackCheckout.tsx`, `OrderPayment.tsx` :
remplacer `<Elements>`/`PaymentElement` (`@stripe/react-stripe-js`) par le composant
`<MangopayCheckout>` de **`@mangopay/checkout-sdk-react`**.
- Deux callbacks à câbler : **`onCreateCardRegistration`** → POST
  `/api/mangopay/create-card-registration` ; **`onCreatePayment`** → POST
  `/api/mangopay/create-payin` (renvoie l'objet PayIn au SDK).
- **Le SDK gère le 3DS en interne** : `SecureModeReturnURL` côté serveur =
  `https://checkout.mangopay.com`. ⇒ **pas** de pages de retour 3DS maison à créer ; on
  écoute l'événement **`paymentComplete`** (`onPaymentComplete`) puis on **vérifie le statut
  du PayIn côté backend** avant d'afficher le succès.
- `enableSaveCard` laissé à **`false`** (tippeurs invités, packs ponctuels) → évite la
  gestion `onDeactivateSavedCard`.
- **CSP** (`next.config.ts`) : autoriser le script `checkout.mangopay.com`
  (`script-src`/`script-src-elem`), les domaines Mangopay/Payline (`connect-src`) et
  `*.google.com` (`script-src`). Le script Checkout **doit** être servi depuis
  `checkout.mangopay.com` (PCI — pas de bundling local).
- Supprimer tout usage de `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## Phase 8 — Script de setup & divers

- `scripts/stripe-setup.ts` → `scripts/mangopay-setup.ts` : créer le *Legal User*
  plateforme (`OWNER`, CGU acceptées), le wallet central EUR, enregistrer tous les Hooks
  vers `${BASE_URL}/api/webhooks/mangopay` **avec une adresse e-mail d'alerte** (obligatoire),
  afficher `MANGOPAY_PLATFORM_USER_ID` / `MANGOPAY_CENTRAL_WALLET_ID` à coller dans l'env.
- `scripts/backfill-invoices.ts` : supprimer ou réécrire sur `lib/mangopay/invoice-pdf.ts`.
- Page admin `/admin/stripe` → `/admin/mangopay` (logs/santé webhooks, statut `INVALID`
  des Hooks). Adapter `/admin/webhooks` et `/admin/audit` aux nouvelles colonnes.
- E-mails : `lib/email.ts` / `lib/email/lifecycle.ts` — les fonctions sont neutres ;
  seuls les points de déclenchement (handler webhook) changent.

## Phase 9 — Tests

`__tests__/stripe/` → `__tests__/mangopay/`. `webhook.test.ts` → **GET** + allowlist IP +
mock du refetch ressource + idempotence + budget 2 s. `create_intent.test.ts`,
`billing_checkout.test.ts` → mock du SDK Mangopay v4 (callbacks card-registration +
create-payin). Mettre à jour `__tests__/setup-env.ts`. Ajouter `vat.test.ts`
(table de taux + reverse-charge) et `invoice-pdf.test.ts`.

---

## Vérification (sandbox Mangopay)

1. `npm install` puis `npm run check:env` ; lancer `npm run setup:mangopay`.
2. `npm run db:migrate` + `npm run db:types`.
3. `npm run lint` && `npm run build` && `npm run test`.
4. `npm run dev` puis dans le navigateur :
   - PayIn carte avec cartes test 3DS (succès **et** échec) → le solde du wallet central
     augmente ; l'événement `paymentComplete` est bien reçu.
   - Pourboire de groupe → répartition correcte dans `group_tip_transfers`.
   - Onboarding staff : *Natural User* `OWNER` + Wallet + enregistrement Recipient avec
     **redirection SCA** + upload pièce d'identité → KYC validée en sandbox.
   - Retrait staff ≥ 40 € : `Transfer` central→wallet (SCA résolu via consentement
     préalable ou écran `USER_PRESENT`) puis `PayOut`→Recipient ; refus si < 40 €, KYC non
     validée ou Recipient non confirmé.
   - Refund d'un pourboire → reverse du Transfer ; litige → `negative_balance_events`.
   - Achat de pack → facture PDF générée avec la **TVA in-app** correcte selon le pays.
   - Livraison d'un Hook GET (allowlist IP) + idempotence sur Hook dupliqué + réponse
     < 2 s.

---

## Risques

- **SCA sur les Transfers `OWNER→OWNER`** *(nouveau, point dur)* : le leg central→wallet du
  retrait déclenche un SCA. Trancher tôt entre `USER_NOT_PRESENT` (consentement recueilli à
  l'onboarding — préféré) et `USER_PRESENT` (redirection à chaque retrait). Confronter à la
  doc « SCA on transfers » avant de coder la Phase 6.
- **SCA sur l'enregistrement du Recipient** : l'onboarding banque n'est plus un simple
  appel API — il faut gérer une redirection hébergée. Sans Recipient confirmé, aucun
  payout.
- **Webhooks non signés + budget 2 s** : l'allowlist IP est la *seule* défense → la garder
  configurable par env. Tenir la contrainte 2 s ; 100 échecs consécutifs invalident le Hook.
- **KYC bloquante** : aucun payout possible avant KYC validée — l'UX d'onboarding doit
  gérer l'attente de validation.
- **TVA 100 % in-app** : la table de taux est une responsabilité de conformité — la
  garder datée et revue.
- **Catégorie `PAYER → OWNER` irréversible** : ne jamais créer un staff/ambassadeur en
  `PAYER` par erreur ; un tippeur réutilisé qui devient staff aurait besoin d'un nouveau
  user `OWNER`.
- **Next.js 16** : conventions modifiées (`AGENTS.md`) — lire `node_modules/next/dist/docs/`
  avant d'écrire du code, notamment pour `unstable_cache` et `after()`.

## Points encore à confirmer sur la doc avant codage

- Mécanique exacte de `ScaContext` côté SDK v4 (`USER_NOT_PRESENT` : comment recueillir et
  vérifier le consentement préalable du staff).
- Disponibilité de l'API **Recipients** dans `mangopay4-nodejs-sdk` (méthodes exactes) et
  forme du parcours SCA d'enregistrement.
- Statut de `after()` / `unstable_after` dans Next.js 16.2.4 pour le traitement webhook
  hors budget 2 s.
- Liste précise des `EventType` de Hooks disponibles (notamment litiges).

## Fichiers critiques

- `lib/env.ts` · `scripts/check-env.ts` · `.env.example` · `next.config.ts` (CSP)
- `actions/stripe.ts` → `actions/mangopay.ts`
- `app/api/webhooks/stripe/route.ts` → `app/api/webhooks/mangopay/route.ts` (GET)
- `app/api/stripe/create-intent/route.ts` → `app/api/mangopay/create-payin/route.ts`
  (+ `create-card-registration/route.ts` nouveau), `create-group-intent/route.ts`
- `app/api/billing/checkout/route.ts`, `create-pack-intent/route.ts`, `pack-tax/route.ts`
- `lib/stripe/*` → `lib/mangopay/*`
- `supabase/migrations/00053_mangopay_migration.sql` (nouveau)
- `components/payment/TipCheckout.tsx`, `GroupTipCheckout.tsx`,
  `components/checkout/PackCheckout.tsx`, `components/order/OrderPayment.tsx`
- `components/banking/BankingSetupForm.tsx`, `IdentityDocumentUpload.tsx`
