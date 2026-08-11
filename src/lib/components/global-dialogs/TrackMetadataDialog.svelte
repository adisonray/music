<script lang="ts" module>
    import Button from '$lib/components/Button.svelte'
    import CommonDialog from '$lib/components/dialog/CommonDialog.svelte'
    import type { DialogOpenAccessor } from '$lib/components/dialog/Dialog.svelte'
    import TextField from '$lib/components/TextField.svelte'
    import { getDatabase } from '$lib/db/database.ts'
    import { dispatchDatabaseChangedEvent } from '$lib/db/events.ts'
    import { createManagedArtwork } from '$lib/helpers/create-managed-artwork.svelte.ts'
    import type { TrackData } from '$lib/library/get/value'
    import { getArtworkRelatedData } from '$lib/library/scan-actions/scanner/parse/format-artwork.ts'
    import { UNKNOWN_ITEM } from '$lib/library/types.ts'
    import { LyricsCache } from '$lib/lyrics/LyricsCache.ts'
    import { LyricsParser } from '$lib/lyrics/LyricsParser.ts'
    import Artwork from '../Artwork.svelte'

    export interface TrackMetadataDialogProps {
        open: DialogOpenAccessor<TrackData>
    }

    const formatLyricTime = (ms: number): string => {
        const mins = Math.floor(ms / 60_000)
        const secs = Math.floor((ms % 60_000) / 1000)
        const centis = Math.floor((ms % 1000) / 10)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `[${pad(mins)}:${pad(secs)}.${pad(centis)}]`
    }

    const serializeLyrics = (lyrics: any[]): string => lyrics
        .map((line) => {
            if (line.isInstrumental) {
                return '[empty]'
            }
            if (line.startTimeMs !== undefined && line.startTimeMs >= 0) {
                return `${formatLyricTime(line.startTimeMs)}${line.words}`
            }
            return line.words
        })
        .join('\n')
</script>

