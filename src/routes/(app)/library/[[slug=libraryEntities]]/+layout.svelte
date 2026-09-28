<script lang="ts">
	import type { Snapshot } from '@sveltejs/kit'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import type { RouteId } from '$app/types'
	import AlbumsListContainer from '$lib/components/AlbumsListContainer.svelte'
	import LibraryHome from '$lib/components/LibraryHome.svelte'
	import ArtistListContainer from '$lib/components/ArtistListContainer.svelte'
	import Button from '$lib/components/Button.svelte'
	import IconButton from '$lib/components/IconButton.svelte'
	import type { IconType } from '$lib/components/icon/Icon.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import ListDetailsLayout from '$lib/components/ListDetailsLayout.svelte'
	import PlaylistListContainer from '$lib/components/playlists/PlaylistListContainer.svelte'
	import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
	import { initPageQueries } from '$lib/db/query/page-query.svelte.js'
	import { isMobile } from '$lib/helpers/utils/ua.ts'
	import { useSetOverlaySnippet } from '$lib/layout-bottom-bar.svelte.ts'
	import { FAVORITE_PLAYLIST_ID } from '$lib/library/playlists-actions.ts'
	import { getPlaylistMenuItems } from '$lib/menu-actions/playlists.ts'
	import Search from './Search.svelte'

	const { data, children } = $props()

	initPageQueries(() => data)

	const main = useMainStore()
	const dialogs = useDialogsStore()

	const itemsIds = $derived(data.itemsIdsQuery.value)
	const slug = $derived(page.params.slug as typeof data.slug | undefined)
	const isLibraryHome = $derived(!slug)
	const isHandHeldDevice = isMobile()
	const isDetailPage = $derived(Boolean(page.params.uuid))
	const isAlbumOrArtistDetails = $derived(isDetailPage && (slug === 'albums' || slug === 'artists'))

	type LibraryNavSlug = 'home' | 'tracks' | 'albums' | 'artists' | 'playlists'

	interface NavItem {
		slug: LibraryNavSlug
		title: string
		icon: IconType
	}

	const navItems: NavItem[] = [
		{
			slug: 'home',
			title: 'Library',
			icon: 'home',
		},
		{
			slug: 'tracks',
			title: m.tracks(),
			icon: 'musicNote',
		},
		{
			slug: 'albums',
			title: m.albums(),
			icon: 'album',
		},
		{
			slug: 'artists',
			title: m.artists(),
			icon: 'person',
		},
		{
			slug: 'playlists',
			title: m.playlists(),
			icon: 'playlist',
		},
	]

	const isWideLayout = $derived(data.isWideLayout())
	const layoutMode = $derived(
		data.layoutMode(main.librarySplitLayoutEnabled, isWideLayout, page.params.uuid),
	)

	useSetOverlaySnippet('bottom-bar', () => layoutBottom)

	export const snapshot: Snapshot<string> = {
		capture: () => data.store.searchTerm,
		restore: (value) => {
			data.store.searchTerm = value
		},
	}
</script>

