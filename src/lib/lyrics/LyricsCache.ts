import type { Lyric } from '@braccato/parsers'
import { getDatabase } from '$lib/db/database.ts'

export const CACHE_VERSION = 14
export const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export interface CachedLyricsResult {
	status: 'found' | 'not-found' | 'instrumental' | 'error'
	source?: string
	lyrics?: Lyric[]
	syncType?: 'karaoke' | 'line' | 'plain'
}

export class LyricsCache {
	static async get(trackId: number): Promise<CachedLyricsResult | undefined> {
		try {
			const db = await getDatabase()
			const cached = await db.get('lyrics', trackId)

			if (!(cached && (cached as any).version) || (cached as any).version !== CACHE_VERSION) {
				return undefined
			}

			const isUploaded = (cached.data as any)?.source === 'uploaded'
			if (!isUploaded && Date.now() - cached.cachedAt > CACHE_TTL_MS) {
				return undefined
			}

			return cached.data as CachedLyricsResult
		} catch {
			return undefined
		}
	}

	static async set(trackId: number, data: CachedLyricsResult): Promise<void> {
		try {
			const db = await getDatabase()
			await db.put('lyrics', {
				trackId,
				data,
				version: CACHE_VERSION,
				cachedAt: Date.now(),
			} as any)
		} catch {}
	}
}
