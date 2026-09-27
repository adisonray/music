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
	contentRating?: string
	isExplicit?: boolean
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
	artist: (params: SpicyApiParams) => request<unknown>('/artist', params).then(unwrap),
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
	artistAlbums: (params: SpicyApiParams) => request<unknown>('/artist/albums', params).then(unwrap),
	artistSongs: (params: SpicyApiParams) => request<unknown>('/artist/songs', params).then(unwrap),
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

const cleanDiscoveryArtwork = (url: unknown, size = 400) => {
	if (typeof url !== 'string' || !url.trim()) return ''
	return url
		.trim()
		.replace(/\{w\}/g, String(size))
		.replace(/\{h\}/g, String(size))
		.replace(/\{c\}/g, 'bb')
		.replace(/\{f\}/g, 'jpg')
		.replace(/\d+x\d+bb\./, `${size}x${size}bb.`)
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

export const parseDiscoveryResults = (input: unknown): DiscoveryResource[] => {
	const songs = parseDiscoveryGroup(input, 'song')
	const albums = parseDiscoveryGroup(input, 'album')
	const artists = parseDiscoveryGroup(input, 'artist')
	const catalog = parseCatalogResources(input)
	const all = [...songs, ...albums, ...artists, ...catalog]

	// Apple Music can omit artwork on artist resources and some catalog
	// deployments omit it on album resources. Reuse artwork from a matching
	// song/album in the same response instead of sending a broken placeholder.
	const artworkByArtist = new Map<string, string>()
	const artworkByAlbum = new Map<string, string>()
	for (const item of all) {
		const art = item.artUrl
		if (!art) continue
		if (item.artist) artworkByArtist.set(item.artist.trim().toLowerCase(), art)
		if (item.album) artworkByAlbum.set(item.album.trim().toLowerCase(), art)
		if (item.type === 'album') artworkByAlbum.set(item.name.trim().toLowerCase(), art)
	}
	// Prefer explicit recordings when Apple Music returns both explicit and clean
	// versions of the same song. If only a clean recording exists, omit it rather
	// than silently presenting a censored version.
	const songGroups = new Map<string, DiscoveryResource[]>()
	for (const item of all) {
		if (item.type !== 'song') continue
		const key = [item.name.trim().toLowerCase(), item.artist.trim().toLowerCase()].join('|')
		const group = songGroups.get(key) ?? []
		group.push(item)
		songGroups.set(key, group)
	}
	const hiddenSongIds = new Set<string>()
	for (const group of songGroups.values()) {
		const explicit = group.filter((item) => {
			const raw = item as DiscoveryResource & { contentRating?: string }
			return raw.contentRating?.toLowerCase() === 'explicit'
		})
		if (explicit.length) {
			for (const item of group) if (!explicit.includes(item)) hiddenSongIds.add(item.id)
		}
	}

	return all.filter((item) => !hiddenSongIds.has(item.id)).map((item) => {
		if (item.artUrl) return item
		if (item.type === 'artist') {
			return { ...item, artUrl: artworkByArtist.get(item.name.trim().toLowerCase()) ?? '' }
		}
		if (item.type === 'album') {
			return { ...item, artUrl: artworkByAlbum.get(item.name.trim().toLowerCase()) ?? '' }
		}
		return item
	})
}

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
				.replace(/\{w\}/g, '600')
				.replace(/\{h\}/g, '600')
				.replace(/\{c\}/g, 'bb')
				.replace(/\{f\}/g, 'jpg')
				.replace(/\d+x\d+bb\./, '400x400bb.')

			const artistName = String(attributes.artistName ?? item.artist ?? item.artistName ?? '')
			const contentRating = String(attributes.contentRating ?? item.contentRating ?? item.content_rating ?? '')
			const isExplicit = contentRating.toLowerCase() === 'explicit' || item.isExplicit === true || item.isExplicit === 'true'
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
				contentRating,
				isExplicit,
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

const iTunesArtistIdCache = new Map<string, string>()

export const resolveAppleMusicArtistId = async (artistName: string): Promise<string | undefined> => {
	const key = artistName.trim().toLowerCase()
	if (!key) return undefined
	const cached = iTunesArtistIdCache.get(key)
	if (cached) return cached

	try {
		const url = new URL('https://itunes.apple.com/search')
		url.searchParams.set('term', artistName)
		url.searchParams.set('entity', 'musicArtist')
		url.searchParams.set('limit', '10')
		url.searchParams.set('country', 'US')
		const response = await fetch(url, { headers: { Accept: 'application/json' } })
		if (!response.ok) return undefined
		const payload = await response.json() as { results?: Array<Record<string, unknown>> }
		const results = Array.isArray(payload.results) ? payload.results : []
		const exact = results.find((result) =>
			String(result.artistName ?? '').trim().toLowerCase() === key && result.artistId != null,
		)
		const match = exact ?? results.find((result) => result.artistId != null)
		if (!match) return undefined
		const id = String(match.artistId)
		iTunesArtistIdCache.set(key, id)
		return id
	} catch {
		return undefined
	}
}

export interface SpicyArtistProfile {
	id: string
	name: string
	image: string
	genre: string
	bio: string
}

const cleanArtistImage = (value: unknown) => cleanDiscoveryArtwork(value, 400)

const artistProfileCache = new Map<string, { expiresAt: number; value: SpicyArtistProfile }>()
const artistProfilePending = new Map<string, Promise<SpicyArtistProfile>>()
const ARTIST_PROFILE_CACHE_TTL = 60 * 60_000

export const getArtistProfile = async (
	artistId: string | number | undefined,
	artistName: string,
): Promise<SpicyArtistProfile> => {
	const cacheKey = artistName.trim().toLowerCase()
	const cached = artistProfileCache.get(cacheKey)
	if (cached && cached.expiresAt > Date.now()) return cached.value
	if (cached) artistProfileCache.delete(cacheKey)

	const pending = artistProfilePending.get(cacheKey)
	if (pending) return pending

	const request = (async (): Promise<SpicyArtistProfile> => {
	// The canonical artist identifier for SpicyAMLL is the Apple Music/iTunes artistId.
	// Resolve it from iTunes first so local library IDs never get sent as artist IDs.
	const appleMusicArtistId = await resolveAppleMusicArtistId(artistName)
	const canonicalArtistId = appleMusicArtistId ?? artistId
	const candidates: SpicyApiParams[] = [
		...(canonicalArtistId !== undefined ? [{ artist: canonicalArtistId }] : []),
		{ artist: artistName },
		{ name: artistName },
		{ query: artistName },
	]

	for (const params of candidates) {
		try {
			const raw = unwrap<unknown>(await spicyamll.artist(params))
			const values = Array.isArray(raw) ? raw : [raw]

			for (const value of values) {
				if (!value || typeof value !== 'object') continue
				const record = value as Record<string, unknown>
				const attributes =
					record.attributes && typeof record.attributes === 'object'
						? record.attributes as Record<string, unknown>
						: record
				const artwork =
					attributes.artwork && typeof attributes.artwork === 'object'
						? attributes.artwork as Record<string, unknown>
						: {}

				const name = String(attributes.name ?? record.name ?? artistName)
				const id = String(attributes.artistId ?? record.artistId ?? record.id ?? artistId ?? '')
				const image = cleanArtistImage(
					artwork.url ?? attributes.artworkUrl100 ?? attributes.artworkUrl ?? record.image ?? record.artwork,
				)
				const genreNames = Array.isArray(attributes.genreNames) ? attributes.genreNames : []
				const genre = String(attributes.genre ?? genreNames[0] ?? record.genre ?? '')
				const editorial =
					attributes.editorialNotes && typeof attributes.editorialNotes === 'object'
						? attributes.editorialNotes as Record<string, unknown>
						: {}
				const bio = String(
					attributes.bio ??
						attributes.description ??
						editorial.standard ??
						editorial.short ??
						record.bio ??
						'',
				)

				return { id, name, image, genre, bio }
			}
		} catch {}
	}

		const empty: SpicyArtistProfile = {
			id: String(canonicalArtistId ?? ''),
			name: artistName,
			image: '',
			genre: '',
			bio: '',
		}
		return empty
	})()

	artistProfilePending.set(cacheKey, request)
	try {
		const value = await request
		artistProfileCache.set(cacheKey, { value, expiresAt: Date.now() + ARTIST_PROFILE_CACHE_TTL })
		return value
	} finally {
		artistProfilePending.delete(cacheKey)
	}
}

export const getAlbumsForArtist = async (artistId: string | number | undefined, artistName: string) => {
	const appleMusicArtistId = await resolveAppleMusicArtistId(artistName)
	const canonicalArtistId = appleMusicArtistId ?? artistId
	const candidates: SpicyApiParams[] = canonicalArtistId !== undefined
		? [{ artist: canonicalArtistId }]
		: [{ artist: artistName }]
	for (const params of candidates) {
		try {
			const raw = unwrap<unknown>(await spicyamll.artistAlbums(params))
			const values = Array.isArray(raw) ? raw : [raw]
			const albums: Array<{ id: string; name: string; artist: string; image: string; year: string }> = []

			const collect = (value: unknown) => {
				if (Array.isArray(value)) {
					for (const entry of value) collect(entry)
					return
				}
				if (!value || typeof value !== 'object') return
				const record = value as Record<string, unknown>
				const attributes =
					record.attributes && typeof record.attributes === 'object'
						? record.attributes as Record<string, unknown>
						: record
				const type = String(record.type ?? '')
				if (type && type !== 'albums' && type !== 'album' && !record.collectionId && !record.albumId) {
					for (const child of Object.values(record)) collect(child)
					return
				}
				const id = String(record.id ?? attributes.collectionId ?? attributes.albumId ?? record.albumId ?? '')
				const name = String(attributes.name ?? attributes.collectionName ?? record.name ?? record.title ?? '')
				if (!id || !name) {
					for (const child of Object.values(record)) collect(child)
					return
				}
				const artwork =
					attributes.artwork && typeof attributes.artwork === 'object'
						? attributes.artwork as Record<string, unknown>
						: {}
				const image = cleanArtistImage(
					artwork.url ?? attributes.artworkUrl100 ?? record.image ?? record.artwork,
				)
				const releaseDate = String(attributes.releaseDate ?? record.releaseDate ?? attributes.year ?? '')
				albums.push({
					id,
					name,
					artist: String(attributes.artistName ?? record.artist ?? artistName),
					image,
					year: releaseDate.slice(0, 4),
				})
			}
			for (const value of values) collect(value)
			return albums.filter((album, index, all) => all.findIndex((entry) => entry.id === album.id) === index)
		} catch {}
	}
	return []
}

export const getSongsForArtist = async (artistId: string | number | undefined, artistName?: string) => {
	const resolvedId = artistName ? await resolveAppleMusicArtistId(artistName) : undefined
	const canonicalArtistId = resolvedId ?? artistId
	const candidates: SpicyApiParams[] = canonicalArtistId !== undefined
		? [{ artist: canonicalArtistId }]
		: artistName
			? [{ artist: artistName }]
			: []
	for (const params of candidates) {
		try {
			const value = normalizeTracks(await spicyamll.artistSongs(params))
			if (value.length) return value
		} catch {}
	}
	return []
}

const preferExplicitRecordings = (tracks: SpicyTrack[]) => {
	const groups = new Map<string, SpicyTrack[]>()
	for (const track of tracks) {
		const key = [normalizeForSearch(track.name), normalizeForSearch(track.artist ?? track.artists?.join(', '))].join('|')
		const group = groups.get(key) ?? []
		group.push(track)
		groups.set(key, group)
	}

	const selected: SpicyTrack[] = []
	for (const group of groups.values()) {
		const explicit = group.find((track) => track.isExplicit === true || track.contentRating?.toLowerCase() === 'explicit')
		if (explicit) selected.push(explicit)
		else selected.push(...group.filter((track) => track.contentRating?.toLowerCase() !== 'clean' && track.contentRating?.toLowerCase() !== 'censored'))
	}
	return selected
}

const normalizeForSearch = (value: unknown) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\\p{P}\\p{S}]+/gu, ' ').replace(/\\s+/g, ' ').trim()

export const searchCatalog = async (query: string) => {
	const params = {
		term: query,
		l: 'en-US',
		limit: 50,
		offset: 0,
	}

	// The Apple Music catalog response is the authoritative search source for
	// playback IDs. Its song resources use Apple Music track IDs, which are the
	// IDs accepted by SpicyAMLL's /stream endpoint. The legacy /search endpoint
	// can return lyric/provider IDs that look valid but are not streamable.
	try {
		const catalogTracks = normalizeTracks(await spicyamll.catalogSearch('us', params))
		if (catalogTracks.length) return preferExplicitRecordings(catalogTracks)
	} catch {}

	// Keep the legacy endpoint as a compatibility fallback for older
	// SpicyAMLL deployments that do not expose catalog search.
	try {
		const legacyTracks = normalizeTracks(await spicyamll.search(params))
		return preferExplicitRecordings(legacyTracks)
	} catch {
		return []
	}
}