{#snippet navItemsSnippet(className: string)}
	{#each navItems as item}
		<Button
			as="a"
			href={item.slug === 'home' ? '/library' : `/library/${item.slug}`}
			kind="blank"
			tooltip={item.title}
			class={['flex shrink-0 items-center justify-center', className]}
		>
			<div
				class={[
					'flex items-center justify-center rounded-full p-2',
					((item.slug === 'home' && !slug) || item.slug === slug) && 'bg-secondaryContainer text-onSecondaryContainer',
				]}
			>
				<Icon type={item.icon} />
			</div>
		</Button>
	{/each}
	<Button
		as="a"
		href="/discovery"
		kind="blank"
		tooltip="Discovery"
		class={['flex shrink-0 items-center justify-center', className]}
	>
		<div class="flex items-center justify-center rounded-full p-2">
			<Icon type="compass" />
		</div>
	</Button>
{/snippet}

{#snippet layoutBottom()}
	{#if isHandHeldDevice && !isDetailPage}
		<div
			class="pointer-events-auto grid h-16 w-full grid-cols-6 items-center border-t border-outline/10 bg-surfaceContainer px-1 pb-[env(safe-area-inset-bottom)] sm:hidden active-view-regular:view-name-[bottom-bar]"
		>
			{@render navItemsSnippet('h-full min-w-0')}
		</div>
	{/if}
{/snippet}

<div
	class={[
		'desktop-sidebar fixed left-4 top-20 z-1 hidden h-max w-16 flex-col items-center gap-2 sm:flex [@media(max-height:500px)]:top-2',
	]}
>
	{#if !isDetailPage}
		{@render navItemsSnippet('h-14 w-20')}
	{/if}
</div>

{#if isLibraryHome}
	<div class="mx-auto w-full max-w-(--app-max-content-width) px-4 sm:pl-20">
		<Search name="Library" sortOptions={data.sortOptions} store={data.store} />
	</div>
	<LibraryHome />
{:else}
	<ListDetailsLayout mode={layoutMode} class="mx-auto w-full max-w-(--app-max-content-width) grow">
	{#snippet list(mode)}
		<div class="flex grow flex-col sm:pl-20 pl-0">
			<div class={[mode === 'both' && 'w-100', 'flex grow flex-col px-4']}>
				<Search
					name={data.pluralTitle()}
					sortOptions={data.sortOptions}
					store={data.store}
					showSplitButton={!isAlbumOrArtistDetails && (slug === 'albums' || slug === 'artists') && isWideLayout}
					splitEnabled={main.librarySplitLayoutEnabled}
					onToggleSplit={() => {
						main.librarySplitLayoutEnabled = !main.librarySplitLayoutEnabled
					}}
			/>

				{#if slug === 'playlists'}
					<div class="mb-4 flex items-center justify-end">
						<Button
							kind="outlined"
							onclick={() => {
								dialogs.openDialog('newPlaylist')
							}}
						>
							<Icon type="plus" />

							{m.libraryNewPlaylist()}
						</Button>
					</div>
				{/if}

				{#if data.tracksCountQuery.value === 0 && slug !== 'playlists'}
					<div class="my-auto flex flex-col items-center text-center">
						<div class="mb-1 text-title-lg">{m.libraryEmpty()}</div>
						{m.libraryStartByAdding()}
						<Button as="a" href="/settings" class="mt-4">
							<Icon type="plus" />
							{m.libraryImportTracks()}
						</Button>
					</div>
				{:else}
					<div class={['flex w-full grow flex-col']}>
						{#if itemsIds.length === 0}
							<div class="relative m-auto flex flex-col items-center text-center">
								<Icon type="magnify" class="my-auto size-35 opacity-54" />

								<div class="text-body-lg">
									{m.libraryNoResults()}
								</div>
								<div>
									{m.libraryNoResultsExplanation()}
								</div>
							</div>
						{:else if slug === 'tracks'}
							<TracksListContainer items={itemsIds} />
						{:else if slug === 'albums'}
							<AlbumsListContainer items={itemsIds} />
						{:else if slug === 'artists'}
							<ArtistListContainer items={itemsIds} />
						{:else if slug === 'playlists'}
							<PlaylistListContainer
								items={itemsIds}
								menuItems={{
									disabled: (playlist) => playlist.id === FAVORITE_PLAYLIST_ID,
									items: (playlist) => getPlaylistMenuItems(dialogs, playlist),
								}}
								onItemClick={({ playlist }) => {
									const detailsViewId: RouteId = '/(app)/library/[[slug=libraryEntities]]/[uuid]'
									const shouldReplace = page.route.id === detailsViewId

									void goto(`/library/playlists/${playlist.uuid}`, { replaceState: shouldReplace })
								}}
							/>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/snippet}

	{#snippet details()}
		<div
			class={[
				'pointer-events-auto flex h-full flex-col rounded-3xl',
				layoutMode === 'both' && 'mx-4 mt-4 border border-primary/5 bg-surfaceContainer',
			]}
		>
			{#key page.url.pathname}
				{@render children()}
			{/key}
		</div>
	{/snippet}
	</ListDetailsLayout>
{/if}
