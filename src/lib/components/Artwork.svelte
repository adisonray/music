<script lang="ts">
	import { canPlayHLS } from '$lib/helpers/utils/ua.ts'
	import type { IconType } from './icon/Icon.svelte'
	import Icon from './icon/Icon.svelte'

	interface Props {
		src: string | undefined
		loading?: 'eager' | 'lazy'
		animatedSrc?: string | undefined
		class?: ClassValue
		alt?: string
		fallbackIcon?: IconType | false
		noFallbackBg?: boolean
		noAspectSquare?: boolean
		onVideoLoad?: () => void
		onVideoError?: () => void
		children?: Snippet
	}

	const {
		src,
		animatedSrc,
		fallbackIcon = 'musicNote',
		noFallbackBg,
		noAspectSquare,
		onVideoLoad,
		onVideoError,
		class: className,
		alt,
		children,
		loading = 'eager',
	}: Props = $props()

	let error = $state(false)
	let fallbackApplied = $state(false)
	let animatedError = $state(false)
	let videoLoaded = $state(false)
	let animatedImageLoaded = $state(false)

	$effect(() => {
		void src
		void animatedSrc

		untrack(() => {
			error = false
			fallbackApplied = false
			animatedError = false
			videoLoaded = false
			animatedImageLoaded = false
		})
	})

	const isHlsJsSupported = $derived.by(() => {
		if (typeof window === 'undefined') {
			return false
		}
		return 'MediaSource' in window
	})

	const isAnimatedImage = $derived.by(() => {
		if (!animatedSrc) {
			return false
		}
		try {
			const pathname = new URL(animatedSrc, window.location.href).pathname.toLowerCase()
			return pathname.endsWith('.gif') || pathname.endsWith('.webp') || pathname.endsWith('.apng')
		} catch {
			const lower = animatedSrc.toLowerCase()
			return lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.apng')
		}
	})

	const isVideo = $derived.by(() => {
		if (!animatedSrc) {
			return false
		}
		return !isAnimatedImage
	})

	const shouldShowAnimated = $derived.by(() => {
		if (!animatedSrc || animatedError) {
			return false
		}

		let isM3u8 = false
		try {
			const pathname = new URL(animatedSrc, window.location.href).pathname.toLowerCase()
			isM3u8 = pathname.endsWith('.m3u8')
		} catch {
			isM3u8 = animatedSrc.endsWith('.m3u8')
		}

		if (isM3u8) {
			return canPlayHLS() || isHlsJsSupported
		}

		return true
	})

	let videoElement = $state<HTMLVideoElement>()

	$effect(() => {
		const srcVal = animatedSrc
		const el = videoElement
		let hlsInstance: any = null

		let isM3u8 = false
		if (srcVal) {
			try {
				const pathname = new URL(srcVal, window.location.href).pathname.toLowerCase()
				isM3u8 = pathname.endsWith('.m3u8')
			} catch {
				isM3u8 = srcVal.endsWith('.m3u8')
			}
		}

		if (srcVal && el && shouldShowAnimated && isM3u8 && !canPlayHLS()) {
			import('hls.js')
				.then(({ default: Hls }) => {
					if (!Hls.isSupported()) {
						animatedError = true
						onVideoError?.()
						return
					}

					hlsInstance = new Hls({
						capLevelToPlayerSize: true,
						maxBufferLength: 5,
					})
					hlsInstance.loadSource(srcVal)
					hlsInstance.attachMedia(el)
					hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
						el.play().catch((err: unknown) => {
							console.warn('Failed to play HLS video artwork:', err)
						})
					})
					hlsInstance.on(Hls.Events.ERROR, (_event: any, data: any) => {
						if (data.fatal) {
							animatedError = true
							onVideoError?.()
						}
					})
				})
				.catch((err) => {
					console.error('Failed to load hls.js', err)
					animatedError = true
					onVideoError?.()
				})
		}

		return () => {
			if (hlsInstance) {
				hlsInstance.destroy()
			}
		}
	})
</script>

<div
	class={[
		'relative flex overflow-hidden ring-1 ring-surfaceContainerHigh contain-strict text-onSurfaceVariant/60',
		!noAspectSquare && 'aspect-square',
		!noFallbackBg && 'bg-surfaceContainerHighest',
		className,
	]}
>
	{#if (src && !error) || fallbackApplied}
		<!-- biome-ignore lint/a11y/useAltText: false positive, alt exists -->
		<img
			src={fallbackApplied ? '/artwork.svg' : src}
			{alt}
			{loading}
			referrerpolicy="no-referrer"
			decoding="async"
			class="size-full object-cover"
			draggable="false"
			onerror={() => {
				error = true
				if (fallbackIcon === false) {
					if (fallbackApplied) return
					fallbackApplied = true
				}
			}}
			onload={() => {
				error = false
			}}
		/>
	{/if}

	{#if shouldShowAnimated && isAnimatedImage}
		{#key animatedSrc}
			<!-- biome-ignore lint/a11y/useAltText: false positive, alt exists -->
			<img
				src={animatedSrc}
				{alt}
				{loading}
				referrerpolicy="no-referrer"
				decoding="async"
				class={[
					'absolute inset-0 size-full object-cover transition-opacity duration-1000',
					!animatedImageLoaded && 'opacity-0',
				]}
				draggable="false"
				onerror={() => {
					animatedError = true
					onVideoError?.()
				}}
				onload={() => {
					animatedImageLoaded = true
					onVideoLoad?.()
				}}
			/>
		{/key}
	{/if}

	{#if shouldShowAnimated && isVideo}
		{#key animatedSrc}
			<video
				bind:this={videoElement}
				src={!animatedSrc?.endsWith('.m3u8') || canPlayHLS() ? animatedSrc : undefined}
				autoplay
				loop
				muted
				playsinline
				class={[
					'absolute inset-0 size-full object-cover transition-opacity duration-1000',
					!videoLoaded && 'opacity-0',
				]}
				onerror={() => {
					if (canPlayHLS() || !animatedSrc?.endsWith('.m3u8')) {
						animatedError = true
						onVideoError?.()
					}
				}}
				onloadeddata={() => {
					if (!videoLoaded) {
						videoLoaded = true
						onVideoLoad?.()
					}
				}}
				oncanplay={() => {
					if (!videoLoaded) {
						videoLoaded = true
						onVideoLoad?.()
					}
				}}
			></video>
		{/key}
	{/if}

	{#if (!src || (error && !fallbackApplied)) && !videoLoaded && !animatedImageLoaded && fallbackIcon !== false}
		<Icon type={fallbackIcon} class="m-auto size-2/3" />
	{/if}

	{#if children}
		{@render children()}
	{/if}
</div>
