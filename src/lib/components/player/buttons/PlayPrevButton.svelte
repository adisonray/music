<script lang="ts">
	import { onMount } from 'svelte'

	const { class: className }: { class?: ClassValue } = $props()
	const player = usePlayer()
	let button: HTMLButtonElement
	let skip: HTMLSpanElement

	onMount(async () => {
		const [{ initPlayerButton }, { initSkipLabel, playSkip }] = await Promise.all([
			import('https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'),
			import('https://nurislamaibekuly.github.io/aeroui/src/components/skip-label/skip-label.js'),
		])

		initPlayerButton(button)
		initSkipLabel(skip)

		button.addEventListener('pressend', () => {
			playSkip(skip, { bouncing: true })
			player.playPrev()
		})
	})
</script>

<button bind:this={button} type="button" class={['aero-player', className]} aria-label={m.playerPlayPreviousTrack()} disabled={player.isQueueEmpty}>
	<span bind:this={skip} class="aero-skip" data-direction="backward" data-size="24" aria-hidden="true"></span>
</button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player {
		--player-size: --spacing(11);
		--player-icon: --spacing(6);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		color: var(--color-onSecondaryContainer);
	}
</style>
