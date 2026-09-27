<script lang="ts">
	import Icon, { type IconType } from '$lib/components/icon/Icon.svelte'
	import Section from './Section.svelte'

	interface Feature {
		icon: IconType
		title: string
		description: string
		accent: 'primary' | 'secondary' | 'tertiary'
	}

	const features: Feature[] = [
		{
			icon: 'album',
			title: 'Artists and albums, one library',
			description:
				'Move between tracks, albums, and artist pages without losing the music you are playing.',
			accent: 'primary',
		},
		{
			icon: 'musicNote',
			title: 'Lyrics that stay with the player',
			description:
				'Follow synced lyrics while the artwork and player controls remain right where you need them.',
			accent: 'secondary',
		},
		{
			icon: 'palette',
			title: 'A UI that follows the music',
			description:
				'Album artwork can drive the Material color palette, so the interface changes with what you play.',
			accent: 'tertiary',
		},
		{
			icon: 'playlistMusic',
			title: 'Playlists, queue, and history',
			description:
				'Build playlists, mark favorites, shuffle or repeat, and decide what comes next.',
			accent: 'primary',
		},
	]
</script>

<Section
	id="features"
	class="mktg-content-width"
	label="The new Adi Music"
	title="A music player that feels like one system"
	description="Material surfaces, expressive artwork, and the controls you actually use while listening."
>
	<div class="grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-2">
		{#each features as feature}
			<article
				class={[
					'feature-card marketing-scroll-enter-soft p-7',
					feature.accent === 'secondary'
						? 'feature-secondary'
						: feature.accent === 'tertiary'
							? 'feature-tertiary'
							: 'feature-primary',
				]}
			>
				<div class="feature-card-icon mb-6">
					<Icon type={feature.icon} />
				</div>

				<h3 class="mb-2 text-title-lg font-semibold text-onSurface">{feature.title}</h3>
				<p class="max-w-xl text-body-lg leading-relaxed text-onSurfaceVariant">
					{feature.description}
				</p>

				<div class="feature-line" aria-hidden="true"></div>
			</article>
		{/each}
	</div>
</Section>

<style>
	.feature-card {
		position: relative;
		overflow: hidden;
		display: flex;
		min-height: 15rem;
		flex-direction: column;
		border: 1px solid --alpha(var(--color-outline) / 0.18);
		border-radius: 1.75rem;
		background: var(--color-surfaceContainer);
		box-shadow: 0 5px 18px --alpha(var(--color-shadow) / 0.07);
		transition:
			transform 0.25s ease,
			border-color 0.25s ease,
			box-shadow 0.25s ease;
	}

	.feature-card:hover {
		transform: translateY(-3px);
		border-color: --alpha(var(--color-primary) / 0.35);
		box-shadow: 0 12px 32px --alpha(var(--color-shadow) / 0.12);
	}

	.feature-card-icon {
		display: flex;
		width: 3.5rem;
		height: 3.5rem;
		align-items: center;
		justify-content: center;
		border-radius: 1.15rem;
		background: --alpha(var(--color-primaryContainer) / 0.65);
		color: var(--color-primary);
	}

	.feature-secondary .feature-card-icon {
		background: --alpha(var(--color-secondaryContainer) / 0.65);
		color: var(--color-secondary);
	}

	.feature-tertiary .feature-card-icon {
		background: --alpha(var(--color-tertiaryContainer) / 0.65);
		color: var(--color-tertiary);
	}

	.feature-line {
		position: absolute;
		right: 1.5rem;
		bottom: 1.5rem;
		left: 1.5rem;
		height: 0.25rem;
		border-radius: 999px;
		background: linear-gradient(90deg, --alpha(var(--color-primary) / 0.65), transparent);
		opacity: 0.7;
	}

	.feature-secondary .feature-line {
		background: linear-gradient(90deg, --alpha(var(--color-secondary) / 0.65), transparent);
	}

	.feature-tertiary .feature-line {
		background: linear-gradient(90deg, --alpha(var(--color-tertiary) / 0.65), transparent);
	}
</style>