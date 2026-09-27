import { getLibraryValue } from '$lib/library/get/value.ts'
import { dbImportTrack } from '$lib/library/scan-actions/scanner/import-track.ts'
import { LEGACY_NO_NATIVE_DIRECTORY, UNKNOWN_ITEM, type UnknownTrack } from '$lib/library/types.ts'
import { spicyamll } from '$lib/services/spicyamll.ts'
import { getDatabase } from '$lib/db/database.ts'

const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024
const pendingDownloads = new Map<string, Promise<number>>()
const downloadControllers = new Map<string, AbortController>()
const LOCAL_ALIAS_PREFIX = 'adi_music_local_track_alias:'

const getCachedLocalTrackId = (sourceId: number | string): number | undefined => {
	if (typeof window === 'undefined') return undefined
	const key = String(sourceId)
	try {
		const id = Number(localStorage.getItem(LOCAL_ALIAS_PREFIX + key) || '')
		return Number.isFinite(id) && id > 0 ? id : undefined
	} catch {
		return undefined
	}
}

const setCachedLocalTrackId = (sourceId: number | string, localTrackId: number) => {
	if (typeof window === 'undefined') return
	try {
		localStorage.setItem(LOCAL_ALIAS_PREFIX + String(sourceId), String(localTrackId))
	} catch {}
}

const isNumericId = (value: number | string) => {
	const normalized = String(value).trim()
	return normalized !== '' && Number.isFinite(Number(normalized))
}

/** Return the IndexedDB track id backing a remote/stable discovery id, when one exists. */
export const getStoredLocalTrackId = async (sourceId: number | string): Promise<number | undefined> => {
	const cachedId = getCachedLocalTrackId(sourceId)
	if (cachedId) {
		const cachedTrack = await getLibraryValue('tracks', cachedId, true)
		if (cachedTrack?.file) return cachedId
	}

	const remoteTrack = isNumericId(sourceId)
		? await getLibraryValue('tracks', Number(sourceId), true)
		: undefined

	if (remoteTrack?.file) return remoteTrack.id

	const database = await getDatabase()
	const remoteUuid = remoteTrack?.uuid ?? `spicyamll:${String(sourceId)}`
	const existing = await database.getFromIndex('tracks', 'uuid', remoteUuid)

	if (existing?.file) {
		setCachedLocalTrackId(sourceId, existing.id)
		return existing.id
	}

	return undefined
}

const sanitizeFilename = (value: string) =>
	value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown'

const getAudioExtension = (blob: Blob): string => {
	const type = blob.type.toLowerCase()

	if (type.includes('mpeg')) return 'mp3'
	if (type.includes('ogg')) return 'ogg'
	if (type.includes('flac')) return 'flac'
	if (type.includes('wav')) return 'wav'
	if (type.includes('aac')) return 'aac'

	return 'm4a'
}

type LibraryTrack = Awaited<ReturnType<typeof getLibraryValue<'tracks', true>>>

const getDownloadUrls = (track: LibraryTrack): string[] => {
	if (!track) return []

	const urls: string[] = []

	// Always prefer the dedicated download endpoint for remote songs. The
	// playback URL is a streaming source and should never be the primary
	// source for an offline-library import.
	if (track.remoteId !== undefined && track.remoteId !== null && String(track.remoteId).trim() !== '' && String(track.remoteId) !== '0') {
		urls.push(
			spicyamll.downloadUrl(track.remoteId, {
				codec: 'aac',
				language: 'en-US',
			}),
		)
		// Keep the official SpicyAMLL stream URL as a fallback source for
		// offline import. Downloading the response into IndexedDB is still
		// what makes the track offline; this does not start the player.
		urls.push(
			spicyamll.streamUrl(track.remoteId, {
				codec: 'aac',
				fallback: true,
				language: 'en-US',
			}),
		)
	}

	if (track.url?.startsWith('http') && !track.url.includes('/stream?')) {
		urls.push(track.url)
	}

	return [...new Set(urls)]
}

