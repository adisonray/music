const artworkCompressionCache = new WeakMap<Blob, Promise<Blob>>()

const MAX_ARTWORK_SIZE = 512
const WEBP_QUALITY = 0.78

export const compressArtwork = (source: Blob): Promise<Blob> => {
	const cached = artworkCompressionCache.get(source)
	if (cached) return cached

	const promise = new Promise<Blob>((resolve) => {
		if (typeof window === 'undefined' || !source.type.startsWith('image/')) {
			resolve(source)
			return
		}

		const finish = (blob: Blob | null) => {
			if (!blob || blob.size >= source.size) {
				resolve(source)
				return
			}
			resolve(blob)
		}

		const image = new Image()
		image.decoding = 'async'
		image.onload = () => {
			const scale = Math.min(1, MAX_ARTWORK_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
			const width = Math.max(1, Math.round(image.naturalWidth * scale))
			const height = Math.max(1, Math.round(image.naturalHeight * scale))
			const canvas = document.createElement('canvas')
			canvas.width = width
			canvas.height = height
			const context = canvas.getContext('2d')
			if (!context) {
				URL.revokeObjectURL(image.src)
				resolve(source)
				return
			}
			context.drawImage(image, 0, 0, width, height)
			canvas.toBlob((blob) => {
				URL.revokeObjectURL(image.src)
				finish(blob)
			}, 'image/webp', WEBP_QUALITY)
		}
		image.onerror = () => {
			URL.revokeObjectURL(image.src)
			resolve(source)
		}
		image.src = URL.createObjectURL(source)
	})

	artworkCompressionCache.set(source, promise)
	return promise
}
