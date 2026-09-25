# Adi Music

beta 3

fork of **[Snae Player](https://snaeplayer.com)**

> Just another modern web-based **music player**. Yep, it’s still a local music player at heart. It plays your music directly from your device without the usual hassle and heavy bloat of installing a dedicated app, while also letting you discover and stream music online. You get playlists, queue management, synced lyrics, favorites, dynamic theming, and [much more](#features). Basically, your music, your files, your browser.

---

## Features

- 🎧 Local music playback
- 🌐 Online music discovery and streaming
- 📂 Folder-based library support
- 📝 Synced lyrics with word-by-word synchronization
- ❤️ Favorites and playlists
- 📜 Queue management
- ⏭️ Automatic queue playback
- ⚡ Next-track audio and lyrics preloading
- 🎚️ Equalizer controls
- ⏩ Playback speed adjustment
- 🎨 Dynamic UI theming from album artwork
- 🖼️ Remote artwork support
- 🎤 Artist profiles
- 💿 Album pages
- 🔎 Music search
- 🧭 Music discovery
- 💾 Offline-friendly experience
- 📱 Installable PWA
- 🎵 Media Session support
- 🎛️ Native media controls
- 📡 Progressive audio streaming
- 🗃️ Persistent online track metadata
- 🧠 Lyrics and request caching
- 🎨 Material Design

---

## Online Music

Adi Music can also discover and stream music directly from the web.

Online music is powered by **SpicyAMLL**, providing:

- 🔎 Music search
- 🎤 Artist information
- 💿 Album information
- 🎵 Track metadata
- 🎨 Album artwork
- 🌊 Audio streaming
- 📝 Synchronized lyrics
- 🎞️ Animated artwork support
- 📚 Related music and discovery resources

Online tracks are cached locally where possible, allowing their metadata, lyrics, artwork and playback information to persist between sessions.

---

## Discovery

The Discovery section provides a dedicated place to search for and discover online music.

It supports:

- Music search
- Artists
- Albums
- Songs
- Recommended music
- Album browsing
- Artist profiles
- Online playback

The Discovery section is automatically unavailable when the app is offline, while your local library remains fully usable.

---

## Lyrics

Adi Music supports synchronized lyrics from multiple sources, including word-level and line-level synchronization.

Lyrics sources include:

1. [LRCLIB](https://lrclib.net/)
2. [LRCMUX](https://api.lrcmux.dev/)
3. [AMLL DB](https://github.com/amll-dev/amll-ttml-db) (shown as `adi lyrics` in the app)
4. Unison / BetterLyrics
5. Own Upload / Custom API

Lyrics are cached locally when possible, and lyrics for upcoming tracks can be preloaded alongside their audio.

---

## Audio Playback

Adi Music uses progressive browser-native audio streaming for online music.

The player is designed to avoid unnecessarily downloading an entire song before playback starts.

Online playback includes:

- ▶️ Automatic playback
- ⏭️ Queue autoplay
- ⚡ Upcoming-track preloading
- 📝 Upcoming-lyrics preloading
- 🔄 Persistent playback state
- 🎚️ Playback speed
- 🎛️ Equalizer
- 📱 Media Session integration
- ⏩ Seeking
- 🎨 Artwork-based theming

The original SpicyAMLL stream URL and its query parameters are preserved.

---

## Dynamic Theming

Adi Music can automatically generate its UI theme from the artwork of the currently playing track.

This works with both:

- 💾 Local music
- 🌐 Online music

Theme changes smoothly transition between album artwork colors instead of instantly switching the entire interface.

---

## Privacy

Your local music library stays entirely on your device.

Adi Music does not upload, collect, or transmit your audio files or personal library data.

Anonymous page analytics are powered by [GoatCounter](https://goatcounter.com/), a lightweight privacy-focused analytics platform.

Online music requests are made to the external services required to provide online search, metadata, artwork, streaming and lyrics.

---

## APIs & Credits

### SpicyAMLL

Online music functionality is powered by **[SpicyAMLL](https://api.spicyamll.online/)**.

Used for:

- Search
- Artists
- Albums
- Songs
- Track metadata
- Album artwork
- Audio streaming
- Lyrics
- Animated artwork
- Music discovery
- Related resources

### Lyrics & Music Services

- [Apple Music Animated Artwork API](https://github.com/m8tec/apple-music-animated-artworks)
- [BetterLyrics](https://github.com/better-lyrics)
- [LRCMUX](https://api.lrcmux.dev/)
- [LRCLIB](https://lrclib.net/)
- [AMLL DB](https://github.com/amll-dev/amll-ttml-db)

### Other

- [GoatCounter](https://goatcounter.com/) for anonymous analytics
- Hosted on Vercel
- Fork of **[Snae Player](https://snaeplayer.com)**

---

## Tech Stack

- SvelteKit
- Svelte 5
- TypeScript
- Tailwind CSS 4
- IndexedDB
- File System Access API
- Material Design
- Vercel

---

## Browser Support

Adi Music works in modern browsers.

On browsers that support the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), currently Chromium-based browsers, Adi Music can read audio files directly from folders you choose.

In browsers without File System Access support, files are stored in IndexedDB instead. This provides wider browser compatibility at the cost of additional local storage usage.

Online music features require an internet connection. Your local library remains available when offline.

---

## Building Locally

Clone the repository and install dependencies:

```bash
pnpm install
pnpm run build
````

Start the development server:

```bash
pnpm run dev
```

---

## Credits

Adi Music is a fork of **[Snae Player](https://snaeplayer.com)**.

Built and maintained by **[Aditya](https://github.com/adidotzip)**.
