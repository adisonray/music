/**
 * Adi Music — Library Manager
 *
 * Handles the local user library and listening history used by Discovery.
 * This is browser-only state and never sends library/history data to a server.
 */

export type LibrarySong = {
	id: string
	type: 'song'
	name: string
	artist: string
	album: string
	artUrl: string
	addedAt: number
}

export type LibraryAlbum = {
	id: string
	type: 'album'
	name: string
	artist: string
	artUrl: string
	releaseDate: string
	addedAt: number
}

export type LibraryArtist = {
	id: string
	type: 'artist'
	name: string
	artUrl: string
	genre: string
	addedAt: number
}

export type Library = {
	songs: LibrarySong[]
	albums: LibraryAlbum[]
	artists: LibraryArtist[]
}

export type RecentTrack = {
	id: string
	trackId: string
	name: string
	artist: string
	album: string
	artUrl: string
	playedAt: number
}

const STORAGE_KEY = 'adi_music_user_library'
const HISTORY_KEY = 'adi_music_recent_tracks'
const MAX_HISTORY = 100

const isBrowser = () => typeof window !== 'undefined'

const emptyLibrary = (): Library => ({ songs: [], albums: [], artists: [] })

function getRawLibrary(): Library {
	if (!isBrowser()) return emptyLibrary()

	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return emptyLibrary()

		const parsed = JSON.parse(raw) as Partial<Library>
		return {
			songs: Array.isArray(parsed.songs) ? parsed.songs : [],
			albums: Array.isArray(parsed.albums) ? parsed.albums : [],
			artists: Array.isArray(parsed.artists) ? parsed.artists : [],
		}
	} catch (error) {
		console.error('[Library] Failed to parse library:', error)
		return emptyLibrary()
	}
}

function saveRawLibrary(lib: Library) {
	if (!isBrowser()) return

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(lib))
		window.dispatchEvent(new CustomEvent('adi-music-library-changed', { detail: lib }))
	} catch (error) {
		console.error('[Library] Failed to save library:', error)
	}
}

const cleanArtUrl = (url: unknown, width = 600, height = 600) => {
	if (typeof url !== 'string' || !url) return 'favicon.svg'

	const cleaned = url
		.replace(/\{w\}/g, String(width))
		.replace(/\{h\}/g, String(height))
		.replace(/\{c\}/g, 'bb')
		.replace(/\{f\}/g, 'jpg')
		.replace(/\d+x\d+bb\./, `${width}x${height}bb.`)

	return /^https?:\/\//i.test(cleaned) ? cleaned : 'favicon.svg'
}

const songId = (song: Record<string, unknown>) =>
	String(song.trackId ?? song.id ?? song.amTrackId ?? '')

export function addSongToLibrary(song: Record<string, unknown>) {
	const id = songId(song)
	if (!id) return

	const lib = getRawLibrary()
	lib.songs = lib.songs.filter((item) => String(item.id) !== id)

	const entry: LibrarySong = {
		id,
		type: 'song',
		name: String(song.trackName ?? song.name ?? song.title ?? 'Unknown Song'),
		artist: String(song.artistName ?? song.artist ?? 'Unknown Artist'),
		album: String(song.collectionName ?? song.album ?? ''),
		artUrl: cleanArtUrl(song.artworkUrl100 ?? song.artUrl ?? song.artwork),
		addedAt: Date.now(),
	}

	lib.songs.unshift(entry)
	saveRawLibrary(lib)
	return entry
}

export function removeSongFromLibrary(id: string | number) {
	const lib = getRawLibrary()
	lib.songs = lib.songs.filter((song) => String(song.id) !== String(id))
	saveRawLibrary(lib)
}

export function isSongInLibrary(id: string | number) {
	return getRawLibrary().songs.some((song) => String(song.id) === String(id))
}

