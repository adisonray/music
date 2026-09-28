<script lang="ts">
	import { tooltip } from '$lib/attachments/tooltip.ts'
	import Button from '$lib/components/Button.svelte'
	import IconButton from '$lib/components/IconButton.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import Select from '$lib/components/Select.svelte'
	import Separator from '$lib/components/Separator.svelte'
	import Slider from '$lib/components/Slider.svelte'
	import Spinner from '$lib/components/Spinner.svelte'
	import Switch from '$lib/components/Switch.svelte'
	import { isDatabaseOperationPending } from '$lib/db/lock-database.ts'
	import { initPageQueries } from '$lib/db/query/page-query.svelte.ts'
	import { supportsChangingAudioVolume } from '$lib/helpers/audio.ts'
	import { type BackupData, exportBackupData, importBackupData, validateBackupData } from '$lib/helpers/backup.ts'
	import { Debounced } from '$lib/helpers/debounced.svelte.ts'
	import { isFileSystemAccessSupported } from '$lib/helpers/file-system.ts'
	import { debounce } from '$lib/helpers/utils/debounce.ts'
	import type { AppMotionOption, AppThemeOption } from '$lib/stores/main/store.svelte.ts'
	import {
		PLAYER_PLAYBACK_RATE_MAX,
		PLAYER_PLAYBACK_RATE_MIN,
	} from '$lib/stores/player/player.svelte.ts'
	import { getLocale, type Locale, setLocale } from '$paraglide/runtime.js'
	import DirectoriesList from './components/DirectoriesList.svelte'
	import InstallAppBanner from './components/InstallAppBanner.svelte'
	import MissingFsApiBanner from './components/MissingFsApiBanner.svelte'

	const { data } = $props()

	initPageQueries(() => data)

	const mainStore = useMainStore()
	const player = usePlayer()
	const dialogs = useDialogsStore()

	const directories = $derived(data.directoriesQuery.value)

	const themeOptions: { name: string; value: AppThemeOption }[] = [
		{
			name: m.settingsThemeAuto(),
			value: 'auto',
		},
		{
			name: m.settingsThemeDark(),
			value: 'dark',
		},
		{
			name: m.settingsThemeLight(),
			value: 'light',
		},
	]

	const motionOptions: { name: string; value: AppMotionOption }[] = [
		{
			name: m.settingsMotionAuto(),
			value: 'auto',
		},
		{
			name: m.settingsMotionReduced(),
			value: 'reduced',
		},
		{
			name: m.settingsMotionNormal(),
			value: 'normal',
		},
	]

	const languageOptions: { name: string; value: Locale }[] = [
		{ name: 'English (EN)', value: 'en' },
		{ name: 'हिन्दी (HI)', value: 'hi' },
		{ name: 'Lietuvių (LT)', value: 'lt' },
		{ name: 'Deutsch (DE)', value: 'de' },
		{ name: 'Français (FR)', value: 'fr' },
		{ name: '简体中文', value: 'zh-CN' },
		{ name: '繁體中文', value: 'zh-TW' },
	]

	const updateMainColor = debounce((value: string | null) => {
		mainStore.customThemePaletteHex = value
	}, 400)

	let colorPickerElement: HTMLInputElement | undefined = $state()
	let localCustomColor = $state(mainStore.customThemePaletteHex ?? '#000000')

	$effect(() => {
		localCustomColor = mainStore.customThemePaletteHex ?? '#000000'
	})

	// We debounce state updates, because some DB operations can be very fast.
	// This prevents UI from flickering
	const isDatabasePendingGetter = new Debounced(() => isDatabaseOperationPending(), 200)
	const isDatabasePending = $derived(isDatabasePendingGetter.current)

	let fileInputEl: HTMLInputElement | undefined = $state()
	let importSummary = $state<{
		date: string
		playlistsCount: number
		tracksCount: number
		zip: any
		data: BackupData
	} | null>(null)

	const handleExport = async () => {
		try {
			const zipBlob = await exportBackupData()
			const url = URL.createObjectURL(zipBlob)
			const a = document.createElement('a')
			a.href = url
			a.download = `adi-music-backup-${new Date().toISOString().split('T')[0]}.zip`
			a.click()
			URL.revokeObjectURL(url)
			snackbar(m.settingsExportSuccess())
		} catch (error) {
			console.error(error)
			snackbar(m.settingsExportError({ error: error instanceof Error ? error.message : String(error) }))
		}
	}

	const handleFileSelect = async (e: Event) => {
		const target = e.currentTarget as HTMLInputElement
		const file = target.files?.[0]
		if (!file) { return }

		try {
			const JSZip = (await import('jszip')).default
			const zip = await JSZip.loadAsync(file)
			const backupJsonFile = zip.file('backup.json')
			if (!backupJsonFile) {
				throw new Error('Missing backup.json inside the zip archive')
			}
			const text = await backupJsonFile.async('string')
			const data = JSON.parse(text)
			if (!validateBackupData(data)) {
				throw new Error('Invalid or unsupported backup file schema')
			}

			const dateStr = new Date(data.timestamp).toLocaleString()
			const playlistsCount = data.db.playlists.length
			const tracksCount = data.db.tracks.length

			importSummary = {
				date: dateStr,
				playlistsCount,
				tracksCount,
				zip,
				data,
			}
		} catch (error) {
			console.error(error)
			snackbar(m.settingsImportError({ error: error instanceof Error ? error.message : String(error) }))
			if (fileInputEl) { fileInputEl.value = '' }
		}
	}

	const handleConfirmImport = async () => {
		if (!importSummary) { return }
		try {
			await importBackupData(importSummary.zip, importSummary.data)
			snackbar(m.settingsImportSuccess())
			setTimeout(() => {
				window.location.reload()
			}, 1000)
		} catch (error) {
			console.error(error)
			snackbar(m.settingsImportError({ error: error instanceof Error ? error.message : String(error) }))
		} finally {
			importSummary = null
			if (fileInputEl) { fileInputEl.value = '' }
		}
	}

	const handleCancelImport = () => {
		importSummary = null
		if (fileInputEl) { fileInputEl.value = '' }
	}
