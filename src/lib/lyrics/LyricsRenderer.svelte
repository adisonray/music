<script lang="ts">
	import { browser } from '$app/environment'
	import '@braccato/core/styles/variables.css'
	import '@braccato/core/styles/lyrics.css'
	import '@braccato/core/styles/instrumental.css'
	import type { Lyric } from '@braccato/parsers'
	import { getLocale } from '$paraglide/runtime'

	interface Props {
		lyrics: Lyric[] | null
		audioElement: HTMLAudioElement | null
		class?: string
	}

	let { lyrics, audioElement, class: className }: Props = $props()

	let el:
		| (HTMLElement & {
				lyrics: Lyric[] | null
				source: HTMLAudioElement | string | null
				renderer: any
		  })
		| undefined = $state()

	let previousLyrics: Lyric[] | null = null

	if (browser) {
		void import('@braccato/core/element')
	}

	$effect(() => {
		const currentEl = el
		if (!currentEl) return

		if (lyrics !== previousLyrics) {
			previousLyrics = lyrics
			currentEl.lyrics = lyrics
		}
	})

	$effect(() => {
		const currentEl = el
		if (!currentEl) return

		if (currentEl.source !== audioElement) {
			currentEl.source = audioElement
		}
	})

	// Inject secondary lyrics (translations/romanizations) & agent alignment tags
	$effect(() => {
		const currentEl = el
		if (!currentEl) return

		const handleLoaded = async () => {
			const { injectTranslation, injectRomanization } = await import('@braccato/core')
			const renderer = currentEl.renderer
			if (!((renderer && renderer.lines ) && lyrics)) return

			let needsRelayout = false

			for (const [index, line] of renderer.lines.entries()) {
				const item = lyrics[index]
				if (!item) continue

				// Attribute changes do not shift element height, so don't trigger relayout
				if (item.agent) {
					line.lyricElement.setAttribute('data-agent', item.agent)
				}

				// Inject translation
				const isChinese = getLocale().startsWith('zh')
				if (item.translation?.text && isChinese) {
					injectTranslation(document, line.lyricElement, item.translation.text)
					needsRelayout = true
				}

				// Inject romanization
				if (item.romanization) {
					injectRomanization(
						document,
						line.lyricElement,
						line,
						item.romanization,
						item.timedRomanization
					)
					needsRelayout = true
				}
			}

			if (needsRelayout) {
				renderer.relayout()
			}
		}

		currentEl.addEventListener('braccato:lyrics-loaded', handleLoaded)

		if (currentEl.renderer && currentEl.renderer.lines) {
			void handleLoaded()
		}

		return () => {
			currentEl.removeEventListener('braccato:lyrics-loaded', handleLoaded)
		}
	})
</script>

<braccato-lyrics bind:this={el} class={className}></braccato-lyrics>

<style lang="postcss">
	@reference "../../app.css";

	braccato-lyrics {
		display: block;
		width: 100%;
		height: 100%;
		overflow-y: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	braccato-lyrics::-webkit-scrollbar {
		display: none;
	}

	:global(.blyrics-container) {
		font-family: var(--font-sans);
		text-align: left;

		padding-top: var(--blyrics-padding-top, 50vh);
		padding-bottom: var(--blyrics-padding-bottom, 50vh);

		--blyrics-font-size: 2.25rem;
		--blyrics-line-height: 1.35;
		--blyrics-padding: 1.25rem;

		/* Subtle scale parameters to prevent rasterization stutter */
		--blyrics-scale: 0.985;
		--blyrics-active-scale: 1.01;
		--blyrics-lyric-scroll-duration: 700ms;

		/* Colors */
		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(0, 0, 0, 0.45));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #140c0b);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(0, 0, 0, 0.12));

		/* Avoid paint containment on scrolling composite surfaces */
		contain: layout;
	}

	@media (width >= 640px) {
		:global(.blyrics-container) {
			--blyrics-font-size: 2.85rem;
			--blyrics-padding: 1.5rem;
		}
	}

	@media (width >= 1024px) {
		:global(.blyrics-container) {
			--blyrics-font-size: 3.5rem;
			--blyrics-padding: 1.75rem;
		}
	}

	:global(.dark .blyrics-container),
	:global([data-theme='dark'] .blyrics-container) {
		--blyrics-lyric-inactive-color: var(--lyric-inactive, rgba(255, 255, 255, 0.45));
		--blyrics-lyric-active-color: var(--lyric-active-fill, #f1dedc);
		--blyrics-glow-color: var(--lyric-active-unfill, rgba(255, 255, 255, 0.22));
	}

	:global(.blyrics-container > div),
	:global(.blyrics--line) {
		transition: opacity var(--blyrics-scale-transition-duration, 0.166s) ease, filter var(--blyrics-scale-transition-duration, 0.166s) ease !important;
		will-change: transform, translate, opacity, filter;
		backface-visibility: hidden;
		transform-style: preserve-3d;
	}

	:global(.blyrics--line) {
		font-weight: 800;
		letter-spacing: -0.025em;
	}

	:global(.blyrics--translated) {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.65em;
		font-weight: 600;
		color: var(--lyric-translation, rgba(0, 0, 0, 0.65));
	}

	:global(.blyrics--romanized) {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.55em;
		font-weight: 500;
		color: var(--lyric-romanization, rgba(0, 0, 0, 0.5));
	}

	:global(.dark .blyrics--translated),
	:global([data-theme='dark'] .blyrics--translated) {
		color: var(--lyric-translation, rgba(255, 255, 255, 0.85));
	}

	:global(.dark .blyrics--romanized),
	:global([data-theme='dark'] .blyrics--romanized) {
		color: var(--lyric-romanization, rgba(255, 255, 255, 0.65));
	}

	/* Multi-Singer Alignment */
	:global(.blyrics--line) {
		text-align: left;
	}

	:global(.blyrics--line[data-agent='v1']) {
		text-align: left;
		margin-left: 0;
		margin-right: auto;
	}

	:global(.blyrics--line[data-agent='v2']),
	:global(.blyrics--line[data-agent='v3']),
	:global(.blyrics--line[data-agent='v1000']) {
		text-align: right;
		margin-left: auto;
		margin-right: 0;
	}
</style>
