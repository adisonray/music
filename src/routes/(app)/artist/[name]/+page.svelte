<script lang="ts">
	import { page } from '$app/state'
	import { onMount } from 'svelte'
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import Spinner from '$lib/components/Spinner.svelte'
	import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { generateStableId } from '$lib/services/jiosaavn.ts'
	import { normalizeTracks, parseDiscoveryResults, spicyamll, type DiscoveryResource } from '$lib/services/spicyamll.ts'

	const player = usePlayer()

	let loading = $state(true)
	let error = $state<string | null>(null)
	let artistId = $state('')
	let artist = $state('')
	let artistArt = $state<string | undefined>()
	let songs = $state<DiscoveryResource[]>([])
	let albums = $state<DiscoveryResource[]>([])
	let songIds = $state<number[]>([])

	const cleanArtwork = (url: unknown, size = 1200): string | undefined => {
		if (typeof url !== 'string' || !url.trim()) return undefined
		return url
			.trim()
			.replace(/\{w\}/g, String(size))
			.replace(/\{h\}/g, String(size))
			.replace(/\{c\}/g, 'bb')
			.replace(/\{f\}/g, 'jpg')
			.replace(/\d+x\d+bb\./, `${size}x${size}bb.`)
	}

	const resourceList = (input: unknown, type: 'song' | 'album'): DiscoveryResource[] => {
		const parsed = parseDiscoveryResults(input).filter((item) => item.type === type)
		if (parsed.length) return parsed

		const tracks = normalizeTracks(input)
		return tracks.map((track) => ({
			type,
			id: String(track.id),
			name: track.name || 'Unknown',
			artist: track.artist || artist,
			album: track.album || (type === 'album' ? track.name : ''),
			artUrl: cleanArtwork(track.image) || '',
			duration: track.duration,
			genre: '',
			bio: '',
		}))
	}

	const registerSongs = (items: DiscoveryResource[]) => {
		songIds = items.map((song) => {
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

	const getArtistName = (input: unknown): string | undefined => {
		if (!input || typeof input !== 'object') return undefined
		const root = input as Record<string, unknown>
		const attrs = root.attributes && typeof root.attributes === 'object'
			? root.attributes as Record<string, unknown>
			: root
		return typeof attrs.name === 'string' && attrs.name.trim() ? attrs.name.trim() : undefined
	}

	const getArtistArtwork = (input: unknown): string | undefined => {
		if (!input || typeof input !== 'object') return undefined
		const root = input as Record<string, unknown>
		const attrs = root.attributes && typeof root.attributes === 'object'
			? root.attributes as Record<string, unknown>
			: root
		const artwork = attrs.artwork && typeof attrs.artwork === 'object'
			? attrs.artwork as Record<string, unknown>
			: undefined
		return cleanArtwork(artwork?.url ?? attrs.artworkUrl100 ?? attrs.artworkUrl)
	}

	const load = async () => {
		loading = true
		error = null

		try {
			const nameHint = page.url.searchParams.get('name')?.trim() || ''
			const artHint = cleanArtwork(page.url.searchParams.get('art'), 1200)

			let profile: unknown = null
			for (const params of [{ id: artistId }, { artist: artistId }, { artistId }]) {
				try {
					profile = await spicyamll.artist(params)
					if (profile) break
				} catch {}
			}

			artist = getArtistName(profile) || nameHint || artistId
			artistArt = artHint || getArtistArtwork(profile)

			const [songsResponse, albumsResponse] = await Promise.all([
				spicyamll.artistSongs({ artist: artistId }),
				spicyamll.artistAlbums({ artist: artistId }),
			])

			songs = resourceList(songsResponse, 'song')
			albums = resourceList(albumsResponse, 'album')

			// Some deployments key the endpoint by id instead of artist.
			if (!songs.length) {
				for (const params of [{ id: artistId }, { artistId }]) {
					try {
						songs = resourceList(await spicyamll.artistSongs(params), 'song')
						if (songs.length) break
					} catch {}
				}
			}

			if (!albums.length) {
				for (const params of [{ id: artistId }, { artistId }]) {
					try {
						albums = resourceList(await spicyamll.artistAlbums(params), 'album')
						if (albums.length) break
					} catch {}
				}
			}

			const firstSongArt = songs.find((song) => song.artUrl)?.artUrl
			const firstAlbumArt = albums.find((album) => album.artUrl)?.artUrl
			artistArt = artistArt || firstAlbumArt || firstSongArt

			// If the artist endpoint has no PFP, search results can still provide
			// an Apple Music artist resource with artwork.
			if (!artistArt && artist) {
				try {
					const matches = await import('$lib/services/spicyamll.ts').then(({ searchDiscovery }) => searchDiscovery(artist, 20))
					const match = matches.find(
						(item) => item.type === 'artist' && item.name.toLowerCase() === artist.toLowerCase(),
					)
					artistArt = match?.artUrl || firstAlbumArt || firstSongArt
				} catch {}
			}

			registerSongs(songs)
			if (!songs.length && !albums.length) {
				throw new Error('No songs or albums were found for this artist.')
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to load artist profile.'
		} finally {
			loading = false
		}
	}

	const playSongs = () => {
		if (songIds.length) player.playTrack(0, songIds)
	}

	const shuffleSongs = () => {
		if (songIds.length) player.playTrack(0, songIds, { shuffle: true })
	}

	onMount(() => {
		artistId = decodeURIComponent(page.params.name)
		void load()
	})

	let latestAlbum = $derived(albums[0] ?? null)
	let latestArtwork = $derived(latestAlbum?.artUrl || songs.find((song) => song.artUrl)?.artUrl || artistArt)
</script>

<Header title={artist || 'Artist'} />

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
	{#if loading}
		<div class="my-auto flex min-h-80 items-center justify-center">
			<Spinner class="size-8" />
		</div>
	{:else if error}
		<div class="my-auto flex min-h-80 flex-col items-center justify-center gap-3 text-center">
			<div class="text-title-lg text-error">{error}</div>
			<Button onclick={() => void load()}>Retry</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-8">
			<section class="relative overflow-hidden rounded-3xl bg-surfaceContainerHigh">
				{#if latestArtwork}
					<div
						class="absolute inset-0 bg-cover bg-center opacity-25 blur-2xl"
						style={`background-image:url("${latestArtwork}")`}
					></div>
				{/if}
				<div class="relative flex flex-col gap-6 p-5 sm:p-7 @2xl:flex-row @2xl:items-end">
					<Artwork
						src={artistArt || latestArtwork}
						fallbackIcon="person"
						class="size-40 shrink-0 rounded-full sm:size-48 @2xl:size-56"
					/>
					<div class="min-w-0 flex-1">
						<div class="mb-2 text-label-md uppercase tracking-wider text-onSurfaceVariant">Artist</div>
						<h1 class="truncate text-display-sm sm:text-display-md">{artist}</h1>
						<p class="mt-2 text-body-md text-onSurfaceVariant">
							{songs.length} {songs.length === 1 ? 'song' : 'songs'} • {albums.length} {albums.length === 1 ? 'album' : 'albums'}
						</p>
						<div class="mt-5 flex flex-wrap items-center gap-2">
							<Button kind="filled" disabled={!songIds.length} onclick={playSongs}>{m.play()}</Button>
							<Button kind="flat" disabled={!songIds.length} onclick={shuffleSongs}>
								{m.shuffle()}
								<Icon type="shuffle" />
							</Button>
						</div>
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
						<Button kind="flat" onclick={playSongs}>{m.play()}</Button>
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
					<div class="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{#each albums as album (album.id)}
							<a
								href={`/album/${encodeURIComponent(album.id)}?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(album.artist || artist)}&art=${encodeURIComponent(album.artUrl)}`}
								class="interactable group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surfaceContainerHigh"
							>
								<Artwork
									src={album.artUrl || songs.find((song) => song.album.toLowerCase() === album.name.toLowerCase())?.artUrl}
									fallbackIcon="album"
									class="aspect-square w-full rounded-[inherit]"
								/>
								<div class="min-w-0 px-3 py-3">
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
