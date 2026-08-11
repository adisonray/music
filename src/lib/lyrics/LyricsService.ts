import type { TrackData } from '$lib/library/get/value-queries.ts'
import { LyricsProvider } from './LyricsProvider.ts'
import { LyricsParser } from './LyricsParser.ts'
import { LyricsCache, type CachedLyricsResult } from './LyricsCache.ts'

export type ServiceLyricsResult = CachedLyricsResult

export function getSourceDisplayName(source?: string): string {
    if (!source) return 'Unknown'
    const s = source.toLowerCase()
    if (s === 'adi') return 'Adi Lyrics'
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
        const cached = await LyricsCache.get(track.id)
        if (cached) {
            return cached
        }

        try {
            const durationMs = Math.round(track.duration) * 1000
            let plainLyrics: { content: string; source: string } | null = null

            // A. Query Adi Lyrics (Primary)
            try {
                const adiResponse = await LyricsProvider.fetchFromAdi(track, signal)
                if (adiResponse) {
                    if (!adiResponse.isPlainOnly) {
                        const lyrics = LyricsParser.parse(adiResponse.rawLyrics, durationMs)
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: 'adi',
                            lyrics,
                            syncType: 'karaoke'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else {
                        plainLyrics = { content: adiResponse.rawLyrics, source: 'adi' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // B. Query LRCMux (Secondary)
            try {
                const lrcmuxResponse = await LyricsProvider.fetchFromLrcmux(track, signal)
                if (lrcmuxResponse) {
                    if (!lrcmuxResponse.isPlainOnly) {
                        const lyrics = LyricsParser.parse(lrcmuxResponse.rawLyrics, durationMs)
                        const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: 'lrcmux',
                            lyrics,
                            syncType: hasWordTiming ? 'karaoke' : 'line'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else if (!plainLyrics) {
                        plainLyrics = { content: lrcmuxResponse.rawLyrics, source: 'lrcmux' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // C. Query Unison (Tertiary)
            try {
                const unisonResponse = await LyricsProvider.fetchFromUnison(track, signal)
                if (unisonResponse) {
                    if (!unisonResponse.isPlainOnly) {
                        const lyrics = LyricsParser.parse(unisonResponse.rawLyrics, durationMs)
                        const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: 'unison',
                            lyrics,
                            syncType: hasWordTiming ? 'karaoke' : 'line'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else if (!plainLyrics) {
                        plainLyrics = { content: unisonResponse.rawLyrics, source: 'unison' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // D. Query LRCLib (Quaternary / Last Fallback)
            try {
                const lrclibResponse = await LyricsProvider.fetchFromLrclib(track, signal)
                if (lrclibResponse) {
                    if (lrclibResponse.rawLyrics === 'Instrumental') {
                        const result: ServiceLyricsResult = { status: 'instrumental' }
                        await LyricsCache.set(track.id, result)
                        return result
                    }

                    if (!lrclibResponse.isPlainOnly) {
                        const lyrics = LyricsParser.parse(lrclibResponse.rawLyrics, durationMs)
                        const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: 'lrclib',
                            lyrics,
                            syncType: hasWordTiming ? 'karaoke' : 'line'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else if (!plainLyrics) {
                        plainLyrics = { content: lrclibResponse.rawLyrics, source: 'lrclib' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // E. Fall back to Plain lyrics if found from any provider
            if (plainLyrics) {
                const lyrics = LyricsParser.parse(plainLyrics.content, durationMs)
                const result: ServiceLyricsResult = {
                    status: 'found',
                    source: plainLyrics.source,
                    lyrics,
                    syncType: 'plain'
                }
                await LyricsCache.set(track.id, result)
                return result
            }

            const notFoundResult: ServiceLyricsResult = { status: 'not-found' }
            await LyricsCache.set(track.id, notFoundResult)
            return notFoundResult

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return { status: 'error' }
        }
    }
}
