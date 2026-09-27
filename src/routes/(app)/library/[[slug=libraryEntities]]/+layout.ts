import { innerWidth } from 'svelte/reactivity/window'
import type { RouteId } from '$app/types'
import type { LayoutMode } from '$lib/components/ListDetailsLayout.svelte'
import { getLibraryItemIds } from '$lib/library/get/ids.ts'
import {
	createLibraryItemKeysPageQuery,
	type PageQueryResult,
} from '$lib/library/get/ids-queries.ts'
import { setLibraryValueInCache, registerRemoteId } from '$lib/library/get/value.ts'
import { createTracksCountPageQuery } from '$lib/library/tracks-queries.ts'
import { FAVORITE_PLAYLIST_ID, type LibraryStoreName } from '$lib/library/types.ts'
import {
	searchAlbums,
	searchArtists,
	searchPlaylists,
	searchSongs,
} from '$lib/services/jiosaavn.ts'
import { getPersistedLibrarySplitLayoutEnabled } from '$lib/stores/main/store.svelte.ts'
import { defineViewTransitionMatcher } from '$lib/view-transitions.svelte.ts'
import type { LayoutLoad } from './$types.js'
import { configsMap, type LibraryRouteConfig, type LibrarySearchFn } from './config.ts'
import { LibraryStore } from './store.svelte.js'

const defaultSearchFn: LibrarySearchFn<{ name: string }> = (value, searchTerm) =>
	value.name.toLowerCase().includes(searchTerm)

type LoadDataResult<Slug extends LibraryStoreName> = {
	[ExactSlug in Slug]: LibraryRouteConfig<ExactSlug> & {
		store: LibraryStore<ExactSlug>
		itemsIdsQuery: PageQueryResult<number[]>
		tracksCountQuery: PageQueryResult<number>
	}
}[Slug]

const loadData = async <Slug extends LibraryStoreName>(
	slug: Slug,
): Promise<LoadDataResult<Slug>> => {
	const config = configsMap[slug]
	const searchFn = config.search ?? defaultSearchFn
	const store = new LibraryStore(slug)

	const itemsIdsQueryPromise = createLibraryItemKeysPageQuery(slug, {
		key: () => [slug, store.sortByKey, store.order, store.searchTerm.toLowerCase().trim()],
		fetcher: async ([name, sortKey, order, searchTerm], signal) => {
			const localResult = await getLibraryItemIds(name, {
				sort: sortKey,
				order,
				searchTerm,
				searchFn: (value) => searchFn(value, searchTerm),
				signal,
			})

			let result = localResult

			if (searchTerm) {
				let onlineItems: any[] = []
				if (slug === 'tracks') {
					onlineItems = await searchSongs(searchTerm)
				} else if (slug === 'albums') {
					onlineItems = await searchAlbums(searchTerm)
				} else if (slug === 'artists') {
					onlineItems = await searchArtists(searchTerm)
				} else if (slug === 'playlists') {
					onlineItems = await searchPlaylists(searchTerm)
				}

				for (const item of onlineItems) {
					registerRemoteId(item.id, item.uuid)
					setLibraryValueInCache(slug, item.id, {
						...item,
						type: slug.slice(0, -1) as any,
						favorite: false,
					})
				}

				result = [...localResult, ...onlineItems.map((i) => i.id)]
			}

			if (slug === 'playlists') {
				return [FAVORITE_PLAYLIST_ID, ...result]
			}

			return result
		},
	})

	const [itemsIdsQuery, tracksCountQuery] = await Promise.all([
		itemsIdsQueryPromise,
		createTracksCountPageQuery(),
	])

	return {
		...config,
		store,
		itemsIdsQuery,
		tracksCountQuery,
	}
}

type LoadResult = LoadDataResult<LibraryStoreName> & {
	isWideLayout: () => boolean
	layoutMode: (
		splitViewAllowed: boolean,
		isWide: boolean,
		itemId: string | undefined,
	) => LayoutMode
}

export const load: LayoutLoad = async (event): Promise<LoadResult> => {
	const { slug: routeSlug } = event.params
	const slug = routeSlug ?? 'tracks'
	const data = await loadData(slug)

	const isWideLayout = () => (innerWidth.current ?? 0) > 1154
	// We pass params here so that inside page we can benefit from $derived caching
	const layoutMode = (
		splitViewAllowed: boolean,
		isWide: boolean,
		itemUuid: string | undefined,
	): LayoutMode => {
		if (slug === 'tracks') {
			return 'list'
		}

		if (isWide && splitViewAllowed) {
			return 'both'
		}

		if (itemUuid) {
			return 'details'
		}

		return 'list'
	}

	defineViewTransitionMatcher((to, from) => {
		const libraryRoute: RouteId = '/(app)/library/[[slug=libraryEntities]]'
		const detailsRoute: RouteId = `${libraryRoute}/[uuid]`

		if (to === libraryRoute && from === libraryRoute) {
			return { view: 'library' }
		}

		const mode = event.untrack(() =>
			layoutMode(getPersistedLibrarySplitLayoutEnabled(), isWideLayout(), event.params.uuid),
		)
		if (mode !== 'both') {
			return null
		}

		if (
			(to === detailsRoute && from === libraryRoute) ||
			(to === libraryRoute && from === detailsRoute) ||
			(to === detailsRoute && from === detailsRoute)
		) {
			return { view: 'library' }
		}

		return null
	})

	return {
		...data,
		isWideLayout,
		layoutMode,
	}
}
