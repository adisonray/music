import type JSZip from 'jszip'
import { getDatabase } from '$lib/db/database.ts'

export interface BackupData {
	version: number
	timestamp: number
	localStorage: Record<string, string>
	db: {
		tracks: unknown[]
		albums: unknown[]
		artists: unknown[]
		playlists: unknown[]
		playlistEntries: unknown[]
		playHistory: unknown[]
		lyrics: unknown[]
	}
}

const getExtension = (fileName?: string) => {
	if (!fileName) {
		return 'mp3'
	}
	const parts = fileName.split('.')
	return parts.length > 1 ? parts.pop() : 'mp3'
}

export const exportBackupData = async (): Promise<Blob> => {
	const JSZipModule = await import('jszip')
	const JSZipConstructor =
		typeof JSZipModule.default === 'function'
			? JSZipModule.default
			: (JSZipModule as any).default
	const zip = new JSZipConstructor()

	// Gather localStorage items
	const lsData: Record<string, string> = {}
	for (let i = 0; i < localStorage.length; i += 1) {
		const key = localStorage.key(i)
		if (key && (key.startsWith('snaeplayer-') || key === 'snae-locale')) {
			// Skip artwork caches to keep backup small and text-only
			if (key.includes('artwork')) {
				continue
			}
			const val = localStorage.getItem(key)
			if (val !== null) {
				lsData[key] = val
			}
		}
	}

	const db = await getDatabase()
	const stores = [
		'tracks',
		'albums',
		'artists',
		'playlists',
		'playlistEntries',
		'playHistory',
		'lyrics',
	] as const

	const dbData: Record<string, unknown[]> = {}

	for (const storeName of stores) {
		const items = await db.getAll(storeName)
		const processedItems: unknown[] = []

		for (const item of items) {
			if (!item) {
				processedItems.push(item)
				continue
			}
			const cloned = { ...(item as Record<string, any>) }

			if (storeName === 'tracks') {
				const trackUuid = cloned.uuid
				// Try to fetch track audio file and add to zip
				if (cloned.file) {
					try {
						let fileBlob: Blob | null = null
						if (cloned.file instanceof File || cloned.file instanceof Blob) {
							fileBlob = cloned.file
						} else if (typeof cloned.file.getFile === 'function') {
							fileBlob = await cloned.file.getFile()
						}

						if (
							!fileBlob &&
							cloned.directory !== undefined &&
							cloned.directory !== -1
						) {
							const dir = await db.get('directories', cloned.directory)
							if (dir?.handle) {
								const fileHandle = await dir.handle.getFileHandle(
									cloned.fileName || cloned.file.name,
								)
								fileBlob = await fileHandle.getFile()
							}
						}

						if (fileBlob) {
							const ext = getExtension(cloned.fileName || cloned.file.name)
							zip.file(`music/${trackUuid}.${ext}`, fileBlob)
						}
					} catch (e) {
						console.warn(`Failed to export track file for ${cloned.name}`, e)
					}
				}

				// Handle track image
				if (cloned.image) {
					if (cloned.image.full instanceof Blob) {
						zip.file(`images/tracks/${trackUuid}/full`, cloned.image.full)
						cloned.image.full = ''
					}
					if (cloned.image.small instanceof Blob) {
						zip.file(`images/tracks/${trackUuid}/small`, cloned.image.small)
						cloned.image.small = ''
					}
				}
			}

			if (storeName === 'albums') {
				const albumUuid = cloned.uuid
				if (cloned.image instanceof Blob) {
					zip.file(`images/albums/${albumUuid}`, cloned.image)
					delete cloned.image
				}
			}

			processedItems.push(cloned)
		}

		dbData[storeName] = processedItems
	}

	const backupMetadata: BackupData = {
		version: 1,
		timestamp: Date.now(),
		localStorage: lsData,
		db: dbData as unknown as BackupData['db'],
	}

	zip.file('backup.json', JSON.stringify(backupMetadata, null, 2))

	return await zip.generateAsync({ type: 'blob' })
}

