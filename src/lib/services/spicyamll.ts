const API_BASE = 'https://api.spicyamll.online'

export type SpicyApiParams = Record<string, string | number | boolean | undefined | null>

export interface SpicyTrack {
	id: string | number
	name: string
	artist?: string
	artists?: string[]
	album?: string
	albumName?: string
	image?: string
	artwork?: string
	duration?: number
	year?: number | string
	[key: string]: unknown
}

const API_CACHE_TTL = {
	search: 5 * 60_000,
	recommendations: 10 * 60_000,
	album: 30 * 60_000,
	artist: 30 * 60_000,
	default: 5 * 60_000,
} as const

const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
const pendingRequests = new Map<string, Promise<unknown>>()

const getCacheTtl = (path: string) => {
	if (path.includes('recommendations')) return API_CACHE_TTL.recommendations
	if (path.includes('album')) return API_CACHE_TTL.album
	if (path.includes('artist')) return API_CACHE_TTL.artist
	if (path === '/search' || path.includes('/catalog/')) return API_CACHE_TTL.search
	return API_CACHE_TTL.default
}

const request = async <T>(path: string, params: SpicyApiParams = {}): Promise<T> => {
	const url = new URL(`${API_BASE}${path}`)
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
	}

	const key = url.toString()
	const cached = responseCache.get(key)
	if (cached && cached.expiresAt > Date.now()) return cached.value as T
	if (cached) responseCache.delete(key)

	const pending = pendingRequests.get(key)
	if (pending) return pending as Promise<T>

	const promise = (async () => {
		try {
			const response = await fetch(url, { headers: { Accept: 'application/json' } })
			if (!response.ok) {
				let detail = ''
				try { detail = (await response.text()).slice(0, 300) } catch {}
				throw new Error(`SpicyAMLL ${response.status}: ${response.statusText}${detail ? ` - ${detail}` : ''}`)
			}
			const value = await response.json()
			responseCache.set(key, { value, expiresAt: Date.now() + getCacheTtl(path) })
			return value
		} catch (directError) {
			if (!(directError instanceof TypeError)) throw directError
			const proxy = new URL(`${API_BASE}/proxy`)
			proxy.searchParams.set('url', url.toString())
			const response = await fetch(proxy, { headers: { Accept: 'application/json' } })
			if (!response.ok) throw new Error(`SpicyAMLL proxy ${response.status}: ${response.statusText}`)
			const value = await response.json()
			responseCache.set(key, { value, expiresAt: Date.now() + getCacheTtl(path) })
			return value
		}
	})()

	pendingRequests.set(key, promise)
	try { return await promise as T } finally { pendingRequests.delete(key) }
}
const unwrap = <T>(value: unknown): T => {
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>
		return (record.data ?? record.result ?? record.results ?? value) as T
	}
	return value as T
}

