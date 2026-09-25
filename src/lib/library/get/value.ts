import { WeakLRUCache } from 'weak-lru-cache'
import { type DbKey, getDatabase } from '$lib/db/database.ts'
import { type DatabaseChangeDetails, onDatabaseChange } from '$lib/db/events.ts'
import type { Album, Artist, Playlist, Track } from '$lib/library/types.ts'
import { FAVORITE_PLAYLIST_ID, FAVORITE_PLAYLIST_UUID, type LibraryStoreName } from '../types.ts'
import { getSongDetails } from '$lib/services/jiosaavn.ts'

const idToUuidMap = new Map<number, string>()
const remoteTrackMap = new Map<number, TrackData>()
const REMOTE_TRACK_STORAGE_PREFIX = 'adi_music_remote_track:'

const LOCAL_TRACK_ALIAS_PREFIX = 'adi_music_local_track_alias:'

const getPersistedLocalTrackAlias = (sourceId: number): number | undefined => {
	if (typeof window === 'undefined' || sourceId >= 0) return undefined

	try {
		const id = Number(localStorage.getItem(LOCAL_TRACK_ALIAS_PREFIX + sourceId) || '')
		return Number.isFinite(id) && id > 0 ? id : undefined
	} catch {
		return undefined
	}
}


const recoverRemoteTrack = async (id: number): Promise<TrackData | undefined> => {
	if (typeof window === 'undefined' || id >= 0) return undefined

	try {
		const [{ getRecentlyPlayed }, { parseDiscoveryResults, spicyamll }] = await Promise.all([
			import('$lib/services/library.ts'),
			import('$lib/services/spicyamll.ts'),
		])

		const history = getRecentlyPlayed(100)
		const recent = history.find((item) => String(item.trackId) === String(id))
		if (!recent) return undefined

		const response = await spicyamll.search({
			term: recent.name + ' ' + recent.artist,
			types: 'songs',
			limit: 10,
		})
		const songs = parseDiscoveryResults(response).filter((item) => item.type === 'song')
		const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
		const name = normalize(recent.name)
		const artist = normalize(recent.artist)
		const match =
			songs.find((song) => normalize(song.name) === name && normalize(song.artist) === artist) ??
			songs.find((song) => normalize(song.name) === name)

		if (!match) return undefined

		const recovered: TrackData = {
			id,
			remoteId: Number(match.id) || 0,
			streaming: true,
			uuid: 'spicyamll:' + match.id,
			name: match.name,
			album: match.album || '~\\0unknown',
			artists: match.artist ? [match.artist] : ['Unknown Artist'],
			year: '~\\0unknown',
			duration: 0,
			genre: [],
			trackNo: 0,
			trackOf: 0,
			discNo: 0,
			discOf: 0,
			language: undefined,
			image: match.artUrl
				? { optimized: false, small: match.artUrl, full: match.artUrl }
				: undefined,
			file: undefined,
			directory: undefined,
			fileName: undefined,
			scannedAt: Date.now(),
			url: spicyamll.streamUrl(match.id, {
				codec: 'aac',
				fallback: true,
				language: 'en-US',
			}),
			favorite: false,
			type: 'track',
		}

		registerRemoteTrack(recovered)
		const db = await getDatabase()
		const favorite = await db.getFromIndex('playlistEntries', 'playlistTrack', [
			FAVORITE_PLAYLIST_ID,
			id,
		])
		return { ...recovered, favorite: !!favorite }
	} catch {
		return undefined
	}
}

const getPersistedRemoteTrack = (id: number): TrackData | undefined => {
	if (typeof window === 'undefined' || id >= 0) return undefined

	try {
		const raw = localStorage.getItem(REMOTE_TRACK_STORAGE_PREFIX + id)
		if (!raw) return undefined
		return JSON.parse(raw) as TrackData
	} catch {
		return undefined
	}
}

/** @public */
export const registerRemoteId = (id: number, uuid: string) => {
	idToUuidMap.set(id, uuid)
}

/** @public */
export const registerRemoteTrack = (track: Omit<TrackData, 'id'> & { id: number }) => {
	const value = track as TrackData
	remoteTrackMap.set(track.id, value)

	// Remote tracks are not stored in IndexedDB, so keep their metadata locally.
	// This lets playlist entries containing negative remote IDs survive a reload.
	if (typeof window !== 'undefined' && track.id < 0) {
		try {
			localStorage.setItem(REMOTE_TRACK_STORAGE_PREFIX + track.id, JSON.stringify(value))
		} catch {
			// Storage quota/private-mode failures should never block playback.
		}
	}
}

/** @public */
export const unregisterRemoteTrack = (id: number) => {
	remoteTrackMap.delete(id)
}

type CacheKey<Store extends LibraryStoreName> = `${Store}:${string}`

const getCacheKey = <Store extends LibraryStoreName>(
	storeName: Store,
	key: DbKey<Store>,
): CacheKey<Store> => `${storeName}:${key}`

