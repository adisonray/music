<script lang="ts" module>
	import Button from '$lib/components/Button.svelte'
	import Dialog, { type DialogOpenAccessor } from '$lib/components/dialog/Dialog.svelte'
	import Separator from '$lib/components/Separator.svelte'
	import TextField from '$lib/components/TextField.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import Spinner from '$lib/components/Spinner.svelte'
	import Tabs from '$lib/components/Tabs.svelte'
	import type { TrackData } from '$lib/library/get/value.ts'
	import { LyricsCache, type CachedLyricsResult } from '$lib/lyrics/LyricsCache.ts'
	import { LyricsParser } from '$lib/lyrics/LyricsParser.ts'
	import { LyricsProvider } from '$lib/lyrics/LyricsProvider.ts'

	export interface LyricsSourceDialogProps {
		open: DialogOpenAccessor<TrackData>
	}

	interface CustomSource {
		id: string
		name: string
		url: string
	}
</script>

<script lang="ts">
	let { open }: LyricsSourceDialogProps = $props()

	const track = $derived(open.get())

	const tabs = ['sources', 'upload', 'custom-apis'] as const
	let selectedTabIndex = $state(0)
	const currentTab = $derived(tabs[selectedTabIndex])

	let customSources: CustomSource[] = $state([])
	let newSourceName = $state('')
	let newSourceUrl = $state('')
	let fetching = $state(false)
	let activeFetchingSource = $state<string | null>(null)

	$effect(() => {
		if (typeof window !== 'undefined') {
			const raw = localStorage.getItem('snaeplayer-custom-lyrics-sources')
			if (raw) {
				try {
					customSources = JSON.parse(raw)
				} catch {}
			}
		}
	})

	function saveCustomSources() {
		localStorage.setItem('snaeplayer-custom-lyrics-sources', JSON.stringify(customSources))
	}

	function addCustomSource() {
		if (!newSourceName.trim() || !newSourceUrl.trim()) {
			snackbar('Please fill out both Name and URL')
			return
		}
		const newSource: CustomSource = {
			id: crypto.randomUUID(),
			name: newSourceName.trim(),
			url: newSourceUrl.trim(),
		}
		customSources = [...customSources, newSource]
		saveCustomSources()
		newSourceName = ''
		newSourceUrl = ''
		snackbar('Custom source added successfully')
	}

	function deleteCustomSource(id: string) {
		customSources = customSources.filter((cs) => cs.id !== id)
		saveCustomSources()
		snackbar('Custom source deleted')
	}

	async function selectSource(sourceId: 'adi' | 'lrcmux' | 'unison' | 'lrclib' | string) {
		if (!track) return
		fetching = true
		activeFetchingSource = sourceId

		try {
			let result: CachedLyricsResult | null = null
			const durationMs = Math.round(track.duration) * 1000

			if (sourceId === 'adi') {
				const resp = await LyricsProvider.fetchFromAdi(track)
				if (resp) {
					const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
					result = {
						status: 'found',
						source: 'adi',
						lyrics,
						syncType: resp.isPlainOnly ? 'plain' : 'karaoke',
					}
				}
			} else if (sourceId === 'lrcmux') {
				const resp = await LyricsProvider.fetchFromLrcmux(track)
				if (resp) {
					const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
					const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
					result = {
						status: 'found',
						source: 'lrcmux',
						lyrics,
						syncType: hasWordTiming ? 'karaoke' : 'line',
					}
				}
			} else if (sourceId === 'unison') {
				const resp = await LyricsProvider.fetchFromUnison(track)
				if (resp) {
					const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
					const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
					result = {
						status: 'found',
						source: 'unison',
						lyrics,
						syncType: hasWordTiming ? 'karaoke' : resp.isPlainOnly ? 'plain' : 'line',
					}
				}
			} else if (sourceId === 'lrclib') {
				const resp = await LyricsProvider.fetchFromLrclib(track)
				if (resp) {
					if (resp.rawLyrics === 'Instrumental') {
						result = { status: 'instrumental' }
					} else {
						const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
						const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
						result = {
							status: 'found',
							source: 'lrclib',
							lyrics,
							syncType: hasWordTiming ? 'karaoke' : resp.isPlainOnly ? 'plain' : 'line',
						}
					}
				}
			} else {
				// Custom source
				const custom = customSources.find((cs) => cs.id === sourceId)
				if (custom) {
					const resp = await LyricsProvider.fetchFromCustomSource(track, custom)
					if (resp) {
						const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
						result = {
							status: 'found',
							source: custom.name,
							lyrics,
							syncType: resp.isPlainOnly ? 'plain' : 'line',
						}
					}
				}
			}

			if (result) {
				await LyricsCache.set(track.id, result)
				window.dispatchEvent(new CustomEvent('lyrics-reload'))
				snackbar('Lyrics loaded successfully')
				open.close()
			} else {
				snackbar('Failed to fetch lyrics from this source')
			}
		} catch (e) {
			console.error(e)
			snackbar('An error occurred while fetching lyrics')
		} finally {
			fetching = false
			activeFetchingSource = null
		}
	}

	async function resetToDefault() {
		if (!track) return
		try {
			// Clear cache entry to trigger standard priority searching chain
			const db = await (await import('$lib/db/database.ts')).getDatabase()
			await db.delete('lyrics', track.id)
			window.dispatchEvent(new CustomEvent('lyrics-reload'))
			snackbar('Lyrics reset to default search')
			open.close()
		} catch (e) {
			console.error(e)
			snackbar('Failed to reset lyrics')
		}
	}

	function handleFileUpload(event: Event) {
		if (!track) return
		const target = event.target as HTMLInputElement
		const file = target.files?.[0]
		if (!file) return

		const reader = new FileReader()
		reader.onload = async (e) => {
			const text = e.target?.result as string
			if (!text) {
				snackbar('Failed to read file')
				return
			}

			try {
				const durationMs = Math.round(track.duration) * 1000
				const lyrics = LyricsParser.parse(text, durationMs)
				const isPlainOnly = !text.includes('[') && !text.includes('<tt')
				const result: CachedLyricsResult = {
					status: 'found',
					source: 'uploaded',
					lyrics,
					syncType: isPlainOnly ? 'plain' : 'line',
				}
				await LyricsCache.set(track.id, result)
				window.dispatchEvent(new CustomEvent('lyrics-reload'))
				snackbar('Lyrics uploaded successfully')
				open.close()
			} catch (err) {
				console.error(err)
				snackbar('Failed to parse uploaded lyrics file')
			}
		}
		reader.readAsText(file)
	}
