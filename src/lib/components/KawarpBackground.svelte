<script lang="ts">
	import { Kawarp } from '@kawarp/core'
	import { onMount } from 'svelte'

	interface Props {
		imageUrl: string | null
		enabled?: boolean
		warpIntensity?: number
		blurPasses?: number
		animationSpeed?: number
		transitionDuration?: number
		saturation?: number
		tintColor?: [number, number, number]
		tintIntensity?: number
		dithering?: number
		scale?: number
	}

	const {
		imageUrl,
		enabled = true,
		warpIntensity = 0.8,
		blurPasses = 8,
		animationSpeed = 1,
		transitionDuration = 1000,
		saturation = 1.5,
		tintColor,
		tintIntensity = 0.15,
		dithering = 0.008,
		scale = 1
	}: Props = $props()

	const mainStore = useMainStore()
	const player = usePlayer()

	const activeTintColor = $derived<[number, number, number]>(
		tintColor === undefined
			? (mainStore.isThemeDark ? [0.16, 0.16, 0.24] : [0.95, 0.95, 0.98])
			: tintColor
	)

	const isReducedMotion = $derived(mainStore.isReducedMotion)
	const activeAnimationSpeed = $derived(isReducedMotion ? 0 : animationSpeed)

	let canvasElement = $state<HTMLCanvasElement>()
	let kawarpInstance: Kawarp | null = null
	let currentLoadedUrl: string | null = null
	let isLoaded = $state(false)
	let animationFrameId: number | null = null

	const runAudioReaction = () => {
		if (!enabled || !kawarpInstance) {
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId)
				animationFrameId = null
			}
			return
		}

		const analyser = player.equalizer.analyser
		if (analyser && player.playing) {
			const bufferLength = analyser.frequencyBinCount
			const dataArray = new Uint8Array(bufferLength)
			analyser.getByteFrequencyData(dataArray)

			let sum = 0
			for (let i = 0; i < bufferLength; i += 1) {
				sum += dataArray[i] ?? 0
			}
			const average = sum / bufferLength // 0 to 255

			// Isolate bass (first 15% of the bins)
			let bassSum = 0
			const bassCount = Math.max(1, Math.floor(bufferLength * 0.15))
			for (let i = 0; i < bassCount; i += 1) {
				bassSum += dataArray[i] ?? 0
			}
			const bassAverage = bassSum / bassCount // 0 to 255

			const normVol = average / 255
			const normBass = bassAverage / 255

			const targetWarpIntensity = warpIntensity + normBass * 0.6
			const targetAnimationSpeed = activeAnimationSpeed + normVol * 1.5
			const targetScale = scale + normBass * 0.05

			const ease = 0.1
			kawarpInstance.warpIntensity = kawarpInstance.warpIntensity + (targetWarpIntensity - kawarpInstance.warpIntensity) * ease
			kawarpInstance.animationSpeed = kawarpInstance.animationSpeed + (targetAnimationSpeed - kawarpInstance.animationSpeed) * ease
			kawarpInstance.scale = kawarpInstance.scale + (targetScale - kawarpInstance.scale) * ease
		} else {
			// Fade back to defaults
			const ease = 0.05
			kawarpInstance.warpIntensity = kawarpInstance.warpIntensity + (warpIntensity - kawarpInstance.warpIntensity) * ease
			kawarpInstance.animationSpeed = kawarpInstance.animationSpeed + (activeAnimationSpeed - kawarpInstance.animationSpeed) * ease
			kawarpInstance.scale = kawarpInstance.scale + (scale - kawarpInstance.scale) * ease
		}

		animationFrameId = requestAnimationFrame(runAudioReaction)
	}

	onMount(() => {
		let resizeObserver: ResizeObserver | null = null

		if (canvasElement) {
			try {
				// Initialize Kawarp on client mount
				kawarpInstance = new Kawarp(canvasElement, {
					warpIntensity,
					blurPasses,
					animationSpeed: activeAnimationSpeed,
					transitionDuration,
					saturation,
					tintColor: activeTintColor,
					tintIntensity,
					dithering,
					scale
				})

				// Set up ResizeObserver
				resizeObserver = new ResizeObserver(() => {
					if (kawarpInstance) {
						kawarpInstance.resize()
					}
				})
				resizeObserver.observe(canvasElement)

				// Load the initial image if it exists
				if (enabled && imageUrl) {
					currentLoadedUrl = imageUrl
					kawarpInstance.loadImage(imageUrl)
						.then(() => {
							isLoaded = true
							if (kawarpInstance && enabled) {
								kawarpInstance.start()
							}
						})
						.catch((err) => {
							console.error('Failed to load initial Kawarp image:', err)
							isLoaded = false
						})
				} else if (enabled) {
					kawarpInstance.start()
				}
			} catch (e) {
				console.error('Failed to initialize Kawarp:', e)
			}
		}

		return () => {
			if (resizeObserver) {
				resizeObserver.disconnect()
			}
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId)
				animationFrameId = null
			}
			if (kawarpInstance) {
				kawarpInstance.stop()
				kawarpInstance.dispose()
				kawarpInstance = null
			}
		}
	})

	// React to options changes
	$effect(() => {
		if (!kawarpInstance) {
			return
		}

		kawarpInstance.setOptions({
			warpIntensity,
			blurPasses,
			animationSpeed: activeAnimationSpeed,
			transitionDuration,
			saturation,
			tintColor: activeTintColor,
			tintIntensity,
			dithering,
			scale
		})
	})

	// React to audio playing and start/stop visualizer loop
	$effect(() => {
		// Evaluate player.playing to establish reactive dependency
		const isEnabled = enabled
		if (player.playing && isEnabled && kawarpInstance) {
			if (!animationFrameId) {
				runAudioReaction()
			}
		} else {
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId)
				animationFrameId = null
			}
		}

		return () => {
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId)
				animationFrameId = null
			}
		}
	})

	// React to imageUrl changes
	$effect(() => {
		if (!kawarpInstance) {
			return
		}

		if (!imageUrl) {
			isLoaded = false
			currentLoadedUrl = null
			return
		}

		if (imageUrl !== currentLoadedUrl) {
			currentLoadedUrl = imageUrl
			kawarpInstance.loadImage(imageUrl)
				.then(() => {
					isLoaded = true
					if (kawarpInstance && enabled) {
						kawarpInstance.start()
					}
				})
				.catch((err) => {
					console.error('Failed to load Kawarp image:', err)
					isLoaded = false
				})
		}
	})

	// React to enabled changes
	$effect(() => {
		if (!kawarpInstance) {
			return
		}

		if (enabled && isLoaded) {
			kawarpInstance.start()
		} else {
			kawarpInstance.stop()
		}
	})
</script>

<div
	class="kawarp-background"
	style="opacity: {isLoaded && enabled ? 1 : 0};"
>
	<canvas bind:this={canvasElement}></canvas>
	<div class="kawarp-overlay"></div>
</div>

<style lang="postcss">
	@reference '../../app.css';

	.kawarp-background {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		pointer-events: none;
		z-index: 0;
		transition: opacity 0.5s ease;
	}

	.kawarp-background canvas {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.kawarp-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 1;
		transition: background 0.5s ease;
	}

	:global(.dark) .kawarp-overlay {
		background: linear-gradient(
			to bottom,
			rgb(0 0 0 / 0.12),
			rgb(0 0 0 / 0.35)
		);
	}

	:global(html:not(.dark)) .kawarp-overlay {
		background: linear-gradient(
			to bottom,
			rgb(255 255 255 / 0.45),
			rgb(255 255 255 / 0.7)
		);
	}
</style>