interface QueryConfig<Result> {
	fetch: (id: number) => Promise<Result | undefined>
	shouldRefetch: (
		itemId: number | undefined,
		changes: readonly DatabaseChangeDetails[],
	) => boolean
}

const defaultRefreshOnDatabaseChanges = (
	storeName: LibraryStoreName,
	itemId: number | undefined,
	changes: readonly DatabaseChangeDetails[],
) => {
	for (const change of changes) {
		if (change.storeName === storeName) {
			if (itemId === undefined) {
				return true
			}

			if (change.key === itemId) {
				return true
			}
		}
	}

	return false
}

export interface TrackData extends Track {
	type: 'track'
	favorite: boolean
}

const trackConfig: QueryConfig<TrackData> = {
	fetch: async (id) => {
		if (id < 0) {
			const localAlias = getPersistedLocalTrackAlias(id)
			if (localAlias) {
				const localTrack = await trackConfig.fetch(localAlias)
				if (localTrack) return localTrack
			}

			const remote = remoteTrackMap.get(id) ?? getPersistedRemoteTrack(id)
			if (remote) {
				remoteTrackMap.set(id, remote)
				const db = await getDatabase()
				const favorite = await db.getFromIndex('playlistEntries', 'playlistTrack', [
					FAVORITE_PLAYLIST_ID,
					id,
				])
				return { ...remote, favorite: !!favorite }
			}

			const recovered = await recoverRemoteTrack(id)
			if (recovered) return recovered

			const uuid = idToUuidMap.get(id)
			if (uuid) {
				const details = await getSongDetails(uuid)
				if (details) {
					return {
						...details,
						type: 'track',
						favorite: false,
					} as TrackData
				}
			}
			return undefined
		}

		const db = await getDatabase()
		const tx = db.transaction(['tracks', 'playlistEntries'], 'readonly')

		const [item, favorite] = await Promise.all([
			tx.objectStore('tracks').get(id),
			tx
				.objectStore('playlistEntries')
				.index('playlistTrack')
				.get([FAVORITE_PLAYLIST_ID, id]),
		])

		if (!item) {
			return undefined
		}

		return {
			...item,
			type: 'track',
			favorite: !!favorite,
		} as TrackData
	},
	shouldRefetch: (itemId, changes) => {
		for (const change of changes) {
			if (change.storeName === 'playlistEntries') {
				const playlistEntry = change.value

				if (
					playlistEntry.playlistId === FAVORITE_PLAYLIST_ID &&
					itemId === playlistEntry.trackId
				) {
					return true
				}
			}

			if (change.storeName === 'tracks' && change.key === itemId) {
				return true
			}
		}

		return false
	},
}

const dbGetValue = async <Store extends LibraryStoreName, const T extends string>(
	storeName: Store,
	type: T,
	id: number,
) => {
	const db = await getDatabase()
	const value = await db.get(storeName, id)
	if (!value) {
		return undefined
	}

	return {
		...value,
		type,
	}
}

export interface AlbumData extends Album {
	type: 'album'
}

const albumConfig: QueryConfig<AlbumData> = {
	fetch: (id) => dbGetValue('albums', 'album', id),
	shouldRefetch: defaultRefreshOnDatabaseChanges.bind(null, 'albums'),
}
export interface ArtistData extends Artist {
	type: 'artist'
}

const artistConfig: QueryConfig<ArtistData> = {
	fetch: (id) => dbGetValue('artists', 'artist', id),
	shouldRefetch: defaultRefreshOnDatabaseChanges.bind(null, 'artists'),
}

export interface PlaylistData extends Playlist {
	type: 'playlist'
}

const playlistsConfig: QueryConfig<PlaylistData> = {
	fetch: (id) => {
		if (id === FAVORITE_PLAYLIST_ID) {
			const favoritePlaylist: PlaylistData = {
				type: 'playlist',
				id: FAVORITE_PLAYLIST_ID,
				uuid: FAVORITE_PLAYLIST_UUID,
				name: m.favorites(),
				description: '',
				createdAt: 0,
			}

			return Promise.resolve(favoritePlaylist)
		}

		return dbGetValue('playlists', 'playlist', id)
	},
	shouldRefetch: defaultRefreshOnDatabaseChanges.bind(null, 'playlists'),
}

interface LibraryValueMap {
	tracks: TrackData
	albums: AlbumData
	artists: ArtistData
	playlists: PlaylistData
}

type LibraryValue<Store extends LibraryStoreName = LibraryStoreName> = LibraryValueMap[Store]

type LibraryConfigMap = {
	[Store in LibraryStoreName]: QueryConfig<LibraryValue<Store>>
}

const libraryConfigMap = {
	tracks: trackConfig,
	albums: albumConfig,
	artists: artistConfig,
	playlists: playlistsConfig,
} satisfies LibraryConfigMap

type LibraryCachedValue<Store extends LibraryStoreName = LibraryStoreName> =
	| LibraryValue<Store>
	| Promise<LibraryValue<Store> | undefined>