export const validateBackupData = (data: unknown): data is BackupData => {
	if (!data || typeof data !== 'object') {
		return false
	}
	const obj = data as Record<string, unknown>
	if (obj.version !== 1) {
		return false
	}
	if (!obj.localStorage || typeof obj.localStorage !== 'object') {
		return false
	}
	if (!obj.db || typeof obj.db !== 'object') {
		return false
	}

	const dbObj = obj.db as Record<string, unknown>
	const requiredStores = [
		'tracks',
		'albums',
		'artists',
		'playlists',
		'playlistEntries',
		'playHistory',
		'lyrics',
	]
	for (const store of requiredStores) {
		if (dbObj[store] !== undefined && !Array.isArray(dbObj[store])) {
			return false
		}
	}

	return true
}

export const importBackupData = async (zip: JSZip, backup: BackupData): Promise<void> => {
	const db = await getDatabase()
	// Clear all stores and write backup data
	const stores = [
		'tracks',
		'albums',
		'artists',
		'playlists',
		'playlistEntries',
		'playHistory',
		'lyrics',
		'directories',
	] as const

	// Prepare data in-memory beforehand to avoid non-IDB awaits inside active transaction
	const preparedDbData: Record<string, any[]> = {}

	for (const storeName of stores) {
		if (storeName === 'directories') {
			continue
		}
		const items = backup.db[storeName] || []
		const preparedItems = []

		for (const item of items) {
			if (!item) {
				continue
			}
			const cloned = { ...(item as Record<string, any>) }

			if (storeName === 'tracks') {
				const trackUuid = cloned.uuid || 'unknown'
				const ext = getExtension(cloned.fileName || cloned.file?.name || 'mp3')
				const musicFileInZip = zip.file(`music/${trackUuid}.${ext}`)
				if (musicFileInZip) {
					try {
						const audioBlob = await musicFileInZip.async('blob')
						const fileObject = new File(
							[audioBlob],
							cloned.fileName || `${trackUuid}.${ext}`,
							{
								type: audioBlob.type || 'audio/mpeg',
							},
						)
						cloned.file = fileObject
						cloned.directory = -1 // LEGACY_NO_NATIVE_DIRECTORY
					} catch (e) {
						console.warn(`Failed to parse music file for track ${trackUuid}`, e)
					}
				}

				// Restore track images
				const fullImgFile = zip.file(`images/tracks/${trackUuid}/full`)
				const smallImgFile = zip.file(`images/tracks/${trackUuid}/small`)
				if (fullImgFile || smallImgFile) {
					if (!cloned.image || typeof cloned.image !== 'object') {
						cloned.image = { optimized: true, small: '', full: '' }
					}
					try {
						if (fullImgFile) {
							cloned.image.full = await fullImgFile.async('blob')
						}
						if (smallImgFile) {
							cloned.image.small = await smallImgFile.async('blob')
						}
					} catch (e) {
						console.warn(`Failed to parse artwork for track ${trackUuid}`, e)
					}
				}
			}

			if (storeName === 'albums') {
				const albumUuid = cloned.uuid || 'unknown'
				const albumImgFile = zip.file(`images/albums/${albumUuid}`)
				if (albumImgFile) {
					try {
						cloned.image = await albumImgFile.async('blob')
					} catch (e) {
						console.warn(`Failed to parse artwork for album ${albumUuid}`, e)
					}
				}
			}

			if (storeName === 'lyrics') {
				const isUploaded = cloned.data?.source === 'uploaded'
				if (!isUploaded && cloned.cachedAt) {
					cloned.cachedAt = Date.now()
				}
			}

			preparedItems.push(cloned)
		}

		preparedDbData[storeName] = preparedItems
	}

	// Now run the IndexedDB transaction with only fast, sequential IDB operations
	const tx = db.transaction(stores, 'readwrite')

	for (const storeName of stores) {
		const store = tx.objectStore(storeName)
		store.clear()
		if (storeName !== 'directories') {
			const items = preparedDbData[storeName] || []
			for (const item of items) {
				store.add(item)
			}
		}
	}

	await tx.done

	// Clear current localStorage keys (snaeplayer- and snae-locale)
	for (let i = localStorage.length - 1; i >= 0; i -= 1) {
		const key = localStorage.key(i)
		if (key && (key.startsWith('snaeplayer-') || key === 'snae-locale')) {
			localStorage.removeItem(key)
		}
	}

	// Restore new localStorage keys
	for (const [key, value] of Object.entries(backup.localStorage)) {
		localStorage.setItem(key, value)
	}
}
