<script lang="ts">
	import Button from '$lib/components/Button.svelte'
	import productShowcase from '../assets/hero.avif'

	interface Props {
		onOpenPlayerClick: (event: MouseEvent) => void
	}

	const { onOpenPlayerClick }: Props = $props()
</script>

<section
	class="mktg-content-width @container relative mx-auto grid w-full items-center gap-10 overflow-hidden px-6 pt-16 pb-4 lg:grid-cols-[0.82fr_1.18fr] lg:gap-12 lg:py-24"
>
	<div class="relative z-10 text-center lg:text-left">
		<div
			class="mb-5 inline-flex items-center gap-2 rounded-full border border-outlineVariant bg-surfaceContainerHigh px-3.5 py-2 text-label-md font-medium text-onSurfaceVariant"
		>
			<span class="size-2 rounded-full bg-primary"></span>
			Material Design • Dynamic colors
		</div>

		<h1 class="hero-title mb-6 font-bold text-onSurface">
			Your music,
			<span class="inline-block text-primary">organized around you.</span>
		</h1>

		<p
			class="mx-auto mb-7 max-w-2xl text-title-md leading-relaxed text-onSurfaceVariant sm:text-title-lg lg:mx-0 lg:max-w-xl"
		>
			Browse artists and albums, follow synced lyrics, shape the sound with an equalizer, and keep
			your playlists and queue close.
		</p>

		<div
			class="mx-auto grid max-w-120 grid-cols-1 items-center justify-center gap-4 sm:grid-cols-2 lg:mx-0 lg:justify-start"
		>
			<Button
				as="a"
				href="/library/tracks"
				kind="filled"
				class="w-full"
				onclick={onOpenPlayerClick}
			>
				Open Player
			</Button>
			<Button as="a" href="#features" kind="outlined" class="w-full">Explore features</Button>
		</div>

		<div class="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-body-md text-onSurfaceVariant lg:justify-start">
			<span>Private by default</span>
			<span aria-hidden="true">•</span>
			<span>Works offline</span>
			<span aria-hidden="true">•</span>
			<span>Open source</span>
		</div>
	</div>

	<div class="product-stage relative min-w-0">
		<div class="product-glow"></div>
		<div class="product-frame">
			<img
				class="product-image block h-auto w-full"
				src={productShowcase.src}
				alt="Adi Music showing the player with lyrics alongside artist and album views"
				loading="eager"
				fetchpriority="high"
			/>
		</div>

		<div class="product-chip product-chip-top">
			<div class="text-label-sm text-onSurfaceVariant">Adaptive interface</div>
			<div class="mt-1 text-title-sm font-semibold text-onSurface">Artwork colors follow the track</div>
		</div>

		<div class="product-chip product-chip-bottom">
			<div class="text-label-sm text-onSurfaceVariant">Listening tools</div>
			<div class="mt-1 text-title-sm font-semibold text-onSurface">Lyrics · Queue · Equalizer</div>
		</div>
	</div>
</section>

<style lang="postcss">
	@reference '../../../app.css';

	.hero-title {
		font-size: clamp(3.1rem, 7cqw, 6.5rem);
		line-height: 0.94;
		letter-spacing: -0.055em;
		text-wrap: balance;
	}

	.product-stage {
		padding: 0.75rem 0.5rem 1rem;
	}

	.product-frame {
		position: relative;
		overflow: hidden;
		border: 1px solid --alpha(var(--color-outline) / 0.2);
		border-radius: 2rem;
		background: var(--color-surfaceContainer);
		padding: 0.65rem;
		box-shadow:
			0 30px 70px --alpha(var(--color-shadow) / 0.24),
			0 0 0 1px --alpha(var(--color-primary) / 0.08);
		transform: perspective(1600px) rotateY(-2deg) rotateX(1deg);
	}

	.product-image {
		border-radius: 1.45rem;
	}

	.product-glow {
		position: absolute;
		inset: 10% 8% 5%;
		border-radius: 50%;
		background:
			radial-gradient(circle at 20% 20%, --alpha(var(--color-primary) / 0.22), transparent 45%),
			radial-gradient(circle at 80% 75%, --alpha(var(--color-secondary) / 0.2), transparent 42%);
		filter: blur(45px);
		pointer-events: none;
	}

	.product-chip {
		position: absolute;
		z-index: 2;
		border: 1px solid --alpha(var(--color-outline) / 0.22);
		border-radius: 1.25rem;
		background: --alpha(var(--color-surfaceContainerHighest) / 0.92);
		padding: 0.75rem 0.9rem;
		box-shadow: 0 12px 28px --alpha(var(--color-shadow) / 0.16);
		backdrop-filter: blur(16px);
	}

	.product-chip-top {
		top: 0;
		right: -0.5rem;
	}

	.product-chip-bottom {
		bottom: 0;
		left: -0.5rem;
	}

	@media (width < --theme(--breakpoint-lg)) {
		.product-frame {
			transform: none;
		}

		.product-chip-top {
			right: 0;
		}

		.product-chip-bottom {
			left: 0;
		}
	}

	@media (width < --theme(--breakpoint-sm)) {
		.product-chip {
			display: none;
		}

		.product-stage {
			padding-inline: 0;
		}

		.product-frame {
			border-radius: 1.5rem;
			padding: 0.4rem;
		}

		.product-image {
			border-radius: 1.1rem;
		}
	}
</style>