<script lang="ts">
    let { open }: TrackMetadataDialogProps = $props()

    const track = $derived(open.get())

    let titleVal = $state('')
    let artistVal = $state('')
    let albumVal = $state('')
    let albumArtistVal = $state('')
    let genreVal = $state('')
    let yearVal = $state('')
    let trackNoVal = $state('')
    let trackOfVal = $state('')
    let discNoVal = $state('')
    let discOfVal = $state('')
    let composerVal = $state('')
    let lyricsVal = $state('')

    let fileInputEl = $state<HTMLInputElement>()
    let artworkBlob = $state<Blob | null | undefined>(undefined)
    let previewArtworkUrl = $state<string | undefined>(undefined)

    const trackImageSrc = createManagedArtwork(() => track?.image?.full)

    const artworkSrcToShow = $derived.by(() => {
        if (artworkBlob === null) {
            return undefined
        }
        if (artworkBlob instanceof Blob) {
            return previewArtworkUrl
        }
        return track?.image?.full ? trackImageSrc() : undefined
    })

    $effect(() => {
        if (track) {
            titleVal = track.name || ''
            artistVal = (track.artists || []).join(', ')
            albumVal = track.album || ''
            albumArtistVal = (track as any).albumArtist || ''
            genreVal = (track.genre || []).join(', ')
            yearVal = track.year || ''
            trackNoVal = String(track.trackNo || '')
            trackOfVal = String(track.trackOf || '')
            discNoVal = String(track.discNo || '')
            discOfVal = String(track.discOf || '')
            composerVal = (track as any).composer || ''

            // Load cached lyrics
            lyricsVal = ''
            LyricsCache.get(track.id).then((cached) => {
                if (cached?.lyrics) {
                    lyricsVal = serializeLyrics(cached.lyrics)
                }
            })

            artworkBlob = undefined
            if (previewArtworkUrl) {
                URL.revokeObjectURL(previewArtworkUrl)
                previewArtworkUrl = undefined
            }
        }
    })

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
    }

    const saveMetadata = async () => {
        if (!track) return

        if (!titleVal.trim()) {
            snackbar('Title is required')
            return
        }

        try {
            const db = await getDatabase()
            const tx = db.transaction(['tracks', 'albums', 'artists'], 'readwrite')

            const originalTrack = await tx.objectStore('tracks').get(track.id)
            if (!originalTrack) {
                snackbar('Track not found in database')
                return
            }

            const artistsArray = artistVal.split(',').map(s => s.trim()).filter(Boolean)
            const genreArray = genreVal.split(',').map(s => s.trim()).filter(Boolean)

            const updatedTrack = {
                ...originalTrack,
                name: titleVal.trim(),
                artists: artistsArray.length > 0 ? artistsArray : [UNKNOWN_ITEM],
                album: albumVal.trim() || UNKNOWN_ITEM,
                albumArtist: albumArtistVal.trim() || undefined,
                genre: genreArray,
                year: yearVal.trim() || UNKNOWN_ITEM,
                trackNo: Number.parseInt(trackNoVal) || 0,
                trackOf: Number.parseInt(trackOfVal) || 0,
                discNo: Number.parseInt(discNoVal) || 0,
                discOf: Number.parseInt(discOfVal) || 0,
                composer: composerVal.trim() || undefined,
            }

            if (artworkBlob !== undefined) {
                if (artworkBlob === null) {
                    delete updatedTrack.image
                    delete updatedTrack.primaryColor
                } else {
                    const artworkData = await getArtworkRelatedData(artworkBlob)
                    updatedTrack.image = artworkData.image
                    if (artworkData.primaryColor !== undefined) {
                        updatedTrack.primaryColor = artworkData.primaryColor
                    }
                }
            }

            await tx.objectStore('tracks').put(updatedTrack)

            // Ensure album exists and is updated
            const albumsStore = tx.objectStore('albums')
            const existingAlbum = await albumsStore.index('name').get(updatedTrack.album)
            let albumChange: any = null
            if (updatedTrack.album !== UNKNOWN_ITEM) {
                const updatedAlbum = existingAlbum
                    ? {
                            ...existingAlbum,
                            artists: [...new Set([...existingAlbum.artists, ...updatedTrack.artists])].filter(
                                (artist) => artist !== UNKNOWN_ITEM,
                            ),
                            year: existingAlbum.year || updatedTrack.year,
                            image: existingAlbum.image || updatedTrack.image?.full,
                        }
                    : {
                            uuid: crypto.randomUUID(),
                            name: updatedTrack.album,
                            artists: updatedTrack.artists,
                            year: updatedTrack.year,
                            image: updatedTrack.image?.full,
                        }
                const albumId = await albumsStore.put(updatedAlbum as any)
                albumChange = {
                    storeName: 'albums',
                    key: albumId,
                    operation: existingAlbum ? 'update' : 'add',
                }
            }

            // Ensure artists exist
            const artistsStore = tx.objectStore('artists')
            const artistsChanges = []
            for (const artistName of updatedTrack.artists) {
                if (artistName === UNKNOWN_ITEM) continue
                const existingArtist = await artistsStore.index('name').get(artistName)
                if (!existingArtist) {
                    const newArtist = {
                        name: artistName,
                        uuid: crypto.randomUUID(),
                    }
                    const artistId = await artistsStore.put(newArtist as any)
                    artistsChanges.push({
                        storeName: 'artists',
                        key: artistId,
                        operation: 'add',
                    })
                }
            }

            await tx.done

            // Update lyrics if modified
            if (lyricsVal !== undefined) {
                const durationMs = Math.round(updatedTrack.duration) * 1000
                if (lyricsVal.trim()) {
                    const parsedLyrics = LyricsParser.parse(lyricsVal, durationMs)
                    const isPlainOnly = !(lyricsVal.includes('[') || lyricsVal.includes('<tt'))
                    await LyricsCache.set(track.id, {
                        status: 'found',
                        source: 'local',
                        lyrics: parsedLyrics,
                        syncType: isPlainOnly ? 'plain' : 'line',
                    })
                } else {
                    const localDb = await getDatabase()
                    await localDb.delete('lyrics', track.id)
                }
                window.dispatchEvent(new CustomEvent('lyrics-reload'))
            }

            dispatchDatabaseChangedEvent([
                {
                    storeName: 'tracks',
                    key: track.id,
                    operation: 'update',
                },
                albumChange,
                ...artistsChanges,
            ].filter(Boolean))

            snackbar('Track metadata updated successfully')
            open.close()
        } catch (error) {
            console.error(error)
            snackbar('Failed to update metadata')
        }
    }
</script>

<CommonDialog
    {open}
    icon="playlistMusic"
    title={m.trackMetadataEditor()}
    class="[--dialog-width:--spacing(150)]"
    buttons={[
        {
            title: m.libraryCancel(),
        },
        {
            title: m.librarySave(),
            type: 'submit',
        },
    ]}
    onsubmit={saveMetadata}
