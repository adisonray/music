import { searchDiscovery, type DiscoveryResource } from './spicyamll.ts'

const API_BASE_URL = (
	import.meta.env.PUBLIC_LYRICSFLOW_API_URL ||
	import.meta.env.VITE_LYRICSFLOW_API_URL ||
	''
).replace(/\/$/, '')

type AppleMusicArtist = {
	id?: string | number
	type?: string
	attributes?: { name?: string; url?: string; genreNames?: string[]; artwork?: { url?: string } }
	relationships?: { albums?: { data?: AppleMusicResource[] }; songs?: { data?: AppleMusicResource[] } }
}

type AppleMusicResource = {
	id?: string | number
	type?: string
	attributes?: { name?: string; artistName?: string; albumName?: string; artwork?: { url?: string } }
}

const requestArtist = async (artistId: string): Promise<AppleMusicArtist | null> => {
	if (!API_BASE_URL) return null
	try {
		const response = await fetch(
			`${API_BASE_URL}/artist?artist=${encodeURIComponent(artistId)}`,
			{ headers: { Accept: 'application/json' } },
		)
		if (!response.ok) return null
		const payload = (await response.json()) as { data?: AppleMusicArtist[] | AppleMusicArtist }
		const data = payload?.data
		return Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
	} catch {
		return null
	}
}

const artworkUrl = (url?: string, size = 600) =>
	url?.replace(/\{w\}/g, String(size)).replace(/\{h\}/g, String(size)).replace(/\{f\}/g, 'jpg').replace(/\{c\}/g, 'bb') || 'favicon.svg'

const mapResource = (item: AppleMusicResource, type: 'song' | 'album', artistName: string): DiscoveryResource | null => {
	const attributes = item.attributes
	const name = attributes?.name
	if (!name || !item.id) return null
	return {
		type,
		id: String(item.id),
		name,
		artist: attributes?.artistName || artistName,
		album: type === 'album' ? name : attributes?.albumName || '',
		artUrl: artworkUrl(attributes?.artwork?.url),
	}
}

const ARTIST_PROFILE_CACHE_TTL = 10 * 60 * 1000
const artistProfileCache = new Map<string, { value: LyricsflowArtistProfile; expiresAt: number }>()
const artistProfileRequests = new Map<string, Promise<LyricsflowArtistProfile>>()

export interface LyricsflowArtistProfile {
	name: string
	artUrl?: string
	songs: DiscoveryResource[]
	albums: DiscoveryResource[]
}

const SPICYAMLL_API = 'https://api.spicyamll.online'

const requestSpicyArtistResource = async <T>(
	path: string,
	artistId: string,
): Promise<T | null> => {
	// SpicyAMLL normally expects the numeric Apple Music artist ID as `artist`.
	// Retry compatible parameter names so a 400 from one deployment does not
	// make the entire artist profile fail.
	for (const key of ['artist', 'artistId', 'id'] as const) {
		try {
			const url = new URL(SPICYAMLL_API + path)
			url.searchParams.set(key, artistId)
			const response = await fetch(url, { headers: { Accept: 'application/json' } })
			if (!response.ok) continue
			return (await response.json()) as T
		} catch {
			// Try the next compatible parameter name.
		}
	}
	return null
}
const extractItems = (value: unknown): unknown[] => {
	if (Array.isArray(value)) return value
	if (!value || typeof value !== 'object') return []

	const object = value as Record<string, unknown>
	for (const key of ['data', 'results', 'songs', 'albums', 'items']) {
		const child = object[key]
		if (Array.isArray(child)) return child
		if (child && typeof child === 'object') {
			const nested = extractItems(child)
			if (nested.length) return nested
		}
	}
	return []
}