class LibraryValueCache {
	#cache = new WeakLRUCache<CacheKey<LibraryStoreName>, LibraryCachedValue<LibraryStoreName>>({
		cacheSize: 10_000,
	})

	get<Store extends LibraryStoreName>(key: CacheKey<Store>) {
		return this.#cache.getValue(key) as LibraryCachedValue<Store> | undefined
	}

	set<Store extends LibraryStoreName>(
		key: CacheKey<Store>,
		value: LibraryCachedValue<Store> | undefined,
	) {
		if (value) {
			this.#cache.setValue(key, value)
		} else {
			this.delete(key)
		}
	}

	delete<Store extends LibraryStoreName>(key: CacheKey<Store>) {
		this.#cache.delete(key)
	}

	clear() {
		this.#cache.clear()
	}
}

// Fast in memory cache for `items`, so we do not need to
// call indexed db for every access.
// IMPORTANT. Only store whole library items in here.
const valueCache = new LibraryValueCache()

if (import.meta.env.DEV) {
	// @ts-expect-error used for debugging
	globalThis.libraryValueCache = valueCache
}

if (!import.meta.env.SSR) {
	onDatabaseChange((changes) => {
		for (const change of changes) {
			const { storeName } = change

			if (
				storeName === 'tracks' ||
				storeName === 'albums' ||
				storeName === 'artists' ||
				storeName === 'playlists'
			) {
				if (change.operation === 'delete' || change.operation === 'update') {
					const cacheKey = getCacheKey(storeName, change.key)
					valueCache.delete(cacheKey)
				}
			} else if (storeName === 'playlistEntries') {
				const playlistEntry = change.value

				if (playlistEntry.playlistId === FAVORITE_PLAYLIST_ID) {
					const cacheKey = getCacheKey('tracks', playlistEntry.trackId)
					valueCache.delete(cacheKey)
				}
			}
		}
	})
}

export class LibraryValueNotFoundError extends Error {
	constructor(cacheKey: CacheKey<LibraryStoreName>) {
		super(`Value not found. Cache key: ${cacheKey}`)
		this.name = 'LibraryValueNotFoundError'
	}
}

const assertsValue = <T, AllowEmpty extends boolean = false>(
	value: T,
	allowEmpty: AllowEmpty | undefined,
	cacheKey: CacheKey<LibraryStoreName>,
) => {
	if (!(value || allowEmpty)) {
		throw new LibraryValueNotFoundError(cacheKey)
	}

	return value
}

const getCachedOrFetchValue = <Store extends LibraryStoreName>(
	key: CacheKey<Store>,
	fetchValue: () => Promise<GetLibraryValueResult<Store> | undefined>,
): LibraryValue<Store> | Promise<LibraryValue<Store> | undefined> => {
	const cachedValue = valueCache.get(key)
	if (cachedValue) {
		return cachedValue
	}

	const promise = fetchValue()
		.then((value) => {
			valueCache.set(key, value)

			return value
		})
		.catch((error) => {
			valueCache.delete(key)
			throw error
		})

	valueCache.set(key, promise)

	return promise
}

export type GetLibraryValueResult<
	Store extends LibraryStoreName,
	AllowEmpty extends boolean = false,
> = AllowEmpty extends true ? LibraryValue<Store> | undefined : LibraryValue<Store>

/** @public */
export const getLibraryValue = <Store extends LibraryStoreName, AllowEmpty extends boolean = false>(
	storeName: Store,
	id: number,
	allowEmpty?: AllowEmpty,
): Promise<GetLibraryValueResult<Store, AllowEmpty>> | GetLibraryValueResult<Store, AllowEmpty> => {
	const key = getCacheKey(storeName, id)
	const result = getCachedOrFetchValue(key, () => {
		const config: LibraryConfigMap[Store] = libraryConfigMap[storeName]

		return config.fetch(id)
	})

	if (result instanceof Promise) {
		const promiseResult = result.then((value) =>
			assertsValue(value, allowEmpty, key),
		) as Promise<GetLibraryValueResult<Store, AllowEmpty>>

		return promiseResult
	}

	return assertsValue(result, allowEmpty, key)
}

/** @public */
export const preloadLibraryValue = async (
	storeName: LibraryStoreName,
	id: number,
): Promise<void> => {
	try {
		// this will fetch data and store it inside cache
		await getLibraryValue(storeName, id)
	} catch {
		// Ignore
	}
}

/** @public */
export const setLibraryValueInCache = <Store extends LibraryStoreName>(
	storeName: Store,
	id: number,
	value: LibraryValue<Store>,
) => {
	const key = getCacheKey(storeName, id)
	valueCache.set(key, value)
}

export const shouldRefetchLibraryValue = (
	storeName: LibraryStoreName,
	id: number | undefined,
	changes: readonly DatabaseChangeDetails[],
): boolean => {
	const config = libraryConfigMap[storeName]

	return config.shouldRefetch(id, changes)
}

/** @private - Used for testing only */
export const clearLibraryValueCache = () => {
	valueCache.clear()
}
