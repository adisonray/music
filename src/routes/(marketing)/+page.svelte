<script lang="ts">
	import { page } from '$app/state'
	import { APP_NAME_EN, APP_URL } from '$lib/app-metadata.ts'
	import Button from '$lib/components/Button.svelte'
	import IconButton from '$lib/components/IconButton.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import productShowcase from './assets/hero.avif'
	import FeaturesSection from './components/FeaturesSection.svelte'
	import GettingStartedSection from './components/GettingStartedSection.svelte'
	import HeroSection from './components/HeroSection.svelte'
	import HowItWorksSection from './components/HowItWorksSection.svelte'
	import SoundControlsSection from './components/SoundControlsSection.svelte'

	const seoTitle = `${APP_NAME_EN} - A music player built around your library`
	const seoDescription = 'Browse your music by artist and album, follow synced lyrics, build playlists, and tune playback with a Material interface that adapts to your music.'
	const canonicalUrl = `${APP_URL}${page.url.pathname}`

	const trackOpenPlayerClick = (location: 'header' | 'hero' | 'getting-started') => {
		window.goatcounter?.count({
			path: `click-marketing-open-player-${location}`,
			title: `Clicked marketing Open Player (${location})`,
			event: true,
		})
	}

	const schemaJson = $derived(
		JSON.stringify(
			[
				{
					'@context': 'https://schema.org',
					'@type': 'WebApplication',
					name: APP_NAME_EN,
					applicationCategory: 'MultimediaApplication',
					applicationSubCategory: 'Music Player',
					operatingSystem: 'Any',
					browserRequirements: 'Requires a modern web browser',
					description: seoDescription,
					url: canonicalUrl,
					image: `${APP_URL}${productShowcase.src}`,
					offers: {
						'@type': 'Offer',
						price: '0',
						priceCurrency: 'USD',
					},
					sameAs: ['https://github.com/adidotzip/music'],
					featureList: [
						'Play music stored on your device',
						'Works in modern browsers on Android and iOS, plus Chromebooks, Windows PCs, and Macs',
						'Works offline with no account or uploads',
						'Organizes tracks into albums, artists, playlists, and favorites',
						'Includes queue, shuffle, repeat, history, equalizer, and playback speed controls',
						'Artwork colors adapt to your music',
					],
				},
			],
			null,
			0,
		),
	)
</script>

<svelte:head>
	<title>{seoTitle}</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="keywords"
		content="music player, browser music player, local music, playlists, queue, lyrics, artists, albums, favorites, equalizer, playback speed, dynamic colors"
	/>
	<meta name="robots" content="index,follow,max-image-preview:large" />
	<meta name="application-name" content={APP_NAME_EN} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={seoTitle} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={`${APP_URL}${productShowcase.src}`} />
	<meta property="og:image:alt" content="Adi Music showing artist, album, and lyrics player views" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={seoTitle} />
	<meta name="twitter:description" content={seoDescription} />
	<meta name="twitter:image" content={`${page.url.origin}${productShowcase.src}`} />

	<link rel="canonical" href={canonicalUrl} />

	{@html `<script type="application/ld+json">${schemaJson}</script>`}
</svelte:head>

<header class="mktg-content-width flex-row justify-start gap-2 py-4">
	<div
		class="mr-auto flex items-center gap-2 text-title-sm font-medium text-onSurface xs:text-title-md"
	>
		<img src="/icons/responsive.svg" width="24" height="24" alt="" class="size-6" />
		{m.appName()}
	</div>

	<IconButton
		as="a"
		href="https://github.com/adidotzip/music"
		target="_blank"
		kind="flat"
		tooltip="View source code on GitHub"
	>
		<Icon type="github" />
	</IconButton>

	<Button
		as="a"
		href="/library/tracks"
		kind="outlined"
		class="max-sm:hidden"
		onclick={() => trackOpenPlayerClick('header')}
	>
		Open Player
	</Button>
</header>

<main class="flex flex-col gap-14 select-text md:gap-32">
	<HeroSection onOpenPlayerClick={() => trackOpenPlayerClick('hero')} />

	<HowItWorksSection />

	<FeaturesSection />

	<SoundControlsSection />

	<GettingStartedSection onOpenPlayerClick={() => trackOpenPlayerClick('getting-started')} />
</main>

<footer class="w-full border-t border-outlineVariant bg-shadow/7">
	<div class="mktg-content-width items-center justify-between gap-4 py-8 sm:flex-row">
		<div class="flex items-center gap-2 text-label-lg font-medium text-onSurfaceVariant">
			<img
				src="/icons/responsive.svg"
				width="24"
				height="24"
				alt="Logo"
				class="size-5 opacity-60"
			/>
			{m.appName()}
		</div>

		<div class="flex items-center gap-6 text-body-md">
			<a
				href="https://github.com/adidotzip/music"
				rel="noopener noreferrer"
				target="_blank"
				class="flex items-center gap-1.5 text-onSurfaceVariant transition-colors duration-200 hover:text-onSurface"
			>
				<Icon type="github" class="h-4 w-4" />
				{m.aboutSourceCode()}
			</a>

			<a
				href="https://github.com/adidotzip/music#privacy"
				rel="noopener noreferrer"
				target="_blank"
				class="text-onSurfaceVariant transition-colors duration-200 hover:text-onSurface"
			>
				{m.aboutPrivacy()}
			</a>
		</div>
	</div>
</footer>
