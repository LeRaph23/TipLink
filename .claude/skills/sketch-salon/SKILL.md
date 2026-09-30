---
name: sketch-salon
description: Write and render a new episode of "Juste les Pointes", the hand-drawn hairdresser sketch series (Nadia the jaded senior, Chloé the literal-minded apprentice) for TikTok/Reels, as a 1080×1920 MP4 with sound effects. Use when asked for a new episode, a sketch about a phrase hairdressers hear all the time, a coiffeuse/salon comedy video, or to extend the series; also when adapting the series format to barbers or restaurants.
---

# Épisode « Juste les Pointes »

Une série de sketchs dessinés : chaque épisode joue **une phrase que les
coiffeuses entendent tout le temps**. Tout vit dans `marketing/serie-coiffeuses/` :

| Fichier | Rôle |
|---|---|
| `BIBLE.md` | Personnages, salon, format, règle sur la plaque Digitip. **À lire avant d'écrire.** |
| `PHRASES.md` | Banque de phrases, avec une piste d'escalade et de retournement pour chacune |
| `kit/salon-kit.js` | Le décor et les trois personnages, pilotés par options (`Salon.build`) |
| `kit/series.css` | Style propre à la série (bandeau, bulles cliente, tag de fin) |
| `01-ep01-juste-les-pointes.html` | Épisode de référence : partir de ce fichier |
| `render.sh` | Rendu MP4 ou images fixes (installe ffmpeg / Playwright si besoin) |

Le moteur (`../meta-ads/base.js`, `cartoon.js`, `cartoon.css`, `sfx.py`,
`render.mjs`) est partagé avec les pubs : ne pas le casser.

## 1. Choisir la phrase

- Prendre une phrase de `PHRASES.md` pas encore tournée, en priorité celles marquées ✓.
  Si l'utilisateur en apporte une, l'ajouter à la banque.
- Une phrase « à valider » : le dire à l'utilisateur (on n'a pas de source qui confirme
  que les coiffeuses l'entendent vraiment).

## 2. Écrire le script (avant tout code)

Écrire les temps forts avec leur minutage, puis vérifier chaque règle :

1. **La phrase dès la 1re seconde** : bandeau du haut `Les phrases du salon, n°X` +
   première bulle de la cliente.
2. **Chloé la prend au pied de la lettre** ou fonce ; c'est elle qui déclenche l'action.
3. **Escalade en 2 ou 3 temps**, chaque fois plus gros et plus rapide. À chaque temps,
   quelque chose **change à l'image** (cheveux, outil, visage, objet) et un **bruitage**.
4. **Retournement** qui n'est pas la chute attendue. Le plus fort : la cliente retourne
   la situation contre la coiffeuse.
5. **Nadia ne commente pas, elle joue.** Réactions muettes (sourcil, gorgée de café),
   puis **une seule réplique finale, 5 mots max**.
6. **On montre, on n'explique jamais** : pas de narratrice, pas de « traduction », pas de
   sous-titre qui dit quoi comprendre. L'utilisateur a rejeté ce format.
7. 12 à 18 s ; 8 bulles max ; 2 lignes max par bulle, environ 25 caractères par ligne.
8. Test final : une coiffeuse dirait-elle « c'est tellement vrai » ? Sinon, réécrire.

Montrer le script à l'utilisateur avant de dessiner s'il est ambigu ou s'il sort du format.

## 3. Construire l'épisode

Copier `01-ep01-juste-les-pointes.html` en `NN-epNN-<slug>.html` (le préfixe `NN-` est
obligatoire pour le rendu). On y change : `data-duration`, le bandeau, les bulles, la
liste `#sfx` et l'appel `Salon.build`.

**Les états** acceptent une valeur fixe ou une table `{ 'début-fin': valeur }` en secondes :

```js
Salon.build({
  nadia:  { face: 'blasee' | 'surprise', brow: '8.6-12.9', sip: [15.0] },
  client: { hair: 'long' | 'shoulder' | 'bob' | 'pixie',
            face: 'smile' | 'neutral' | 'annoyed' | 'wow' | 'hot' | 'fake',
            red: '5-9', sweat: '6-9' },
  chloe:  { tool: 'scissors' | 'ruler' | 'shower' | 'mirror' | 'none',
            eyes: 'happy' | 'focus' | 'panic', mouth: 'grin' | 'o' | 'tongue' | 'wobbly',
            sweat: '…', snips: '3.3-3.6,…', cheer: '12.2-12.9', jumps: [12.3] },
  tufts:  [3.5, 6.95, …],   // mèches qui tombent et s'empilent au sol
  hearts: 12.3,             // cœurs autour de Chloé à partir de cet instant
  salon:  '0-15',           // fenêtre du décor salon, si une autre scène suit
  extra:  '<g data-on="15-99">…</g>', // autre scène (voiture, rue…) en SVG
});
```

- Besoin d'une expression, d'une coiffure ou d'un outil qui n'existe pas : l'ajouter
  **dans le kit** (nouvelle valeur d'option), pas dans l'épisode, pour la réutiliser.
- Garder la silhouette des personnages (voir `BIBLE.md`) : carré noir, mèche fuchsia et
  mug « NON » pour Nadia ; queue de cheval rousse et salopette rose pour Chloé.
- Bulles : `.bub.client` (cliente, 52 px), `.bub.right` (Chloé, queue à droite),
  `.bub` (Nadia, à gauche vers `left:30px`), `.shout` pour crier. Chaque bulle a un
  `data-on` et un enfant `data-pop` au même instant.
- Zone de sécurité Reels/TikTok : texte important entre y≈280 et y≈1250 ; rien
  d'essentiel collé au bord droit (icônes de l'appli).
- Bruitages disponibles dans `sfx.py` : pop, tink, ding, cash, whoosh, boing, flip, tick,
  drumroll (durée), tada, trombone, bell, cricket (durée), snip, hiss (durée). Un
  bruitage par temps fort ; `pop` à l'apparition de chaque bulle.
- Plaque Digitip : elle reste sur l'étagère, jamais mentionnée. Un épisode qui la met en
  avant doit être signalé comme publicité (mention « Publicité ») : le dire à l'utilisateur.

## 4. Vérifier puis rendre

```sh
marketing/serie-coiffeuses/render.sh NN --stills 1,3,5,7,9,11,13,15   # images fixes
marketing/serie-coiffeuses/render.sh NN                               # MP4 dans out/
```

- Assembler les images fixes en une planche (ffmpeg `hstack`/`vstack`) et **la
  regarder** : bulles qui se chevauchent ou débordent, bandeau qui masque un visage,
  changement d'état qui n'apparaît pas, texte hors zone de sécurité. Corriger, recommencer.
- Rendre la vidéo, puis vérifier une planche à 1 image/s tirée du MP4.
- Envoyer le MP4 à l'utilisateur (`SendUserFile`). `out/` n'est pas versionné ; commiter
  l'épisode, le kit et `PHRASES.md` (marquer la phrase comme tournée).

## Autres métiers

Pour une série barbiers ou restaurants : même format et même moteur, mais nouveau
dossier (`marketing/serie-<métier>/`) avec sa propre bible, sa banque de phrases et son
kit (décor et personnages à redessiner). Ne pas réutiliser Nadia et Chloé.
