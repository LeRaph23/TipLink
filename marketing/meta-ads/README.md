# Pubs Meta (Reels / Stories, 9:16)

Trois pubs verticales 1080×1920, écrites en HTML/CSS et rendues image par image.

| Fichier | Angle | Durée |
|---|---|---|
| `01-pas-de-liquide.html` | Douleur : « j'ai pas de liquide » → la plaque → démo → promesses | 15,2 s |
| `02-le-calcul.html` | Rentabilité : plaque remboursée en moins de 10 pourboires de 10 € | 12,8 s |
| `03-pov-comptoir.html` | Format natif « POV » : le tableau de bord se remplit | 12,4 s |
| `04-la-fouille.html` | Sketch dessiné : le client fouille ses poches, sort de tout, puis 1 centime | 18,5 s |
| `05-je-repasse-demain.html` | Sketch dessiné : « je repasse demain », Léa attend trois ans | 17,3 s |

Les sketchs (04+) utilisent `cartoon.css` / `cartoon.js` (trait qui tremble,
bulles, police manuscrite Gochi Hand, licence OFL) et des bruitages synthétisés
par `sfx.py` à partir de la liste `#sfx` de chaque page.

Aperçu en direct : ouvrir un fichier `.html` dans Chrome (la page boucle).

Rendu MP4 (dans `out/`) :

```sh
FFMPEG=/chemin/vers/ffmpeg node marketing/meta-ads/render.mjs          # toutes
node marketing/meta-ads/render.mjs 02                                   # une seule
node marketing/meta-ads/render.mjs 01 --stills 1,5,9                    # images fixes
```

Les textes importants restent entre y≈280 et y≈1250 px, hors des zones
couvertes par l'interface Reels et dans le recadrage 4:5 du fil d'actualité.
Les vidéos 01 à 03 ont une piste audio muette : ajouter une musique depuis la
bibliothèque sonore de Meta dans le Gestionnaire de publicités.
