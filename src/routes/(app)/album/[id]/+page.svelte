<script lang="ts">
    import { onMount } from 'svelte'
    import { page } from '$app/state'
    import Artwork from '$lib/components/Artwork.svelte'
    import Button from '$lib/components/Button.svelte'
    import Header from '$lib/components/Header.svelte'
    import Icon from '$lib/components/icon/Icon.svelte'
    import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
    import { registerRemoteTrack } from '$lib/library/get/value.ts'
    import { generateStableId } from '$lib/services/jiosaavn.ts'
    import { normalizeTracks, spicyamll } from '$lib/services/spicyamll.ts'

    const player = usePlayer()

    let loading = $state(true)
    let error = $state<string | null>(null)
    let albumId = $state('')
    let albumName = $state('')
    let artistName = $state('')
    let artwork = $state<string | undefined>()
    let songIds = $state<number[]>([])

    const artworkUrl = (url: unknown, size = 1200) =>
        typeof url === 'string'
            ? url.replace(/\{w\}/g, String(size)).replace(/\{h\}/g, String(size)).replace(/\{f\}/g, 'jpg').replace(/\{c\}/g, 'bb')
            : undefined

    const load = async () => {
        loading = true
        error = null
        try {
            const response = await spicyamll.album({ id: albumId, l: 'en-US' })
            const tracks = await spicyamll.albumTracks(albumId)
            const normalized = normalizeTracks(tracks)

            const root = response && typeof response === 'object' ? response as Record<string, unknown> : {}
            const data = Array.isArray(root.data) ? root.data[0] : root.data
            const resource = data && typeof data === 'object' ? data as Record<string, unknown> : root
            const attrs = resource.attributes && typeof resource.attributes === 'object'
                ? resource.attributes as Record<string, unknown>
                : resource
            const art = attrs.artwork && typeof attrs.artwork === 'object'
                ? attrs.artwork as Record<string, unknown>
                : {}

            albumName = String(attrs.name || page.url.searchParams.get('name') || 'Album')
            artistName = String(attrs.artistName || page.url.searchParams.get('artist') || '')
            artwork = artworkUrl(art.url) || page.url.searchParams.get('art') || undefined

            songIds = normalized.map((song) => {
                const id = generateStableId(`spicyamll:${song.id}`)
                registerRemoteTrack({
                    id,
                    remoteId: Number(song.id) || 0,
                    streaming: true,
                    uuid: `spicyamll:${song.id}`,
                    name: song.name,
                    album: song.album || albumName,
                    artists: song.artist ? [song.artist] : artistName ? [artistName] : [],
                    year: 'Unknown',
                    duration: song.duration || 0,
                    genre: [],
                    trackNo: 0,
                    trackOf: 0,
                    discNo: 0,
                    discOf: 0,
                    language: undefined,
                    image: song.image ? { optimized: false, small: song.image, full: song.image } : undefined,
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
        } catch (e) {
            error = e instanceof Error ? e.message : 'Unable to load album.'
        } finally {
            loading = false
        }
    }

    const playShuffle = () => {
        if (!songIds.length) return
        const randomIndex = Math.floor(Math.random() * songIds.length)
        player.playTrack(randomIndex, songIds)
    }

    onMount(() => {
        albumId = decodeURIComponent(page.params.id)
        void load()
    })
</script>

<Header title={albumName || 'Album'} />

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
    {#if loading}
        <div class="my-auto flex min-h-80 items-center justify-center">
            <div class="text-title-md text-onSurfaceVariant opacity-60">Loading album...</div>
        </div>
    {:else if error}
        <div class="my-auto flex flex-col items-center justify-center gap-3 text-center">
            <div class="text-title-lg text-error">{error}</div>
            <Button onclick={() => void load()}>Retry</Button>
        </div>
    {:else}
        <div class="flex flex-col gap-6">
            <section class="relative flex w-full flex-col items-center justify-center gap-6 overflow-clip py-4 @2xl:min-h-60 @2xl:flex-row">
                <Artwork
                    src={artwork}
                    fallbackIcon="album"
                    class="h-49 shrink-0 rounded-2xl @2xl:h-full"
                />

                <div class="relative z-0 flex size-full flex-col overflow-clip rounded-2xl bg-surfaceContainerHigh">
                    <div class="flex grow flex-col p-4">
                        <div class="flex items-center gap-2">
                            <Icon type="album" class="size-10 text-onSurface/54" />
                            <h1 class="text-headline-md">{albumName}</h1>
                        </div>

                        {#if artistName}
                            <div class="grid w-full overflow-hidden text-body-lg">
                                <div class="truncate">{artistName}</div>
                            </div>
                        {/if}

                        <div class="mt-1 text-onSurfaceVariant">
                            {m.libraryTracksCount({ count: songIds.length })}
                        </div>
                    </div>

                    <div class="mt-auto flex items-center gap-2 py-4 pr-2 pl-4">
                        <Button
                            kind="filled"
                            class="my-1"
                            disabled={songIds.length === 0}
                            onclick={() => player.playTrack(0, songIds)}
                        >
                            {m.play()}
                        </Button>

                        <Button
                            kind="flat"
                            class="my-1 mr-auto"
                            disabled={songIds.length === 0}
                            onclick={playShuffle}
                        >
                            {m.shuffle()}
                            <Icon type="shuffle" />
                        </Button>
                    </div>
                </div>
            </section>

            <TracksListContainer items={songIds} />
        </div>
    {/if}
</main>
