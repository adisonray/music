<script lang="ts">
	import PlayNextButton from './buttons/PlayNextButton.svelte'
	import PlayPrevButton from './buttons/PlayPrevButton.svelte'
	import PlayToggleButton from './buttons/PlayToggleButton.svelte'
	import RepeatButton from './buttons/RepeatButton.svelte'
	import ShuffleButton from './buttons/ShuffleButton.svelte'

	const { class: className }: { class?: ClassValue } = $props()
</script>

<div class={['flex items-center gap-2', className]}>
	<ShuffleButton />

	<PlayPrevButton />

	<PlayToggleButton />

	<PlayNextButton />

	<RepeatButton />
</div>
