import { getDatabase } from '$lib/db/database.ts'
import { dispatchDatabaseChangedEvent } from '$lib/db/events.ts'
import { UNKNOWN_ITEM, type Track } from '$lib/library/types.ts'
import { getArtworkRelatedData } from '$lib/library/scan-actions/scanner/parse/format-artwork.ts'
import { searchSongs } from '$lib/services/jiosaavn.ts'
import { LyricsService } from '$lib/lyrics/LyricsService.ts'

export interface AutoMetadataResult {
	title: string
	artist: string
	album: string
	albumArtist?: string
	genre?: string
	year?: string
	trackNo?: number
	trackOf?: number
	discNo?: number
	discOf?: number
	artworkUrl?: string
	source: 'itunes' | 'jiosaavn'
}

export const cleanQueryString = (raw: string): string => {
	let str = raw.replace(/\.(mp3|flac|m4a|wav|ogg|aac|alac|aiff|wma|opus)$/i, '')
	// Replace underscores
	str = str.replace(/_/g, ' ')
	// Remove common file noise tags like [320kbps], (Official Video), etc.
	str = str.replace(/\[.*?\]|\(.*?video.*?\)/gi, '')
	return str.trim()
}

export const fetchAutoMetadata = async (
	query: string,
	artistHint?: string,
): Promise<AutoMetadataResult[]> => {
	const cleaned = cleanQueryString(query)
	if (!cleaned) return []

	const searchTerm = artistHint && artistHint !== UNKNOWN_ITEM ? `${cleaned} ${artistHint}` : cleaned
	const results: AutoMetadataResult[] = []

	// 1. Fetch from iTunes API
	try {
		const itunesRes = await fetch(
			`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=5`,
		)
		if (itunesRes.ok) {
			const data = await itunesRes.json()
			if (data.results && Array.isArray(data.results)) {
				for (const item of data.results) {
					const artworkUrl = item.artworkUrl100
						? item.artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg')
						: undefined

					const year = item.releaseDate ? new Date(item.releaseDate).getFullYear().toString() : undefined

					results.push({
						title: item.trackName || '',
						artist: item.artistName || '',
						album: item.collectionName || '',
						albumArtist: item.artistName || undefined,
						genre: item.primaryGenreName || undefined,
						year,
						trackNo: item.trackNumber || 0,
						trackOf: item.trackCount || 0,
						discNo: item.discNumber || 0,
						discOf: item.discCount || 0,
						artworkUrl,
						source: 'itunes',
					})
				}
			}
		}
	} catch (e) {
		console.error('iTunes auto metadata fetch error:', e)
	}

	// 2. Fetch from JioSaavn API as complementary source
	try {
		const saavnSongs = await searchSongs(searchTerm)
		for (const song of saavnSongs) {
			const artwork = typeof song.image?.full === 'string' ? song.image.full : (typeof song.image?.small === 'string' ? song.image.small : undefined)
			results.push({
				title: song.name,
				artist: song.artists.join(', '),
				album: song.album,
				albumArtist: song.artists[0],
				year: song.year,
				artworkUrl: artwork,
				source: 'jiosaavn',
			})
		}
	} catch (e) {
		console.error('JioSaavn auto metadata fetch error:', e)
	}

	return results
}

export const downloadArtworkBlob = async (url: string): Promise<Blob | null> => {
	try {
		const response = await fetch(url)
		if (response.ok) {
			return await response.blob()
		}
	} catch (e) {
		console.error('Download artwork blob error:', e)
	}
	return null
}

