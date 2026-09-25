
const ARTIST_FAVORITES_KEY = 'adi_music_favorite_artists'
const SONG_FAVORITES_KEY = 'adi_music_favorite_songs'

export type OnlineArtist = {
	id: string
	name: string
	artUrl: string
	genre: string
	bio: string
}


export function getFavoriteSongIds(): string[] {
	if (typeof localStorage === 'undefined') return []
	try {
		const value = JSON.parse(localStorage.getItem(SONG_FAVORITES_KEY) || '[]')
		return Array.isArray(value) ? value.map(String) : []
	} catch {
		return []
	}
}

export function isFavoriteSong(id: string | number) {
	return getFavoriteSongIds().includes(String(id))
}

export function toggleFavoriteSong(id: string | number) {
	if (typeof localStorage === 'undefined') return false
	const key = String(id)
	const ids = getFavoriteSongIds()
	const next = ids.includes(key) ? ids.filter((item) => item !== key) : [key, ...ids]
	localStorage.setItem(SONG_FAVORITES_KEY, JSON.stringify(next))
	window.dispatchEvent(new CustomEvent('adi-music-favorite-songs-changed', { detail: { id: key, favorite: !ids.includes(key) } }))
	return !ids.includes(key)
}

export function getFavoriteArtistIds(): string[] {
	if (typeof localStorage === 'undefined') return []
	try {
		const value = JSON.parse(localStorage.getItem(ARTIST_FAVORITES_KEY) || '[]')
		return Array.isArray(value) ? value.map(String) : []
	} catch {
		return []
	}
}

export function isFavoriteArtist(id: string | number) {
	return getFavoriteArtistIds().includes(String(id))
}

export function toggleFavoriteArtist(id: string | number) {
	if (typeof localStorage === 'undefined') return false
	const key = String(id)
	const ids = getFavoriteArtistIds()
	const next = ids.includes(key) ? ids.filter((item) => item !== key) : [key, ...ids]
	localStorage.setItem(ARTIST_FAVORITES_KEY, JSON.stringify(next))
	window.dispatchEvent(new CustomEvent('adi-music-favorite-artists-changed'))
	return !ids.includes(key)
}

export const artistFromSearch = (item: Record<string, unknown>): OnlineArtist => {
	const attributes = item.attributes && typeof item.attributes === 'object'
		? item.attributes as Record<string, unknown>
		: item
	const artwork = attributes.artwork && typeof attributes.artwork === 'object'
		? attributes.artwork as Record<string, unknown>
		: {}
	return {
		id: String(attributes.id ?? item.id ?? ''),
		name: String(attributes.name ?? item.name ?? 'Artist'),
		artUrl: String(artwork.url ?? item.artUrl ?? item.image ?? 'favicon.svg')
			.replace('{w}', '1200').replace('{h}', '1200').replace('{f}', 'jpg'),
		genre: String(attributes.genreNames && Array.isArray(attributes.genreNames) ? attributes.genreNames[0] : attributes.genre ?? 'Music'),
		bio: String(attributes.editorialNotes && typeof attributes.editorialNotes === 'object'
			? (attributes.editorialNotes as Record<string, unknown>).short ?? ''
			: ''),
	}
}
