import { formatArtists } from '$lib/helpers/utils/text.ts'
import type { TrackData } from '$lib/library/get/value-queries.ts'

export interface ProviderResponse {
    rawLyrics: string
    source: 'adi' | 'lrcmux' | 'unison' | 'lrclib'
    isPlainOnly?: boolean
}

export class LyricsProvider {
    static async getLyrics(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
        const primary = await LyricsProvider.fetchFromAdi(track, signal)
        if (primary) return primary

        const secondary = await LyricsProvider.fetchFromLrcmux(track, signal)
        if (secondary) return secondary

        const tertiary = await LyricsProvider.fetchFromUnison(track, signal)
        if (tertiary) return tertiary

        const quaternary = await LyricsProvider.fetchFromLrclib(track, signal)
        if (quaternary) return quaternary

        return null
    }


    static async fetchFromAdi(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
        try {
            const query = `${track.name} ${formatArtists(track.artists)}`
            const searchUrl = new URL('https://lyrics.imreallyadi.space/api/search')
            searchUrl.searchParams.set('q', query)

            const searchResponse = await fetch(searchUrl, { signal })
            if (!searchResponse.ok) return null

            const searchData = await searchResponse.json()
            if (!searchData.ok || !Array.isArray(searchData.results) || searchData.results.length === 0) {
                return null
            }

            const bestMatch = searchData.results[0]
            if (!bestMatch || !bestMatch.id) return null

            // Request TTML explicitly using format=ttml
            const lyricUrl = `https://lyrics.imreallyadi.space/api/lyrics/${bestMatch.id}?format=ttml`
            const lyricResponse = await fetch(lyricUrl, { signal })
            if (!lyricResponse.ok) return null

            const lyricData = await lyricResponse.json()
            if (!lyricData.ok || !lyricData.lyric) return null

            if ((lyricData.lyric.format === 'ttml' || lyricData.lyric.format === 'qrc') && lyricData.lyric.rawContent) {
                return {
                    rawLyrics: lyricData.lyric.rawContent,
                    source: 'adi',
                    isPlainOnly: false
                }
            }

            if (lyricData.lyric.lyrics) {
                return {
                    rawLyrics: lyricData.lyric.lyrics,
                    source: 'adi',
                    isPlainOnly: true
                }
            }

            return null
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return null
        }
    }

    static async fetchFromCustomSource(
        track: TrackData,
        customSource: { url: string; name: string },
        signal?: AbortSignal
    ): Promise<ProviderResponse | null> {
        try {
            let urlStr = customSource.url
            urlStr = urlStr.replace('{title}', encodeURIComponent(track.name))
            urlStr = urlStr.replace('{artist}', encodeURIComponent(formatArtists(track.artists)))
            urlStr = urlStr.replace('{album}', encodeURIComponent(track.album))
            urlStr = urlStr.replace('{duration}', encodeURIComponent(String(Math.round(track.duration))))

            const url = new URL(urlStr)
            const response = await fetch(url, { signal })
            if (!response.ok) return null

            const contentType = response.headers.get('content-type') || ''
            if (contentType.includes('application/json')) {
                const data = await response.json()
                const rawLyrics = data.syncedLyrics || data.plainLyrics || data.lyrics || data.rawLyrics || data.rawContent || data.content
                if (typeof rawLyrics === 'string') {
                    const isPlainOnly = !rawLyrics.includes('[') && !rawLyrics.includes('<tt')
                    return {
                        rawLyrics,
                        source: 'custom' as any,
                        isPlainOnly
                    }
                }
            } else {
                const rawLyrics = await response.text()
                if (rawLyrics.trim().length > 0) {
                    const isPlainOnly = !rawLyrics.includes('[') && !rawLyrics.includes('<tt')
                    return {
                        rawLyrics,
                        source: 'custom' as any,
                        isPlainOnly
                    }
                }
            }
            return null
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return null
        }
    }

