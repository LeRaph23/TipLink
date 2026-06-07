@echo off
REM === Lanceur automatique du Screen Recorder (Windows) ===
REM Double-clique simplement sur ce fichier.

cd /d "%~dp0"

echo Demarrage du screen recorder...

REM Essaie de lancer un petit serveur local (necessaire pour Chrome).
where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:8000
    python -m http.server 8000
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:8000
    py -m http.server 8000
    goto :eof
)

REM Pas de Python : on ouvre directement le fichier dans le navigateur.
echo Python introuvable, ouverture directe du fichier...
start "" "%~dp0index.html"
