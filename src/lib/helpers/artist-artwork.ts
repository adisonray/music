import { dbGetArtistTracksIdsByName } from '$lib/library/get/ids'
import { getLibraryValue } from '$lib/library/get/value'
import { UNKNOWN_ITEM } from '$lib/library/types.ts'

const pendingRequests = new Map<string, Promise<string | undefined>>()

const getStorageKey = (artist: string) => `snaeplayer-artist-artwork.${artist}`

type CachedArtwork =
	| { type: 'image'; value: string; timestamp: number }
	| { type: 'none'; timestamp: number }

const safeSetStorage = (key: string, value: CachedArtwork) => {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Artwork caching is optional.
	}
}

const safeGetStorage = (key: string): CachedArtwork | null => {
	try {
		const raw = localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as CachedArtwork) : null
	} catch {
		return null
	}
}

/**
 * Resolve artist artwork only from the user's local library.
 *
 * The old implementation queried TheAudioDB and retried failed requests,
 * which made artist cards/profile artwork depend on an unreliable external
 * service. Library tracks already contain the artwork we need, so use that
 * as the single source of truth instead.
 */
export const getArtistArtwork = async (artist: string): Promise<string | undefined> => {
	if (!artist || artist === UNKNOWN_ITEM) {
		return undefined
	}

	const key = getStorageKey(artist)
	const cached = safeGetStorage(key)

	if (cached?.type === 'image') {
		return cached.value
	}

	const FIVE_MINUTES = 5 * 60 * 1000
	if (cached?.type === 'none' && Date.now() - cached.timestamp < FIVE_MINUTES) {
		return undefined
	}

	const pending = pendingRequests.get(artist)
	if (pending) {
		return pending
	}

	const request = (async () => {
		try {
			const trackIds = await dbGetArtistTracksIdsByName(artist)

			for (const trackId of trackIds.slice(0, 8)) {
				const track = await getLibraryValue('tracks', trackId, true)
				const artwork = track?.image?.small ?? track?.image?.full

				if (artwork instanceof Blob) {
					// Blob URLs are only valid for the current document, so never
					// persist them in localStorage.
					return URL.createObjectURL(artwork)
				}

				if (typeof artwork === 'string' && artwork) {
					safeSetStorage(key, {
						type: 'image',
						value: artwork,
						timestamp: Date.now(),
					})
					return artwork
				}
			}
		} catch {
			// Missing local artwork is a normal state.
		}

		safeSetStorage(key, {
			type: 'none',
			timestamp: Date.now(),
		})
		return undefined
	})()

	pendingRequests.set(artist, request)

	try {
		return await request
	} finally {
		pendingRequests.delete(artist)
	}
}
