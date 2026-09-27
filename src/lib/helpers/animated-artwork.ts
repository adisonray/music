import { SerialQueue } from './serial-queue.ts'

const getStorageKey = (artist: string, album: string, title?: string) =>
	`snaeplayer-animated-artwork-v3.${artist}:${album}${title ? `:${title}` : ''}`

const queue = new SerialQueue()

const NONE_CACHE_DURATION = 1000 * 60 * 30 // 30 mins

export interface AnimatedArtwork {
	url: string
	urlTall?: string
}

type CachedArtwork =
	| {
			type: 'image'
			value: AnimatedArtwork
			timestamp: number
	  }
	| {
			type: 'none'
			timestamp: number
	  }

const pendingRequests = new Map<string, Promise<AnimatedArtwork | undefined>>()

const safeSetStorage = (key: string, value: CachedArtwork) => {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch (error) {
		console.warn(`[Storage Warning] Failed to cache ${key}`, error)
	}
}

const safeGetStorage = (key: string): CachedArtwork | null => {
	try {
		const raw = localStorage.getItem(key)
		if (!raw) return null
		return JSON.parse(raw) as CachedArtwork
	} catch {
		return null
	}
}

export const getAnimatedArtwork = async (
	artist: string,
	album: string,
	title?: string,
): Promise<AnimatedArtwork | undefined> => {
	const key = getStorageKey(artist, album, title)
	const cached = safeGetStorage(key)

	if (cached) {
		if (cached.type === 'image') {
			return cached.value
		}
		if (cached.type === 'none' && Date.now() - cached.timestamp < NONE_CACHE_DURATION) {
			return undefined
		}
	}

	const pending = pendingRequests.get(key)
	if (pending) {
		return pending
	}

	const request = (async () => {
		try {
			return await queue.enqueue(async () => {
				// Re-check cache in case it was populated while waiting in queue
				const cached = safeGetStorage(key)
				if (cached) {
					if (cached.type === 'image') {
						return cached.value
					}
					if (
						cached.type === 'none' &&
						Date.now() - cached.timestamp < NONE_CACHE_DURATION
					) {
						return undefined
					}
				}

				try {
					// Try the exact song first. If the online provider has slightly
					// different title metadata, fall back to the album artwork search.
					const queries: Record<string, string>[] = [{ artist, album }]
					if (title) queries.unshift({ artist, album, title })

					for (const params of queries) {
						const searchParams = new URLSearchParams(params)
						const response = await fetch(
							`https://artwork.m8tec.top/api/v1/artwork/search?${searchParams.toString()}`,
						)

						if (!response.ok) {
							if (response.status !== 404) break
							continue
						}

						const data = (await response.json()) as { url?: string; url_tall?: string }
						if (!data.url) continue

						const result: AnimatedArtwork = {
							url: data.url,
							urlTall: data.url_tall,
						}
						safeSetStorage(key, {
							type: 'image',
							value: result,
							timestamp: Date.now(),
						})
						return result
					}

					safeSetStorage(key, {
						type: 'none',
						timestamp: Date.now(),
					})
				} catch (error) {
					console.error('Failed to fetch animated artwork', error)
				}

				return undefined
			})
		} finally {
			pendingRequests.delete(key)
		}
	})()

	pendingRequests.set(key, request)
	return request
}
