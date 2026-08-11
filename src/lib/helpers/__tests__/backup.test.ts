import 'fake-indexeddb/auto'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase } from '$lib/db/database.ts'
import { clearDatabaseStores } from '$lib/helpers/test-helpers.ts'
import { exportBackupData, importBackupData, validateBackupData } from '../backup.ts'

describe('backup and restore', () => {
	beforeEach(async () => {
		await clearDatabaseStores()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it('exports and imports backup data correctly', async () => {
		const db = await getDatabase()
		// Let's seed some data in the database
		await db.add('artists', {
			id: 1,
			uuid: 'artist-1',
			name: 'Test Artist',
		})

		await db.add('albums', {
			id: 1,
			uuid: 'album-1',
			name: 'Test Album',
			artists: ['Test Artist'],
			year: '2023',
		})

		await db.add('tracks', {
			id: 1,
			uuid: 'track-1',
			name: 'Test Track',
			artists: ['Test Artist'],
			album: 'Test Album',
			year: '2023',
			duration: 120,
			genre: ['Pop'],
			trackNo: 1,
			trackOf: 10,
			discNo: 1,
			discOf: 1,
			fileName: 'test.mp3',
			directory: -1,
			scannedAt: Date.now(),
			file: new File(['audio'], 'test.mp3', { type: 'audio/mpeg' }),
		})

		await db.add('lyrics', {
			trackId: 1,
			data: {
				status: 'found',
				source: 'uploaded',
				lyrics: [
					{
						startTimeMs: 0,
						durationMs: 5000,
						words: 'Hello world',
					} as any,
				],
				syncType: 'line',
			},
			version: 14,
			cachedAt: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days old (uploaded shouldn't expire)
		} as any)

		await db.add('lyrics', {
			trackId: 2,
			data: {
				status: 'found',
				source: 'adi',
				lyrics: [
					{
						startTimeMs: 0,
						durationMs: 5000,
						words: 'Regular lyric',
					} as any,
				],
				syncType: 'line',
			},
			version: 14,
			cachedAt: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days old (should be updated on restore)
		} as any)

		// Export
		const backupBlob = await exportBackupData()
		expect(backupBlob).toBeInstanceOf(Blob)

		// Parse the ZIP file to validate its content
		const zip = await JSZip.loadAsync(backupBlob)
		const backupJsonFile = zip.file('backup.json')
		expect(backupJsonFile).not.toBeNull()

		const text = await backupJsonFile!.async('string')
		const backupData = JSON.parse(text)

		expect(validateBackupData(backupData)).toBe(true)
		expect(backupData.db.tracks).toHaveLength(1)
		expect(backupData.db.artists).toHaveLength(1)
		expect(backupData.db.lyrics).toHaveLength(2)

		// Now clear database
		await clearDatabaseStores()

		// Import
		await importBackupData(zip, backupData)

		// Verify database after import
		const restoredArtists = await db.getAll('artists')
		expect(restoredArtists).toHaveLength(1)
		expect(restoredArtists[0]?.name).toBe('Test Artist')

		const restoredTracks = await db.getAll('tracks')
		expect(restoredTracks).toHaveLength(1)
		expect(restoredTracks[0]?.name).toBe('Test Track')

		const restoredLyrics = await db.getAll('lyrics')
		expect(restoredLyrics).toHaveLength(2)
		const uploadedLyric = restoredLyrics.find((l) => l.data.source === 'uploaded')
		const adiLyric = restoredLyrics.find((l) => l.data.source === 'adi')

		expect(uploadedLyric).toBeDefined()
		expect(uploadedLyric?.data.lyrics[0].words).toBe('Hello world')
		// uploaded cachedAt is preserved/remains old, but it doesn't expire
		expect(uploadedLyric?.cachedAt).toBeLessThan(Date.now() - 1000 * 60 * 60 * 24 * 9)

		expect(adiLyric).toBeDefined()
		expect(adiLyric?.data.lyrics[0].words).toBe('Regular lyric')
		// regular lyric's cachedAt should be refreshed to Date.now() on restore
		expect(adiLyric?.cachedAt).toBeGreaterThan(Date.now() - 1000 * 60)
	})

	it('handles validation and loading of older/incomplete backups gracefully', async () => {
		// Mock an older backup missing 'lyrics' and 'playHistory' fields under 'db'
		const oldBackupData = {
			version: 1,
			timestamp: Date.now(),
			localStorage: {
				'snaeplayer-test': 'some-value',
			},
			db: {
				tracks: [],
				albums: [],
				artists: [],
				playlists: [],
				playlistEntries: [],
				// missing playHistory and lyrics
			},
		}

		// Validation should pass
		expect(validateBackupData(oldBackupData)).toBe(true)

		const db = await getDatabase()
		// Seed some initial data that should be cleared
		await db.add('artists', {
			id: 1,
			uuid: 'old-artist',
			name: 'Old Artist',
		})

		const zip = new JSZip()
		// Import older backup
		await importBackupData(zip, oldBackupData as any)

		// Database should be cleared, and stores should be successfully updated (empty but valid)
		const restoredArtists = await db.getAll('artists')
		expect(restoredArtists).toHaveLength(0)

		const restoredTracks = await db.getAll('tracks')
		expect(restoredTracks).toHaveLength(0)
	})
})