const mapSpicyResource = (
	item: unknown,
	type: 'song' | 'album',
	artistName: string,
): DiscoveryResource | null => {
	if (!item || typeof item !== 'object') return null
	const record = item as Record<string, unknown>
	const attributes =
		record.attributes && typeof record.attributes === 'object'
			? record.attributes as Record<string, unknown>
			: record
	const artwork =
		attributes.artwork && typeof attributes.artwork === 'object'
			? attributes.artwork as Record<string, unknown>
			: {}

	const id = attributes.trackId ?? attributes.songId ?? attributes.collectionId ?? attributes.albumId ?? record.id
	const name = attributes.name ?? attributes.trackName ?? attributes.collectionName ?? record.name ?? record.title
	if (id === undefined || id === null || !name) return null

	return {
		type,
		id: String(id),
		name: String(name),
		artist: String(attributes.artistName ?? record.artistName ?? record.artist ?? artistName),
		album: type === 'album'
			? String(name)
			: String(attributes.albumName ?? record.albumName ?? record.album ?? ''),
		artUrl: artworkUrl(
			String(
				artwork.url ??
				attributes.artworkUrl100 ??
				record.artworkUrl100 ??
				record.artUrl ??
				record.image ??
				record.cover ??
				'',
			),
		),
	}
}

const fetchLyricsflowArtistProfile = async (
	artistId: string,
	artistName?: string,
): Promise<LyricsflowArtistProfile> => {
	// /artist is used for the canonical artist identity and PFP.
	const artist = await requestArtist(artistId)

	let discovery: DiscoveryResource[] = []
	let fallbackArtist: DiscoveryResource | undefined

	if (!artist && artistName?.trim()) {
		try {
			discovery = await searchDiscovery(artistName.trim())
			fallbackArtist = discovery.find(
				(item) => item.type === 'artist' && item.name.toLowerCase() === artistName.trim().toLowerCase(),
			)
		} catch {
			// The SpicyAMLL catalog endpoints below can still resolve by ID.
		}
	}

	const name = artist?.attributes?.name || fallbackArtist?.name || artistName?.trim() || artistId

	// Use the exact SpicyAMLL artist catalog endpoints requested for the
	// complete songs and albums lists.
	const [songsResponse, albumsResponse] = await Promise.all([
		requestSpicyArtistResource<unknown>('/artist/songs', artistId),
		requestSpicyArtistResource<unknown>('/artist/albums', artistId),
	])

	let songs = extractItems(songsResponse)
		.map((item) => mapSpicyResource(item, 'song', name))
		.filter((item): item is DiscoveryResource => !!item)

	let albums = extractItems(albumsResponse)
		.map((item) => mapSpicyResource(item, 'album', name))
		.filter((item): item is DiscoveryResource => !!item)

	// If an endpoint returns an envelope containing the artist relationship
	// rather than a direct array, still keep the profile usable.
	if (!songs.length && artist?.relationships?.songs?.data) {
		songs = artist.relationships.songs.data
			.map((item) => mapResource(item, 'song', name))
			.filter((item): item is DiscoveryResource => !!item)
	}

	if (!albums.length && artist?.relationships?.albums?.data) {
		albums = artist.relationships.albums.data
			.map((item) => mapResource(item, 'album', name))
			.filter((item): item is DiscoveryResource => !!item)
	}

	if (!songs.length && discovery.length) {
		songs = discovery.filter(
			(item) => item.type === 'song' && item.artist.toLowerCase() === name.toLowerCase(),
		)
	}
	if (!albums.length && discovery.length) {
		albums = discovery.filter(
			(item) => item.type === 'album' && item.artist.toLowerCase() === name.toLowerCase(),
		)
	}

	if (!songs.length && !albums.length && !artist && !fallbackArtist) {
		throw new Error('Unable to load artist profile.')
	}

	return {
		name,
		artUrl: artist?.attributes?.artwork?.url
			? artworkUrl(artist.attributes.artwork.url, 1200)
			: fallbackArtist?.artUrl,
		songs,
		albums,
	}
}

export const getLyricsflowArtistProfile = (artistId: string, artistName?: string): Promise<LyricsflowArtistProfile> => {
	const key = `${artistId}:${artistName?.trim().toLowerCase() ?? ''}`
	const cached = artistProfileCache.get(key)
	if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
	if (cached) artistProfileCache.delete(key)

	const pending = artistProfileRequests.get(key)
	if (pending) return pending

	const request = fetchLyricsflowArtistProfile(artistId, artistName).then((value) => {
		artistProfileCache.set(key, { value, expiresAt: Date.now() + ARTIST_PROFILE_CACHE_TTL })
		return value
	}).finally(() => artistProfileRequests.delete(key))

	artistProfileRequests.set(key, request)
	return request
}
