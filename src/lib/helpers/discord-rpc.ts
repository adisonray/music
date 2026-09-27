export interface DiscordPresencePayload {
	title: string
	artist: string
	album?: string
	playing: boolean
	position: number
	duration: number
}

const BRIDGE_URL = 'http://127.0.0.1:6463'
const REQUEST_TIMEOUT = 1500

let lastPayload: string | null = null
let lastSentAt = 0
let clearSentAt = 0

const post = async (path: string, body?: unknown): Promise<boolean> => {
	if (typeof window === 'undefined') return false

	const controller = new AbortController()
	const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

	try {
		const response = await fetch(`${BRIDGE_URL}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: controller.signal,
		})

		return response.ok
	} catch {
		return false
	} finally {
		window.clearTimeout(timeout)
	}
}

export const updateDiscordPresence = (payload: DiscordPresencePayload): void => {
	const positionBucket = Math.floor(Math.max(0, payload.position) / 5) * 5
	const normalized = JSON.stringify({
		...payload,
		position: positionBucket,
		duration: Math.max(0, Math.floor(payload.duration)),
	})

	const now = Date.now()
	if (normalized === lastPayload && now - lastSentAt < 5000) return

	lastPayload = normalized
	lastSentAt = now
	clearSentAt = 0
	void post('/v1/presence', payload)
}

export const clearDiscordPresence = (): void => {
	const now = Date.now()
	if (now - clearSentAt < 5000) return

	lastPayload = null
	clearSentAt = now
	void post('/v1/presence/clear')
}
