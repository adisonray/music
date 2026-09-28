const UPSTREAM = 'https://artwork.m8tec.top/api/v1/artwork/search'

export default async function handler(req, res) {
	if (req.method !== 'GET') {
		res.statusCode = 405
		res.setHeader('Allow', 'GET')
		res.end('Method Not Allowed')
		return
	}

	const artist = typeof req.query?.artist === 'string' ? req.query.artist.trim() : ''
	const album = typeof req.query?.album === 'string' ? req.query.album.trim() : ''
	const title = typeof req.query?.title === 'string' ? req.query.title.trim() : ''

	if (!artist || !album) {
		res.statusCode = 400
		res.end('Missing artist or album')
		return
	}

	const params = new URLSearchParams({ artist, album })
	if (title) params.set('title', title)

	try {
		const response = await fetch(UPSTREAM + '?' + params.toString(), {
			headers: {
				Accept: 'application/json',
				'User-Agent': 'Adi-Music-Animated-Artwork/1.0',
			},
		})

		if (response.status === 404) {
			res.statusCode = 204
			res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800')
			res.end()
			return
		}

		if (!response.ok) {
			res.statusCode = 502
			res.end('Animated artwork provider unavailable')
			return
		}

		const contentType = response.headers.get('content-type') || ''
		if (!contentType.includes('application/json')) {
			res.statusCode = 502
			res.end('Invalid animated artwork response')
			return
		}

		const body = await response.text()
		res.statusCode = 200
		res.setHeader('Content-Type', 'application/json; charset=utf-8')
		res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400')
		res.setHeader('X-Content-Type-Options', 'nosniff')
		res.end(body)
	} catch {
		res.statusCode = 502
		res.end('Animated artwork fetch failed')
	}
}
