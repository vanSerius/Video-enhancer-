# Video-Enhancer

Eine Web-App, die unscharfe und schlecht kolorierte Videos verbessert — **komplett im Browser**, ohne Server, ohne Upload. Läuft auf GitHub Pages.

## Features

- **5 Ein-Klick-Presets**:
  - **Auto-Verbesserung** — ausgewogen: Schärfe + Rauschen + Farbe
  - **Schärfen** — aggressive Detailverstärkung
  - **Farbe auffrischen** — Sättigung, Vibrance, Kontrast
  - **Rauschen entfernen** — für körnige Aufnahmen
  - **KI-Upscaling 2×** — Real-ESRGAN Super-Resolution (langsam, beste Qualität)
- **Vorher/Nachher-Vorschau** Seite an Seite
- **Direkt herunterladen** als MP4
- **100 % client-seitig** — deine Datei verlässt deinen Browser nicht
- **Funktioniert auf GitHub Pages** dank coi-serviceworker (SharedArrayBuffer-Trick)

## Tech-Stack

- [Vite](https://vitejs.dev/) + TypeScript (Vanilla, kein Framework)
- [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) (multi-threaded WASM)
- [UpscalerJS](https://upscalerjs.com/) + [TensorFlow.js](https://www.tensorflow.org/js) (WebGL-Backend)
- [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) für Cross-Origin-Isolation auf GitHub Pages

## Lokal entwickeln

```bash
npm install
npm run dev
```

Öffne `http://localhost:5173`. In der DevTools-Konsole sollte `crossOriginIsolated === true` ergeben — das bedeutet SharedArrayBuffer ist aktiv und FFmpeg läuft multi-threaded.

## Build

```bash
npm run build
```

Die statische Site landet in `dist/`.

## Deployment auf GitHub Pages

1. In den Repo-Einstellungen unter **Settings → Pages** als Quelle **„GitHub Actions"** wählen.
2. Push auf `main` — der Workflow `.github/workflows/deploy.yml` baut und deployed automatisch.
3. Die App ist dann unter `https://<user>.github.io/Video-enhancer-/` erreichbar.

Der Vite-`base`-Pfad in `vite.config.ts` ist auf `/Video-enhancer-/` gesetzt — bei abweichendem Repo-Namen entsprechend anpassen.

## Bekannte Grenzen

- **Speicher**: Der Browser-Tab hat ein Speicherlimit von ~2–4 GB. Videos über ~30 Sek bei 1080p können den Tab überlasten — empfohlen sind kurze Clips.
- **KI-Upscaling-Geschwindigkeit**: Hängt stark von der GPU ab. Faustregel: 1–3 Sek pro Frame auf Mittelklasse-Hardware. Ein 10-Sek-Clip mit 30 fps = 300 Frames = 5–15 Minuten. Für längere Clips lieber einen der FFmpeg-Filter-Presets nehmen.
- **Erst-Ladezeit**: Beim ersten „Verbessern"-Klick werden ~30 MB FFmpeg-Core und (bei KI-Modus) ~5 MB ESRGAN-Modell geladen. Danach cached der Browser.
- **Audio**: Wird unverändert übernommen. Keine Audio-Verbesserung.
- **Safari**: FFmpeg-Multi-Thread kann zickig sein. Single-Thread-Fallback ist eingebaut, aber langsamer.

## Architektur

```
Browser
├── index.html
├── coi-serviceworker.js    → setzt COOP/COEP-Header für SharedArrayBuffer
└── src/
    ├── main.ts             → Bootstrap
    ├── ui.ts               → Drag-Drop, Presets, Vorschau, Download
    ├── presets.ts          → Preset-Definitionen + FFmpeg-Filter
    ├── ffmpeg-runner.ts    → FFmpeg.wasm Lazy-Load, Filter, Frame-Extraktion
    └── upscaler.ts         → UpscalerJS Pipeline (Frames → KI → Reassemble)
```

## Lizenz

MIT
