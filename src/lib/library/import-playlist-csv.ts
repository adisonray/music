import { getDatabase } from '$lib/db/database.ts'
import { ensureTrackIsStoredLocally } from '$lib/library/local-download.ts'
import { dbAddTracksToPlaylistsWithTx, getPlaylistEntriesDatabaseStore } from '$lib/library/playlists-actions.ts'
import { generateStableId } from '$lib/services/jiosaavn.ts'
import { registerRemoteTrack } from '$lib/library/get/value.ts'
import { searchCatalog, spicyamll, type SpicyTrack } from '$lib/services/spicyamll.ts'
import { dispatchDatabaseChangedEvent } from '$lib/db/events.ts'

export interface PlaylistCsvImportProgress {
	current: number
	total: number
	title: string
	artist: string
	status: 'searching' | 'downloading' | 'added' | 'duplicate' | 'not-found' | 'failed'
	rowIndex: number
}

export interface PlaylistCsvImportResult {
	added: number
	duplicates: number
	notFound: Array<{ title: string; artist: string; album?: string }>
	failed: Array<{ title: string; artist: string; reason: string }>
}

const normalize = (value: unknown) =>
	String(value ?? '')
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[\p{P}\p{S}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const parseCsv = (text: string): string[][] => {
	const rows: string[][] = []
	let row: string[] = []
	let field = ''
	let quoted = false

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i]
		if (char === '"') {
			if (quoted && text[i + 1] === '"') {
				field += '"'
				i += 1
			} else {
				quoted = !quoted
			}
		} else if (char === ',' && !quoted) {
			row.push(field)
			field = ''
		} else if ((char === '\n' || char === '\r') && !quoted) {
			if (char === '\r' && text[i + 1] === '\n') i += 1
			row.push(field)
			field = ''
			if (row.some((value) => value.trim())) rows.push(row)
			row = []
		} else {
			field += char
		}
	}

	row.push(field)
	if (row.some((value) => value.trim())) rows.push(row)
	return rows
}

const getColumn = (headers: string[], names: string[]) => {
	const normalized = headers.map(normalize)
	return names.map(normalize).map((name) => normalized.indexOf(name)).find((index) => index >= 0) ?? -1
}

const registerTrack = (track: SpicyTrack): number => {
	const remoteId = String(track.id)
	const id = generateStableId(`spicyamll:${remoteId}`)
	const artist = track.artist ?? track.artists?.join(', ') ?? ''
	const album = track.album ?? track.albumName ?? ''
	const image = track.image ?? track.artwork

	registerRemoteTrack({
		id,
		remoteId,
		streaming: true,
		uuid: `spicyamll:${remoteId}`,
		name: track.name,
		album: album || '~\\0unknown',
		artists: artist ? [artist] : ['Unknown Artist'],
		year: track.year ? String(track.year) : '~\\0unknown',
		duration: Number(track.duration ?? 0),
		genre: [],
		trackNo: 0,
		trackOf: 0,
		discNo: 0,
		discOf: 0,
		language: undefined,
		explicit: track.isExplicit ?? track.contentRating?.toLowerCase() === 'explicit',
		image: image ? { optimized: false, small: image, full: image } : undefined,
		file: undefined,
		directory: undefined,
		fileName: undefined,
		scannedAt: Date.now(),
		url: spicyamll.streamUrl(remoteId, { codec: 'aac', fallback: true, language: 'en-US' }),
		favorite: false,
		type: 'track',
	})

	return id
}

const findMatch = async (title: string, artist: string, album: string) => {
	const results = await searchCatalog([title, artist].filter(Boolean).join(' '))
	const wantedTitle = normalize(title)
	const wantedArtist = normalize(artist)
	const wantedAlbum = normalize(album)
	const isExplicit = (track: SpicyTrack) =>
		track.isExplicit === true || track.contentRating?.toLowerCase() === 'explicit'
	const isClean = (track: SpicyTrack) =>
		track.contentRating?.toLowerCase() === 'clean' || track.isExplicit === false

	const exactMatches = results.filter((track) => {
		const titleMatch = normalize(track.name) === wantedTitle
		const artistMatch = !wantedArtist || normalize(track.artist ?? track.artists?.join(', ')) === wantedArtist
		const albumMatch = !wantedAlbum || normalize(track.album ?? track.albumName) === wantedAlbum
		return titleMatch && artistMatch && albumMatch
	})
	if (exactMatches.length) return exactMatches.find(isExplicit) ?? exactMatches.find((track) => !isClean(track)) ?? exactMatches[0]

	const artistMatches = results.filter((track) => {
		const titleMatch = normalize(track.name) === wantedTitle
		const artistValue = normalize(track.artist ?? track.artists?.join(', '))
		return titleMatch && (!wantedArtist || artistValue.includes(wantedArtist) || wantedArtist.includes(artistValue))
	})
	if (artistMatches.length) return artistMatches.find(isExplicit) ?? artistMatches.find((track) => !isClean(track)) ?? artistMatches[0]

	const titleMatches = results.filter((track) => normalize(track.name) === wantedTitle)
	return titleMatches.find(isExplicit) ?? titleMatches.find((track) => !isClean(track)) ?? titleMatches[0]

}

