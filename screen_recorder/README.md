# 🎬 Screen Recorder

Enregistreur d'écran ultra-simple pour filmer ton onboarding (format paysage, sur PC).
Aucune installation : tout se passe dans le navigateur (Chrome ou Edge recommandés).

## Comment le lancer

### Méthode 1 — Le plus simple (double-clic)
1. Ouvre le dossier `screen_recorder`.
2. Double-clique sur **`index.html`** → il s'ouvre dans ton navigateur.
3. Clique sur **« Démarrer l'enregistrement »**.
4. Dans la fenêtre de partage, choisis **« Tout l'écran »** (= format paysage 16:9 automatique).
5. Fais ton onboarding, parle si tu as coché le micro.
6. Clique sur **« Arrêter »**, puis **« Télécharger la vidéo »**.

> Si le bouton ne marche pas (rare), passe par la Méthode 2.

### Méthode 2 — Via un petit serveur local (si besoin)
Ouvre un terminal dans le dossier `screen_recorder` et lance :

```bash
python -m http.server 8000
```

Puis va sur **http://localhost:8000** dans Chrome.

## Options
- **Micro (ta voix)** : pour commenter pendant l'enregistrement.
- **Son du système** : pour capter les sons de l'appli.

## Format de sortie
La vidéo est en `.webm` (lisible partout : VLC, navigateur, etc.).
Pour la convertir en MP4 (ex. pour YouTube ou réseaux), avec [ffmpeg](https://ffmpeg.org) :

```bash
ffmpeg -i onboarding-XXXX.webm onboarding.mp4
```

## Conseils pour un bon paysage 16:9
- Choisis **« Tout l'écran »** plutôt qu'une fenêtre (évite les bords noirs).
- Sur PC, l'écran est déjà en 16:9 → la vidéo sera nativement en paysage.
- La capture vise du 1920×1080 à 30 fps.
