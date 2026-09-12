import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase } from '$lib/db/database.ts'
import { clearDatabaseStores } from '$lib/helpers/test-helpers.ts'
import { dbImportTrack } from '$lib/library/scan-actions/scanner/import-track.ts'
import type { UnknownTrack } from '$lib/library/types.ts'
import { autoApplyTrackMetadata, cleanQueryString, fetchAutoMetadata } from '$lib/services/auto-metadata.ts'

const dbImportTestTrack = (overrides: Partial<UnknownTrack> = {}): Promise<number> => {
	const trackData: UnknownTrack = {
		uuid: crypto.randomUUID(),
		name: 'Shape of You',
		album: 'Divide',
		artists: ['Ed Sheeran'],
		year: '2017',
		duration: 233,
		trackNo: 1,
		trackOf: 12,
		discNo: 1,
		discOf: 1,
		genre: ['Pop'],
		file: new File(['test'], '01 - Shape of You.mp3', { type: 'audio/mp3' }),
		scannedAt: Date.now(),
		fileName: '01 - Shape of You.mp3',
		directory: 1,
		...overrides,
	}

	return dbImportTrack(trackData, undefined)
}

describe('auto-metadata service', () => {
	beforeEach(async () => {
		await clearDatabaseStores()
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('cleanQueryString', () => {
		it('should strip leading track numbers, file extension, and tags', () => {
			expect(cleanQueryString('01 - Song Title [320kbps].mp3')).toBe('Song Title')
			expect(cleanQueryString('02. Another Song (Official Video).flac')).toBe('Another Song')
			expect(cleanQueryString('track_name_with_underscores.m4a')).toBe('track name with underscores')
		})
	})

	describe('fetchAutoMetadata', () => {
		it('should fetch from iTunes API and map results correctly', async () => {
			const fakeResponse = {
				resultCount: 1,
				results: [
					{
						trackName: 'Shape of You',
						artistName: 'Ed Sheeran',
						collectionName: '÷ (Deluxe)',
						primaryGenreName: 'Pop',
						releaseDate: '2017-01-06T08:00:00Z',
						artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
						trackNumber: 4,
						trackCount: 16,
						discNumber: 1,
						discCount: 1,
					},
				],
			}

			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = String(input)
				if (url.includes('itunes.apple.com')) {
					return new Response(JSON.stringify(fakeResponse), { status: 200 })
				}
				if (url.includes('jiosaavn')) {
					return new Response(JSON.stringify({ success: true, data: { results: [] } }), { status: 200 })
				}
				return new Response('', { status: 404 })
			})

			const results = await fetchAutoMetadata('Shape of You', 'Ed Sheeran')

			expect(results).toHaveLength(1)
			expect(results[0]).toMatchObject({
				title: 'Shape of You',
				artist: 'Ed Sheeran',
				album: '÷ (Deluxe)',
				genre: 'Pop',
				year: '2017',
				artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/1000x1000bb.jpg',
				source: 'itunes',
			})
			expect(fetchSpy).toHaveBeenCalled()
		})

		it('should fallback to title-only query if combined search returns no results', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = String(input)
				if (url.includes('Mismatched')) {
					// Return empty if invalid/mismatched artist hint was combined
					return new Response(JSON.stringify({ resultCount: 0, results: [] }), { status: 200 })
				}
				if (url.includes('itunes.apple.com')) {
					return new Response(
						JSON.stringify({
							resultCount: 1,
							results: [
								{
									trackName: 'Shape of You',
									artistName: 'Ed Sheeran',
									collectionName: 'Divide',
								},
							],
						}),
						{ status: 200 },
					)
				}
				return new Response(JSON.stringify({ success: true, data: { results: [] } }), { status: 200 })
			})

			const results = await fetchAutoMetadata('Shape of You', 'Mismatched Artist')

			expect(results.length).toBeGreaterThan(0)
			expect(results[0]?.title).toBe('Shape of You')
			expect(fetchSpy).toHaveBeenCalledTimes(4) // 2 for first query (itunes+saavn), 2 for fallback query
		})
	})

	describe('autoApplyTrackMetadata', () => {
		it('should update track metadata in IDB without TransactionInactiveError', async () => {
			const trackId = await dbImportTestTrack({
				name: '01 - Shape of You',
				artists: ['~\0unknown'],
				album: '~\0unknown',
			})

			vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = String(input)
				if (url.includes('itunes.apple.com')) {
					return new Response(
						JSON.stringify({
							resultCount: 1,
							results: [
								{
									trackName: 'Shape of You',
									artistName: 'Ed Sheeran',
									collectionName: '÷ (Deluxe)',
									primaryGenreName: 'Pop',
									releaseDate: '2017-01-06T08:00:00Z',
									artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
									trackNumber: 4,
									trackCount: 16,
								},
							],
						}),
						{ status: 200 },
					)
				}
				if (url.includes('1000x1000bb.jpg')) {
					return new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), { status: 200 })
				}
				if (url.includes('jiosaavn')) {
					return new Response(JSON.stringify({ success: true, data: { results: [] } }), { status: 200 })
				}
				return new Response('', { status: 404 })
			})

			const res = await autoApplyTrackMetadata(trackId)

			expect(res.success).toBe(true)
			expect(res.trackName).toBe('Shape of You')

			const db = await getDatabase()
			const updatedTrack = await db.get('tracks', trackId)

			expect(updatedTrack).toBeDefined()
			expect(updatedTrack?.name).toBe('Shape of You')
			expect(updatedTrack?.artists).toEqual(['Ed Sheeran'])
			expect(updatedTrack?.album).toBe('÷ (Deluxe)')
			expect(updatedTrack?.genre).toEqual(['Pop'])
			expect(updatedTrack?.year).toBe('2017')
		})
	})
})
