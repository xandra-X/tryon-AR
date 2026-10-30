# TryOn Studio

A personal live virtual try-on app for your Mac webcam. The app runs on localhost; the actual AI runs on Decart's cloud, using the official `@decartai/sdk` and `lucy-vton-latest` model. It is not an offline model.

## Start

Double-click `Start TryOn.command`, or run:

```sh
git clone https://github.com/xandra-X/tryon-AR.git
cd tryon-AR
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173). Use Chrome or Edge for the best WebRTC compatibility.

1. Get a Decart API key with available credits at https://platform.decart.ai.
2. Open **Connection settings** and paste the key. The app keeps it only in tab memory; refresh requires re-entry.
3. Enable the camera and allow camera access.
4. Upload or drop a JPG, PNG, or WebP clothing photo (maximum 15 MB). Add an optional outfit description.
5. Click **Start live try-on**. This starts a paid cloud session and sends video plus your outfit image to Decart.
6. Upload another image and click **Apply new outfit** to change outfits without reconnecting.
7. Click **End live session** to disconnect from AI. **Turn off camera** also releases the webcam.

The app disconnects on page exit, or after five minutes without a click or keyboard interaction. The timer measures elapsed session time, not provider billing. Provider pricing, availability, queues and model quality apply. Stand back with good light and one person in frame. Costumes/armour may vary in quality.

## Build

`npm run build` type-checks the app and produces `dist/`. `npm run preview` serves that build locally.

## Privacy and scope

Camera preview is local. Microphone access is never requested. Live video and the outfit image go directly to Decart when you start AI try-on. The key is not saved to browser storage or the source tree. This is a personal localhost app; do not publish it as a shared production service with a long-lived key. A shared service should mint short-lived scoped client tokens from a backend.

## Validation

TypeScript and production build pass. The initial screen was visually inspected in a browser. End-to-end cloud generation requires a working API key, credits and camera permission; no live cloud output has been verified without those credentials.

Official integration reference: https://github.com/DecartAI/tryon-examples