export const spicyamll = {
	// Lyricsflow-compatible discovery search. This is the endpoint used by the recommendation model.
	search: (params: SpicyApiParams) => request<unknown>('/search', params),
	recommendations: (params: SpicyApiParams) => request<unknown>('/recommendations', params),
	catalogSearch: (storefront: string, params: SpicyApiParams) =>
		request<unknown>(`/get/v1/catalog/${encodeURIComponent(storefront)}/search`, params).then(unwrap),
	artist: (params: SpicyApiParams) => request<unknown>('/get/artist', params).then(unwrap),
	album: (params: SpicyApiParams) => request<unknown>('/album', params).then(unwrap),
	albumTracks: async (albumId: string | number) => {
		const payload = await request<unknown>('/album', { id: String(albumId), l: 'en-US' })
		const root = unwrap<unknown>(payload)

		// SpicyAMLL can return either an array of albums or an already-unwrapped album object.
		const albumList = Array.isArray(root) ? root : [root]
		const album = albumList[0] as Record<string, unknown> | undefined
		if (!album || typeof album !== 'object') return []

		const relationships =
			album.relationships && typeof album.relationships === 'object'
				? album.relationships as Record<string, unknown>
				: undefined
		const tracks =
			relationships?.tracks && typeof relationships.tracks === 'object'
				? relationships.tracks as Record<string, unknown>
				: undefined
		const trackData = tracks?.data

		return normalizeTracks(trackData ?? album)
	},
	playlist: (params: SpicyApiParams) => request<unknown>('/get/playlist', params).then(unwrap),
	musicVideo: (params: SpicyApiParams) => request<unknown>('/get/musicvideo', params).then(unwrap),
	musicVideoGet: (params: SpicyApiParams) => request<unknown>('/get/musicvideo/get', params).then(unwrap),
	musicVideoById: (mvId: string | number) => request<unknown>(`/get/musicvideo/${encodeURIComponent(mvId)}`).then(unwrap),
	musicVideoDownload: (params: SpicyApiParams) => request<unknown>('/get/musicvideo/download', params).then(unwrap),
	musicVideoStream: (params: SpicyApiParams) => request<unknown>('/get/musicvideo/stream', params).then(unwrap),
	artistAlbums: (params: SpicyApiParams) => request<unknown>('/get/artist/albums', params).then(unwrap),
	artistSongs: (params: SpicyApiParams) => request<unknown>('/get/artist/songs', params).then(unwrap),
	downloadFormat: (fmt: string, params: SpicyApiParams) =>
		request<unknown>(`/get/download/${encodeURIComponent(fmt)}`, params).then(unwrap),
	songs: (id: string | number) => request<unknown>(`/get/songs/${encodeURIComponent(id)}`).then(unwrap),
	song: (id: string | number) => request<unknown>(`/get/song/${encodeURIComponent(id)}`).then(unwrap),
	lyrics: (params: SpicyApiParams) => request<unknown>('/get/lyrics', params).then(unwrap),
	download: (params: SpicyApiParams) => request<unknown>('/get/download', params).then(unwrap),
	getStream: (params: SpicyApiParams) => request<unknown>('/get/stream', params).then(unwrap),
	convert: (params: SpicyApiParams) => request<unknown>('/get/convert', params).then(unwrap),
	animatedArt: (params: SpicyApiParams) => request<unknown>('/get/animatedart', params).then(unwrap),

	downloadUrl: (
		song: string | number,
		options: { codec?: string; language?: string } = {},
	) => {
		const url = new URL(`${API_BASE}/download`)
		url.searchParams.set('song', String(song))
		url.searchParams.set('codec', options.codec ?? 'aac')
		url.searchParams.set('l', options.language ?? 'en-US')
		return url.toString()
	},

	streamUrl: (
		song: string | number,
		options: { codec?: string; fallback?: boolean; language?: string } = {},
	) => {
		const url = new URL(`${API_BASE}/stream`)
		url.searchParams.set('song', String(song))
		url.searchParams.set('codec', options.codec ?? 'aac')
		url.searchParams.set('fallback', String(options.fallback ?? true))
		url.searchParams.set('l', options.language ?? 'en-US')
		url.searchParams.set('websupport', 'true')
		return url.toString()
	},
}

export type DiscoveryResource = {
	type: 'song' | 'album' | 'artist'
	id: string
	name: string
	artist: string
	album: string
	artUrl: string
	duration?: number
	genre?: string
	bio?: string
}

const cleanDiscoveryArtwork = (url: unknown) => {
	if (typeof url !== 'string' || !url) return 'favicon.svg'
	return url
		.replace(/\{w\}/g, '1000')
		.replace(/\{h\}/g, '1000')
		.replace(/\{c\}/g, 'bb')
		.replace(/\{f\}/g, 'jpg')
		.replace(/\d+x\d+bb\./, '1000x1000bb.')
}

