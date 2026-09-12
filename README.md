# Adi Music
beta 2.1
fork of **[snae player](https://snaeplayer.com)**
> Just another modern web based **local music player**. Yes it is a local music player, it plays files directly from your device without the heavy bloat of installing a local app, but with the usual support for playlists, queue managements and [much more](#features) that your usual joe offered.
---

## Features

* 🎧 Local music playback
* 📂 Folder-based library support
* 📝 Synced lyrics support
* ❤️ Favorites and playlists
* 📜 Queue management
* 🎚️ Equalizer controls
* ⏩ Playback speed adjustment
* 🎨 Dynamic UI theming from album artwork
* 💾 Offline-friendly experience
* Material Design

---

## Browser Support

Adi Music works in all modern browsers.

On browsers that support the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API?utm_source=chatgpt.com), currently Chromium-based browsers, the app can read audio files directly from folders you choose.

In browsers without File System Access support, files are stored in IndexedDB instead. This provides compatibility at the cost of additional local storage usage.

---

## Privacy

Your music library stays entirely on your device.
Adi Music does not upload, collect, or transmit your audio files or personal library data.

Anonymous page analytics are powered by [GoatCounter](https://goatcounter.com/?utm_source=chatgpt.com), a lightweight privacy-focused analytics platform.

---

## Lyrics Sources

Lyrics are fetched from multiple providers for better coverage and synchronization quality:

1. LRCLIB
2. LRCMUX
3. AMLL DB (Written as 'adi lyrics' in the app)
4. Unison/BetterLyrics
5. Own Upload/Custom API

---

## APIs & Credits

* [Apple Music Animated Artwork API](https://github.com/m8tec/apple-music-animated-artworks)
* [BetterLyrics](https://github.com/better-lyrics) (Background And Lyrics <3)
* [lrcmux](https://api.lrcmux.dev/)
* [LRCLIB](https://lrclib.net/)
* [AMLL DB](https://github.com/amll-dev/amll-ttml-db)
* Hosted On Vercel
* Fork Of **Snae Player**


---

## Tech Stack

* SvelteKit / Svelte 5
* TypeScript
* Tailwind CSS 4

---

## Building Locally

Clone the repository and install dependencies:

```bash
pnpm install
pnpm run build
```

Start the development server:

```bash
pnpm run dev
```
