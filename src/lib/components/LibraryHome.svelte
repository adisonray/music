<script lang="ts">
	import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import AlbumsListContainer from '$lib/components/AlbumsListContainer.svelte'
	import PlaylistListContainer from '$lib/components/playlists/PlaylistListContainer.svelte'
	import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
	import { getLibraryItemIds } from '$lib/library/get/ids.ts'
	import { getLibraryValue } from '$lib/library/get/value.ts'
	import { FAVORITE_PLAYLIST_ID } from '$lib/library/types.ts'

	const SECTION_LIMIT = 8

	let loading = $state(true)
	let playlistIds = $state<number[]>([])
	let albumIds = $state<number[]>([])
	let topPickIds = $state<number[]>([])
	let refreshDate = $state('')

	const dailyHash = (value: string): number => {
		let hash = 2166136261
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index)
			hash = Math.imul(hash, 16777619)
		}
		return hash >>> 0
	}

	const dailyPick = (ids: readonly number[], section: string, date: string, limit: number) =>
		[...ids]
			.sort((a, b) => dailyHash(`${date}:${section}:${a}`) - dailyHash(`${date}:${section}:${b}`))
			.slice(0, limit)

	const getToday = () => {
		const now = new Date()
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
	}

	const loadLibraryHome = async () => {
		loading = true
		const date = getToday()

		try {
			const [playlists, albums, tracks] = await Promise.all([
				getLibraryItemIds('playlists', { sort: 'name' }),
				getLibraryItemIds('albums', { sort: 'name' }),
				getLibraryItemIds('tracks', { sort: 'name' }),
			])

			const downloadedTracks: number[] = []
			for (const trackId of tracks) {
				const track = await getLibraryValue('tracks', trackId, true)
				if (track?.file) downloadedTracks.push(trackId)
			}

			playlistIds = dailyPick(
				playlists.filter((id) => id !== FAVORITE_PLAYLIST_ID),
				'playlists',
				date,
				SECTION_LIMIT,
			)
			albumIds = dailyPick(albums, 'albums', date, SECTION_LIMIT)
			topPickIds = dailyPick(downloadedTracks, 'top-picks', date, SECTION_LIMIT)
			refreshDate = date
		} finally {
			loading = false
		}
	}

	let refreshTimer: number | undefined

	const scheduleDailyRefresh = () => {
		if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)

		const now = new Date()
		const nextDay = new Date(now)
		nextDay.setHours(24, 0, 2, 0)
		refreshTimer = window.setTimeout(() => {
			void loadLibraryHome()
			scheduleDailyRefresh()
		}, Math.max(1000, nextDay.getTime() - now.getTime()))
	}

	onMount(() => {
		void loadLibraryHome()

		const onLibraryUpdated = () => void loadLibraryHome()
		window.addEventListener('adi-music-library-updated', onLibraryUpdated)

		scheduleDailyRefresh()

		return () => {
			window.removeEventListener('adi-music-library-updated', onLibraryUpdated)
			if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
		}
	})
</script>

<main class="mx-auto flex min-h-full w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
	<header class="flex items-end justify-between gap-4 py-8">
		<div>
			<h1 class="text-headline-lg font-semibold text-onSurface">Library</h1>
			<p class="mt-1 text-body-lg text-onSurfaceVariant">Your offline music, all in one place.</p>
		</div>
		<div class="hidden items-center gap-1 text-body-sm text-onSurfaceVariant @sm:flex">
			<Icon type="cached" class="size-4" />
			<span>Updates daily</span>
		</div>
	</header>

	{#if loading}
		<div class="flex min-h-72 items-center justify-center text-onSurfaceVariant">
			<div class="animate-pulse">Refreshing your library...</div>
		</div>
	{:else if playlistIds.length === 0 && albumIds.length === 0 && topPickIds.length === 0}
		<div class="m-auto flex max-w-md flex-col items-center justify-center gap-3 py-20 text-center">
			<Icon type="album" class="size-24 opacity-40" />
			<h2 class="text-title-lg">Your library is empty</h2>
			<p class="text-body-md text-onSurfaceVariant">Download some music and it will appear here.</p>
			<Button as="a" href="/discovery">
				<Icon type="compass" />
				Explore music
			</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-10">
			{#if topPickIds.length > 0}
				<section aria-labelledby="library-top-picks">
					<div class="mb-3 flex items-end justify-between gap-3">
						<div>
							<h2 id="library-top-picks" class="text-title-lg font-semibold">Top Picks</h2>
							<p class="text-body-sm text-onSurfaceVariant">Picked from your offline library • refreshes daily</p>
						</div>
						<Button as="a" href="/library/tracks" kind="flat">View all</Button>
					</div>
					<div class="overflow-hidden rounded-2xl bg-surfaceContainerHigh">
						<TracksListContainer items={topPickIds} showDownloadButton={false} />
					</div>
				</section>
			{/if}

			{#if playlistIds.length > 0}
				<section aria-labelledby="library-playlists">
					<div class="mb-3 flex items-end justify-between gap-3">
						<div>
							<h2 id="library-playlists" class="text-title-lg font-semibold">Playlists</h2>
							<p class="text-body-sm text-onSurfaceVariant">Your saved collections</p>
						</div>
						<Button as="a" href="/library/playlists" kind="flat">View all</Button>
					</div>
					<div class="overflow-hidden rounded-2xl bg-surfaceContainerHigh p-2">
						<PlaylistListContainer
						items={playlistIds}
						onItemClick={({ playlist }) => {
							void goto(resolve('/(app)/library/[[slug=libraryEntities]]/[uuid]', {
								slug: 'playlists',
								uuid: playlist.uuid,
							}))
						}}
					/>
					</div>
				</section>
			{/if}

			{#if albumIds.length > 0}
				<section aria-labelledby="library-albums">
					<div class="mb-3 flex items-end justify-between gap-3">
						<div>
							<h2 id="library-albums" class="text-title-lg font-semibold">Albums</h2>
							<p class="text-body-sm text-onSurfaceVariant">A daily rotation from your offline albums</p>
						</div>
						<Button as="a" href="/library/albums" kind="flat">View all</Button>
					</div>
					<AlbumsListContainer items={albumIds} />
				</section>
			{/if}

			{#if refreshDate}
				<p class="text-center text-body-sm text-onSurfaceVariant/60">Updated {refreshDate}</p>
			{/if}
		</div>
	{/if}
</main>
