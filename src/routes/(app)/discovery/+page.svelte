<script lang="ts">
    import { onMount } from 'svelte'
import { browser } from '$app/environment'
    import { goto } from '$app/navigation'
    import Artwork from '$lib/components/Artwork.svelte'
    import Button from '$lib/components/Button.svelte'
    import Header from '$lib/components/Header.svelte'
    import IconButton from '$lib/components/IconButton.svelte'
    import Icon from '$lib/components/icon/Icon.svelte'
    import MenuButton from '$lib/components/MenuButton.svelte'
    import Separator from '$lib/components/Separator.svelte'
    import Spinner from '$lib/components/Spinner.svelte'
    import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
    import { useSetOverlaySnippet } from '$lib/layout-bottom-bar.svelte'
    import { registerRemoteTrack } from '$lib/library/get/value.ts'
    import { UNKNOWN_ITEM } from '$lib/library/types.ts'
    import {
        cacheDiscoveryRecommendations,
        getCachedDiscoveryRecommendations,
    } from '$lib/services/discovery-cache.ts'
    import { generateStableId } from '$lib/services/jiosaavn.ts'
    import { getRecentlyPlayed } from '$lib/services/library.ts'
    import {
        type DiscoveryResource,
        type DiscoveryTrack,
        getSongsForArtist,
        normalizeTracks,
        parseDiscoveryResults,
        searchDiscovery,
        spicyamll,
    } from '$lib/services/spicyamll.ts'

    type DiscoveryItem = DiscoveryResource

    const player = usePlayer()

    let query = $state('')
    let loading = $state(false)
    let loadingRecommendations = $state(false)
    let error = $state<string | null>(null)
    let searched = $state(false)
    let isOnline = $state(browser ? navigator.onLine : true)

    let results = $state<DiscoveryItem[]>([])
    let topPicks = $state<DiscoveryItem[]>([])
    let recommendations = $state<DiscoveryItem[]>([])
    let recentlyPlayed = $state<DiscoveryItem[]>([])


    const getOrRegisterRemoteTrack = (input: DiscoveryTrack | DiscoveryResource): number => {
        const key = `spicyamll:${input.id}`
        const id = generateStableId(key)

        const isResource = 'artUrl' in input
        const name = input.name || 'Unknown'
        const artistName = isResource ? input.artist : input.artist
        const albumName = isResource ? input.album : input.album
        const imageUrl = isResource ? input.artUrl : input.image
        const rawDuration = isResource ? input.duration ?? 0 : input.duration ?? 0
        const yearStr = !isResource && input.year ? String(input.year) : UNKNOWN_ITEM

        registerRemoteTrack({
            id,
            remoteId: String(input.id),
            streaming: true,
            uuid: key,
            name,
            album: albumName || UNKNOWN_ITEM,
            artists: artistName ? [artistName] : ['Unknown Artist'],
            year: yearStr,
            duration: rawDuration,
            genre: [],
            trackNo: 0,
            trackOf: 0,
            discNo: 0,
            discOf: 0,
            language: undefined,
            image: imageUrl ? { optimized: false, small: imageUrl, full: imageUrl } : undefined,
            primaryColor: undefined,
            file: undefined,
            directory: undefined,
            fileName: undefined,
            scannedAt: Date.now(),
            url: spicyamll.streamUrl(input.id, {
                codec: 'aac',
                fallback: true,
                language: 'en-US',
            }),
            favorite: false,
            type: 'track',
        })

        return id
    }

    let songResults = $derived(results.filter((item) => item.type === 'song'))
    let albumResults = $derived(results.filter((item) => item.type === 'album'))
    let artistResults = $derived(results.filter((item) => item.type === 'artist'))

    let songTrackIds = $derived(songResults.map((s) => getOrRegisterRemoteTrack(s)))
    let recSongTrackIds = $derived(
        recommendations.filter((r) => r.type === 'song').map((s) => getOrRegisterRemoteTrack(s)),
    )
    let topPicksSongTrackIds = $derived(
        topPicks.filter((r) => r.type === 'song').map((s) => getOrRegisterRemoteTrack(s)),
    )
    let recentlyPlayedTrackIds = $derived(
        recentlyPlayed.filter((r) => r.type === 'song').map((s) => getOrRegisterRemoteTrack(s)),
    )

    const cleanArtUrl = (url: unknown) => {
        if (typeof url !== 'string' || !url.trim()) return ''
        const value = url
            .trim()
            .replace(/\{w\}/g, '600')
            .replace(/\{h\}/g, '600')
            .replace(/\{c\}/g, 'bb')
            .replace(/\{f\}/g, 'jpg')
            .replace(/\d+x\d+bb\./, '600x600bb.')
        return /^https?:\/\//i.test(value) ? value : ''
    }

    const shuffle = <T,>(items: T[]) => {
        const out = [...items]
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[out[i], out[j]] = [out[j], out[i]]
        }
        return out
    }

    const dedupeItems = (items: DiscoveryItem[]) => {
        const seen = new Set<string>()
        return items.filter((item) => {
            const key = `${item.type}:${item.id}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }

    const parseRecommendationSearch = (input: unknown): DiscoveryItem[] => parseDiscoveryResults(input)

    // Search/catalog responses can return artist and album resources without artwork.
    // Detail pages already recover artwork from their songs, so do the same for grid cards.
    const enrichDiscoveryArtwork = async (items: DiscoveryItem[]) => {
        const output = [...items]
        const missingArtists = output.filter((item) => item.type === 'artist' && !item.artUrl)
        const missingAlbums = output.filter((item) => item.type === 'album' && !item.artUrl)

        await Promise.all([
            ...missingArtists.map(async (item) => {
                try {
                    const songs = await getSongsForArtist(item.id, item.name)
                    const art = songs.map((song) => cleanArtUrl(song.image)).find(Boolean)
                    if (art) item.artUrl = art
                } catch {
                    // Keep the fallback icon if the artist endpoint has no artwork.
                }
            }),
            ...missingAlbums.map(async (item) => {
                try {
                    const tracks = normalizeTracks(await spicyamll.album({ id: item.id, l: 'en-US' }))
                    const art = tracks.map((track) => cleanArtUrl(track.image)).find(Boolean)
                    if (art) item.artUrl = art
                } catch {
                    // Keep the fallback icon if the album endpoint has no artwork.
                }
            }),
        ])

        return output
    }

    const loadRecommendations = async () => {
        loadingRecommendations = true
        try {
            const cached = getCachedDiscoveryRecommendations()
            const history = getRecentlyPlayed(100)

            recentlyPlayed = history.slice(0, 10).map((track) => ({
                type: 'song',
                id: String(track.trackId || track.id),
                name: track.name,
                artist: track.artist,
                album: track.album,
                artUrl: cleanArtUrl(track.artUrl),
            }))

            if (cached) {
                topPicks = await enrichDiscoveryArtwork(cached.topPicks)
                recommendations = await enrichDiscoveryArtwork(cached.recommendations)
                return
            }
            if (history.length) {
                const latest = history[0]
                const latestItem: DiscoveryItem = {
                    type: 'song',
                    id: String(latest.trackId || latest.id),
                    name: latest.name,
                    artist: latest.artist,
                    album: latest.album,
                    artUrl: cleanArtUrl(latest.artUrl),
                }
                const artists = [...new Set(history.map((track) => track.artist.trim()).filter(Boolean))].slice(0, 4)
                const groups = await Promise.all(artists.map(async (artist) => {
                    try { return parseRecommendationSearch(await spicyamll.search({ term: artist, limit: 15 })) } catch { return [] }
                }))
                topPicks = await enrichDiscoveryArtwork([
                    latestItem,
                    ...shuffle(dedupeItems(groups.flat()).filter((x) => !(x.type === 'song' && x.id === latestItem.id))).slice(0, 10),
                ])
            } else {
                topPicks = []
            }

            const listenedIds = new Set(history.map((track) => String(track.trackId || track.id)))
            const artists = [...new Set(history.map((track) => track.artist.trim()).filter(Boolean))].slice(0, 8)
            const queries = artists.length ? artists : ['Hits', 'Pop', 'Rock', 'Electronic']
            const groups = await Promise.all([
                ...queries.map(async (term) => {
                    try { return parseRecommendationSearch(await spicyamll.search({ term, limit: 25 })) } catch { return [] }
                }),
                (async () => {
                    try { return parseRecommendationSearch(await spicyamll.recommendations({ name: 'search-landing' })) } catch { return [] }
                })(),
            ])
            recommendations = await enrichDiscoveryArtwork(
                shuffle(dedupeItems(groups.flat()).filter((item) => item.type !== 'song' || !listenedIds.has(item.id))).slice(0, 90),
            )
            cacheDiscoveryRecommendations(topPicks, recommendations)
        } catch (e) {
            console.warn('[Discovery] Recommendations failed:', e)
        } finally {
            loadingRecommendations = false
        }
    }

    const search = async () => {
        if (!isOnline) return
        const term = query.trim()
        if (!term) return
        loading = true
        error = null
        searched = true
        results = []

        try {
            results = await enrichDiscoveryArtwork(await searchDiscovery(term))
        } catch (e) {
            error = e instanceof Error ? e.message : 'Unable to search SpicyAMLL'
        } finally {
            loading = false
        }
    }

    const viewAlbum = async (album: DiscoveryItem) => {
        const params = new URLSearchParams({
            name: album.name,
            artist: album.artist || '',
            art: album.artUrl || '',
        })
        await goto(`/album/${encodeURIComponent(album.id)}?${params.toString()}`)
    }

    const viewArtist = async (artist: DiscoveryItem) => {
        const params = new URLSearchParams({
            name: artist.name,
            art: artist.artUrl || '',
        })
        await goto(`/artist/${encodeURIComponent(artist.id)}?${params.toString()}`)
    }

    onMount(() => {
        const handleOnline = () => {
            isOnline = true
            void loadRecommendations()
        }
        const handleOffline = () => {
            isOnline = false
            query = ''
            results = []
            searched = false
            error = null
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        if (navigator.onLine) void loadRecommendations()

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    })
</script>

{#snippet navItemsSnippet(className: string)}
    <Button
        as="a"
        href="/library/tracks"
        kind="blank"
        tooltip={m.tracks()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="musicNote" />
        </div>
    </Button>

    <Button
        as="a"
        href="/library/albums"
        kind="blank"
        tooltip={m.albums()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="album" />
        </div>
    </Button>

    <Button
        as="a"
        href="/library/artists"
        kind="blank"
        tooltip={m.artists()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="person" />
        </div>
    </Button>

    <Button
        as="a"
        href="/library/playlists"
        kind="blank"
        tooltip={m.playlists()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="playlist" />
        </div>
    </Button>

    {#if isOnline}
        <Button
            as="a"
            href="/discovery"
            kind="blank"
            tooltip="Discovery"
            class={['flex shrink-0 items-center justify-center', className]}
        >
            <div class="flex items-center justify-center rounded-full bg-surfaceContainerHighest p-2 text-onSurface">
                <Icon type="compass" />
            </div>
        </Button>
    {/if}
{/snippet}

{#snippet layoutBottom()}
    <div
        class="pointer-events-auto grid h-16 w-full grid-cols-[repeat(auto-fit,minmax(0,1fr))] bg-surfaceContainer sm:hidden active-view-regular:view-name-[bottom-bar]"
    >
        {@render navItemsSnippet('h-full')}
    </div>
{/snippet}

{useSetOverlaySnippet('bottom-bar', () => layoutBottom)}

<Header
    title="Discovery"
    noBackButton={!searched}
    onback={
        searched
            ? () => {
                  query = ''
                  results = []
                  searched = false
                  error = null
              }
            : undefined
    }
/>

<div class="desktop-sidebar fixed z-1 mt-20 hidden h-max w-max flex-col items-center gap-2 sm:flex [@media(max-height:500px)]:mt-2">
    {@render navItemsSnippet('h-14 w-20')}
</div>

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
    <form
            class="@container sticky top-2 z-1 mt-2 mb-6 ml-auto flex w-full max-w-125 items-center gap-1 rounded-full bg-surfaceContainerHigh px-2 @sm:gap-2"
            onsubmit={(event) => {
                event.preventDefault()
                void search()
            }}
        >
            <input
                bind:value={query}
                type="text"
                name="search"
                placeholder="Search tracks, artists, albums"
                class="h-12 w-60 grow bg-transparent pl-3 text-body-md placeholder:text-onSurfaceVariant focus:outline-none"
            />

            <IconButton icon="magnify" tooltip="Search" type="submit" />

            <Separator vertical class="my-auto hidden h-6 @sm:flex" />

            <MenuButton
                ariaLabel={m.libraryOpenApplicationMenu()}
                tooltip={m.more()}
                menuItems={() => [
                    { label: m.settings(), action: () => void goto('/settings') },
                    { label: m.about(), action: () => void goto('/about') },
                ]}
                width={200}
            />
        </form>

    {#if error}
        <div class="my-auto flex flex-col items-center p-8 text-center text-error">
            <div class="text-title-lg">{error}</div>
        </div>
    {:else if loading}
        <div class="my-auto flex min-h-60 flex-col items-center justify-center gap-4 text-center opacity-70">
            <Spinner class="size-10" />
            <div class="text-title-md">Searching catalog...</div>
        </div>
    {:else if searched && results.length === 0}
        <div class="relative m-auto flex flex-col items-center text-center py-12">
            <Icon type="magnify" class="my-auto size-35 opacity-54" />
            <div class="text-body-lg">{m.libraryNoResults()}</div>
            <div>{m.libraryNoResultsExplanation()}</div>
        </div>
    {:else if results.length > 0}
        <div class="flex flex-col gap-8 pb-8">
            {#if songResults.length}
                <section class="flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <h2 class="text-title-lg font-bold text-onSurface">Songs</h2>
                        <span class="text-body-sm text-onSurfaceVariant/70">{songResults.length}</span>
                    </div>
                    <TracksListContainer
                        items={songTrackIds}
                        onItemClick={({ index, items }) => {
                            player.playTrack(index, items)
                        }}
                    />
                </section>
            {/if}

            {#if albumResults.length}
                <section class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h2 class="text-title-lg font-bold text-onSurface">Albums</h2>
                        <span class="text-body-sm text-onSurfaceVariant/70">{albumResults.length}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each albumResults as item (item.id)}
                            <button
                                type="button"
                                class="interactable group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surfaceContainerHigh text-left transition-colors hover:bg-surfaceContainerHighest"
                                onclick={() => void viewAlbum(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="album"
                                    class="aspect-square w-full rounded-[inherit] transition-transform duration-200 group-hover:scale-[1.015]"
                                />
                                <div class="flex min-h-18 w-full flex-col justify-center overflow-hidden px-3 py-3">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                    <div class="truncate text-body-sm text-onSurfaceVariant">{item.artist || 'Unknown Artist'}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}

            {#if artistResults.length}
                <section class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h2 class="text-title-lg font-bold text-onSurface">Artists</h2>
                        <span class="text-body-sm text-onSurfaceVariant/70">{artistResults.length}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each artistResults as item (item.id)}
                            <button
                                type="button"
                                class="interactable flex flex-col overflow-hidden rounded-2xl bg-surfaceContainerHigh text-left"
                                onclick={() => void viewArtist(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="person"
                                    class="aspect-square w-full rounded-[inherit]"
                                />
                                <div class="flex min-h-18 w-full flex-col justify-center overflow-hidden px-3 py-3 text-center text-onSurfaceVariant">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}
        </div>
    {:else}
        <div class="flex flex-col gap-8 pb-8">
            {#if recentlyPlayedTrackIds.length}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recently Played</h2>
                    <TracksListContainer items={recentlyPlayedTrackIds} />
                </section>
            {/if}

            {#if topPicksSongTrackIds.length}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Top Picks For You</h2>
                    <TracksListContainer items={topPicksSongTrackIds} />
                </section>
            {/if}

            {#if recSongTrackIds.length}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recommended For You</h2>
                    <TracksListContainer items={recSongTrackIds.slice(0, 20)} />
                </section>
            {:else if loadingRecommendations}
                <div class="flex min-h-40 flex-col items-center justify-center gap-2 text-center opacity-60">
                    <Spinner class="size-6" />
                    <div class="text-body-md">Building recommendations...</div>
                </div>
            {/if}

            {#if recommendations.some((r) => r.type === 'album')}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recommended Albums</h2>
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each recommendations.filter((r) => r.type === 'album').slice(0, 12) as item (item.id)}
                            <button
                                type="button"
                                class="interactable group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surfaceContainerHigh text-left transition-colors hover:bg-surfaceContainerHighest"
                                onclick={() => void viewAlbum(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="album"
                                    class="aspect-square w-full rounded-[inherit] transition-transform duration-200 group-hover:scale-[1.015]"
                                />
                                <div class="flex min-h-18 w-full flex-col justify-center overflow-hidden px-3 py-3">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                    <div class="truncate text-body-sm text-onSurfaceVariant">{item.artist || 'Unknown Artist'}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}

            {#if recommendations.some((r) => r.type === 'artist')}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recommended Artists</h2>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each recommendations.filter((r) => r.type === 'artist').slice(0, 12) as item (item.id)}
                            <button
                                type="button"
                                class="interactable flex flex-col overflow-hidden rounded-lg bg-surfaceContainerHigh text-left"
                                onclick={() => void viewArtist(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="person"
                                    class="aspect-square w-full rounded-[inherit]"
                                />
                                <div class="flex h-18 w-full flex-col justify-center overflow-hidden px-2 text-center text-onSurfaceVariant">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}
        </div>
    {/if}
</main>
