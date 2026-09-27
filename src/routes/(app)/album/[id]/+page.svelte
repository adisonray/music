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
    import {
        cancelTrackDownload,
        ensureTrackIsStoredLocally,
        getStoredLocalTrackId,
        isDownloadAbortError,
    } from '$lib/library/local-download.ts'
    import { dbRemoveTracks } from '$lib/library/remove.ts'
    import { snackbar } from '$lib/components/snackbar/snackbar.ts'

    const player = usePlayer()

    let loading = $state(true)
    let error = $state<string | null>(null)
    let albumId = $state('')
    let albumName = $state('')
    let artistName = $state('')
    let artwork = $state<string | undefined>()
    let songIds = $state<number[]>([])
    type AlbumDownloadStatus = 'queued' | 'downloading' | 'done' | 'error'
    type AlbumDownloadItem = {
        id: number
        name: string
        status: AlbumDownloadStatus
        progress: number
    }

    let downloadingAlbum = $state(false)
    let albumDownloadProgress = $state(0)
    let albumDownloadItems = $state<AlbumDownloadItem[]>([])
    let currentDownloadId = $state<number | undefined>()
    let albumDownloadGeneration = 0
    let downloadedDuringAlbumSession: number[] = []
    let downloadedRemoteIdsDuringAlbumSession: number[] = []

    const artworkUrl = (url: unknown, size = 1200) => {
        if (typeof url !== 'string' || !url) return undefined
        return url
            .replace(/\{w\}/g, String(size))
            .replace(/\{h\}/g, String(size))
            .replace(/\{f\}/g, 'jpg')
            .replace(/\{c\}/g, 'bb')
            .replace(/\d+x\d+bb\./, `${size}x${size}bb.`)
    }

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
            artwork = page.url.searchParams.get('art') || artworkUrl(art.url) || normalized.find((song) => song.image)?.image || undefined

            albumDownloadItems = normalized.map((song) => ({
                id: generateStableId(`spicyamll:${song.id}`),
                name: song.name,
                status: 'queued' as const,
                progress: 0,
            }))

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

    const stopAlbumDownload = async () => {
        albumDownloadGeneration += 1
        const idsToRemove = [...downloadedDuringAlbumSession]
        const remoteIdsToReset = [...downloadedRemoteIdsDuringAlbumSession]
        downloadedDuringAlbumSession = []
        downloadedRemoteIdsDuringAlbumSession = []

        if (currentDownloadId !== undefined) {
            cancelTrackDownload(currentDownloadId)
        }

        downloadingAlbum = false
        currentDownloadId = undefined
        albumDownloadProgress = 0
        for (const item of albumDownloadItems) {
            if (remoteIdsToReset.includes(item.id)) {
                item.status = 'queued'
                item.progress = 0
            } else if (item.status !== 'done') {
                item.status = 'queued'
                item.progress = 0
            }
        }

        if (idsToRemove.length > 0) {
            await dbRemoveTracks(idsToRemove)
        }
    }

    const downloadAlbum = async () => {
        if (!songIds.length) return
        if (downloadingAlbum) {
            await stopAlbumDownload()
            return
        }

        const generation = ++albumDownloadGeneration
        downloadingAlbum = true
        albumDownloadProgress = 0
        downloadedDuringAlbumSession = []
        downloadedRemoteIdsDuringAlbumSession = []

        for (const item of albumDownloadItems) {
            const localId = await getStoredLocalTrackId(item.id)
            item.status = localId !== undefined ? 'done' : 'queued'
            item.progress = localId !== undefined ? 100 : 0
        }

        try {
            const pendingItems = albumDownloadItems.filter((item) => item.status !== 'done')
            let completed = albumDownloadItems.filter((item) => item.status === 'done').length

            for (const item of pendingItems) {
                if (generation !== albumDownloadGeneration) return

                currentDownloadId = item.id
                item.status = 'downloading'
                item.progress = 0

                try {
                    const localId = await ensureTrackIsStoredLocally(item.id, (progress) => {
                        if (generation !== albumDownloadGeneration) return
                        item.progress = progress
                        albumDownloadProgress = Math.round(
                            ((completed + progress / 100) / albumDownloadItems.length) * 100,
                        )
                    })

                    if (generation !== albumDownloadGeneration) return
                    item.status = 'done'
                    item.progress = 100
                    completed += 1
                    downloadedDuringAlbumSession.push(localId)
                    downloadedRemoteIdsDuringAlbumSession.push(item.id)
                    albumDownloadProgress = Math.round((completed / albumDownloadItems.length) * 100)
                } catch (error) {
                    if (generation !== albumDownloadGeneration || isDownloadAbortError(error)) return
                    item.status = 'error'
                    throw error
                } finally {
                    if (generation === albumDownloadGeneration) currentDownloadId = undefined
                }
            }
        } catch (error) {
            if (!isDownloadAbortError(error)) snackbar.unexpectedError(error)
        } finally {
            if (generation === albumDownloadGeneration) {
                downloadingAlbum = false
                currentDownloadId = undefined
            }
        }
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
                        <button
                            type="button"
                            class="interactable flex size-13 shrink-0 items-center justify-center rounded-full text-onSurfaceVariant"
                            disabled={songIds.length === 0}
                            aria-label={downloadingAlbum ? 'Stop downloading album' : 'Download album for offline playback'}
                            title={downloadingAlbum ? 'Stop downloading album' : 'Download album for offline playback'}
                            onclick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void downloadAlbum()
                            }}
                        >
                            {#if downloadingAlbum}
                                <span class="relative flex size-8 items-center justify-center rounded-full">
                                    <span
                                        class="absolute inset-0 rounded-full"
                                        style="background: conic-gradient(var(--color-primary) {albumDownloadProgress}%, color-mix(in srgb, var(--color-onSurface) 14%, transparent) 0)"
                                    ></span>
                                    <span class="absolute inset-1 flex items-center justify-center rounded-full bg-surfaceContainerHigh">
                                        <Icon type="close" class="size-4" />
                                    </span>
                                </span>
                            {:else}
                                <Icon type="download" class="size-6" />
                            {/if}
                        </button>

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

            {#if albumDownloadItems.length > 0}
                <section class="rounded-2xl bg-surfaceContainerHigh p-4" aria-live="polite">
                    <div class="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <h2 class="text-title-md">Album downloads</h2>
                            <div class="text-body-sm text-onSurfaceVariant">
                                {albumDownloadItems.filter((item) => item.status === 'done').length}/{albumDownloadItems.length} files downloaded
                            </div>
                        </div>
                        {#if downloadingAlbum}
                            <div class="text-body-sm tabular-nums text-primary">{albumDownloadProgress}%</div>
                        {/if}
                    </div>

                    <div class="grid gap-1">
                        {#each albumDownloadItems as item (item.id)}
                            <div class="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2">
                                <div class="flex size-8 shrink-0 items-center justify-center">
                                    {#if item.status === 'done'}
                                        <Icon type="check" class="size-5 text-primary" />
                                    {:else if item.status === 'downloading'}
                                        <div class="size-5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true"></div>
                                    {:else if item.status === 'error'}
                                        <Icon type="alertCircle" class="size-5 text-error" />
                                    {:else}
                                        <Icon type="download" class="size-5 text-onSurfaceVariant" />
                                    {/if}
                                </div>
                                <div class="min-w-0 grow truncate text-body-md">{item.name}</div>
                                {#if item.status === 'downloading'}
                                    <div class="text-body-sm tabular-nums text-onSurfaceVariant">{item.progress}%</div>
                                {:else if item.status === 'done'}
                                    <div class="text-body-sm text-primary">Offline</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}

            <TracksListContainer items={songIds} downloadButtonLarge />
        </div>
    {/if}
</main>
