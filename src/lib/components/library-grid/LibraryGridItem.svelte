<script lang="ts" module>
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import type { RouteId } from '$app/types'
	import { getArtistArtwork } from '$lib/helpers/artist-artwork.ts'
	import { getArtistProfile } from '$lib/services/spicyamll.ts'
	import { compressArtwork } from '$lib/helpers/compress-artwork.ts'
	import type { QueryResult } from '$lib/db/query/query.ts'
	import { createManagedArtwork } from '$lib/helpers/create-managed-artwork.svelte.ts'
	import { dbGetAlbumTracksIdsByName, dbGetArtistTracksIdsByName } from '$lib/library/get/ids'
	import { getLibraryValue, type AlbumData, type ArtistData } from '$lib/library/get/value'
	import { createAlbumQuery, createArtistQuery } from '$lib/library/get/value-queries'
	import { UNKNOWN_ITEM } from '$lib/library/types'
	import Artwork from '../Artwork.svelte'

	export type LibraryGridItemType = 'albums' | 'artists'

	export type LibraryGridItemValue<Type extends LibraryGridItemType> = {
	albums: AlbumData
	artists: ArtistData
}[Type]

	export interface LibraryItemGridItemProps<Type extends LibraryGridItemType> {
	itemId: number
	type: Type
	class: ClassValue
	style: string
	children: Snippet<[LibraryGridItemValue<Type>]>
}
</script>

<script lang="ts" generics="Type extends LibraryGridItemType">
	const {
		type,
		itemId,
		class: className,
		children,
	}: LibraryItemGridItemProps<Type> = $props()

	const menu = useMenu()
	const dialogs = useDialogsStore()
	const player = usePlayer()

	type Value = LibraryGridItemValue<Type>

	const query = $derived.by(
		() =>
			(type === 'albums' ? createAlbumQuery(() => itemId) : createArtistQuery(() => itemId)) as QueryResult<Value>,
	)

	const item = $derived(query.value)

	let artworkSource = $state<Blob | string | undefined>()
	const artworkUrl = createManagedArtwork(() => artworkSource)

	const loadArtwork = async (value: Value) => {
		if (type === 'albums') {
			const album = value as AlbumData

			if (album.image instanceof Blob) {
				artworkSource = await compressArtwork(album.image)
				return
			}

			const trackIds = await dbGetAlbumTracksIdsByName(album.name)
			for (const trackId of trackIds) {
				const track = await getLibraryValue('tracks', trackId, true)
				if (!track?.file) continue

				const image = track.image?.small ?? track.image?.full
				if (image) {
					artworkSource = image instanceof Blob ? await compressArtwork(image) : image
					return
				}
			}

			return
		}

		const artist = value as ArtistData

		// Artist cards must use the same artist profile artwork as the
		// artist detail page. Track artwork is album artwork and must never
		// be used as an artist portrait.
		const profile = await getArtistProfile(undefined, artist.name)
		if (profile.image) {
			artworkSource = profile.image
			return
		}

		// Only use a locally cached artist portrait as a fallback. Never fall
		// back to a downloaded track's artwork because that is album art.
		const artistArtwork = await getArtistArtwork(artist.name)
		if (artistArtwork) artworkSource = artistArtwork
	}

	$effect(() => {
		let cancelled = false

		const refreshArtwork = () => {
			if (cancelled) return
			artworkSource = undefined
			const value = item
			if (!value || value.name === UNKNOWN_ITEM) return
			void loadArtwork(value).catch(() => {
				if (!cancelled) artworkSource = undefined
			})
		}

		refreshArtwork()
		window.addEventListener('adi-music-library-updated', refreshArtwork)

		return () => {
			cancelled = true
			window.removeEventListener('adi-music-library-updated', refreshArtwork)
		}
	})

	const linkProps = $derived.by(() => {
		if (!item) return null

		const detailsViewId: RouteId = '/(app)/library/[[slug=libraryEntities]]/[uuid]'
		const shouldReplace = page.route.id === detailsViewId

		return {
			href: resolve('/(app)/library/[[slug=libraryEntities]]/[uuid]', {
				slug: type,
				uuid: item.uuid,
			}),
			shouldReplace,
		}
	})

	const getTrackIds = (name: string) =>
		type === 'albums' ? dbGetAlbumTracksIdsByName(name) : dbGetArtistTracksIdsByName(name)

	const menuItems = () => {
		if (!item || !linkProps) return []

		return [
			{
				label: m.libraryViewDetails(),
				action: () => goto(linkProps.href, { replaceState: linkProps.shouldReplace }),
			},
			{
				label: m.playerAddToQueue(),
				action: async () => {
					try {
						player.addToQueue(await getTrackIds(item.name))
					} catch (error) {
						snackbar.unexpectedError(error)
					}
				},
			},
			{
				label: m.libraryAddToPlaylist(),
				action: async () => {
					try {
						dialogs.openDialog('addToPlaylist', await getTrackIds(item.name))
					} catch (error) {
						snackbar.unexpectedError(error)
					}
				},
			},
			{
				label: m.libraryRemoveFromLibrary(),
				action: () => {
					dialogs.openDialog('removeFromLibrary', {
						type: 'single',
						id: item.id,
						name: item.name,
						storeName: type,
					})
				},
			},
		]
	}
</script>

<a
	class={[
		'library-entity-card group block min-w-0 overflow-hidden rounded-2xl bg-surfaceContainerHigh text-onSurface transition-transform duration-150 hover:-translate-y-0.5 hover:bg-surfaceContainerHighest active:scale-[0.99]',
		className,
	]}
	href={linkProps?.href}
	data-sveltekit-replacestate={linkProps?.shouldReplace}
	oncontextmenu={(event) => {
		event.preventDefault()
		menu.showFromEvent(event, menuItems(), {
			anchor: false,
			position: { top: event.y, left: event.x },
		})
	}}
>
	<div class={['relative aspect-square w-full overflow-hidden', type === 'artists' ? 'rounded-full p-3' : 'rounded-2xl']}>
		<Artwork
			src={artworkUrl()}
			alt={item?.name}
			fallbackIcon={type === 'artists' ? 'person' : 'album'}
			class={['size-full', type === 'artists' ? 'rounded-full' : 'rounded-2xl']}
			loading="lazy"
		/>

	</div>

	<div class="min-w-0 px-2.5 py-3">
		{#if query.loading}
			<div class="mb-2 h-3 w-3/4 animate-pulse rounded bg-onSurface/10"></div>
			<div class="h-2 w-1/2 animate-pulse rounded bg-onSurface/8"></div>
		{:else if query.error}
			<div class="text-body-sm text-error">{m.errorUnexpected()}</div>
		{:else if item}
			<div class="truncate text-body-md font-medium text-onSurface">
				{@render children(item)}
			</div>
		{/if}
	</div>
</a>
