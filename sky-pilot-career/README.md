# Sky Pilot Career

Ein GitHub-ready Browser-Flugsimulator-Spiel mit Three.js und Vite.

Der Prototyp ist aus der ursprünglichen Einzel-HTML-Demo zu einer echten Projektstruktur umgebaut worden. Ziel ist ein realistisches Indie-Flugspiel: starten, Checkpoints fliegen, sauber landen, Score bekommen und Fortschritt speichern.

## Features

- 3D-Flugzeug mit Tail-Chase-, Cockpit-, Tower-, Wing- und Free-Look-Kamera
- prozedurales Terrain mit Runway, Taxiway, Apron, Tower, Hangar, Stadt, See, Straßen, Bäumen und Wolken
- vereinfachte, aber spielbare Flugphysik:
  - Lift / Drag / Thrust / Gravity
  - Angle of Attack
  - Stall
  - Overspeed
  - Flaps
  - Gear Drag
  - Bremsen
  - Treibstoffverbrauch
  - Wind
  - harte Landung / Crash-Erkennung
- Mission-Modus:
  - Takeoff
  - Checkpoints
  - Final Approach
  - Landebewertung
  - Score, XP und Geld
  - Speicherung per `localStorage`
- HUD mit Speed, Altitude, Vertical Speed, Heading, RPM, Flaps, Gear, Fuel, Warnings und FPS
- Browser-Audio für Engine, Wind, Stall, Gear, Flaps, Touchdown und Crash
- GitHub Actions Build-Workflow
- Netlify/Vercel-ready

## Start lokal

```bash
npm install
npm run dev
```

Dann im Browser öffnen:

```text
http://localhost:5173
```

## Build

```bash
npm run build
npm run preview
```

Der fertige Build landet in:

```text
dist/
```

## Steuerung

| Taste | Funktion |
|---|---|
| `Shift` | Schub erhöhen |
| `Ctrl` | Schub reduzieren |
| `W / S` | Pitch runter / hoch |
| `A / D` | Rollen links / rechts |
| `Q / E` | Seitenruder / Yaw |
| `F / V` | Flaps ausfahren / einfahren |
| `G` | Fahrwerk ein/aus |
| `B` | Bremse |
| `T / Y` | Trim |
| `C` | Kamera wechseln |
| `P` | Pause |
| `R` | Neustart |
| `Arrow Keys` | Free-Look-Kamera steuern |

## GitHub Upload

```bash
git init
git add .
git commit -m "Initial Sky Pilot Career prototype"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/sky-pilot-career.git
git push -u origin main
```

## Deployment auf Netlify

Build Command:

```bash
npm run build
```

Publish Directory:

```text
dist
```

## Deployment auf Vercel

Framework Preset: `Vite`

Build Command:

```bash
npm run build
```

Output Directory:

```text
dist
```

## Projektstruktur

```text
sky-pilot-career/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── .gitignore
├── .github/workflows/ci.yml
├── public/
│   └── favicon.svg
├── assets/
│   ├── models/
│   ├── textures/
│   └── sounds/
└── src/
    ├── main.js
    ├── aircraft.js
    ├── audio.js
    ├── cameraRig.js
    ├── constants.js
    ├── input.js
    ├── missions.js
    ├── physics.js
    ├── state.js
    ├── storage.js
    ├── styles.css
    ├── ui.js
    ├── utils.js
    └── world.js
```

## Nächste sinnvolle Entwicklungsschritte

1. echtes 3D-Flugzeugmodell als `.glb` einbauen
2. Cockpit mit echten Instrumenten bauen
3. echte Sounds in `assets/sounds` legen
4. Missionen erweitern: Frachtflug, Notlandung, Nachtflug, Sturmflug
5. Flugzeug-Auswahl und Upgrades bauen
6. Save-System erweitern
7. Mobile-Controls oder Gamepad-Support ergänzen
8. optional später Unity/Unreal-Version erstellen

## Claude Code Prompt für Weiterentwicklung

```text
You are working inside this repository: Sky Pilot Career.
Keep the project Vite + Three.js and improve it as a real indie flight simulator game.
Do not collapse the project back into one HTML file.

Priorities:
1. Keep npm run dev and npm run build working.
2. Improve playability before academic realism.
3. Add features in small, testable commits.
4. Use src/physics.js for flight model changes.
5. Use src/world.js for terrain/airport changes.
6. Use src/missions.js for game objectives and scoring.
7. Use src/ui.js for HUD/menu changes.
8. Use src/audio.js for sound.

Next task:
Add a second mission: emergency landing after engine failure. The engine should lose power after checkpoint 1, the HUD should show ENGINE FAILURE, and the player must glide back to the runway. Score the landing based on touchdown speed, sink rate and runway alignment.
```

## Status

Das ist noch kein fertiges kommerzielles Spiel, sondern eine saubere GitHub-Basis. Daraus kann man jetzt systematisch ein echtes Spiel entwickeln.
