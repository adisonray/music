/** @import { Config } from '@sveltejs/kit' */
import adapter from '@sveltejs/adapter-static'
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), 'PUBLIC_')
const goatCounterUrl = (env.PUBLIC_GOAT_COUNTER_URL ?? 'https://adidotzip.goatcounter.com').replace(/\/+$/, '')

/** @type {Config} */
const config = {
	compilerOptions: {
		runes: true,
		experimental: {
			async: true,
		},
	},

	kit: {
		paths: {
			relative: false,
		},

		outDir: './.generated/svelte-kit',

		adapter: adapter({
			// When changing this, also update env variable
			fallback: '200.html',
		}),

		alias: {
			$paraglide: './.generated/paraglide',
		},

		csp: {
			directives: {
				'default-src': ['self'],

				'script-src': [
					'self',
					'unsafe-inline',
					'https://gc.zgo.at/',
					'https://nurislamaibekuly.github.io',
					'https://static.cloudflareinsights.com',
				],

				'style-src': ['self', 'unsafe-inline', 'https://nurislamaibekuly.github.io'],

				'img-src': [
					'self',
					'blob:',
					'data:',
					goatCounterUrl ? `${goatCounterUrl}/count` : '',
					'https://*.jiosaavncdn.com',
					'https://*.saavncdn.com',
					'https://*.mzstatic.com',
					'https://e-cdns-images.dzcdn.net',
					'https://cdn-images.dzcdn.net',
					'https://www.theaudiodb.com',
					'https://r2.theaudiodb.com',
					'https://artwork.m8tec.top',
					'https://api.spicyamll.online',
					'https:',
				],

				'media-src': [
					'self',
					'blob:',
					'https://*.jiosaavncdn.com',
					'https://*.saavncdn.com',
					'https://mvod.itunes.apple.com',
					'https://*.itunes.apple.com',
					'https://*.mzstatic.com',
					'https://*.apple.com',
					'https://*.applemusic.com',
					'https://mediaservices.cdn-apple.com',
					'https://*.dzcdn.net',
					'https://api.spicyamll.online',
					'https:',
				],

				'font-src': ['self', 'data:'],

				'connect-src': [
					'self',
					'blob:',
					'http://127.0.0.1:6463',
					'http://localhost:6463',
					goatCounterUrl || '',

					'https://api.amll.dev',
					'https://lyrics.imreallyadi.space',
					'https://lyrics-api.boidu.dev',
					'https://lrclib.net',
					'https://unison.boidu.dev',
					'https://api.lrcmux.dev',
					'https://lyrics-api.binimum.org',
					'https://lyricsplus.binimum.org',
					'https://lyricsplus-seven.vercel.app',
					'https://lyricsplus.prjktla.workers.dev',
					'https://lyrics-plus-backend.vercel.app',
					'https://fetch-genius.samidy.workers.dev',
					'https://translate.googleapis.com',

					'https://jiosaavn-apix.arcadopredator.workers.dev',
					'https://*.jiosaavncdn.com',
					'https://*.saavncdn.com',

					'https://artwork.m8tec.top',
					'https://www.theaudiodb.com',

					// Apple Music animated artwork uses HLS. Chromium/hls.js
					// fetches the playlist and media segments through XHR/fetch,
					// so these hosts must be allowed by connect-src.
					'https://itunes.apple.com',
					'https://*.itunes.apple.com',
					'https://mvod.itunes.apple.com',
					'https://*.mzstatic.com',
					'https://music.apple.com',
					'https://*.apple.com',
					'https://*.applemusic.com',
					'https://amp-api.music.apple.com',
					'https://mediaservices.cdn-apple.com',

					'https://api.spicyamll.online',

					'https://api.deezer.com',
					'https://cloudflareinsights.com',
					'https://e-cdns-images.dzcdn.net',
					'https://cdn-images.dzcdn.net',
				],

				'worker-src': ['self', 'blob:'],
				'child-src': ['self', 'blob:'],
				'object-src': ['none'],
				'frame-ancestors': ['none'],
				'form-action': ['none'],
				'manifest-src': ['self'],
				'base-uri': ['none'],
			},
		},

		typescript: {
			config: (tsConfig) => {
				tsConfig.extends = '../../tsconfig.base.json'
				tsConfig.include.push('../paraglide/**/*')
				return tsConfig
			},
		},

		serviceWorker: {
			register: false,
		},

		prerender: {
			handleHttpError: 'warn',
		},
	},
}

export default config
