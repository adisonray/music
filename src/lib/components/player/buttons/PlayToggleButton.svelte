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
			// Update immediately so AeroUI's native symbol-replace animation
			// runs on every play/pause transition.
			syncIcon()
		}

		button.addEventListener('pressend', handlePress)

		return () => {
			button.removeEventListener('pressend', handlePress)
		}
	})

	$effect(() => {
		// Track the reactive playing state and keep AeroUI's native icon in sync.
		player.playing
		syncIcon()
	})
</script>

<button
	bind:this={button}
	type="button"
	class="aero-player"
	aria-label={player.playing ? m.playerPause() : m.playerPlay()}
	disabled={!player.activeTrack}
></button>

<style lang="postcss">
	@reference '../../../../app.css';

	.aero-player {
		--player-label: var(--color-onSecondaryContainer);
		--player-pressed: var(--color-onSecondaryContainer);
		--player-tint: color-mix(in srgb, var(--color-onSecondaryContainer) 10%, transparent);
		--player-disabled: color-mix(in srgb, var(--color-onSecondaryContainer) 55%, transparent);
	}
</style>
