import { formatArtists } from '$lib/helpers/utils/text.ts'
import type { TrackData } from '$lib/library/get/value-queries.ts'
import { UNKNOWN_ITEM } from '$lib/library/types.ts'

export interface ProviderResponse {
    rawLyrics: string
    source: 'adi' | 'lrcmux' | 'am-lyrics' | 'unison' | 'lrclib' | string
    isPlainOnly?: boolean
}

export class LyricsProvider {
    static async fetchByProviderId(
        providerId: string,
        track: TrackData,
        signal?: AbortSignal
    ): Promise<ProviderResponse | null> {
        if (providerId === 'adi') return LyricsProvider.fetchFromAdi(track, signal)
        if (providerId === 'lrcmux') return LyricsProvider.fetchFromLrcmux(track, signal)
        if (providerId === 'lrclib') return LyricsProvider.fetchFromLrclib(track, signal)
        if (providerId === 'am-lyrics' || providerId === 'am') return LyricsProvider.fetchFromAmLyrics(track, signal)
        if (providerId === 'unison') return LyricsProvider.fetchFromUnison(track, signal)

        if (typeof window !== 'undefined') {
            try {
                const rawCustoms = localStorage.getItem('snaeplayer-custom-lyrics-sources')
                if (rawCustoms) {
                    const customs: Array<{ id: string; name: string; url: string }> = JSON.parse(rawCustoms)
                    const targetCustom = customs.find((cs) => cs.id === providerId)
                    if (targetCustom) {
                        return LyricsProvider.fetchFromCustomSource(track, targetCustom, signal)
                    }
                }
            } catch {}
        }
        return null
    }

