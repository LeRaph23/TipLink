# Pubs Meta (Reels / Stories, 9:16)

Trois pubs verticales 1080×1920, écrites en HTML/CSS et rendues image par image.

| Fichier | Angle | Durée |
|---|---|---|
| `01-pas-de-liquide.html` | Douleur : « j'ai pas de liquide » → la plaque → démo → promesses | 15,2 s |
| `02-le-calcul.html` | Rentabilité : plaque remboursée en moins de 10 pourboires de 10 € | 12,8 s |
| `03-pov-comptoir.html` | Format natif « POV » : le tableau de bord se remplit | 12,4 s |

Aperçu en direct : ouvrir un fichier `.html` dans Chrome (la page boucle).

Rendu MP4 (dans `out/`) :

```sh
FFMPEG=/chemin/vers/ffmpeg node marketing/meta-ads/render.mjs          # toutes
node marketing/meta-ads/render.mjs 02                                   # une seule
node marketing/meta-ads/render.mjs 01 --stills 1,5,9                    # images fixes
```

Les textes importants restent entre y≈280 et y≈1250 px, hors des zones
couvertes par l'interface Reels et dans le recadrage 4:5 du fil d'actualité.
Les vidéos ont une piste audio muette : ajouter une musique depuis la
bibliothèque sonore de Meta dans le Gestionnaire de publicités.