const downloadAndImport = async (
	trackId: number,
	onProgress?: (progress: number) => void,
	signal?: AbortSignal,
): Promise<number> => {
	const track = await getLibraryValue('tracks', trackId, true)
	if (!track) {
		throw new Error('Track is no longer available. Open the song once and try Download again.')
	}

	if (track.file instanceof File) return track.id
	if (trackId >= 0 && track.file) return track.id

	const database = await getDatabase()
	const existing = await database.getFromIndex('tracks', 'uuid', track.uuid)
	if (existing?.file) {
		if (trackId < 0) setCachedLocalTrackId(trackId, existing.id)
		return existing.id
	}

	const urls = getDownloadUrls(track)
	if (!urls.length) {
		throw new Error(`No downloadable source is available for "${track.name}".`)
	}

	let response: Response | undefined
	let lastError: unknown

	for (const url of urls) {
		try {
			const candidate = await fetch(url, {
				method: 'GET',
				mode: 'cors',
				credentials: 'omit',
				cache: 'no-store',
				signal,
				headers: { Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5' },
			})

			const contentType = candidate.headers.get('content-type')?.toLowerCase() ?? ''
			if (
				candidate.ok &&
				!contentType.includes('application/json') &&
				!contentType.includes('text/html')
			) {
				response = candidate
				break
			}

			let detail = ''
			try {
				detail = (await candidate.text()).slice(0, 160)
			} catch {}
			lastError = new Error(
				`Download failed (${candidate.status})${detail ? `: ${detail}` : '.'}`,
			)
		} catch (error) {
			if (signal?.aborted) throw error
			lastError = error
		}
	}

	if (!response) {
		throw new Error(
			`Unable to fetch the audio for "${track.name}". Check your connection or whether this song is available offline.`,
			{ cause: lastError },
		)
	}

	const contentLength = Number(response.headers.get('content-length') || 0)
	if (contentLength > MAX_DOWNLOAD_BYTES) {
		throw new Error('The track is too large to store locally.')
	}

	// Read the response ourselves so the UI can show real download progress.
	// Do not use an <a download> or media element here: this is an IndexedDB
	// import and must never start playback.
	const total = Number(response.headers.get('content-length') || 0)
	if (total > MAX_DOWNLOAD_BYTES) {
		throw new Error('The track is too large to store locally.')
	}

	let blob: Blob
	if (response.body) {
		const reader = response.body.getReader()
		const chunks: Uint8Array[] = []
		let received = 0

		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			if (value) {
				chunks.push(value)
				received += value.byteLength
				if (received > MAX_DOWNLOAD_BYTES) {
					await reader.cancel()
					throw new Error('The track is too large to store locally.')
				}
				if (total > 0) onProgress?.(Math.min(99, Math.round((received / total) * 100)))
			}
		}
		onProgress?.(100)
		blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mp4' })
	} else {
		blob = await response.blob()
		onProgress?.(100)
	}

	if (blob.size === 0) {
		throw new Error('The downloaded track was empty.')
	}
	if (blob.size > MAX_DOWNLOAD_BYTES) {
		throw new Error('The track is too large to store locally.')
	}

	const extension = getAudioExtension(blob)
	const filename = `${sanitizeFilename(track.artists?.join(', ') || 'Unknown Artist')} - ${sanitizeFilename(track.name)}.${extension}`
	const file = new File([blob], filename, {
		type: blob.type || 'audio/mp4',
		lastModified: Date.now(),
	})

	let parsedData: UnknownTrack

	try {
		const { parseTrackMetadata } = await import('$lib/library/scan-actions/scanner/parse/parse-track.ts')
		const parsed = await parseTrackMetadata(file)

		if (!parsed) throw new Error('Metadata parser returned no track.')

		parsedData = {
			...parsed.data,
			name: parsed.data.name || track.name,
			album: parsed.data.album || track.album || UNKNOWN_ITEM,
			artists: parsed.data.artists?.length ? parsed.data.artists : track.artists?.length ? track.artists : ['Unknown Artist'],
			year: parsed.data.year || track.year || UNKNOWN_ITEM,
			duration: parsed.data.duration || track.duration || 0,
			genre: parsed.data.genre?.length ? parsed.data.genre : track.genre || [],
			trackNo: parsed.data.trackNo || track.trackNo || 0,
			trackOf: parsed.data.trackOf || track.trackOf || 0,
			discNo: parsed.data.discNo || track.discNo || 0,
			discOf: parsed.data.discOf || track.discOf || 0,
			language: parsed.data.language || track.language,
			image: parsed.data.image ?? track.image,
			primaryColor: parsed.data.primaryColor ?? track.primaryColor,
			file,
			directory: LEGACY_NO_NATIVE_DIRECTORY,
			fileName: file.name,
			scannedAt: Date.now(),
			uuid: track.uuid,
			remoteId: track.remoteId,
			streaming: false,
			url: undefined,
		}
	} catch {
		parsedData = {
			name: track.name,
			album: track.album || UNKNOWN_ITEM,
			artists: track.artists?.length ? track.artists : ['Unknown Artist'],
			year: track.year || UNKNOWN_ITEM,
			duration: track.duration || 0,
			genre: track.genre || [],
			trackNo: track.trackNo || 0,
			trackOf: track.trackOf || 0,
			discNo: track.discNo || 0,
			discOf: track.discOf || 0,
			language: track.language,
			image: track.image,
			primaryColor: track.primaryColor,
			file,
			directory: LEGACY_NO_NATIVE_DIRECTORY,
			fileName: file.name,
			scannedAt: Date.now(),
			uuid: track.uuid,
			remoteId: track.remoteId,
			streaming: false,
			url: undefined,
		}
	}

	const localTrackId = await dbImportTrack(parsedData, trackId >= 0 ? trackId : undefined)

	if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('adi-music-library-updated'))
	if (trackId < 0) setCachedLocalTrackId(trackId, localTrackId)
	return localTrackId
}

export const isDownloadAbortError = (error: unknown): boolean =>
	error instanceof Error && error.name === 'AbortError'

export const cancelTrackDownload = (trackId: number): boolean => {
	const key = String(trackId)
	const controller = downloadControllers.get(key)
	if (!controller) return false

	controller.abort()
	downloadControllers.delete(key)
	pendingDownloads.delete(key)
	return true
}

export const ensureTrackIsStoredLocally = async (
	trackId: number,
	onProgress?: (progress: number) => void,
): Promise<number> => {
	const cachedLocalTrackId = getCachedLocalTrackId(trackId)
	if (cachedLocalTrackId) {
		const cachedTrack = await getLibraryValue('tracks', cachedLocalTrackId, true)
		if (cachedTrack?.file) return cachedLocalTrackId
	}

	const existingRequest = pendingDownloads.get(String(trackId))
	if (existingRequest) return existingRequest

	const key = String(trackId)
	const controller = new AbortController()
	const request = downloadAndImport(trackId, onProgress, controller.signal).finally(() => {
		if (downloadControllers.get(key) === controller) {
			pendingDownloads.delete(key)
			downloadControllers.delete(key)
		}
	})

	downloadControllers.set(key, controller)
	pendingDownloads.set(key, request)
	return request
}
