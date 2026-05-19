# Migration Stripe → Mangopay (TipLink)

> Plan de migration. Fichier modifiable et partagé entre conversations.

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
- Paiement carte : **SDK Checkout intégré** (`@mangopay/checkout-sdk`), UX proche de
  l'actuel Stripe Elements.
- **Aucune reprise de données** — uniquement des tests en prod, on part de zéro.
- Mangopay ne fournit **ni calcul de TVA ni génération de factures** → à recoder dans
  l'app pour les ventes de packs.

> Les clés API Mangopay seront fournies à la fin. Tout le développement et les tests se
> font en **sandbox** (`api.sandbox.mangopay.com`) ; le passage en prod = changement
> d'env uniquement.

---

## Modèle cible

- **TipLink** = un *Legal User* Mangopay + un **wallet central EUR** (« wallet de
  collecte »). Créés une fois par script de setup.
- **PayIn** carte → crédite toujours le wallet central (pourboires + packs). Pas de
  `transfer_data` : l'argent reste central.
- **Solde staff** = ledger interne en base (`transactions`, `group_tip_transfers`,
  `staff_payouts`) — l'argent physique reste dans le wallet central.
- **Retrait staff** (≥ 40 €) en deux temps : `Transfer` wallet central → wallet du staff,
  puis `PayOut` wallet du staff → son IBAN (objet *Recipient*). Pré-requis : le staff a un
  *Natural User*, un *Wallet*, un *Recipient* IBAN, et une **KYC validée** (Mangopay exige
  le niveau REGULAR / un document d'identité avant tout payout).
- **Ambassadeurs** : même modèle, minimum de retrait inchangé (30 €).
- **Tippeurs invités** : un PayIn carte exige un `AuthorId` → on crée un *Natural User*
  léger par tippeur (réutilisé par e-mail si fourni).
- **Webhooks Mangopay (« Hooks »)** : non signés, sans payload — la notification ne
  contient que `RessourceId` + `EventType` + `Date`. Sécurité = allowlist d'IP ; le
  handler doit **refetcher la ressource** via l'API. Idempotence via `webhook_events`.

---

## Pré-requis

- **Accès réseau** : dans l'environnement actuel, `docs.mangopay.com` et les API
  Mangopay ne sont **pas joignables** (allowlist réseau + blocage anti-bot 403). Avant
  l'implémentation, ajouter à l'allowlist de l'environnement : `docs.mangopay.com`
  (doc — versions markdown via `.md` sur chaque URL et `/llms-full.txt`),
  `api.sandbox.mangopay.com` et `api.mangopay.com`. Les détails d'API précisés
  « à vérifier » ci-dessous **doivent** être confrontés à la doc à ce moment-là.
- `node_modules/` doit être installé (`npm install`) puis **lire `node_modules/next/dist/docs/`**
  comme l'impose `AGENTS.md` (Next.js 16.2.4 a des conventions modifiées). À respecter :
  `params` async (`await params`), `headers()`/`cookies()` async, `runtime = 'nodejs'`
  sur les route handlers. Vérifier le statut de `unstable_cache` (utilisé dans
  `lib/stripe/pricing.ts` — ne sera plus nécessaire, voir Phase 1).
- Dernière migration = `00052` (attention : `00043` est dupliqué). Le nouveau fichier
  sera **`00053`**.

---

## Phase 0 — Dépendances & env

- **`package.json`** : retirer `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`,
  `@stripe/connect-js`, `@stripe/react-connect-js`. Ajouter `mangopay2-nodejs-sdk`
  (serveur), `@mangopay/checkout-sdk` (client), **`pdf-lib`** (génération facture PDF —
  pur JS, sans dépendance native, adapté au serverless Vercel). Renommer le script
  `setup:stripe` → `setup:mangopay`.
- **`lib/env.ts`** : supprimer les vars `STRIPE_*` et `STRIPE_PRICE_PACK_*`. Ajouter
  (serveur) : `MANGOPAY_CLIENT_ID`, `MANGOPAY_API_KEY`, `MANGOPAY_BASE_URL`,
  `MANGOPAY_CENTRAL_WALLET_ID`, `MANGOPAY_PLATFORM_USER_ID`,
  `MANGOPAY_WEBHOOK_ALLOWED_IPS`. (Public) : remplacer `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  par `NEXT_PUBLIC_MANGOPAY_CLIENT_ID`. Le prix des packs devient 100 % in-app : la
  constante `PACKS` dans `lib/env.ts` (déjà présente, `hardwareAmount`/`listAmount`)
  devient la source de vérité unique.
- Mettre à jour `scripts/check-env.ts`, `.env.example`, `__tests__/setup-env.ts`.

## Phase 1 — Module `lib/mangopay/` (remplace `lib/stripe/`)

| Fichier | Rôle |
|---|---|
| `client.ts` | Init `new mangopay({ clientId, clientApiKey, baseUrl })` + constantes plateforme (wallet central, user plateforme). Remplace `lib/stripe/client.ts`. |
| `users.ts` | Création/lecture *Natural Users* (staff, ambassadeurs, tippeurs invités) et *Legal User* plateforme. Helper `getOrCreateTipperUser()`. |
| `wallets.ts` | Création wallet EUR par user + lecture de solde. |
| `payins.ts` | Direct Card PayIn (`CardDirect`) vers le wallet central ; gestion du `SecureModeRedirectURL` (3DS). |
| `transfers.ts` | `Transfer` wallet central → wallet staff/ambassadeur. |
| `payouts.ts` | `PayOut` wallet → IBAN (*Recipient*). |
| `recipients.ts` | Enregistrement IBAN/*Recipient* ; réutilise `lib/banking/iban.ts` (`validateIban`, garde `ibantools`). |
| `kyc.ts` | Création document KYC, upload des pages, soumission, mapping de statut. Remplace `lib/stripe/identity.ts` — garder la validation MIME/taille de `fileToDocument`. |
| `refunds.ts` | Refund de PayIn + reverse de Transfer. Remplace `lib/stripe/refunds.ts`. |
| `hooks.ts` | Enregistrement/lecture des Hooks ; vérif allowlist IP ; refetch ressource par `RessourceId`. |
| `pricing.ts` | Prix packs depuis `PACKS` uniquement (plus de fetch distant → `unstable_cache` supprimé). |
| `vat.ts` | **Nouveau** — table de taux TVA standard par pays UE + reverse-charge si n° TVA UE valide (réutiliser le regex `EU_VAT_RE` de `lib/stripe/tax.ts`). Remplace Stripe Tax. |
| `invoice-pdf.ts` | **Nouveau** — génération facture PDF (`pdf-lib`), stockage dans un bucket Supabase Storage, renvoie l'URL. Remplace `lib/stripe/pack-invoice.ts`. |
| `idempotency.ts` | `generateIdempotencyKey` conservé quasi tel quel. |

> **Risque à vérifier sur la doc Mangopay** : le flux carte exige une *CardRegistration*
> (serveur crée → client tokenise via le Checkout SDK → serveur fait le PayIn avec le
> `CardId`). Confirmer ce que `@mangopay/checkout-sdk` abstrait.

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

- `app/api/stripe/create-intent/route.ts` → `app/api/mangopay/create-payin/route.ts` :
  valide le staff (via `mangopay_user_id`/KYC), insère la ligne `transactions`, crée le
  *Natural User* tippeur, fait le Direct Card PayIn dans le **wallet central**. Plus de
  `transfer_data` ; la commission reste un calcul ledger (`platform_fee_amount`).
- `create-group-intent` : idem, répartition de groupe = calcul ledger seul.
- `billing/checkout` & `create-pack-intent` : TVA via `lib/mangopay/vat.ts`, PayIn dans
  le **wallet central**, MAJ des infos `groups`, suppression du customer Stripe.
- `billing/pack-tax` : recalcul synchrone via `lib/mangopay/vat.ts` (sans appel API).
- `billing/attach-pi-email` : **supprimée** — l'e-mail du reçu est stocké dans
  `transactions.metadata` à la création du PayIn et envoyé par `lib/email.ts`.
- `webhooks/stripe` → `app/api/webhooks/mangopay/route.ts` (Phase 4).
- `cron/group-transfers-reconcile` : repointé sur les statuts de Transfer Mangopay.
- `ambassadeur/[code]/payout` : flux Transfer→PayOut (Phase 6) ; conserver le verrou
  consultatif + l'index unique partiel anti-doublon ; minimum 30 € inchangé.
- `ambassadeur/[code]/banking` : *Natural User* + Wallet + Recipient + KYC.

## Phase 4 — Handler webhook Mangopay

Nouveau `app/api/webhooks/mangopay/route.ts`. Hooks **non signés, sans payload**. Étapes :
1. Vérifier l'IP de la requête contre `MANGOPAY_WEBHOOK_ALLOWED_IPS`.
2. Parser `EventType` + `RessourceId`.
3. Idempotence : insert dans `webhook_events` ; sortir si `(resource_id, event_type)`
   existe déjà.
4. **Refetcher la ressource** via l'API Mangopay (PayIn/PayOut/Transfer/KYC) — ne jamais
   se fier à la notification.
5. Dispatcher. Le méga-handler actuel `payment_intent.succeeded` (branches
   `pack-express`/`pack-order`/tip/group) se mappe sur `PAYIN_NORMAL_SUCCEEDED` en
   branchant sur `transactions.metadata.source`.

Hooks à enregistrer : `PAYIN_NORMAL_SUCCEEDED/FAILED`, `PAYOUT_NORMAL_SUCCEEDED/FAILED`,
`TRANSFER_NORMAL_SUCCEEDED/FAILED`, `KYC_SUCCEEDED/FAILED`, événements de litige
(`DISPUTE_CREATED`, `DISPUTE_ACTION_REQUIRED`, `DISPUTE_CLOSED`…). Renvoyer 200 sur
doublon bénin, non-200 sur échec réel (déclenche le retry Mangopay).

## Phase 5 — Banque + KYC (onboarding)

`actions/stripe.ts` → `actions/mangopay.ts` :
- `createCustomStripeAccount`/`setupStaffBanking` → créer *Natural User* → créer Wallet
  EUR → enregistrer *Recipient* (IBAN) → stocker les ids sur `staff_profiles` ;
  `onboarding_status` reste en attente tant que la KYC n'est pas validée.
- `updateBankAccountIBAN` → désactiver l'ancien *Recipient*, en enregistrer un nouveau.
- `getStaffStripeBalance`/`getStaffPayoutAvailability` → pilotés par le ledger (déjà
  largement le cas) + solde du wallet staff.
- `uploadStaffIdentityDocument` → `lib/mangopay/kyc.ts`.
- Composants : `BankingSetupForm.tsx`, `IdentityDocumentUpload.tsx`,
  `OnboardingWizard.tsx` — adapter le texte/flux (« enregistrer IBAN + envoyer pièce
  d'identité pour validation KYC ») ; retraits bloqués tant que KYC ≠ validée.

## Phase 6 — Flux de retrait

Dans `requestPayout` (et équivalent ambassadeur) :
- Pré-conditions : `mangopay_user_id` + `mangopay_wallet_id` + `mangopay_recipient_id`
  présents, KYC validée, `payouts_frozen` faux.
- **Minimum staff = 40 €** : `MIN_PAYOUT_CENTS = 4_000` (actuellement `3_000` à
  `actions/stripe.ts:209`). Ambassadeur : 30 € inchangé.
- Conserver le **hold de 3 jours** (`PAYOUT_HOLD_DAYS`).
- Deux legs : `Transfer` central → wallet user (stocker `mangopay_transfer_id`), puis
  `PayOut` wallet user → *Recipient* (stocker `mangopay_payout_id`). Si le Transfer
  réussit mais le PayOut échoue : persister le transfer id et marquer `failed` pour
  qu'un retry ne re-transfère pas (la route ambassadeur fait déjà exactement ça).

## Phase 7 — Frontend (Checkout SDK)

`TipCheckout.tsx`, `GroupTipCheckout.tsx`, `PackCheckout.tsx`, `OrderPayment.tsx` :
remplacer `<Elements>`/`PaymentElement` (`@stripe/react-stripe-js`) par le formulaire
carte `@mangopay/checkout-sdk` → tokenisation → POST vers la route PayIn → si 3DS,
redirection vers `SecureModeRedirectURL`. Ajouter des pages de retour (ex.
`/pay/[staffId]/return`, `/checkout/return`) qui interrogent le statut du PayIn.
Supprimer tout usage de `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## Phase 8 — Script de setup & divers

- `scripts/stripe-setup.ts` → `scripts/mangopay-setup.ts` : créer le *Legal User*
  plateforme, le wallet central EUR, enregistrer tous les Hooks vers
  `${BASE_URL}/api/webhooks/mangopay`, afficher `MANGOPAY_PLATFORM_USER_ID` /
  `MANGOPAY_CENTRAL_WALLET_ID` à coller dans l'env.
- `scripts/backfill-invoices.ts` : supprimer ou réécrire sur `lib/mangopay/invoice-pdf.ts`.
- Page admin `/admin/stripe` → `/admin/mangopay` (logs/santé webhooks). Adapter
  `/admin/webhooks` et `/admin/audit` aux nouvelles colonnes.
- E-mails : `lib/email.ts` / `lib/email/lifecycle.ts` — les fonctions sont neutres ;
  seuls les points de déclenchement (handler webhook) changent.

## Phase 9 — Tests

`__tests__/stripe/` → `__tests__/mangopay/`. `webhook.test.ts` → allowlist IP + mock du
refetch ressource + idempotence. `create_intent.test.ts`, `billing_checkout.test.ts` →
mock du SDK Mangopay. Mettre à jour `__tests__/setup-env.ts`. Ajouter `vat.test.ts`
(table de taux + reverse-charge) et `invoice-pdf.test.ts`.

---

## Vérification (sandbox Mangopay)

1. `npm install` puis `npm run check:env` ; lancer `npm run setup:mangopay`.
2. `npm run db:migrate` + `npm run db:types`.
3. `npm run lint` && `npm run build` && `npm run test`.
4. `npm run dev` puis dans le navigateur :
   - PayIn carte avec cartes test 3DS (succès **et** échec) → le solde du wallet central
     augmente.
   - Pourboire de groupe → répartition correcte dans `group_tip_transfers`.
   - Onboarding staff : IBAN + upload pièce d'identité → KYC validée en sandbox.
   - Retrait staff ≥ 40 € : Transfer central→wallet puis PayOut→IBAN ; refus si < 40 €
     ou KYC non validée.
   - Refund d'un pourboire → reverse du Transfer ; litige → `negative_balance_events`.
   - Achat de pack → facture PDF générée avec la **TVA in-app** correcte selon le pays.
   - Livraison d'un Hook (allowlist IP) + idempotence sur Hook dupliqué.

---

## Risques

- **Checkout SDK vs CardRegistration** : mécanique exacte à confirmer sur la doc Mangopay
  en ligne avant codage.
- **KYC bloquante** : aucun payout possible avant KYC REGULAR — l'UX d'onboarding doit
  gérer l'attente de validation.
- **Webhooks non signés** : l'allowlist IP est la *seule* défense → la garder
  configurable par env et surveillée.
- **TVA 100 % in-app** : la table de taux est une responsabilité de conformité — la
  garder datée et revue.
- **Next.js 16** : conventions modifiées (`AGENTS.md`) — lire `node_modules/next/dist/docs/`
  avant d'écrire du code, notamment pour `unstable_cache`.

## Fichiers critiques

- `lib/env.ts` · `scripts/check-env.ts` · `.env.example`
- `actions/stripe.ts` → `actions/mangopay.ts`
- `app/api/webhooks/stripe/route.ts` → `app/api/webhooks/mangopay/route.ts`
- `app/api/stripe/create-intent/route.ts`, `create-group-intent/route.ts`
- `app/api/billing/checkout/route.ts`, `create-pack-intent/route.ts`, `pack-tax/route.ts`
- `lib/stripe/*` → `lib/mangopay/*`
- `supabase/migrations/00053_mangopay_migration.sql` (nouveau)
- `components/payment/TipCheckout.tsx`, `GroupTipCheckout.tsx`,
  `components/checkout/PackCheckout.tsx`, `components/order/OrderPayment.tsx`
- `components/banking/BankingSetupForm.tsx`, `IdentityDocumentUpload.tsx`