export const importPlaylistCsv = async (
	playlistId: number,
	file: File | string,
	onProgress?: (progress: PlaylistCsvImportProgress) => void,
	resumeFrom = 0,
): Promise<PlaylistCsvImportResult> => {
	const text = typeof file === 'string' ? file : await file.text()
	const rows = parseCsv(text)
	if (rows.length < 2) throw new Error('The CSV needs a header row and at least one song.')

	const headers = rows[0].map((value) => value.replace(/^\uFEFF/, '').trim())
	const titleIndex = getColumn(headers, ['title', 'track name', 'trackname', 'name'])
	const artistIndex = getColumn(headers, ['artist', 'artist name', 'artistname', 'artist name(s)', 'artists', 'artists name'])
	const albumIndex = getColumn(headers, ['album', 'album name', 'albumname'])

	if (titleIndex < 0 || artistIndex < 0) {
		throw new Error('CSV must contain Title and Artist columns.')
	}

	const result: PlaylistCsvImportResult = { added: 0, duplicates: 0, notFound: [], failed: [] }
	const localTrackIds: number[] = []

	const db = await getDatabase()
	const playlist = await db.get('playlists', playlistId)
	if (!playlist) throw new Error('Playlist not found.')

	// Read the entries directly instead of depending on the compound index.
	// This also works with databases created by older Adi Music versions.
	const existingEntries = await db.getAll('playlistEntries')
	const existing = new Set(
		existingEntries.filter((entry) => entry.playlistId === playlistId).map((entry) => entry.trackId),
	)

	const songRows = rows.slice(1)
	let current = resumeFrom

	for (let rowIndex = 0; rowIndex < songRows.length; rowIndex += 1) {
		if (rowIndex < resumeFrom) continue
		const row = songRows[rowIndex]
		const title = row[titleIndex]?.trim() ?? ''
		const artist = row[artistIndex]?.trim() ?? ''
		const album = albumIndex >= 0 ? row[albumIndex]?.trim() ?? '' : ''
		if (!title || !artist) continue
			current += 1
			onProgress?.({ current, total: songRows.length, title, artist, status: 'searching', rowIndex })

		try {
			const match = await findMatch(title, artist, album)
			if (!match) {
				result.notFound.push({ title, artist, album })
				onProgress?.({ current, total: songRows.length, title, artist, status: 'not-found', rowIndex })
				continue
			}

			onProgress?.({ current, total: songRows.length, title, artist, status: 'downloading', rowIndex })
			const remoteId = registerTrack(match)
			const localId = await ensureTrackIsStoredLocally(remoteId)
			if (existing.has(localId)) {
				result.duplicates += 1
				onProgress?.({ current, total: songRows.length, title, artist, status: 'duplicate', rowIndex })
				continue
			}

			localTrackIds.push(localId)
			existing.add(localId)
			result.added += 1
			onProgress?.({ current, total: songRows.length, title, artist, status: 'added', rowIndex })
		} catch (error) {
			result.failed.push({
				title,
				artist,
				reason: error instanceof Error ? error.message : 'Download failed',
			})
			onProgress?.({ current, total: songRows.length, title, artist, status: 'failed', rowIndex })
		}
	}

	if (localTrackIds.length > 0) {
		const store = await getPlaylistEntriesDatabaseStore()
		const changes = await dbAddTracksToPlaylistsWithTx(store, {
			playlistIds: [playlistId],
			trackIds: localTrackIds,
		})
		dispatchDatabaseChangedEvent(changes)
	}

	return result
}
