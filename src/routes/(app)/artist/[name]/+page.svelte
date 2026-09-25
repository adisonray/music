<script lang="ts">
	import { page } from '$app/state'
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
	import Spinner from '$lib/components/Spinner.svelte'
	import { generateStableId } from '$lib/services/jiosaavn.ts'
	import { getLyricsflowArtistProfile } from '$lib/services/lyricsflow.ts'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { spicyamll } from '$lib/services/spicyamll.ts'
	import { onMount } from 'svelte'
	import { fade, fly, scale } from 'svelte/transition'
	import { cubicOut } from 'svelte/easing'

	const menu = useMenu()
	const player = usePlayer()

	let loading = $state(true)
	let error = $state<string | null>(null)
	let artistId = $state('')
	let artistNameHint = $state('')
	let artist = $state('')
	let artistArt = $state<string | undefined>()
	let songs = $state<DiscoveryResource[]>([])
	let albums = $state<DiscoveryResource[]>([])
	let songIds = $state<number[]>([])

	const registerSongs = () => {
		songIds = songs.map((song) => {
			const id = generateStableId(`spicyamll:${song.id}`)
			registerRemoteTrack({
				id,
				remoteId: Number(song.id) || 0,
				streaming: true,
				uuid: `spicyamll:${song.id}`,
				name: song.name,
				album: song.album || 'Unknown Album',
				artists: song.artist ? [song.artist] : [artist],
				year: 'Unknown',
				duration: song.duration || 0,
				genre: [],
				trackNo: 0,
				trackOf: 0,
				discNo: 0,
				discOf: 0,
				language: undefined,
				image: song.artUrl ? { optimized: false, small: song.artUrl, full: song.artUrl } : undefined,
				primaryColor: undefined,
				file: undefined,
				directory: undefined,
				fileName: undefined,
				scannedAt: Date.now(),
				url: spicyamll.streamUrl(song.id, { codec: 'aac', fallback: true, language: 'en-US' }),
				favorite: false,
				type: 'track',
			})
			return id
		})
	}

	const load = async () => {
		loading = true
		error = null
		try {
			const profile = await getLyricsflowArtistProfile(artistId, artistNameHint)
			artist = profile.name
			artistArt = profile.artUrl
			songs = profile.songs
			albums = profile.albums
			registerSongs()
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to load artist profile.'
		} finally {
			loading = false
		}
	}

	const playSong = (index: number) => {
		if (!songIds.length) return
		player.playTrack(index, songIds)
	}

	const playTopSong = (index: number) => {
		const topIds = songIds.slice(0, 10)
		if (!topIds.length) return
		player.playTrack(index, topIds)
	}

	let latestAlbum = $derived(albums[0] ?? null)
	let latestSong = $derived(songs[0] ?? null)
	let latestArtwork = $derived(latestAlbum?.artUrl || latestSong?.artUrl || artistArt)
	let latestName = $derived(latestAlbum?.name || latestSong?.album || 'Latest Release')
	let latestArtist = $derived(latestAlbum?.artist || artist)

	onMount(() => {
		artistId = decodeURIComponent(page.params.name)
		artistNameHint = page.url.searchParams.get('name')?.trim() || ''
		void load()
	})
</script>

<Header title={artist || 'Artist'} />

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
	{#if loading}
		<div class="my-auto flex min-h-80 items-center justify-center">
			<Spinner class="size-8" />
		</div>
	{:else if error}
		<div class="my-auto flex flex-col items-center justify-center gap-3 text-center">
			<div class="text-title-lg text-error">{error}</div>
			<Button onclick={() => void load()}>Retry</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-6 pb-4">
			<section class="relative flex w-full flex-col items-center justify-center gap-6 overflow-clip py-4 @2xl:min-h-60 @2xl:flex-row">
				<Artwork
					src={artistArt}
					fallbackIcon="person"
					class="size-49 shrink-0 rounded-full @2xl:size-52"
				/>

				<div class="relative z-0 flex size-full flex-col overflow-clip rounded-2xl bg-surfaceContainerHigh">
					<div class="flex grow flex-col p-4">
						<div class="flex items-center gap-2">
							<Icon type="person" class="size-10 text-onSurface/54" />
							<h1 class="truncate text-headline-md">{artist}</h1>
						</div>
						<div class="mt-1 text-onSurfaceVariant">
							{songs.length} songs • {albums.length} {albums.length === 1 ? 'album' : 'albums'}
						</div>
					</div>

					<div class="mt-auto flex items-center gap-2 py-4 pr-2 pl-4">
						<Button
							kind="filled"
							class="my-1"
							disabled={songIds.length === 0}
							onclick={() => playSong(0)}
						>
							{m.play()}
						</Button>
						<Button
							kind="flat"
							class="my-1 mr-auto"
							disabled={songIds.length === 0}
							onclick={() => {
								player.playTrack(0, songIds, { shuffle: true })
							}}
						>
							{m.shuffle()}
							<Icon type="shuffle" />
						</Button>
					</div>
				</div>
			</section>

			{#if songs.length}
				<section class="flex flex-col gap-3">
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg">Top Songs</h2>
						<span class="text-body-sm text-onSurfaceVariant">{Math.min(songs.length, 10)} of {songs.length}</span>
					</div>
					<TracksListContainer items={songIds.slice(0, 10)} />
				</section>

				<section class="flex flex-col gap-3">
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg">All Songs</h2>
						<Button kind="flat" onclick={() => playSong(0)}>{m.play()}</Button>
					</div>
					<TracksListContainer items={songIds} />
				</section>
			{/if}

			{#if albums.length}
				<section class="flex flex-col gap-3">
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg">Albums</h2>
						<span class="text-body-sm text-onSurfaceVariant">{albums.length}</span>
					</div>

					<div class="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{#each albums as album (album.id)}
							<a
								href={`/album/${encodeURIComponent(album.id)}?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(album.artist || artist)}&art=${encodeURIComponent(album.artUrl)}`}
								class="interactable flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surfaceContainerHigh text-left"
							>
								<Artwork
									src={album.artUrl}
									fallbackIcon="album"
									class="aspect-square w-full rounded-[inherit]"
								/>
								<div class="flex min-h-18 w-full flex-col justify-center overflow-hidden px-3 py-3">
									<div class="truncate text-body-md">{album.name}</div>
									<div class="truncate text-body-sm text-onSurfaceVariant">{album.artist || artist}</div>
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</main>