</script>

{#snippet heading(text: string)}
	<div class="px-4 pt-4 text-title-sm text-onSurfaceVariant">{text}</div>
{/snippet}

<section class="card settings-max-width mx-auto w-full overflow-clip">
	<div class="flex flex-col p-4">
		<div class="flex items-center gap-2 text-title-sm">
			{m.settingsDirectories()}
		</div>
		<div class="mt-1 mb-4 text-body-sm text-onSurfaceVariant">
			{m.settingsAllDataLocal()}
		</div>

		{#if !isFileSystemAccessSupported}
			<MissingFsApiBanner />
		{/if}
		<DirectoriesList disabled={isDatabasePending} {directories} />

		{#if isDatabasePending}
			<div
				class="mt-4 flex w-full items-center justify-center gap-4 rounded-md bg-tertiaryContainer/20 py-4"
			>
				{m.settingsDbOperationInProgress()}
				<Spinner class="size-8" />
			</div>
		{/if}
	</div>
</section>

<InstallAppBanner class="settings-max-width mt-6" />

<section class="card settings-max-width mx-auto mt-6 w-full text-body-lg">
	{@render heading(m.settingsAppearance())}

	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4">
		<div>{m.settingsApplicationTheme()}</div>

		<Select
			bind:selected={mainStore.theme}
			items={themeOptions}
			key="value"
			labelKey="name"
			class="w-full sm:w-40"
		/>
	</div>

	<div class="flex items-center justify-between p-4">
		<div>{m.settingPickColorFromArtwork()}</div>

		<Switch bind:checked={mainStore.pickColorFromArtwork} />
	</div>

	<div class="flex flex-col items-center gap-x-2 gap-y-4 p-4 sm:flex-row">
		<div class="mr-auto flex items-center gap-2">
			{m.settingsPrimaryColor()}

			{#if mainStore.customThemePaletteHex}
				<div
					class="pointer-events-none size-6 shrink-0 items-center justify-center rounded-md ring ring-outline/40"
					style:background={mainStore.customThemePaletteHex}
				></div>
			{/if}
		</div>

		<div class="flex items-center gap-2 max-sm:w-full">
			{#if mainStore.customThemePaletteHex}
				<Button
					kind="outlined"
					class="max-sm:w-full"
					disabled={!mainStore.customThemePaletteHex}
					onclick={() => {
						mainStore.customThemePaletteHex = null
					}}
				>
					{m.settingsColorReset()}
				</Button>
			{/if}

			<Button
				kind="toned"
				class="max-sm:w-full"
				onclick={() => {
					colorPickerElement?.click()
				}}
			>
				<Icon type="eyedropper" class="size-5" />

				{m.settingsColorPick()}
			</Button>

			<input
				bind:this={colorPickerElement}
				type="color"
				tabindex="-1"
				bind:value={localCustomColor}
				oninput={(e) => updateMainColor(e.currentTarget.value)}
				class="sr-only"
			/>
		</div>
	</div>

	<Separator />

	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4">
		<div>{m.settingsMotion()}</div>

		<Select
			bind:selected={mainStore.motion}
			items={motionOptions}
			key="value"
			labelKey="name"
			class="w-full sm:w-40"
		/>
	</div>
</section>

<section class="card settings-max-width mx-auto mt-6 w-full text-body-lg">
	{@render heading(m.player())}

	{#if supportsChangingAudioVolume()}
		<div class="flex items-center justify-between p-4">
			<div>{m.settingsDisplayVolumeSlider()}</div>

			<Switch bind:checked={mainStore.volumeSliderEnabled} />
		</div>

		<Separator />
	{/if}

	<div class="flex flex-col justify-between gap-y-4 p-4 sm:flex-row sm:items-center">
		<div class="flex items-center gap-2">
			<div>{m.equalizerTitle()}</div>

			{#if player.equalizer.enabled}
				<div
					class="rounded-full bg-primaryContainer px-2 py-0.5 text-label-sm text-onPrimaryContainer"
				>
					{m.equalizerStatusEnabled()}
				</div>
			{/if}
		</div>

		<Button
			kind="toned"
			onclick={() => {
				dialogs.openDialog('equalizer')
			}}
		>
			{m.equalizerOpenEqualizer()}
		</Button>
	</div>

	<Separator />

	<div class="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
		<div>{m.settingsPlaybackSpeed()}</div>

		<div class="flex w-full items-center gap-3 sm:w-56">
			<div class="w-12 text-center text-label-lg tabular-nums sm:text-right">
				{player.playbackRate}x
			</div>

			<Slider
				min={PLAYER_PLAYBACK_RATE_MIN}
				max={PLAYER_PLAYBACK_RATE_MAX}
				step={0.05}
				bind:value={player.playbackRate}
			/>
		</div>
	</div>

	<div class="flex justify-end px-4 pb-4">
		<Button
			kind="outlined"
			disabled={player.playbackRate === 1}
			onclick={() => {
				player.playbackRate = 1
			}}
		>
			{m.settingsPlaybackSpeedReset()}
		</Button>
	</div>

	<Separator />

	<div class="flex items-center justify-between p-4">
		<div class="flex items-center gap-2">
			<div>{m.settingsPreservePitch()}</div>

			<button
				type="button"
				class="interactable flex size-6 items-center justify-center rounded-full text-onSurfaceVariant"
				{@attach tooltip(m.settingsPreservePitchInfo())}
			>
				<Icon type="information" class="size-4" />
			</button>
		</div>

		<Switch bind:checked={player.preservePitch} />
	</div>
</section>

<section class="card settings-max-width mx-auto mt-6 w-full text-body-lg">
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4">
		<div>{m.settingsLanguage()}</div>

		<Select
			bind:selected={() => getLocale(), setLocale}
			items={languageOptions}
			key="value"
			labelKey="name"
			class="w-full sm:w-40"
		/>
	</div>
</section>

<section class="card settings-max-width mx-auto mt-6 w-full text-body-lg">
	{@render heading(m.settingsExportImport())}

	<div class="px-4 py-2 text-body-md text-onSurfaceVariant">
		{m.settingsBackupDescription()}
	</div>

	<div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
		<Button kind="toned" onclick={handleExport} class="max-sm:w-full">
			<Icon type="cached" class="size-5 mr-1" />
			{m.settingsExportButton()}
		</Button>

		<Button kind="outlined" onclick={() => fileInputEl?.click()} class="max-sm:w-full">
			<Icon type="folder" class="size-5 mr-1" />
			{m.settingsImportButton()}
		</Button>

		<input
			bind:this={fileInputEl}
			type="file"
			accept=".zip"
			onchange={handleFileSelect}
			class="sr-only"
		/>
	</div>

	{#if importSummary}
		<div class="m-4 rounded-xl border border-outline/30 bg-surfaceContainerLow p-4">
			<div class="text-title-medium font-bold text-onSurface mb-2">
				{m.settingsImportConfirmTitle()}
			</div>

			<p class="text-body-sm text-onSurfaceVariant mb-4 leading-relaxed">
				{m.settingsImportConfirmBody()}
			</p>

			<div class="mb-4 rounded-lg bg-surfaceContainerHighest p-3 text-body-sm flex flex-col gap-1">
				<div class="font-bold text-onSurfaceVariant mb-1">{m.settingsImportSummary()}</div>
				<div>{m.settingsImportDate({ date: importSummary.date })}</div>
				<div>{m.settingsImportPlaylistsCount({ count: importSummary.playlistsCount })}</div>
				<div>{m.settingsImportTracksCount({ count: importSummary.tracksCount })}</div>
			</div>

			<div class="flex items-center gap-2">
				<Button kind="toned" class="bg-error hover:bg-opacity-90" onclick={handleConfirmImport}>
					{m.settingsImportConfirmTitle()}
				</Button>
				<Button kind="outlined" onclick={handleCancelImport}>
					{m.cancel()}
				</Button>
			</div>
		</div>
	{/if}
</section>

<section class="card settings-max-width mx-auto mt-6 w-full text-body-lg">
	<div class="flex items-center justify-between p-4">
		<div>{m.about()}</div>

		<IconButton as="a" href="/about" tooltip={m.about()} icon="chevronRight" />
	</div>
</section>

<style lang="postcss">
	@reference '../../../../app.css';

	:global(.settings-max-width) {
		max-width: --spacing(225);
	}
</style>