    static async getLyrics(
        track: TrackData,
        signal?: AbortSignal,
        preferredProvider?: string
    ): Promise<ProviderResponse | null> {
        if (preferredProvider && preferredProvider !== 'auto' && preferredProvider !== 'uploaded') {
            const preferredRes = await LyricsProvider.fetchByProviderId(preferredProvider, track, signal)
            if (preferredRes) return preferredRes
        }

        const standardOrder = ['adi', 'lrcmux', 'lrclib', 'am-lyrics', 'unison']
        for (const pid of standardOrder) {
            if (preferredProvider && pid === preferredProvider) continue
            const res = await LyricsProvider.fetchByProviderId(pid, track, signal)
            if (res) return res
        }

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

            const lyricUrl = `https://lyrics.imreallyadi.space/api/lyrics/${bestMatch.id}?format=ttml`
            const lyricResponse = await fetch(lyricUrl, { signal })
            if (!lyricResponse.ok) return null

            const lyricData = await lyricResponse.json()
            if (!lyricData.ok || !lyricData.lyric) return null

            if (
                (lyricData.lyric.format === 'ttml' || lyricData.lyric.format === 'qrc') &&
                lyricData.lyric.rawContent
            ) {
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

    static async fetchFromLrcmux(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
        try {
            const url = new URL('https://api.lrcmux.dev/compat/kpoe/v2/lyrics/get')
            url.searchParams.set('artist', formatArtists(track.artists))
            url.searchParams.set('title', track.name)

            const response = await fetch(url, { signal })
            if (!response.ok) return null

            const data = await response.json()
            if (!data || !Array.isArray(data.lyrics) || data.lyrics.length === 0) {
                return null
            }

            const formattedLines: string[] = []

            for (const line of data.lyrics) {
                if (typeof line.time !== 'number') continue

                const text = line.text || ''

                if (Array.isArray(line.syllabus) && line.syllabus.length > 0) {
                    const duration = typeof line.duration === 'number' ? line.duration : 0

                    const syllabusParts = line.syllabus
                        .map((word: any) => {
                            const wordText = word.text || ''
                            const wordTime = typeof word.time === 'number' ? word.time : line.time
                            const wordDur = typeof word.duration === 'number' ? word.duration : 0

                            return `${wordText}(${wordTime},${wordDur})`
                        })
                        .join('')

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
            const exactUrl = new URL('https://lrclib.net/api/get')
            exactUrl.searchParams.set('track_name', track.name)
            exactUrl.searchParams.set('artist_name', formatArtists(track.artists))
            if (track.album && track.album !== UNKNOWN_ITEM) {
                exactUrl.searchParams.set('album_name', track.album)
            }
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

            const searchUrl = new URL('https://lrclib.net/api/search')
            searchUrl.searchParams.set('track_name', track.name)
            searchUrl.searchParams.set('artist_name', formatArtists(track.artists))
            searchUrl.searchParams.set('duration', String(durationSeconds))

            const searchResponse = await fetch(searchUrl, { signal })
            if (!searchResponse.ok) return null

            const searchData = await searchResponse.json()
            if (!Array.isArray(searchData) || searchData.length === 0) {
                return null
            }

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

    static async fetchFromAmLyrics(track: TrackData, signal?: AbortSignal): Promise<ProviderResponse | null> {
        try {
            const title = track.name
            const artist = formatArtists(track.artists)

            const biniUrl = new URL('https://lyrics-api.binimum.org/')
            biniUrl.searchParams.set('track', title)
            biniUrl.searchParams.set('artist', artist)

            if (track.album && track.album !== UNKNOWN_ITEM) {
                biniUrl.searchParams.set('album', track.album)
            }

            if (track.duration > 0) {
                biniUrl.searchParams.set(
                    'duration',
                    String(Math.round(track.duration))
                )
            }

            const biniRes = await fetch(biniUrl, { signal })
            if (!biniRes.ok) return null

            const biniData = await biniRes.json()

            if (
                !biniData ||
                !Array.isArray(biniData.results) ||
                biniData.results.length === 0
            ) {
                return null
            }

            const best = biniData.results[0]
            if (!best?.lyricsUrl) return null

            const ttmlRes = await fetch(best.lyricsUrl, { signal })
            if (!ttmlRes.ok) return null

            const rawLyrics = await ttmlRes.text()
            if (rawLyrics.trim().length === 0) return null

            return {
                rawLyrics,
                source: 'am-lyrics',
                isPlainOnly: false
            }
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

            const matchTitle = track.name.trim().toLowerCase()
            const matchArtist = formatArtists(track.artists).trim().toLowerCase()
            const responseTitle = (data.song || '').trim().toLowerCase()
            const responseArtist = (data.artist || '').trim().toLowerCase()

            if (matchTitle !== responseTitle || matchArtist !== responseArtist) {
                return null
            }

            const rawLyrics = data.lyrics
            const isPlainOnly =
                data.syncType === 'plain' ||
                (!rawLyrics.includes('[') && !rawLyrics.includes('<tt'))

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

    static async fetchFromCustomSource(
        track: TrackData,
        customSource: { url: string; name: string },
        signal?: AbortSignal
    ): Promise<ProviderResponse | null> {
        try {
            let urlStr = customSource.url

            urlStr = urlStr.replace('{title}', encodeURIComponent(track.name))
            urlStr = urlStr.replace('{artist}', encodeURIComponent(formatArtists(track.artists)))
            urlStr = urlStr.replace('{album}', encodeURIComponent(track.album && track.album !== UNKNOWN_ITEM ? track.album : ''))
            urlStr = urlStr.replace(
                '{duration}',
                encodeURIComponent(String(Math.round(track.duration)))
            )

            const url = new URL(urlStr)
            const response = await fetch(url, { signal })

            if (!response.ok) return null

            const contentType = response.headers.get('content-type') || ''

            if (contentType.includes('application/json')) {
                const data = await response.json()

                const rawLyrics =
                    data.syncedLyrics ||
                    data.plainLyrics ||
                    data.lyrics ||
                    data.rawLyrics ||
                    data.rawContent ||
                    data.content

                if (typeof rawLyrics === 'string') {
                    const isPlainOnly =
                        !rawLyrics.includes('[') &&
                        !rawLyrics.includes('<tt')

                    return {
                        rawLyrics,
                        source: customSource.name,
                        isPlainOnly
                    }
                }
            } else {
                const rawLyrics = await response.text()

                if (rawLyrics.trim().length > 0) {
                    const isPlainOnly =
                        !rawLyrics.includes('[') &&
                        !rawLyrics.includes('<tt')

                    return {
                        rawLyrics,
                        source: customSource.name,
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
}