const parseDiscoveryGroup = (
	input: unknown,
	type: DiscoveryResource['type'],
): DiscoveryResource[] => {
	if (!input || typeof input !== 'object') return []
	const root = input as Record<string, unknown>
	const results = (root.results ?? (root.data && typeof root.data === 'object'
		? (root.data as Record<string, unknown>).results
		: undefined)) as Record<string, unknown> | undefined
	if (!results) return []

	const groupName = type === 'song' ? 'songs' : type === 'album' ? 'albums' : 'artists'
	const group = results[groupName]
	const data = group && typeof group === 'object'
		? (group as Record<string, unknown>).data
		: Array.isArray(group) ? group : []

	if (!Array.isArray(data)) return []

	return data.map((value) => {
		const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
		const attrs = item.attributes && typeof item.attributes === 'object'
			? item.attributes as Record<string, unknown>
			: item
		const artwork = attrs.artwork && typeof attrs.artwork === 'object'
			? attrs.artwork as Record<string, unknown>
			: {}
		const editorial = attrs.editorialNotes && typeof attrs.editorialNotes === 'object'
			? attrs.editorialNotes as Record<string, unknown>
			: {}

		const id = String(
			type === 'song'
				? (attrs.trackId ?? item.trackId ?? attrs.id ?? item.id ?? '')
				: type === 'album'
					? (attrs.collectionId ?? item.collectionId ?? attrs.id ?? item.id ?? '')
					: (attrs.artistId ?? item.artistId ?? attrs.id ?? item.id ?? ''),
		)
		if (!id) return null

		return {
			type,
			id,
			name: String(attrs.name ?? item.name ?? item.title ?? item.trackName ?? 'Unknown'),
			artist: String(attrs.artistName ?? item.artistName ?? item.artist ?? ''),
			album: String(attrs.albumName ?? item.albumName ?? item.album ?? ''),
			artUrl: cleanDiscoveryArtwork(artwork.url ?? attrs.artworkUrl100 ?? item.artworkUrl100 ?? item.artUrl ?? item.image),
			duration: Number(attrs.durationInMillis ?? item.durationInMillis ?? attrs.duration ?? item.duration ?? 0) / (attrs.durationInMillis !== undefined || item.durationInMillis !== undefined ? 1000 : 1),
			genre: Array.isArray(attrs.genreNames) ? String(attrs.genreNames[0] ?? '') : String(attrs.genre ?? ''),
			bio: String(editorial.short ?? editorial.standard ?? ''),
		}
	}).filter((item): item is DiscoveryResource => Boolean(item))
}

const parseCatalogResources = (input: unknown): DiscoveryResource[] => {
	if (!input || typeof input !== 'object') return []
	const root = input as Record<string, unknown>
	const data = Array.isArray(root.data) ? root.data : []
	return data.map((value) => {
		if (!value || typeof value !== 'object') return null
		const item = value as Record<string, unknown>
		const attrs = item.attributes && typeof item.attributes === 'object' ? item.attributes as Record<string, unknown> : {}
		const type = item.type === 'songs' ? 'song' : item.type === 'albums' ? 'album' : item.type === 'artists' ? 'artist' : null
		if (!type || item.id == null) return null
		const artwork = attrs.artwork && typeof attrs.artwork === 'object' ? attrs.artwork as Record<string, unknown> : {}
		const name = String(attrs.name ?? item.name ?? '')
		if (!name) return null
		return {
			type,
			id: String(item.id),
			name,
			artist: String(attrs.artistName ?? ''),
			album: String(attrs.albumName ?? (type === 'album' ? name : '')),
			artUrl: cleanDiscoveryArtwork(artwork.url ?? attrs.artworkUrl100 ?? ''),
			duration: Number(attrs.durationInMillis ?? attrs.duration ?? 0) / (attrs.durationInMillis !== undefined ? 1000 : 1),
			genre: Array.isArray(attrs.genreNames) ? String(attrs.genreNames[0] ?? '') : '',
			bio: '',
		}
	}).filter((item): item is DiscoveryResource => Boolean(item))
}

export const parseDiscoveryResults = (input: unknown): DiscoveryResource[] => [
	...parseDiscoveryGroup(input, 'song'),
	...parseDiscoveryGroup(input, 'album'),
	...parseDiscoveryGroup(input, 'artist'),
	...parseCatalogResources(input),
]

export const searchDiscovery = async (query: string, limit = 50) => {
	// Apple Music Catalog Search rejects limit values above 50.
	const safeLimit = Math.min(Math.max(1, limit), 50)
	const attempts: SpicyApiParams[] = [
		{ term: query, limit: safeLimit, offset: 0 },
		{ term: query, l: 'en-US', limit: safeLimit, offset: 0 },
		{ term: query, types: 'songs,albums,artists', limit: safeLimit, offset: 0 },
	]

	let lastError: unknown = null

	// Do not send the combined legacy parameter set by default. Current
	// SpicyAMLL deployments can reject unsupported search parameters with 400.
	for (const params of attempts) {
		try {
			const response = await spicyamll.catalogSearch('us', params)
			const results = parseDiscoveryResults(response)
			if (results.length) return results
		} catch (error) {
			lastError = error
		}
	}

	// Compatibility fallback for older SpicyAMLL deployments.
	for (const params of [
		{ term: query, limit: safeLimit },
		{ q: query, limit: safeLimit },
		{ query, limit: safeLimit },
	]) {
		try {
			const response = await spicyamll.search(params)
			const results = parseDiscoveryResults(response)
			if (results.length) return results
		} catch (error) {
			lastError = error
		}
	}

	throw lastError instanceof Error ? lastError : new Error('SpicyAMLL search failed')
}

