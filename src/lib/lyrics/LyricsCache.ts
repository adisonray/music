import { getDatabase } from '$lib/db/database.ts'

export const CACHE_VERSION = 16
export const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export interface CachedLyricsResult {
	status: 'found' | 'not-found' | 'instrumental' | 'error'
	source?: string
	ttml?: string
	syncType?: 'karaoke' | 'line' | 'plain'
	language?: string
}

export function getTrackProvider(trackId: number): string {
	if (typeof window === 'undefined') return 'auto'
	try {
		return localStorage.getItem(`snaeplayer-lyrics-provider-${trackId}`) || 'auto'
	} catch {
		return 'auto'
	}
}

export function setTrackProvider(trackId: number, provider: string): void {
	if (typeof window === 'undefined') return
	try {
		localStorage.setItem(`snaeplayer-lyrics-provider-${trackId}`, provider)
	} catch {}
}

export function clearTrackProvider(trackId: number): void {
	if (typeof window === 'undefined') return
	try {
		localStorage.removeItem(`snaeplayer-lyrics-provider-${trackId}`)
	} catch {}
}

export class LyricsCache {
	static async get(
		trackId: number,
		provider: string = 'auto',
		language?: string,
	): Promise<CachedLyricsResult | undefined> {
		try {
			const db = await getDatabase()
			const cacheKey = `${trackId}:${provider}`
			let cached = await db.get('lyrics', cacheKey as any)

			if (!cached && provider === 'auto') {
				cached = await db.get('lyrics', trackId as any)
			}

			if (!(cached && (cached as any).version) || (cached as any).version !== CACHE_VERSION) {
				return undefined
			}

			const isUploaded = (cached.data as any)?.source === 'uploaded'
			if (!isUploaded && Date.now() - cached.cachedAt > CACHE_TTL_MS) {
				return undefined
			}
			if (!isUploaded && language && (cached.data as CachedLyricsResult).language !== language) {
				return undefined
			}

			return cached.data as CachedLyricsResult
		} catch {
			return undefined
		}
	}

	static async set(
		trackId: number,
		data: CachedLyricsResult,
		provider?: string,
	): Promise<void> {
		try {
			const db = await getDatabase()
			const targetProvider = provider || data.source || 'auto'
			const cacheKey = `${trackId}:${targetProvider}`
			await db.put('lyrics', {
				trackId: cacheKey,
				data,
				version: CACHE_VERSION,
				cachedAt: Date.now(),
			} as any)
		} catch {}
	}

	static async clearForTrack(trackId: number): Promise<void> {
		clearTrackProvider(trackId)
		try {
			const db = await getDatabase()
			const keys = await db.getAllKeys('lyrics')
			const trackIdStr = String(trackId)
			for (const key of keys) {
				const keyStr = String(key)
				if (keyStr === trackIdStr || keyStr.startsWith(`${trackIdStr}:`)) {
					await db.delete('lyrics', key as any)
				}
			}
		} catch {}
	}
}
