import type { DiscoveryResource } from './spicyamll.ts'

const CACHE_KEY = 'adi_music_discovery_recommendations_v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface DiscoveryRecommendationCache {
	cachedAt: number
	topPicks: DiscoveryResource[]
	recommendations: DiscoveryResource[]
}

const isBrowser = () => typeof window !== 'undefined'

export const getCachedDiscoveryRecommendations = (): DiscoveryRecommendationCache | null => {
	if (!isBrowser()) return null

	try {
		const raw = localStorage.getItem(CACHE_KEY)
		if (!raw) return null

		const cached = JSON.parse(raw) as Partial<DiscoveryRecommendationCache>
		if (
			!cached.cachedAt ||
			!Array.isArray(cached.topPicks) ||
			!Array.isArray(cached.recommendations)
		) {
			localStorage.removeItem(CACHE_KEY)
			return null
		}

		if (Date.now() - cached.cachedAt >= CACHE_TTL_MS) {
			localStorage.removeItem(CACHE_KEY)
			return null
		}

		return {
			cachedAt: cached.cachedAt,
			topPicks: cached.topPicks,
			recommendations: cached.recommendations,
		}
	} catch {
		localStorage.removeItem(CACHE_KEY)
		return null
	}
}

export const cacheDiscoveryRecommendations = (
	topPicks: DiscoveryResource[],
	recommendations: DiscoveryResource[],
): void => {
	if (!isBrowser()) return

	try {
		const value: DiscoveryRecommendationCache = {
			cachedAt: Date.now(),
			topPicks,
			recommendations,
		}

		localStorage.setItem(CACHE_KEY, JSON.stringify(value))
	} catch {
		// Quota/private-mode failures should not prevent Discovery from loading.
	}
}

export const clearDiscoveryRecommendationCache = (): void => {
	if (!isBrowser()) return
	localStorage.removeItem(CACHE_KEY)
}

export const DISCOVERY_RECOMMENDATION_CACHE_TTL_MS = CACHE_TTL_MS
