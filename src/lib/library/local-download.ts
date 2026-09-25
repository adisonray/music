import { getLibraryValue } from '$lib/library/get/value.ts'
import { dbImportTrack } from '$lib/library/scan-actions/scanner/import-track.ts'
import { LEGACY_NO_NATIVE_DIRECTORY, UNKNOWN_ITEM, type UnknownTrack } from '$lib/library/types.ts'
import { spicyamll } from '$lib/services/spicyamll.ts'
import { getDatabase } from '$lib/db/database.ts'

const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024
const pendingDownloads = new Map<string, Promise<number>>()
const LOCAL_ALIAS_PREFIX = 'adi_music_local_track_alias:'

const getCachedLocalTrackId = (sourceId: number): number | undefined => {
	if (typeof window === 'undefined' || sourceId >= 0) return undefined
	try {
		const id = Number(localStorage.getItem(LOCAL_ALIAS_PREFIX + sourceId) || '')
		return Number.isFinite(id) && id > 0 ? id : undefined
	} catch {
		return undefined
	}
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

const getDownloadUrl = (track: LibraryTrack) => {
	if (!track) return undefined
	if (track.url?.startsWith('http')) return track.url

	if (track.remoteId !== undefined && track.remoteId > 0) {
		return spicyamll.downloadUrl(track.remoteId, {
			codec: 'aac',
			language: 'en-US',
		})
	}

	return undefined
}

const downloadAndImport = async (trackId: number): Promise<number> => {
	const track = await getLibraryValue('tracks', trackId, true)
	if (!track) {
		throw new Error('Track is no longer available.')
	}

	if (track.file instanceof File) return track.id
	if (trackId >= 0 && track.file) return track.id

	const database = await getDatabase()
	const existing = await database.getFromIndex('tracks', 'uuid', track.uuid)
	if (existing?.file) {
		if (trackId < 0) {
			try {
				localStorage.setItem(LOCAL_ALIAS_PREFIX + trackId, String(existing.id))
			} catch {}
		}
		return existing.id
	}

	const url = getDownloadUrl(track)
	if (!url) {
		throw new Error(`No downloadable source is available for "${track.name}".`)
	}

	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Download failed (${response.status}).`)
	}

	const contentLength = Number(response.headers.get('content-length') || 0)
	if (contentLength > MAX_DOWNLOAD_BYTES) {
		throw new Error('The track is too large to store locally.')
	}

	const blob = await response.blob()
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

	if (trackId < 0) {
		try {
			localStorage.setItem(LOCAL_ALIAS_PREFIX + trackId, String(localTrackId))
		} catch {}
	}
	return localTrackId
}

export const ensureTrackIsStoredLocally = async (trackId: number): Promise<number> => {
	const cachedLocalTrackId = getCachedLocalTrackId(trackId)
	if (cachedLocalTrackId) {
		const cachedTrack = await getLibraryValue('tracks', cachedLocalTrackId, true)
		if (cachedTrack?.file) return cachedLocalTrackId
	}

	const existingRequest = pendingDownloads.get(String(trackId))
	if (existingRequest) return existingRequest

	const request = downloadAndImport(trackId).finally(() => {
		pendingDownloads.delete(String(trackId))
	})

	pendingDownloads.set(String(trackId), request)
	return request
}
