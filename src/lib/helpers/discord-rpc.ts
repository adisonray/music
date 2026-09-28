export interface DiscordPresencePayload {
	title: string
	artist: string
	album?: string
	artwork?: string
	playing: boolean
	position: number
	duration: number
	url?: string
}

export interface AdiMusicRpcState {
	playing: boolean
	title: string
	artist: string
	album?: string
	artwork?: string
	position: number
	duration: number
	url: string
}

declare global {
	interface Window {
		__ADI_MUSIC_RPC__?: AdiMusicRpcState
		adiNative?: {
			platform: string
			isDesktop: boolean
			discord: {
				setPresence: (presence: AdiMusicRpcState) => void
				clearPresence: () => void
			}
			media: {
				setNowPlaying: (metadata: AdiMusicRpcState) => void
			}
		}
	}
}

const SITE_ORIGIN = 'https://music.imreallyadi.space'

let lastState: string | null = null

const getState = (payload: DiscordPresencePayload): AdiMusicRpcState => ({
	playing: payload.playing,
	title: payload.title,
	artist: payload.artist,
	album: payload.album || undefined,
	artwork: payload.artwork || undefined,
	position: Number.isFinite(payload.position) ? Math.max(0, payload.position) : 0,
	duration: Number.isFinite(payload.duration) ? Math.max(0, payload.duration) : 0,
	url: payload.url || window.location.href || SITE_ORIGIN,
})

const publish = (state: AdiMusicRpcState | undefined): void => {
	if (typeof window === 'undefined') return

	if (!state) {
		if (window.__ADI_MUSIC_RPC__ !== undefined) {
			delete window.__ADI_MUSIC_RPC__
			window.adiNative?.discord.clearPresence()
			window.dispatchEvent(new CustomEvent('adi-music-rpc', { detail: null }))
		}
		lastState = null
		return
	}

	const positionBucket = Math.floor(state.position / 2)
	const normalized = JSON.stringify({ ...state, position: positionBucket })

	if (normalized === lastState) return

	lastState = normalized
	window.__ADI_MUSIC_RPC__ = state
	window.adiNative?.discord.setPresence(state)
	window.adiNative?.media.setNowPlaying(state)
	window.dispatchEvent(new CustomEvent('adi-music-rpc', { detail: state }))
}

export const updateDiscordPresence = (payload: DiscordPresencePayload): void => {
	publish(getState(payload))
}

export const clearDiscordPresence = (): void => {
	publish(undefined)
}