>
    <!-- Wrapper with explicit max height, min-h-0, overscroll containment and auto scrolling -->
    <div class="flex flex-col gap-4 overflow-y-auto max-h-[65vh] min-h-0 shrink pr-2 text-body-md overscroll-contain">
        <div class="text-sm font-medium text-primary bg-primaryContainer/30 p-3 rounded-lg border border-primaryContainer mb-2">
            {m.metadataLocalLibraryExplanation()}
        </div>

        <div class="flex flex-col md:flex-row gap-6 items-center md:items-start mb-4">
            <div class="flex flex-col items-center gap-2">
                <Artwork
                    src={artworkSrcToShow}
                    fallbackIcon="musicNote"
                    class="size-36 rounded-lg object-cover"
                />
                <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    bind:this={fileInputEl}
                    onchange={(e) => {
                        const file = e.currentTarget.files?.[0]
                        if (file) {
                            artworkBlob = file
                            if (previewArtworkUrl) {
                                URL.revokeObjectURL(previewArtworkUrl)
                            }
                            previewArtworkUrl = URL.createObjectURL(file)
                        }
                    }}
                />
                <Button kind="outlined" class="interactable mt-2 text-label-md" onclick={() => fileInputEl?.click()}>
                    {m.metadataUploadArtwork()}
                </Button>
                {#if artworkSrcToShow}
                    <Button kind="outlined" class="interactable text-label-md text-error" onclick={() => {
                        artworkBlob = null
                        if (previewArtworkUrl) {
                            URL.revokeObjectURL(previewArtworkUrl)
                            previewArtworkUrl = undefined
                        }
                    }}>
                        {m.metadataRemoveArtwork()}
                    </Button>
                {/if}
            </div>

            <div class="flex flex-col gap-4 grow w-full">
                <div class="flex flex-col gap-1">
                    <span class="text-label-md text-onSurfaceVariant">{m.metadataTitle()}</span>
                    <TextField bind:value={titleVal} name="title" required />
                </div>

                <div class="flex flex-col gap-1">
                    <span class="text-label-md text-onSurfaceVariant">{m.metadataArtist()}</span>
                    <TextField bind:value={artistVal} name="artist" />
                </div>

                <div class="flex flex-col gap-1">
                    <span class="text-label-md text-onSurfaceVariant">{m.metadataAlbum()}</span>
                    <TextField bind:value={albumVal} name="album" />
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataAlbumArtist()}</span>
                <TextField bind:value={albumArtistVal} name="albumArtist" />
            </div>

            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataGenre()}</span>
                <TextField bind:value={genreVal} name="genre" />
            </div>

            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataYear()}</span>
                <TextField bind:value={yearVal} name="year" />
            </div>

            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataComposer()}</span>
                <TextField bind:value={composerVal} name="composer" />
            </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataTrackNumber()}</span>
                <TextField bind:value={trackNoVal} name="trackNo" />
            </div>

            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataTrackTotal()}</span>
                <TextField bind:value={trackOfVal} name="trackOf" />
            </div>

            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataDiscNumber()}</span>
                <TextField bind:value={discNoVal} name="discNo" />
            </div>

            <div class="flex flex-col gap-1">
                <span class="text-label-md text-onSurfaceVariant">{m.metadataDiscTotal()}</span>
                <TextField bind:value={discOfVal} name="discOf" />
            </div>
        </div>

        <div class="flex flex-col gap-1">
            <span class="text-label-md text-onSurfaceVariant">{m.metadataLyrics()}</span>
            <div class="flex flex-col rounded-md border border-outline p-px text-onSurface focus-within:border-2 focus-within:border-primary focus-within:p-0">
                <textarea
                    bind:value={lyricsVal}
                    name="lyrics"
                    rows="5"
                    class="w-full appearance-none border-none bg-transparent p-3.5 outline-none placeholder:text-onSurfaceVariant resize-y min-h-[120px]"
                    placeholder="[00:12.34]Lyric line..."
                ></textarea>
            </div>
        </div>

        {#if track}
            <div class="border-t border-outline/30 pt-4 mt-2">
                <div class="text-title-sm text-onSurfaceVariant mb-2">{m.metadataReadOnlyInfo()}</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-body-sm text-onSurfaceVariant bg-surfaceContainer/50 p-4 rounded-xl">
                    <div class="flex justify-between md:justify-start gap-4">
                        <span class="font-medium text-onSurface/70">{m.metadataDuration()}:</span>
                        <span>{Math.floor(track.duration / 60)}:{(Math.round(track.duration % 60)).toString().padStart(2, '0')}</span>
                    </div>
                    <div class="flex justify-between md:justify-start gap-4 overflow-hidden">
                        <span class="font-medium text-onSurface/70 shrink-0">{m.metadataFileName()}:</span>
                        <span class="truncate" title={track.fileName || track.file?.name}>{track.fileName || track.file?.name || 'Unknown'}</span>
                    </div>
                    <div class="flex justify-between md:justify-start gap-4">
                        <span class="font-medium text-onSurface/70">{m.metadataFileSize()}:</span>
                        <span>{(track.file as any)?.size ? formatSize((track.file as any).size) : 'Unknown'}</span>
                    </div>
                    <div class="flex justify-between md:justify-start gap-4">
                        <span class="font-medium text-onSurface/70">{m.metadataScannedAt()}:</span>
                        <span>{new Date(track.scannedAt).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</CommonDialog>
