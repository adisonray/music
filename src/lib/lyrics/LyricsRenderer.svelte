<script lang="ts">
	import { browser } from '$app/environment'

	interface Props {
		ttml: string | null
		audioElement: HTMLAudioElement | null
		class?: string
	}

	let { ttml, audioElement, class: className }: Props = $props()

	let el: HTMLElement | undefined = $state()

	if (browser) {
		void import('@uimaxbai/am-lyrics/am-lyrics.js')
	}

	$effect(() => {
		const currentEl = el
		const currentAudio = audioElement
		if (!currentEl || !currentAudio) return

		let frameId: number

		const updateTime = () => {
			const timeMs = Math.floor(currentAudio.currentTime * 1000)
			if ((currentEl as any).currentTime !== timeMs) {
				;(currentEl as any).currentTime = timeMs
			}
			if (!currentAudio.paused) {
				frameId = requestAnimationFrame(updateTime)
			}
		}

		const handleTimeUpdate = () => {
			;(currentEl as any).currentTime = Math.floor(currentAudio.currentTime * 1000)
		}

		const handlePlay = () => {
			frameId = requestAnimationFrame(updateTime)
		}

		const handlePause = () => {
			if (frameId) cancelAnimationFrame(frameId)
		}

		currentAudio.addEventListener('timeupdate', handleTimeUpdate)
		currentAudio.addEventListener('play', handlePlay)
		currentAudio.addEventListener('pause', handlePause)

		if (!currentAudio.paused) {
			frameId = requestAnimationFrame(updateTime)
		}

		return () => {
			currentAudio.removeEventListener('timeupdate', handleTimeUpdate)
			currentAudio.removeEventListener('play', handlePlay)
			currentAudio.removeEventListener('pause', handlePause)
			if (frameId) cancelAnimationFrame(frameId)
		}
	})

	$effect(() => {
		const currentEl = el
		if (!currentEl) return

		const handleLineClick = (e: Event) => {
			const customEvent = e as CustomEvent<{ timestamp: number }>
			if (audioElement && customEvent.detail && typeof customEvent.detail.timestamp === 'number') {
				audioElement.currentTime = customEvent.detail.timestamp / 1000
			}
		}

		currentEl.addEventListener('line-click', handleLineClick)
		return () => {
			currentEl.removeEventListener('line-click', handleLineClick)
		}
	})
</script>

<am-lyrics bind:this={el} ttml={ttml ?? undefined} font-family="var(--font-sans)" class={className}
></am-lyrics>

<style lang="postcss">
	@reference "../../app.css";

	am-lyrics {
		display: block;
		width: 100%;
		height: 100%;
		overflow-y: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		scroll-behavior: auto !important;
		transform: translateZ(0);

		--highlight-color: var(--lyric-active-fill, #ffffff);
		--am-lyrics-highlight-color: var(--lyric-active-fill, #ffffff);
		--am-lyrics-compact-font-size: 34px;
		--am-lyrics-compact-line-spacing: 24px;
	}

	am-lyrics::-webkit-scrollbar {
		display: none;
	}
</style>