export const autoApplyTrackMetadata = async (
	trackId: number,
): Promise<{ success: boolean; trackName?: string }> => {
	try {
		const db = await getDatabase()
		const tx = db.transaction(['tracks', 'albums', 'artists'], 'readwrite')
		const trackStore = tx.objectStore('tracks')
		const track: Track | undefined = await trackStore.get(trackId)

		if (!track) {
			return { success: false }
		}

		const artistHint = track.artists && track.artists[0] !== UNKNOWN_ITEM ? track.artists[0] : undefined
		const candidates = await fetchAutoMetadata(track.name || track.fileName || '', artistHint)

		if (candidates.length === 0 || !candidates[0]) {
			return { success: false }
		}

		const best = candidates[0]
		const artistsArray = best.artist.split(',').map((s) => s.trim()).filter(Boolean)
		const genreArray = best.genre ? [best.genre] : track.genre || []

		let artworkData: any = undefined
		if (best.artworkUrl) {
			const blob = await downloadArtworkBlob(best.artworkUrl)
			if (blob) {
				artworkData = await getArtworkRelatedData(blob)
			}
		}

		const updatedTrack: Track & { albumArtist?: string } = {
			...track,
			name: best.title || track.name,
			artists: artistsArray.length > 0 ? artistsArray : [UNKNOWN_ITEM],
			album: best.album || UNKNOWN_ITEM,
			albumArtist: best.albumArtist || (track as any).albumArtist,
			genre: genreArray,
			year: best.year || track.year || UNKNOWN_ITEM,
			trackNo: best.trackNo ?? track.trackNo,
			trackOf: best.trackOf ?? track.trackOf,
			discNo: best.discNo ?? track.discNo,
			discOf: best.discOf ?? track.discOf,
			image: artworkData?.image ?? track.image,
			primaryColor: artworkData?.primaryColor ?? track.primaryColor,
		}

		await trackStore.put(updatedTrack as any)

		// Ensure album exists and is updated
		const albumsStore = tx.objectStore('albums')
		const existingAlbum = await albumsStore.index('name').get(updatedTrack.album)
		let albumChange: any = null
		if (updatedTrack.album !== UNKNOWN_ITEM) {
			const updatedAlbum = existingAlbum
				? {
						...existingAlbum,
						artists: [...new Set([...existingAlbum.artists, ...updatedTrack.artists])].filter(
							(artist) => artist !== UNKNOWN_ITEM,
						),
						year: existingAlbum.year || updatedTrack.year,
						image: existingAlbum.image || updatedTrack.image?.full,
					}
				: {
						uuid: crypto.randomUUID(),
						name: updatedTrack.album,
						artists: updatedTrack.artists,
						year: updatedTrack.year,
						image: updatedTrack.image?.full,
					}
			const albumId = await albumsStore.put(updatedAlbum as any)
			albumChange = {
				storeName: 'albums',
				key: albumId,
				operation: existingAlbum ? 'update' : 'add',
			}
		}

		// Ensure artists exist
		const artistsStore = tx.objectStore('artists')
		const artistsChanges = []
		for (const artistName of updatedTrack.artists) {
			if (artistName === UNKNOWN_ITEM) continue
			const existingArtist = await artistsStore.index('name').get(artistName)
			if (!existingArtist) {
				const newArtist = {
					name: artistName,
					uuid: crypto.randomUUID(),
				}
				const artistId = await artistsStore.put(newArtist as any)
				artistsChanges.push({
					storeName: 'artists',
					key: artistId,
					operation: 'add',
				})
			}
		}

		await tx.done

		// Automatically fetch lyrics for the updated track
		try {
			const localDb = await getDatabase()
			await localDb.delete('lyrics', trackId)
			await LyricsService.fetchLyrics(updatedTrack as any)
			window.dispatchEvent(new CustomEvent('lyrics-reload'))
		} catch (e) {
			console.error('Error auto-fetching lyrics:', e)
		}

		dispatchDatabaseChangedEvent(
			[
				{
					storeName: 'tracks',
					key: track.id,
					operation: 'update',
				},
				albumChange,
				...artistsChanges,
			].filter(Boolean) as any,
		)

		return { success: true, trackName: updatedTrack.name }
	} catch (error) {
		console.error('Failed to auto apply track metadata:', error)
		return { success: false }
	}
}