    static async fetchFromUnison(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
        try {
            const url = new URL('https://unison.boidu.dev/lyrics')
            url.searchParams.set('song', track.name)
            url.searchParams.set('artist', formatArtists(track.artists))

            const response = await fetch(url, { signal })
            if (!response.ok) return null

            const resData = await response.json()
            if (!resData || !resData.success || !resData.data) return null

            const data = resData.data
            if (!data.lyrics) return null

            // Validate that the title and artist 100% match (case-insensitive)
            const matchTitle = track.name.trim().toLowerCase()
            const matchArtist = formatArtists(track.artists).trim().toLowerCase()
            const responseTitle = (data.song || '').trim().toLowerCase()
            const responseArtist = (data.artist || '').trim().toLowerCase()

            if (matchTitle !== responseTitle || matchArtist !== responseArtist) {
                return null
            }

            const rawLyrics = data.lyrics
            const isPlainOnly = data.syncType === 'plain' || (!rawLyrics.includes('[') && !rawLyrics.includes('<tt'))

            return {
                rawLyrics,
                source: 'unison',
                isPlainOnly
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return null
        }
    }

    static async fetchFromLrcmux(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
        try {
            const url = new URL('https://api.lrcmux.dev/compat/kpoe/v2/lyrics/get')
            url.searchParams.set('artist', formatArtists(track.artists))
            url.searchParams.set('title', track.name)

            const response = await fetch(url, { signal })
            if (!response.ok) return null

            const data = await response.json()
            if (!data || !Array.isArray(data.lyrics) || data.lyrics.length === 0) return null

            const formattedLines: string[] = []
            for (const line of data.lyrics) {
                if (typeof line.time !== 'number') continue
                const text = line.text || ''

                if (Array.isArray(line.syllabus) && line.syllabus.length > 0) {
                    const duration = typeof line.duration === 'number' ? line.duration : 0
                    const syllabusParts = line.syllabus.map((word: any) => {
                        const wordText = word.text || ''
                        const wordTime = typeof word.time === 'number' ? word.time : line.time
                        const wordDur = typeof word.duration === 'number' ? word.duration : 0
                        return `${wordText}(${wordTime},${wordDur})`
                    }).join('')
                    formattedLines.push(`[${line.time},${duration}]${syllabusParts}`)
                } else {
                    const timeMs = line.time
                    const min = String(Math.floor(timeMs / 60000)).padStart(2, '0')
                    const sec = String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0')
                    const ms = String(Math.floor((timeMs % 1000) / 10)).padStart(2, '0')
                    const timestamp = `[${min}:${sec}.${ms}]`
                    formattedLines.push(`${timestamp}${text}`)
                }
            }

            const rawLyrics = formattedLines.join('\n')
            if (rawLyrics.trim().length === 0) return null

            return {
                rawLyrics,
                source: 'lrcmux',
                isPlainOnly: false
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return null
        }
    }


    static async fetchFromLrclib(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
        const durationSeconds = Math.round(track.duration)
        try {
            // Exact lookup
            const exactUrl = new URL('https://lrclib.net/api/get')
            exactUrl.searchParams.set('track_name', track.name)
            exactUrl.searchParams.set('artist_name', formatArtists(track.artists))
            exactUrl.searchParams.set('album_name', track.album)
            exactUrl.searchParams.set('duration', String(durationSeconds))

            const exactResponse = await fetch(exactUrl, { signal })
            if (exactResponse.ok) {
                const data = await exactResponse.json()
                if (data.instrumental) {
                    return {
                        rawLyrics: 'Instrumental',
                        source: 'lrclib',
                        isPlainOnly: false
                    }
                }
                if (data.syncedLyrics) {
                    return {
                        rawLyrics: data.syncedLyrics,
                        source: 'lrclib',
                        isPlainOnly: false
                    }
                }
                if (data.plainLyrics) {
                    return {
                        rawLyrics: data.plainLyrics,
                        source: 'lrclib',
                        isPlainOnly: true
                    }
                }
            }

            // Fallback search
            const searchUrl = new URL('https://lrclib.net/api/search')
            searchUrl.searchParams.set('track_name', track.name)
            searchUrl.searchParams.set('artist_name', formatArtists(track.artists))
            searchUrl.searchParams.set('duration', String(durationSeconds))

            const searchResponse = await fetch(searchUrl, { signal })
            if (!searchResponse.ok) return null

            const searchData = await searchResponse.json()
            if (!Array.isArray(searchData) || searchData.length === 0) return null

            const bestMatch = searchData.find((item: any) => {
                return item.duration && Math.abs(item.duration - durationSeconds) <= 4
            })

            if (!bestMatch) return null

            if (bestMatch.syncedLyrics) {
                return {
                    rawLyrics: bestMatch.syncedLyrics,
                    source: 'lrclib',
                    isPlainOnly: false
                }
            }

            if (bestMatch.plainLyrics) {
                return {
                    rawLyrics: bestMatch.plainLyrics,
                    source: 'lrclib',
                    isPlainOnly: true
                }
            }

            return null
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return null
        }
    }
}
