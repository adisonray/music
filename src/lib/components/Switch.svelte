<script lang="ts">
	import Icon from './icon/Icon.svelte'

	interface Props {
		checked: boolean
	}

	let { checked = $bindable(false) }: Props = $props()

	let startX = $state<number | undefined>(undefined)

	const toggle = () => {
		checked = !checked
	}

	const handlePointerDown = (event: PointerEvent) => {
		startX = event.clientX
	}

	const handlePointerUp = (event: PointerEvent) => {
		if (startX === undefined) return

		const distance = event.clientX - startX

		if (distance > 16) checked = true
		else if (distance < -16) checked = false
		else toggle()

		startX = undefined
	}
</script>

<svelte:window onpointerup={handlePointerUp} />

<button
	type="button"
	class="switch interactable"
	class:checked
	role="switch"
	aria-checked={checked}
	onpointerdown={handlePointerDown}
	ondragstart={(event) => event.preventDefault()}
	onkeydown={(event) => {
		if (event.code === 'Enter' || event.code === 'Space') {
			event.preventDefault()
			toggle()
		} else if (event.code === 'ArrowLeft') {
			checked = false
		} else if (event.code === 'ArrowRight') {
			checked = true
		}
	}}
>
	<span class="handle" aria-hidden="true">
		<span class="icon checked-icon"><Icon type="check" class="size-4" /></span>
		<span class="icon unchecked-icon"><Icon type="close" class="size-4" /></span>
	</span>
	<span class="hover" aria-hidden="true"></span>
</button>

<style>
	.switch {
		position: relative;
		display: inline-flex;
		width: 3.25rem;
		height: 2rem;
		padding: 0;
		border: 0.125rem solid var(--color-outline);
		border-radius: 9999px;
		background: var(--color-surfaceContainerHighest);
		cursor: pointer;
		transition:
			background-color 200ms cubic-bezier(0.2, 0, 0, 1),
			border-color 200ms cubic-bezier(0.2, 0, 0, 1);
		-webkit-tap-highlight-color: transparent;
	}

	.switch.checked {
		border-color: var(--color-primary);
		background: var(--color-primary);
	}

	.handle {
		position: absolute;
		top: 50%;
		left: 0.5rem;
		display: flex;
		width: 1rem;
		height: 1rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: var(--color-outline);
		color: var(--color-surfaceContainerHighest);
		transform: translateY(-50%) scale(1);
		transform-origin: center;
		transition:
			left 350ms cubic-bezier(0.2, 0, 0, 1),
			transform 350ms cubic-bezier(0.2, 0, 0, 1),
			background-color 150ms cubic-bezier(0.2, 0, 0, 1),
			color 150ms cubic-bezier(0.2, 0, 0, 1);
		pointer-events: none;
	}

	.switch.checked .handle {
		left: 1.75rem;
		background: var(--color-onPrimary);
		color: var(--color-primary);
		transform: translateY(-50%) scale(1.5);
	}

	.icon {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
	opacity: 0;
		transform: scale(0.667);
		transition:
			opacity 350ms cubic-bezier(0.2, 0, 0, 1),
			transform 350ms cubic-bezier(0.2, 0, 0, 1);
	}

	.switch:not(.checked) .unchecked-icon,
	.switch.checked .checked-icon {
	opacity: 1;
	}

	.hover {
		position: absolute;
		top: 50%;
		left: 1rem;
		width: 3rem;
		height: 3rem;
		border-radius: 9999px;
		transform: translate(-50%, -50%);
		transition:
			left 350ms cubic-bezier(0.2, 0, 0, 1),
			background-color 150ms cubic-bezier(0.2, 0, 0, 1);
		pointer-events: none;
	}

	.switch.checked .hover {
		left: 2.25rem;
	}

	.switch:hover .hover {
		background: color-mix(in srgb, var(--color-onSurface) 8%, transparent);
	}

	.switch.checked:hover .hover {
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.switch:active .handle {
		transform: translateY(-50%) scale(1.75);
	}

	.switch:active .icon {
		transform: scale(0.571);
	}

	.switch.checked:active .handle {
		left: 1.75rem;
	}

	.switch:focus-visible {
		outline: 0.125rem solid var(--color-primary);
		outline-offset: 0.125rem;
	}
</style>
