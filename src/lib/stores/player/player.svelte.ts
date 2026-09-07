import type { QueryResult } from '$lib/db/query/query.ts'
import { getAnimatedArtwork } from '$lib/helpers/animated-artwork.ts'
import { createManagedArtwork } from '$lib/helpers/create-managed-artwork.svelte'
import { persist } from '$lib/helpers/persist.svelte.ts'
import { clamp } from '$lib/helpers/utils/clamp.ts'
import { debounce } from '$lib/helpers/utils/debounce.ts'
import { formatArtists, truncate } from '$lib/helpers/utils/text.ts'
import { throttle } from '$lib/helpers/utils/throttle.ts'
import { createTrackQuery, type TrackData } from '$lib/library/get/value-queries.ts'
import { dbAddToPlayHistory } from '$lib/library/play-history-actions.ts'
import { UNKNOWN_ITEM } from '$lib/library/types.ts'
import { AudioLoader } from './audio-loader.svelte.js'
import { EqualizerStore } from './equalizer.svelte.js'
import { type PlayTrackOptions, QueueStore } from './queue.svelte.js'

export type { PlayTrackOptions }

export type PlayerRepeat = 'none' | 'one' | 'all'

export const PLAYER_PLAYBACK_RATE_MIN = 0.5
export const PLAYER_PLAYBACK_RATE_MAX = 2

export class PlayerStore {
	readonly #main = useMainStore()

