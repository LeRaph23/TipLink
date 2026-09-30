---
name: sketch-salon
description: Write and render a new episode of "Juste les Pointes", the illustrated hairdresser sketch series (seen through the salon mirror) (Nadia the jaded senior, Chloé the literal-minded apprentice) for TikTok/Reels, as a 1080×1920 MP4 with sound effects. Use when asked for a new episode, a sketch about a phrase hairdressers hear all the time, a coiffeuse/salon comedy video, or to extend the series; also when adapting the series format to barbers or restaurants.
---

# Épisode « Juste les Pointes »

Une série de sketchs dessinés : chaque épisode joue **une phrase que les
coiffeuses entendent tout le temps**. Tout vit dans `marketing/serie-coiffeuses/` :

| Fichier | Rôle |
|---|---|
| `BIBLE.md` | Personnages, salon, format, règle sur la plaque Digitip. **À lire avant d'écrire.** |
| `PHRASES.md` | Banque de phrases, avec une piste d'escalade et de retournement pour chacune |
| `kit/mirror-kit.js` | Plan « miroir du salon » et les personnages, pilotés par options (`Mirror.build`) |
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
4. **Retournement** qui n'est pas la chute attendue. La chute doit être une **image ou une
   phrase qu'on a envie de citer** (ép. 1 : Chloé coupe 1 mm → « Vous pouvez recoller ? »
   + Nadia qui tend un tube de colle). Refusé par l'utilisateur : les chutes molles du
   type « la prochaine fois, juste les pointes » ou une morale. Écrire trois chutes,
   garder la plus absurde qui reste crédible.
5. **Nadia ne commente pas, elle joue.** Elle entre dans le cadre pour le gag final,
   souvent **sans un mot** (un objet, un regard). Une réplique au plus, 5 mots max.
6. **On montre, on n'explique jamais** : pas de narratrice, pas de « traduction », pas de
   sous-titre qui dit quoi comprendre. L'utilisateur a rejeté ce format.
7. 12 à 18 s ; 8 bulles max ; 2 lignes max par bulle, environ 25 caractères par ligne.
8. Test final : une coiffeuse dirait-elle « c'est tellement vrai » ? Sinon, réécrire.

Montrer le script à l'utilisateur avant de dessiner s'il est ambigu ou s'il sort du format.

## 3. Construire l'épisode

**Style imposé** : illustration semi-réaliste, cadrée comme **le miroir du salon** (la
cliente assise face à nous, Chloé derrière elle). L'utilisateur a rejeté le style
cartoon « bonhommes triangles » : pas de corps géométriques, pas de gros contours noirs.

Copier `01-ep01-juste-les-pointes.html` en `NN-epNN-<slug>.html` (le préfixe `NN-` est
obligatoire pour le rendu). On y change : `data-duration`, le bandeau, les bulles, la
liste `#sfx` et l'appel `Mirror.build`.

**Les états** acceptent une valeur fixe ou une table `{ 'début-fin': valeur }` en secondes :

```js
Mirror.build({
  mirrorOn: '0-5.4,8-99',          // quand on voit le miroir (sinon: l'insert)
  client: { face: 'neutral' | 'stern' | 'menace' | 'shock' | 'sad', lean: '3.9-5.4' },
  chloe:  { face: 'grin' | 'worried' | 'proud' | 'panic',
            tool: 'scissors' | 'tweezers' | 'none',
            snips: '…', tremble: '3.9-5.4', jumps: [8.1] },
  nadia:  { on: '11.6-99' },        // elle glisse dans le cadre par la droite (tube de colle)
  insert: { on: '5.4-8', snip: 6.9 }, // gros plan « Zoom ×400 » sur un cheveu
});
```

- Besoin d'une expression, d'une coiffure, d'un objet ou d'un autre plan : l'ajouter
  **dans le kit** (nouvelle valeur d'option ou nouvel insert), pas dans l'épisode. Ce
  qu'il tient dans la main de Nadia (aujourd'hui la colle) doit devenir une option dès
  le 2e épisode.
- Rester dans le style : proportions réelles, dégradés doux (peau, cheveux, cape),
  contours fins colorés, mèches dessinées par des traits plus clairs.
- Garder les silhouettes (voir `BIBLE.md`) : carré noir, mèche fuchsia, créoles pour
  Nadia ; chignon bouclé roux, taches de rousseur, tablier rose pour Chloé.
- Bulles : `.bub.right.client` (cliente, queue vers sa tête, `left≈40–150px`,
  `top≈650–700px`), `.bub.right` (Chloé, à gauche de sa tête, `top≈560px`), `.shout`
  pour crier. Chaque bulle a un `data-on` et un enfant `data-pop` au même instant.
- Zone de sécurité Reels/TikTok : texte important entre y≈280 et y≈1250 ; rien
  d'essentiel collé au bord droit (icônes de l'appli).
- Bruitages disponibles dans `sfx.py` : pop, tink, ding, cash, whoosh, boing, flip, tick,
  drumroll (durée), tada, trombone, bell, cricket (durée), snip, hiss (durée). Un
  bruitage par temps fort ; `pop` à l'apparition de chaque bulle ; un silence
  (cricket) avant la chute marche bien.
- Plaque Digitip : elle reste sur l'étagère du fond, jamais mentionnée. Un épisode qui
  la met en avant doit porter la mention « Publicité » : le dire à l'utilisateur.

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
