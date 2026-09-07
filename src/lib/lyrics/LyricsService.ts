import type { TrackData } from '$lib/library/get/value-queries.ts'
import { getLocale } from '$paraglide/runtime.js'
import { LyricsProvider } from './LyricsProvider.ts'
import { LyricsParser } from './LyricsParser.ts'
import { LyricsCache, type CachedLyricsResult } from './LyricsCache.ts'

export type ServiceLyricsResult = CachedLyricsResult

export function getSourceDisplayName(source?: string): string {
    if (!source) return 'Unknown'
    const s = source.toLowerCase()
    if (s === 'adi') return 'Adi Lyrics'
    if (s === 'am-lyrics' || s === 'am' || s === 'binimum' || s === 'bini') return 'AM Lyrics'
    if (s === 'lrcmux') return 'LRC Mux'
    if (s === 'lrclib') return 'LRCLIB'
    if (s === 'plain') return 'Lyrics+'
    if (s === 'lyrics-plus' || s === 'lyricsplus') return 'Lyrics+'
    if (s === 'musixmatch') return 'Musixmatch'
    if (s === 'apple' || s === 'apple-music') return 'Apple Music'
    if (s === 'unison') return 'Unison'
    return source.charAt(0).toUpperCase() + source.slice(1)
}

export class LyricsService {
    static async fetchLyrics(track: TrackData, signal?: AbortSignal): Promise<ServiceLyricsResult> {
        const language = getLocale()
        const cached = await LyricsCache.get(track.id, language)
        if (cached) {
            return cached
        }

        try {
            const durationMs = Math.round(track.duration) * 1000
            const response = await LyricsProvider.getLyrics(track, signal)
            if (response) {
                if (response.rawLyrics === 'Instrumental') {
                    const result: ServiceLyricsResult = { status: 'instrumental', language }
                    await LyricsCache.set(track.id, result)
                    return result
                }

                const ttml = LyricsParser.toTTML(response.rawLyrics, durationMs, language)
                const result: ServiceLyricsResult = {
                    status: 'found',
                    source: response.source,
                    ttml,
                    syncType: response.isPlainOnly ? 'plain' : ttml.includes('<span') ? 'karaoke' : 'line',
                    language,
                }
                await LyricsCache.set(track.id, result)
                return result
            }

            const notFoundResult: ServiceLyricsResult = { status: 'not-found' }
            await LyricsCache.set(track.id, { ...notFoundResult, language })
            return notFoundResult

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return { status: 'error' }
        }
    }
}
