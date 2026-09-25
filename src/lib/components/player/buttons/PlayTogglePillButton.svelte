<script lang="ts">
	import { onMount } from 'svelte'

	const player = usePlayer()

	let button: HTMLButtonElement
	let setPlayerIcon: ((el: HTMLButtonElement, name: 'play' | 'pause') => void) | undefined

	function syncIcon() {
		if (!button || !setPlayerIcon) return
		setPlayerIcon(button, player.playing ? 'pause' : 'play')
	}

	onMount(async () => {
		const aero = await import(
			'https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js'
		)

		setPlayerIcon = aero.setPlayerIcon
		aero.initPlayerButton(button)
		syncIcon()

		const handlePress = () => {
			player.togglePlay()
			syncIcon()
		}

		button.addEventListener('pressend', handlePress)

		return () => {
			button.removeEventListener('pressend', handlePress)
		}
	})

	$effect(() => {
		player.playing
		syncIcon()
	})
</script>

<button
	bind:this={button}
	class="aero-player"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
></button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player {
		--player-size: --spacing(18);
		--player-icon: --spacing(6);
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 38%, transparent);
		color: var(--color-onSecondaryContainer);
	}
</style>