	readonly #audio = new Audio()
	readonly #audioLoader = new AudioLoader((src) => {
		this.#audio.src = src ?? ''
	})
	readonly #queue = new QueueStore()
	readonly equalizer = new EqualizerStore(this.#audio)

	repeat: PlayerRepeat = $state('none')
	playing: boolean = $state(false)
	muted: boolean = $state(false)
	#volume: number = $state(100)

	playbackRate: number = $state(1)
	preservePitch: boolean = $state(true)

	get shuffle(): boolean {
		return this.#queue.shuffle
	}

	get itemsIds(): readonly number[] {
		return this.#queue.itemsIds
	}

	get activeTrackIndex(): number {
		return this.#queue.activeTrackIndex
	}

	get isQueueEmpty(): boolean {
		return this.#queue.isQueueEmpty
	}

	get audioElement(): HTMLAudioElement {
		return this.#audio
	}

	loading: boolean = $derived(this.#audioLoader.loading)

	currentTime: number = $state(0)
	duration: number = $state(0)

	get volume(): number {
		return this.#main.volumeSliderEnabled ? this.#volume : 100
	}

	set volume(value: number) {
		this.#volume = clamp(value, 0, 100)
	}

	#activeTrackQuery: QueryResult<TrackData | undefined> = createTrackQuery(
		() => this.#queue.itemsIds[this.#queue.activeTrackIndex] ?? -1,
		{ allowEmpty: true },
	)

	activeTrack: TrackData | undefined = $derived(this.#activeTrackQuery.value)

	#artwork = createManagedArtwork(() => this.activeTrack?.image?.full)
	artworkSrc: string | undefined = $derived.by(this.#artwork)
	animatedArtworkSrc: string | undefined = $state()
	animatedArtworkTallSrc: string | undefined = $state()
	animatedArtworkLoaded: boolean = $state(false)

	constructor() {
		persist('player', this, ['volume', 'repeat', 'muted', 'playbackRate', 'preservePitch'])
		persist('player', this.#queue, ['shuffle'])

		this.equalizer.init()

		const audio = this.#audio
		audio.crossOrigin = 'anonymous'

		// Plain (non-$state) so reads inside the effect don't create subscriptions.
		let prevTrackId: number | null = null

		// Debounced to recover from transient undefined during a DB refresh.
		const scheduleAudioReset = debounce(() => {
			if (!this.activeTrack) {
				this.#audioLoader.reset()
				this.currentTime = 0
				this.duration = 0
				this.playing = false
			}
		}, 100)

		const trackChanged = (track: TrackData | undefined) => {
			if (!track) {
				if (prevTrackId !== null) {
					this.#savePlayHistory(prevTrackId)

					prevTrackId = null
				}
				scheduleAudioReset()
				return
			}

			if (track.id === prevTrackId) {
				return
			}

			scheduleAudioReset.cancel()

			if (prevTrackId !== null) {
				this.#savePlayHistory(prevTrackId)
			}

			prevTrackId = track.id
			this.currentTime = 0
			this.duration = 0

			void this.#audioLoader.load(track.directory, track.file, track.url).then((result) => {
				if (result.status === 'failed') {
					const name = truncate(track.name, 30)
					const errorMap = {
						'not-found': m.playerAudioErrorNotFound,
						'permission-denied': m.playerAudioErrorPermissionDenied,
						error: m.playerAudioErrorLoadError,
					}

					snackbar({
						message: errorMap[result.reason]({ name }),
						id: 'failed-to-load-audio',
						duration: 10_000,
					})

					prevTrackId = null
					this.#queue.setTrack(-1)
				}
			})
		}

		$effect(() => {
			const track = this.activeTrack

			untrack(() => {
				trackChanged(track)
			})

			if (track) {
				this.animatedArtworkSrc = undefined
				this.animatedArtworkTallSrc = undefined
				this.animatedArtworkLoaded = false
				const artist = (track.artists[0] as string) ?? ''
				const album = track.album
				if (artist === UNKNOWN_ITEM || album === UNKNOWN_ITEM) {
					this.animatedArtworkSrc = undefined
					return
				}
				getAnimatedArtwork(artist, album, track.name)
					.then((result) => {
						if (this.activeTrack?.id === track.id) {
							this.animatedArtworkSrc = result?.url
							this.animatedArtworkTallSrc = result?.urlTall
						}
					})
					.catch((error) => {
						console.error('Failed to get animated artwork', error)
						this.animatedArtworkSrc = undefined
					})
			} else {
				this.animatedArtworkSrc = undefined
				this.animatedArtworkTallSrc = undefined
				this.animatedArtworkLoaded = false
			}
		})

		// Guarded by loading: prevents play() on an empty/stale src during file fetch.
		$effect(() => {
			if (this.#audioLoader.loading) {
				return
			}

			const shouldPlay = this.playing

			if (audio.paused === !shouldPlay) {
				return
			}

			if (shouldPlay) {
				if (this.equalizer.enabled) {
					void this.equalizer.resumeContext()
				}
				const playPromise = audio.play()
				if (playPromise !== undefined) {
					playPromise.catch((error) => {
						console.warn('Audio playback error on iOS/Safari:', error)
						this.playing = false
					})
				}
			} else {
				audio.pause()
			}
		})

		const syncPlayingFromAudio = () => {
			const audioPlaying = !audio.paused
			if (audioPlaying !== this.playing) {
				this.playing = audioPlaying
			}
		}

		audio.onplay = () => {
			syncPlayingFromAudio()
			this.#updatePositionState()
		}
		audio.onpause = () => {
			syncPlayingFromAudio()
			this.#updatePositionState()
		}

		audio.onseeked = () => {
			this.#updatePositionState()
		}

		audio.onended = () => {
			if (this.repeat === 'one') {
				this.seek(0)
				this.togglePlay(true)
				return
			}

			if (
				this.repeat === 'none' &&
				this.#queue.activeTrackIndex === this.#queue.itemsIds.length - 1
			) {
				const trackId = this.#queue.activeTrackId
				if (trackId !== null) {
					this.#savePlayHistory(trackId)
				}

				this.togglePlay(false)
				return
			}

			this.playNext()
		}

		audio.ondurationchange = () => {
			this.duration = audio.duration
			this.#updatePositionState()
		}

		audio.ontimeupdate = throttle(() => {
			this.currentTime = audio.currentTime
		}, 100)

		const setPlaybackRate = () => {
			audio.playbackRate = clamp(
				this.playbackRate,
				PLAYER_PLAYBACK_RATE_MIN,
				PLAYER_PLAYBACK_RATE_MAX,
			)
		}

		audio.onloadedmetadata = () => {
			// Audio change resets playbackRate
			setPlaybackRate()
		}

		$effect(() => {
			setPlaybackRate()
		})

		$effect(() => {
			audio.preservesPitch = this.preservePitch
		})

		$effect(() => {
			// Humans perceive volume logarithmically
			// so we adjust the volume to match that perception
			const k = 0.5
			audio.volume = (this.volume / 100) ** k
		})

		$effect(() => {
			audio.muted = this.muted
		})

		const ms = typeof window === 'undefined' ? undefined : window.navigator.mediaSession

		if (ms) {
			$effect(() => {
				ms.playbackState = this.playing ? 'playing' : 'paused'
			})

			$effect(() => {
				const track = this.activeTrack
				if (!track) {
					ms.metadata = null
					return
				}

				const fallbackArtworkSrc = new URL('/artwork.svg', location.origin).toString()
				const artworkSrc = this.artworkSrc ?? fallbackArtworkSrc

				ms.metadata = new MediaMetadata({
					title: track.name,
					artist: formatArtists(track.artists),
					album: track.album,
					artwork: [
						{ src: artworkSrc, sizes: '96x96' },
						{ src: artworkSrc, sizes: '128x128' },
						{ src: artworkSrc, sizes: '192x192' },
						{ src: artworkSrc, sizes: '256x256' },
						{ src: artworkSrc, sizes: '384x384' },
						{ src: artworkSrc, sizes: '512x512' },
					],
				})
			})

			// Done for minification purposes.
			const setAction = ms.setActionHandler.bind(ms)
			setAction('play', () => this.togglePlay(true))
			setAction('pause', () => this.togglePlay(false))
			setAction('previoustrack', this.playPrev)
			setAction('nexttrack', this.playNext)
			setAction('stop', () => {
				this.togglePlay(false)
				this.seek(0)
			})
			setAction('seekbackward', (details) => {
				audio.currentTime = Math.max(audio.currentTime - (details?.seekOffset ?? 10), 0)
			})
			setAction('seekforward', (details) => {
				audio.currentTime = Math.min(
					audio.currentTime + (details?.seekOffset ?? 10),
					audio.duration,
				)
			})
			setAction('seekto', (details) => {
				if (details.seekTime !== undefined) {
					this.seek(details.seekTime)
				}
			})
		}
	}

	#updatePositionState = (): void => {
		const ms = typeof window === 'undefined' ? undefined : window.navigator.mediaSession
		if (!(ms?.setPositionState && Number.isFinite(this.#audio.duration))) {
			return
		}

		ms.setPositionState({
			duration: this.#audio.duration,
			playbackRate: this.#audio.playbackRate,
			position: this.#audio.currentTime,
		})
	}

	#savePlayHistory = (trackId: number): void => {
		const playedTime = this.#audio.currentTime
		const totalDuration = this.#audio.duration

		const percentageThreshold = 0.5
		const timeThreshold = 30

		const threshold = Math.min(timeThreshold, totalDuration * percentageThreshold)
		if (totalDuration > 0 && playedTime >= threshold) {
			void dbAddToPlayHistory(trackId)
		}
	}

	togglePlay = (force?: boolean): void => {
		if (this.#queue.activeTrackIndex === -1) {
			return
		}

		const nextState = force ?? !this.playing
		this.playing = nextState
		if (nextState) {
			if (this.#audioLoader.loading) {
				return
			}

			if (this.equalizer.enabled) {
				void this.equalizer.resumeContext()
			}
			const playPromise = this.#audio.play()
			if (playPromise !== undefined) {
				playPromise.catch(() => {
					// Controlled error fallback in effect
				})
			}
		} else {
			this.#audio.pause()
		}
	}

	playNext = (): void => {
		this.playTrack(this.#queue.getNextIndex())
	}

	playPrev = (): void => {
		this.playTrack(this.#queue.getPrevIndex())
	}

	playTrack = (
		trackIndex: number,
		queue?: readonly number[],
		options: PlayTrackOptions = {},
	): void => {
		const currentTrackId = this.#queue.activeTrackId
		this.#queue.setTrack(trackIndex, queue, options)

		const isSameTrack = currentTrackId !== null && this.#queue.activeTrackId === currentTrackId

		if (isSameTrack) {
			// Reset time to 0
			this.seek(0)
		} else {
			// Update ui time instantly, but keep audio.currentTime
			// until play history is saved.
			this.currentTime = 0
		}

		this.togglePlay(true)
	}

	seek = (time: number): void => {
		this.currentTime = time
		this.#audio.currentTime = time
		this.#updatePositionState()
	}

	toggleRepeat = (): void => {
		let { repeat } = this

		if (repeat === 'none') {
			repeat = 'all'
		} else if (repeat === 'all') {
			repeat = 'one'
		} else {
			repeat = 'none'
		}

		this.repeat = repeat
	}

	toggleShuffle = this.#queue.toggleShuffle

	addToQueue = this.#queue.addToQueue

	removeFromQueue = this.#queue.removeFromQueue

	moveQueueItem = this.#queue.moveQueueItem

	clearQueue = this.#queue.clearQueue
}