</script>

<Dialog {open} class="[--dialog-width:--spacing(150)]">
	{#snippet header()}
		<header data-dialog-header class="flex items-center justify-between px-6 py-6">
			<div class="flex items-center gap-3">
				<Icon type="musicNote" class="text-secondary" />
				<div class="text-headline-sm">Lyrics Settings</div>
			</div>
		</header>
	{/snippet}

	{#snippet children({ close })}
		{#if track}
			<div data-dialog-content class="flex flex-col overflow-hidden">
				<Separator />

				<!-- Track details header -->
				<div class="px-6 py-4 bg-surfaceContainerLow flex flex-col gap-1">
					<div class="text-title-medium font-bold text-onSurface">{track.name}</div>
					<div class="text-body-medium text-onSurfaceVariant">
						{Array.isArray(track.artists) ? track.artists.join(', ') : track.artists}
					</div>
				</div>

				<Separator />

				<!-- Tabs -->
				<div class="px-6 py-3 flex justify-center">
					<Tabs
						selectedIndex={selectedTabIndex}
						items={tabs}
						onchange={(_, idx) => {
							selectedTabIndex = idx
						}}
						class="w-full"
					>
						{#snippet text(tab)}
							<span class="text-label-medium capitalize">
								{tab === 'custom-apis' ? 'Custom APIs' : tab}
							</span>
						{/snippet}
					</Tabs>
				</div>

				<!-- Scrollable content -->
				<div class="grow overflow-y-auto px-6 py-4 max-h-[350px]">
					{#if currentTab === 'sources'}
						<div class="flex flex-col gap-3">
							<div class="text-title-small font-semibold text-onSurfaceVariant mb-1">
								Select Lyrics Provider
							</div>

							<!-- Adi Lyrics -->
							<button
								type="button"
								disabled={fetching}
								class="interactable flex items-center justify-between rounded-xl bg-surfaceContainerLow p-4 text-left transition-colors hover:bg-surfaceContainer"
								onclick={() => selectSource('adi')}
							>
								<div class="flex flex-col">
									<span class="text-body-large font-bold">Adi Lyrics</span>
									<span class="text-body-small text-onSurfaceVariant">Primary Provider</span>
								</div>
								{#if fetching && activeFetchingSource === 'adi'}
									<Spinner class="size-5" />
								{:else}
									<Icon type="chevronRight" class="text-onSurfaceVariant size-5" />
								{/if}
							</button>

							<!-- LRC Mux -->
							<button
								type="button"
								disabled={fetching}
								class="interactable flex items-center justify-between rounded-xl bg-surfaceContainerLow p-4 text-left transition-colors hover:bg-surfaceContainer"
								onclick={() => selectSource('lrcmux')}
							>
								<div class="flex flex-col">
									<span class="text-body-large font-bold">LRC Mux</span>
									<span class="text-body-small text-onSurfaceVariant">Secondary Provider</span>
								</div>
								{#if fetching && activeFetchingSource === 'lrcmux'}
									<Spinner class="size-5" />
								{:else}
									<Icon type="chevronRight" class="text-onSurfaceVariant size-5" />
								{/if}
							</button>

							<!-- Unison -->
							<button
								type="button"
								disabled={fetching}
								class="interactable flex items-center justify-between rounded-xl bg-surfaceContainerLow p-4 text-left transition-colors hover:bg-surfaceContainer"
								onclick={() => selectSource('unison')}
							>
								<div class="flex flex-col">
									<span class="text-body-large font-bold">Unison</span>
									<span class="text-body-small text-onSurfaceVariant">Tertiary Provider</span>
								</div>
								{#if fetching && activeFetchingSource === 'unison'}
									<Spinner class="size-5" />
								{:else}
									<Icon type="chevronRight" class="text-onSurfaceVariant size-5" />
								{/if}
							</button>

							<!-- LRCLIB -->
							<button
								type="button"
								disabled={fetching}
								class="interactable flex items-center justify-between rounded-xl bg-surfaceContainerLow p-4 text-left transition-colors hover:bg-surfaceContainer"
								onclick={() => selectSource('lrclib')}
							>
								<div class="flex flex-col">
									<span class="text-body-large font-bold">LRCLIB</span>
									<span class="text-body-small text-onSurfaceVariant">Last Fallback Provider</span>
								</div>
								{#if fetching && activeFetchingSource === 'lrclib'}
									<Spinner class="size-5" />
								{:else}
									<Icon type="chevronRight" class="text-onSurfaceVariant size-5" />
								{/if}
							</button>

							<!-- Custom Sources -->
							{#if customSources.length > 0}
								<div class="text-title-small font-semibold text-onSurfaceVariant mt-4 mb-1">
									Custom Sources
								</div>
								{#each customSources as source}
									<button
										type="button"
										disabled={fetching}
										class="interactable flex items-center justify-between rounded-xl bg-surfaceContainerLow p-4 text-left transition-colors hover:bg-surfaceContainer"
										onclick={() => selectSource(source.id)}
									>
										<div class="flex flex-col">
											<span class="text-body-large font-bold">{source.name}</span>
											<span class="text-body-small text-onSurfaceVariant truncate max-w-[280px]">
												{source.url}
											</span>
										</div>
										{#if fetching && activeFetchingSource === source.id}
											<Spinner class="size-5" />
										{:else}
											<Icon type="chevronRight" class="text-onSurfaceVariant size-5" />
										{/if}
									</button>
								{/each}
							{/if}

							<Separator class="my-4" />

							<Button kind="outlined" disabled={fetching} onclick={resetToDefault}>
								Reset to Default Search
							</Button>
						</div>
					{:else if currentTab === 'upload'}
						<div class="flex flex-col gap-4 items-center justify-center py-6 text-center">
							<Icon type="folder" class="size-16 text-primary mb-2" />
							<div class="text-body-large font-semibold">Upload Local LRC or TTML</div>
							<div class="text-body-small text-onSurfaceVariant max-w-72">
								Select an `.lrc`, `.ttml`, or `.txt` file containing synced lyrics for this track. It will be loaded and saved locally.
							</div>

							<label
								class="interactable flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-onPrimary transition-all hover:bg-opacity-90 mt-4"
							>
								<Icon type="plus" class="size-5" />
								Select File
								<input
									type="file"
									accept=".lrc,.ttml,.txt"
									class="hidden"
									onchange={handleFileUpload}
								/>
							</label>
						</div>
					{:else if currentTab === 'custom-apis'}
						<div class="flex flex-col gap-4">
							<div class="text-title-small font-semibold text-onSurfaceVariant">
								Add New Custom API Source
							</div>

							<div class="flex flex-col gap-3">
								<TextField
									name="sourceName"
									placeholder="Source Name (e.g. My Custom API)"
									bind:value={newSourceName}
									required
								/>

								<TextField
									name="sourceUrl"
									placeholder="API URL Template"
									bind:value={newSourceUrl}
									required
								/>

								<p class="text-body-small text-onSurfaceVariant px-1 leading-relaxed">
									Use placeholders in your URL Template:
									<code class="bg-surfaceContainerHigh px-1 rounded font-mono text-primary">
										{'{title}'}
									</code>,
									<code class="bg-surfaceContainerHigh px-1 rounded font-mono text-primary">
										{'{artist}'}
									</code>,
									<code class="bg-surfaceContainerHigh px-1 rounded font-mono text-primary">
										{'{album}'}
									</code>, or
									<code class="bg-surfaceContainerHigh px-1 rounded font-mono text-primary">
										{'{duration}'}
									</code> (seconds).
								</p>

								<Button kind="filled" class="mt-2" onclick={addCustomSource}>
									Add Custom Source
								</Button>
							</div>

							{#if customSources.length > 0}
								<Separator class="my-4" />

								<div class="text-title-small font-semibold text-onSurfaceVariant mb-2">
									Manage Custom Sources
								</div>

								<div class="flex flex-col gap-2">
									{#each customSources as source}
										<div
											class="flex items-center justify-between rounded-xl bg-surfaceContainerLow p-3"
										>
											<div class="flex flex-col min-w-0 pr-4">
												<span class="text-body-medium font-bold truncate">{source.name}</span>
												<span class="text-body-small text-onSurfaceVariant truncate font-mono">
													{source.url}
												</span>
											</div>
											<button
												type="button"
												class="interactable flex size-10 items-center justify-center rounded-full text-error hover:bg-error/10 transition-colors"
												onclick={() => deleteCustomSource(source.id)}
											>
												<Icon type="trashOutline" class="size-5" />
											</button>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<Separator />

				<div data-dialog-footer class="flex items-center justify-end px-6 py-4 bg-surfaceContainerLow">
					<Button kind="flat" onclick={close}>Close</Button>
				</div>
			</div>
		{/if}
	{/snippet}
</Dialog>

<style lang="postcss">
	@reference '../../../app.css';
</style>
