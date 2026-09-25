import type { RequestHandler } from './$types'

const ALLOWED_HOSTS = [
	'api.spicyamll.online',
	'is1-ssl.mzstatic.com',
	'is2-ssl.mzstatic.com',
	'is3-ssl.mzstatic.com',
	'is4-ssl.mzstatic.com',
	'is5-ssl.mzstatic.com',
]

export const GET: RequestHandler = async ({ url, fetch }) => {
	const source = url.searchParams.get('url')
	if (!source) return new Response('Missing artwork URL', { status: 400 })

	let artworkUrl: URL
	try {
		artworkUrl = new URL(source)
	} catch {
		return new Response('Invalid artwork URL', { status: 400 })
	}

	if (artworkUrl.protocol !== 'https:' || !ALLOWED_HOSTS.includes(artworkUrl.hostname)) {
		return new Response('Artwork host is not allowed', { status: 403 })
	}

	try {
		const response = await fetch(artworkUrl, {
			headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,*/*' },
		})
		if (!response.ok) return new Response('Artwork unavailable', { status: response.status })

		const contentType = response.headers.get('content-type') ?? 'image/jpeg'
		if (!contentType.startsWith('image/')) {
			return new Response('Not an image', { status: 415 })
		}

		return new Response(response.body, {
			headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
			'Access-Control-Allow-Origin': '*',
			'X-Content-Type-Options': 'nosniff',
		},
		})
	} catch {
		return new Response('Artwork fetch failed', { status: 502 })
	}
}
