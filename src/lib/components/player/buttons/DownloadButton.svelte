<script lang="ts">
	import { cancelTrackDownload, ensureTrackIsStoredLocally, getStoredLocalTrackId, isDownloadAbortError } from '$lib/library/local-download.ts'
	import { snackbar } from '$lib/components/snackbar/snackbar.ts'

	interface Props {
		trackId: number | string
		large?: boolean
		downloaded?: boolean
		class?: ClassValue
	}

	const { trackId, large = false, downloaded = false, class: className }: Props = $props()

	type DownloadState = 'idle' | 'loading' | 'done' | 'error'
	let localState = $state<DownloadState | null>(null)
	let persistedDownloaded = $state(false)
	let state = $derived<DownloadState>(localState ?? (persistedDownloaded ? 'done' : 'idle'))
	let progress = $state(0)

	// A discovery track uses a stable negative id while the actual file lives on
	// the positive IndexedDB track created by the offline import.
	$effect(() => {
		let cancelled = false
		void trackId
		localState = null
		progress = 0
		persistedDownloaded = downloaded

		if (downloaded) return

		void getStoredLocalTrackId(trackId).then((localId) => {
			if (!cancelled && localId !== undefined) persistedDownloaded = true
		})

		return () => {
			cancelled = true
		}
	})

	const download = async (event: MouseEvent) => {
		event.preventDefault()
		event.stopPropagation()

		const idToDownload = typeof trackId === 'string' ? Number(trackId) : trackId
		if (typeof idToDownload !== 'number' || Number.isNaN(idToDownload)) {
			snackbar.unexpectedError(new Error('Invalid track ID for download'))
			return
		}

		if (state === 'loading') {
			cancelTrackDownload(idToDownload)
			localState = 'idle'
			progress = 0
			return
		}
		if (state === 'done') return

		localState = 'loading'
		try {
			await ensureTrackIsStoredLocally(
				idToDownload,
				(value) => (progress = value),
			)
			progress = 100
			localState = 'done'
		} catch (error) {
			if (isDownloadAbortError(error)) {
				localState = 'idle'
				progress = 0
				return
			}

			localState = 'error'
			snackbar.unexpectedError(error)
			window.setTimeout(() => {
				if (localState === 'error') localState = 'idle'
			}, 900)
		}
	}
</script>

<button
	type="button"
	title={state === 'done' ? 'Available offline' : state === 'loading' ? 'Stop downloading' : state === 'error' ? 'Download failed. Try again' : 'Download for offline playback'}
	class={['download-button interactable', large && 'download-button-large', state === 'done' && 'is-complete', state === 'error' && 'is-error', className]}
	aria-label={state === 'done' ? 'Downloaded for offline playback' : state === 'loading' ? 'Stop downloading song' : state === 'error' ? 'Download failed, try again' : 'Download song for offline playback'}
	aria-busy={state === 'loading'}
	disabled={state === 'done'}
	onclick={download}
>
	<span class={['download-icon', state === 'loading' && 'is-loading', state === 'done' && 'is-done', state === 'error' && 'is-error']}>
		{#if state === 'loading'}
			<svg class="download-progress" viewBox="0 0 36 36" aria-hidden="true">
				<circle class="download-progress-track" cx="18" cy="18" r="15" />
				<circle
					class="download-progress-value"
					cx="18"
					cy="18"
					r="15"
					pathLength="100"
					style={`stroke-dashoffset: ${100 - progress}`}
				/>
				<text x="18" y="18" text-anchor="middle" dominant-baseline="central">{progress}%</text>
			</svg>
		{:else if state === 'done'}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M5 12.5 9.2 16.7 19 7" />
			</svg>
		{:else if state === 'error'}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 7v6M12 17.5v.5" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 3v12" />
				<path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
				<path d="M5 20h14" />
			</svg>
		{/if}
	</span>
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.download-button {
		position: relative;
		display: inline-flex;
		height: 40px;
		width: 40px;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 9999px;
		background: transparent;
		color: var(--color-onSurfaceVariant);
		cursor: pointer;
		transition:
			color 160ms var(--ease-standard),
			background-color 160ms var(--ease-standard),
			transform 180ms var(--ease-emphasized);
	}

	.download-button:hover:not(:disabled),
	.download-button:focus-visible:not(:disabled) {
		background: color-mix(in srgb, var(--color-onSurface) 8%, transparent);
		color: var(--color-onSurface);
	}

	.download-button:active:not(:disabled) {
		transform: scale(0.9);
	}

	.download-button-large {
		height: 52px;
		width: 52px;
	}

	.download-icon {
		display: grid;
		height: 20px;
		width: 20px;
		place-items: center;
		transform-origin: center;
		transition:
			transform 180ms var(--ease-emphasized),
			opacity 160ms var(--ease-standard);
	}

	.download-button-large .download-icon {
		height: 24px;
		width: 24px;
	}

	.download-progress {
		height: 100%;
		width: 100%;
	}

	.download-progress circle {
		fill: none;
		stroke-linecap: round;
		stroke-width: 3;
	}

	.download-progress-track {
		stroke: color-mix(in srgb, var(--color-onSurface) 14%, transparent);
	}

	.download-progress-value {
		stroke: var(--color-primary);
		stroke-dasharray: 100;
		transition: stroke-dashoffset 120ms linear;
		transform: rotate(-90deg);
		transform-origin: 18px 18px;
	}

	.download-progress text {
		fill: currentColor;
		font-size: 7px;
		font-weight: 600;
		stroke: none;
	}

	.download-icon svg {
		display: block;
		height: 100%;
		width: 100%;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.9;
	}

	.download-icon.is-done {
		animation: download-complete 240ms var(--ease-emphasized) both;
		color: var(--color-primary);
	}

	.download-icon.is-error {
		color: var(--color-error);
		animation: download-error 220ms var(--ease-emphasized);
	}

	@keyframes download-complete {
		0% {
			transform: scale(0.65);
			opacity: 0;
		}
		70% {
			transform: scale(1.08);
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	@keyframes download-error {
		25% { transform: translateX(-2px); }
		50% { transform: translateX(2px); }
		75% { transform: translateX(-1px); }
		100% { transform: translateX(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.download-icon.is-loading,
		.download-icon.is-done,
		.download-icon.is-error,
		.download-icon.is-loading svg {
			animation: none;
		}
	}

	.download-button:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