export function addAlbumToLibrary(album: Record<string, unknown>) {
	const id = String(album.id ?? album.albumId ?? '')
	if (!id) return

	const lib = getRawLibrary()
	lib.albums = lib.albums.filter((item) => String(item.id) !== id)

	const entry: LibraryAlbum = {
		id,
		type: 'album',
		name: String(album.name ?? album.title ?? album.collectionName ?? 'Album'),
		artist: String(album.artistName ?? album.artist ?? 'Artist'),
		artUrl: cleanArtUrl(album.artworkUrl100 ?? album.artUrl ?? album.artwork),
		releaseDate: String(album.releaseDate ?? ''),
		addedAt: Date.now(),
	}

	lib.albums.unshift(entry)
	saveRawLibrary(lib)
	return entry
}

export function removeAlbumFromLibrary(id: string | number) {
	const lib = getRawLibrary()
	lib.albums = lib.albums.filter((album) => String(album.id) !== String(id))
	saveRawLibrary(lib)
}

export function isAlbumInLibrary(id: string | number) {
	return getRawLibrary().albums.some((album) => String(album.id) === String(id))
}

export function addArtistToLibrary(artist: Record<string, unknown>) {
	const id = String(artist.id ?? artist.artistId ?? '')
	if (!id) return

	const lib = getRawLibrary()
	lib.artists = lib.artists.filter((item) => String(item.id) !== id)

	const genres = Array.isArray(artist.genreNames) ? artist.genreNames : []

	const entry: LibraryArtist = {
		id,
		type: 'artist',
		name: String(artist.name ?? artist.artistName ?? 'Artist'),
		artUrl: cleanArtUrl(artist.artworkUrl100 ?? artist.artUrl ?? artist.artwork),
		genre: String(artist.genre ?? genres[0] ?? 'Music'),
		addedAt: Date.now(),
	}

	lib.artists.unshift(entry)
	saveRawLibrary(lib)
	return entry
}

export function removeArtistFromLibrary(id: string | number) {
	const lib = getRawLibrary()
	lib.artists = lib.artists.filter((artist) => String(artist.id) !== String(id))
	saveRawLibrary(lib)
}

export function isArtistInLibrary(id: string | number) {
	return getRawLibrary().artists.some((artist) => String(artist.id) === String(id))
}

export function getLibrarySongs() {
	return getRawLibrary().songs
}

export function getLibraryAlbums() {
	return getRawLibrary().albums
}

export function getLibraryArtists() {
	return getRawLibrary().artists
}

export function getRecentlyAdded(limit = 100) {
	const lib = getRawLibrary()

	return [
		...lib.songs.map((song) => ({ ...song, itemType: 'song' as const })),
		...lib.albums.map((album) => ({ ...album, itemType: 'album' as const })),
		...lib.artists.map((artist) => ({ ...artist, itemType: 'artist' as const })),
	]
		.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
		.slice(0, limit)
}

function getRawHistory(): RecentTrack[] {
	if (!isBrowser()) return []

	try {
		const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

/**
 * Record one completed/started playback for Discovery recommendations.
 * Replaying a song moves it to the front instead of creating duplicates.
 */
export function recordRecentTrack(track: Record<string, unknown>) {
const id = String(track.remoteId ?? songId(track))
	if (!id || !isBrowser()) return

	const history = getRawHistory().filter((item) => String(item.id) !== id)
	const entry: RecentTrack = {
		id,
		trackId: id,
		name: String(track.trackName ?? track.name ?? track.title ?? 'Unknown Song'),
		artist: String(track.artistName ?? track.artist ?? 'Unknown Artist'),
		album: String(track.collectionName ?? track.album ?? ''),
		artUrl: cleanArtUrl(track.artworkUrl100 ?? track.artUrl ?? track.artwork),
		playedAt: Date.now(),
	}

	history.unshift(entry)

	try {
		localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
		window.dispatchEvent(new CustomEvent('adi-music-history-changed', { detail: entry }))
	} catch (error) {
		console.error('[History] Failed to save history:', error)
	}

	return entry
}

export function getRecentlyPlayed(limit = 10) {
	return getRawHistory().slice(0, limit)
}

export function hasListenedSongs() {
	return getRawHistory().length > 0
}

export function clearRecentlyPlayed() {
	if (!isBrowser()) return
	localStorage.removeItem(HISTORY_KEY)
	window.dispatchEvent(new CustomEvent('adi-music-history-changed'))
}
