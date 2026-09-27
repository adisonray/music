<script lang="ts">
	import { formatArtists, getItemLanguage } from '$lib/helpers/utils/text.ts'
	import Button from './Button.svelte'
	import Icon from './icon/Icon.svelte'
	import PlayerFavoriteButton from './player/buttons/PlayerFavoriteButton.svelte'
	import PlayNextButton from './player/buttons/PlayNextButton.svelte'
	import PlayToggleButton from './player/buttons/PlayToggleButton.svelte'
	import MainControls from './player/MainControls.svelte'
	import PlayerArtwork from './player/PlayerArtwork.svelte'
	import Timeline from './player/Timeline.svelte'
	import VolumeSlider from './player/VolumeSlider.svelte'

	const { class: className }: { class?: ClassValue } = $props()

	const mainStore = useMainStore()
	const player = usePlayer()

	const track = $derived(player.activeTrack)
</script>

<div
	id="mini-player"
	class={[
		'pointer-events-auto mx-auto w-full max-w-225 justify-between overflow-hidden rounded-2xl border border-primary/10 bg-secondaryContainer text-onSecondaryContainer contain-content view-name-[pl-card] sm:h-auto sm:rounded-3xl active-view-player:border-transparent',
		className,
	]}
>
	<div class="flex size-full flex-col items-center justify-between gap-4 sm:px-4 sm:pt-2 sm:pb-4">
		<Timeline class="max-sm:hidden" />
		<div class="flex h-min w-full grow grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center sm:grid">
			<div class="flex min-w-0 grow items-center">
				<Button
					as="a"
					href="/player"
					kind="blank"
					tooltip={m.playerOpenFullPlayer()}
					class="max-sm:rounded-r-4 group flex min-w-0 grow items-center rounded-lg pr-2 max-sm:p-2 sm:h-12 sm:max-w-70"
				>
					<div
						class="relative -z-1 size-11 shrink-0 overflow-hidden rounded-lg bg-onSecondary active-view-player:view-name-[pl-artwork]"
					>
						{#if track}
							<PlayerArtwork class="size-full" />
						{/if}

						<Icon
							type="chevronUp"
							class={[
								'absolute inset-0 m-auto shrink-0 active-view-player:view-name-[pl-chevron-up]',
								track &&
									'scale-0 rounded-full bg-tertiary text-onTertiary transition-[transform,opacity] duration-200 [.group:hover_&]:scale-100',
							]}
						/>
					</div>

					{#if track}
						<div class="ml-3 mr-1 grid min-w-0 sm:ml-3" lang={getItemLanguage(track.language)}>
							<div class="truncate text-body-md">
								{track.name}
							</div>
							<div class="truncate text-body-sm">{formatArtists(track.artists)}</div>
						</div>
					{/if}
				</Button>

				<PlayerFavoriteButton />
			</div>

			<div class="mx-auto flex items-center gap-2 sm:hidden">
				<PlayToggleButton />

				<PlayNextButton class="max-xss:hidden" />
			</div>

			<MainControls class="max-sm:hidden" />

			<div class="ml-auto flex shrink-0 items-center gap-1 pr-1 max-sm:hidden">
				{#if mainStore.volumeSliderEnabled}
					<VolumeSlider />
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	@reference '../../app.css';

	.controls {
		grid-template-columns: 1fr max-content 1fr;
	}

	@media (min-width: 640px) {
		#mini-player .flex.h-min.w-full.grow {
			min-height: 52px;
		}

		#mini-player .flex.h-min.w-full.grow > :first-child {
			width: 100%;
			max-width: 24rem;
		}

		#mini-player .flex.h-min.w-full.grow > :nth-child(2) {
			justify-self: center;
		}

		#mini-player .flex.h-min.w-full.grow > :last-child {
			min-width: 0;
		}
	}

	::view-transition-old(pl-chevron-up) {
		display: none;
	}

	@keyframes -global-view-pl-chevron-up-fade-in {
		from {
			opacity: 0;
			transform: scale(0);
		}
	}

	::view-transition-new(pl-chevron-up) {
		animation: view-pl-chevron-up-fade-in 125ms 225ms linear backwards;
	}
</style>
