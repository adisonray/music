import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase } from '$lib/db/database.ts'
import { clearDatabaseStores } from '$lib/helpers/test-helpers.ts'
import type { TrackData } from '$lib/library/get/value-queries.ts'
import { UNKNOWN_ITEM } from '$lib/library/types.ts'
import { CACHE_VERSION, clearTrackProvider, LyricsCache, setTrackProvider } from '../LyricsCache.ts'
import { LyricsParser } from '../LyricsParser.ts'
import { LyricsService } from '../LyricsService.ts'

const createTrack = (overrides: Partial<TrackData> = {}): TrackData => ({
	id: 1,
	type: 'track',
	favorite: false,
	uuid: 'track-uuid',
	name: 'Drowning (Avicii Remix)',
	album: 'A State Of Trance Classics 14',
	artists: ['Armin van Buuren', 'Laura V'],
	year: UNKNOWN_ITEM,
	duration: 473,
	genre: [],
	trackNo: 0,
	trackOf: 0,
	discNo: 0,
	discOf: 0,
	fileName: 'drowning.mp3',
	directory: -1,
	scannedAt: 1,
	file: new File(['audio'], 'drowning.mp3', { type: 'audio/mpeg' }),
	...overrides,
})

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init,
	})

describe('AM Lyrics System', () => {
	beforeEach(async () => {
		await clearDatabaseStores()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('should parse LRC lyrics into TTML correctly', () => {
		const rawLyrics = '[00:01.00]Hello\n[00:02.00]World'
		const ttml = LyricsParser.toTTML(rawLyrics, 10_000)

		expect(ttml).toBeDefined()
		expect(ttml).toContain('<tt')
		expect(ttml).toContain('Hello')
		expect(ttml).toContain('World')
		expect(ttml).toContain('begin="00:01.000"')
	})

	it('prefers Adi Lyrics QRC when available', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					results: [{ id: '123' }],
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					lyric: {
						format: 'qrc',
						rawContent:
							'[1000,1000]First(1000,500) line(1500,500)\n[2000,1000]Second(2000,500) line(2500,500)',
					},
				}),
			)

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found' || !result.ttml) {
			throw new Error('Expected found with TTML lyrics')
		}
		expect(result.source).toBe('adi')
		expect(result.syncType).toBe('karaoke')
		expect(result.ttml).toContain('First')
	})

	it('falls back to LRCLIB after Adi and LRCMux fail', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					results: [],
				}),
			) // Adi search returns no match
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // LRCMux returns 404
			.mockResolvedValueOnce(
				jsonResponse({
					syncedLyrics: '[00:01.00]LRCLib Line 1\n[00:02.00]LRCLib Line 2',
				}),
			) // LRCLib exact fetch

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found' || !result.ttml) {
			throw new Error('Expected found with TTML lyrics')
		}
		expect(result.source).toBe('lrclib')
		expect(result.ttml).toContain('LRCLib Line 1')
	})

	it('uses LRCMux before lower-priority providers', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ ok: true, results: [] }))
			.mockResolvedValueOnce(
				jsonResponse({
					lyrics: [{ time: 1000, text: 'LRCMux line' }],
				}),
			)

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		expect(result.source).toBe('lrcmux')
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('fetches from AM Lyrics when higher priority providers return nothing', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ ok: true, results: [] })) // Adi
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // LRCMux
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // LRCLib exact
			.mockResolvedValueOnce(jsonResponse([])) // LRCLib search
			.mockResolvedValueOnce(
				jsonResponse({
					results: [{ lyricsUrl: 'https://lyrics-api.binimum.org/ttml' }],
				}),
			) // AM Lyrics search
			.mockResolvedValueOnce(
				new Response(
					'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:01.000" end="00:05.000">AM Lyrics Line</p></div></body></tt>',
					{ status: 200 },
				),
			) // AM Lyrics TTML fetch

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		expect(result.source).toBe('am-lyrics')
		if (result.status === 'found') {
			expect(result.ttml).toContain('AM Lyrics Line')
		}
	})

	it('only includes Adi Chinese translations for Chinese locales', () => {
		const rawTtml =
			'<tt><body><p><span>Original</span><span ttm:role="x-translation" xml:lang="zh-CN">中文</span></p></body></tt>'

		expect(LyricsParser.toTTML(rawTtml, 10_000, 'en')).not.toContain('中文')
		expect(LyricsParser.toTTML(rawTtml, 10_000, 'zh-CN')).toContain('中文')
	})

	it('falls back to plain lyrics when no synchronized lyrics are found', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					results: [{ id: '123' }],
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					lyric: {
						lyrics: 'Plain lyric line 1\nPlain lyric line 2',
					},
				}),
			) // Adi returns plain lyrics
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // AM Lyrics BiniCache returns 404
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // AM Lyrics LRCMux returns 404
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // Unison fetch returns 404
			.mockResolvedValueOnce(new Response(null, { status: 404 })) // LRCLib exact returns 404
			.mockResolvedValueOnce(jsonResponse([])) // LRCLib search returns empty

		vi.stubGlobal('fetch', fetchMock)

		const result = await LyricsService.fetchLyrics(createTrack(), new AbortController().signal)

		expect(result.status).toBe('found')
		if (result.status !== 'found' || !result.ttml) {
			throw new Error('Expected found with TTML lyrics')
		}
		expect(result.source).toBe('adi')
		expect(result.syncType).toBe('plain')
		expect(result.ttml).toContain('Plain lyric line 1')
	})

	describe('LyricsCache expiration logic', () => {
		beforeEach(async () => {
			await clearDatabaseStores()
		})

		it('respects provider selection and keys cache by song + provider', async () => {
			const track = createTrack({ id: 100 })

			// 1. Initial fetch with default provider (returns Adi)
			const fetchMockAdi = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(jsonResponse({ ok: true, results: [{ id: 'adi-1' }] }))
				.mockResolvedValueOnce(
					jsonResponse({
						ok: true,
						lyric: {
							format: 'ttml',
							rawContent:
								'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00.000" end="00:04.000">Adi Content</p></div></body></tt>',
						},
					}),
				)
			vi.stubGlobal('fetch', fetchMockAdi)

			const autoResult = await LyricsService.fetchLyrics(track)
			expect(autoResult.status).toBe('found')
			expect(autoResult.source).toBe('adi')
			expect(autoResult.ttml).toContain('Adi Content')

			// 2. Select LRCLIB provider
			setTrackProvider(track.id, 'lrclib')

			const fetchMockLrclib = vi.fn<typeof fetch>().mockResolvedValueOnce(
				jsonResponse({
					syncedLyrics: '[00:01.00]LRCLIB Content',
				}),
			)
			vi.stubGlobal('fetch', fetchMockLrclib)

			// Fetching with LRCLIB preference must NOT return cached Adi lyrics
			const lrclibResult = await LyricsService.fetchLyrics(track)
			expect(lrclibResult.status).toBe('found')
			expect(lrclibResult.source).toBe('lrclib')
			expect(lrclibResult.ttml).toContain('LRCLIB Content')

			// Verify cache keying: '100:lrclib' has LRCLIB content, '100:auto' has Adi content
			const cachedLrclib = await LyricsCache.get(100, 'lrclib')
			expect(cachedLrclib?.ttml).toContain('LRCLIB Content')

			const cachedAuto = await LyricsCache.get(100, 'auto')
			expect(cachedAuto?.ttml).toContain('Adi Content')

			clearTrackProvider(track.id)
		})

		it('falls back when selected provider returns no lyrics', async () => {
			const track = createTrack({ id: 200 })
			setTrackProvider(track.id, 'lrclib')

			// LRCLIB returns 404, fallback to Adi returns Adi content
			const fetchMock = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(new Response(null, { status: 404 })) // LRCLIB exact
				.mockResolvedValueOnce(jsonResponse([])) // LRCLIB search
				.mockResolvedValueOnce(
					jsonResponse({ ok: true, results: [{ id: 'adi-fallback' }] }),
				) // Adi search
				.mockResolvedValueOnce(
					jsonResponse({
						ok: true,
						lyric: {
							format: 'ttml',
							rawContent:
								'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00.000" end="00:04.000">Adi Fallback Content</p></div></body></tt>',
						},
					}),
				) // Adi fetch
			vi.stubGlobal('fetch', fetchMock)

			const result = await LyricsService.fetchLyrics(track)
			expect(result.status).toBe('found')
			expect(result.source).toBe('adi')
			expect(result.ttml).toContain('Adi Fallback Content')

			clearTrackProvider(track.id)
		})

		it('exempts uploaded lyrics from expiration and expires regular lyrics correctly', async () => {
			const db = await getDatabase()

			// 1. Set an uploaded lyric that is 10 days old
			await db.add('lyrics', {
				trackId: 10,
				data: {
					status: 'found',
					source: 'uploaded',
					ttml: '<tt>Uploaded lyric text</tt>',
					syncType: 'line',
				},
				version: CACHE_VERSION,
				cachedAt: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days old
			} as any)

			// 2. Set an adi lyric that is 10 days old
			await db.add('lyrics', {
				trackId: 20,
				data: {
					status: 'found',
					source: 'adi',
					ttml: '<tt>Adi lyric text</tt>',
					syncType: 'line',
				},
				version: CACHE_VERSION,
				cachedAt: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days old
			} as any)

			// 3. Retrieve uploaded lyric
			const uploadedResult = await LyricsCache.get(10)
			expect(uploadedResult).toBeDefined()
			expect(uploadedResult?.source).toBe('uploaded')
			expect(uploadedResult?.ttml).toContain('Uploaded lyric text')

			// 4. Retrieve regular lyric (should be expired)
			const adiResult = await LyricsCache.get(20)
			expect(adiResult).toBeUndefined()
		})
	})
})
