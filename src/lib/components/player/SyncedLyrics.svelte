<script lang="ts">
	import Icon from '$lib/components/icon/Icon.svelte'
	import Spinner from '$lib/components/Spinner.svelte'
	import type { TrackData } from '$lib/library/get/value-queries.ts'
	import LyricsRenderer from '$lib/lyrics/LyricsRenderer.svelte'
	import { getSourceDisplayName, LyricsService, type ServiceLyricsResult } from '$lib/lyrics/LyricsService.ts'

	interface Props {
		track: TrackData | undefined
		currentTimeMs: number
		isCompact?: boolean
		class?: string
	}

	let { track, isCompact = false, class: className }: Props = $props()
	const player = usePlayer()
	const mainStore = useMainStore()
	const dialogs = useDialogsStore()

	const isLyricsDark = $derived(
		mainStore.isThemeDark || (isCompact && player.animatedArtworkSrc && player.animatedArtworkLoaded)
	)

	let result: ServiceLyricsResult | undefined = $state()
	let loading = $state(false)
	let reloadCount = $state(0)

	$effect(() => {
		const handleReload = () => {
			reloadCount++
		}
		window.addEventListener('lyrics-reload', handleReload)
		return () => {
			window.removeEventListener('lyrics-reload', handleReload)
		}
	})

	$effect(() => {
		if (!track) {
			result = undefined
			loading = false
			return
		}
		const requestedReloadCount = reloadCount
		const controller = new AbortController()
		loading = true

		LyricsService.fetchLyrics(track, controller.signal)
			.then((nextResult) => {
				if (!controller.signal.aborted && requestedReloadCount === reloadCount) {
					result = nextResult
				}
			})
			.catch((error: unknown) => {
				if (error instanceof Error && error.name === 'AbortError') return
				result = { status: 'error' }
			})
			.finally(() => {
				if (!controller.signal.aborted && requestedReloadCount === reloadCount) {
					loading = false
				}
			})

		return () => controller.abort()
	})
</script>

{#snippet emptyState(icon: 'musicNote' | 'alertCircle', title: string, description: string)}
	<div
		class="empty-state z-10 m-auto flex h-full max-w-80 flex-col items-center justify-center text-center opacity-50 transition-opacity duration-500"
	>
		<div class="mb-4 text-[var(--lyric-inactive)]">
			<Icon type={icon} class="h-12 w-12" />
		</div>
		<h3 class="text-xl font-bold" style="color: var(--lyric-active-fill)">{title}</h3>
		<p class="text-sm mt-2" style="color: var(--lyric-inactive)">{description}</p>
	</div>
{/snippet}

<section
	class={[
		'lyrics-shell relative h-full w-full overflow-hidden bg-transparent',
		isLyricsDark ? 'dark' : '',
		className,
	]}
	aria-live="polite"
>
	{#if !track}
		{@render emptyState(
			'musicNote',
			'No Track Playing',
			'Play a track to follow along with the lyrics.',
		)}
	{:else if loading}
		<div class="flex h-full w-full items-center justify-center">
			<div class="text-[var(--lyric-inactive)]">
				<Spinner class="h-8 w-8" />
			</div>
		</div>
	{:else if result?.status === 'instrumental'}
		{@render emptyState(
			'musicNote',
			'Instrumental',
			'This track is an instrumental.',
		)}
	{:else if result?.status === 'found' && result.ttml}
		<div class="absolute inset-0 h-full w-full">
			<LyricsRenderer
				ttml={result.ttml}
				audioElement={player.audioElement}
				class="h-full w-full"
			/>
		</div>
	{:else}
		{@render emptyState(
			'alertCircle',
			'Lyrics Unavailable',
			"We couldn't find synced lyrics for this track.",
		)}
	{/if}

	{#if track && !loading && result}
		<button
			type="button"
			class="interactable absolute bottom-4 right-4 z-30 rounded-full border border-onSurface/10 bg-surfaceContainerHighest/85 px-3 py-1 text-label-sm text-onSurfaceVariant backdrop-blur-md shadow-sm cursor-pointer select-none"
			onclick={(e) => {
				if (e.detail === 3) {
					dialogs.openDialog('lyricsSource', track)
				}
			}}
		>
			Source: {result.source ? getSourceDisplayName(result.source) : 'None (Triple-click)'}
		</button>
	{/if}
</section>

<style lang="postcss">
	@reference "../../../app.css";

	/* Robust Light/Dark Mode Mapping */
	.lyrics-shell {
		/* Defaults for a light environment */
		--lyric-inactive: rgba(0, 0, 0, 0.4);
		--lyric-active-fill: var(--color-primary);
		--lyric-active-unfill: rgba(0, 0, 0, 0.12);
		--lyric-translation: rgba(0, 0, 0, 0.65);
		--lyric-romanization: rgba(0, 0, 0, 0.5);
	}

	/* Overrides: if the container gets 'bg-black' or 'dark' forcefully */
	.lyrics-shell.bg-black,
	:global(.dark) .lyrics-shell,
	.lyrics-shell.dark {
		--lyric-inactive: rgba(255, 255, 255, 0.4);
		--lyric-active-fill: #f1dedc;
		--lyric-active-unfill: rgba(255, 255, 255, 0.22);
		--lyric-translation: rgba(255, 255, 255, 0.85);
		--lyric-romanization: rgba(255, 255, 255, 0.65);
	}
</style>