export const normalizeTracks = (input: unknown): SpicyTrack[] => {
	const root = unwrap<unknown>(input)
	const items: Record<string, unknown>[] = []

	const collect = (value: unknown) => {
		if (Array.isArray(value)) {
			for (const item of value) collect(item)
			return
		}
		if (!value || typeof value !== 'object') return

		const record = value as Record<string, unknown>
		if (
			record.id !== undefined ||
			record.songId !== undefined ||
			record.trackId !== undefined ||
			record.musicId !== undefined
		) {
			items.push(record)
			return
		}
		for (const child of Object.values(record)) collect(child)
	}

	collect(root)

	return items
		.map((item, index) => {
			const attributes =
				item.attributes && typeof item.attributes === 'object'
					? (item.attributes as Record<string, unknown>)
					: {}
			const artwork =
				attributes.artwork && typeof attributes.artwork === 'object'
					? (attributes.artwork as Record<string, unknown>)
					: {}
			const artworkUrl = String(
				artwork.url ?? item.image ?? item.artwork ?? item.cover ?? item.coverUrl ?? '',
			)
				.replace('{w}', '600')
				.replace('{h}', '600')
				.replace('{f}', 'jpg')

			const artistName = String(attributes.artistName ?? item.artist ?? item.artistName ?? '')
			const albumName = String(attributes.albumName ?? item.album ?? item.albumName ?? '')
			const rawId = item.id ?? item.songId ?? item.song_id ?? item.trackId ?? item.musicId
			const parsedId = rawId !== undefined && rawId !== null && rawId !== '' ? rawId : index

			return {
				...item,
				id: typeof parsedId === 'number' ? parsedId : String(parsedId),
				name: String(attributes.name ?? item.name ?? item.title ?? item.songName ?? 'Unknown'),
				artist: artistName,
				artists: artistName
					? [artistName]
					: Array.isArray(item.artists)
						? item.artists.map(String)
						: [],
				album: albumName,
				albumName,
				image: artworkUrl,
				duration:
					Number(attributes.durationInMillis ?? item.duration ?? item.durationSeconds ?? 0) /
					(attributes.durationInMillis !== undefined ? 1000 : 1),
				year: attributes.releaseDate
					? String(attributes.releaseDate).slice(0, 4)
					: (item.year as string | number | undefined),
			}
		})
		.filter((track) => track.id !== undefined && track.id !== null && track.id !== '')
}

export const searchArtists = async (query: string) => {
	const candidates = [{ artist: query }, { name: query }, { query }, { q: query }]
	for (const params of candidates) {
		try {
			const value = normalizeTracks(await spicyamll.artist(params))
			if (value.length) return value
		} catch {}
	}
	return []
}

export const searchAlbums = async (query: string) => {
	// Prefer the discovery parser because it understands Apple Music album
	// resources and their string collection IDs.
	try {
		const results = await searchDiscovery(query)
		const albums = results.filter((result) => result.type === 'album')
		if (albums.length) {
			return albums.map((album) => ({
				id: album.id,
				name: album.name,
				artist: album.artist,
				artists: album.artist ? [album.artist] : [],
				album: album.name,
				albumName: album.name,
				image: album.artUrl,
			}))
		}
	} catch {}

	// Fallback to direct album endpoint variants.
	const candidates = [{ id: query }, { album: query }, { name: query }, { q: query }]
	for (const params of candidates) {
		try {
			const value = normalizeTracks(await spicyamll.album(params))
			if (value.length) return value
		} catch {}
	}
	return []
}

export const getSongsForArtist = async (artistId: string | number, artistName?: string) => {
	const candidates = [
		{ artist: artistId },
		{ id: artistId },
		{ artistId },
		...(artistName ? [{ name: artistName }, { artist: artistName }] : []),
	]
	for (const params of candidates) {
		try {
			const value = normalizeTracks(await spicyamll.artistSongs(params))
			if (value.length) return value
		} catch {}
	}
	return []
}

export const searchCatalog = async (query: string) => {
	const params = {
		term: query,
		l: 'en-US',
		limit: 25,
		offset: 0,
	}

	try {
		const response = await spicyamll.search(params)
		const tracks = normalizeTracks(response)
		if (tracks.length) return tracks
	} catch {}

	const response = await spicyamll.catalogSearch('us', params)
	return normalizeTracks(response)
}
