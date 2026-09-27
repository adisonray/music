const ALLOWED_HOSTS = new Set([
  'api.spicyamll.online',
  'is1-ssl.mzstatic.com',
  'is2-ssl.mzstatic.com',
  'is3-ssl.mzstatic.com',
  'is4-ssl.mzstatic.com',
  'is5-ssl.mzstatic.com',
])

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    res.end('Method Not Allowed')
    return
  }

  const source = typeof req.query?.url === 'string' ? req.query.url : ''
  if (!source) {
    res.statusCode = 400
    res.end('Missing artwork URL')
    return
  }

  let artworkUrl
  try {
    artworkUrl = new URL(source)
  } catch {
    res.statusCode = 400
    res.end('Invalid artwork URL')
    return
  }

  if (artworkUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(artworkUrl.hostname)) {
    res.statusCode = 403
    res.end('Artwork host is not allowed')
    return
  }

  try {
    const response = await fetch(artworkUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/jpeg,image/png,*/*',
        'User-Agent': 'Adi-Music-Artwork-Proxy/1.0',
      },
    })

    if (!response.ok || !response.body) {
      res.statusCode = response.status || 502
      res.end('Artwork unavailable')
      return
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      res.statusCode = 415
      res.end('Not an image')
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    const buffer = Buffer.from(await response.arrayBuffer())
    res.end(buffer)
  } catch {
    res.statusCode = 502
    res.end('Artwork fetch failed')
  }
}
