/** @import { Config } from '@sveltejs/kit' */
import adapter from '@sveltejs/adapter-static'
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), 'PUBLIC_')

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
				'default-src': ['none'],

				'script-src': ['self', 'https://gc.zgo.at/'],

				'style-src': ['self', 'unsafe-inline'],

				'img-src': [
					'self',
					'blob:',
					'data:',

					env.PUBLIC_GOAT_COUNTER_URL ? `${env.PUBLIC_GOAT_COUNTER_URL}/count` : '',

					// JioSaavn
					'https://*.jiosaavncdn.com',
					'https://*.saavncdn.com',

					// Apple
					'https://*.mzstatic.com',

					// Deezer
					'https://e-cdns-images.dzcdn.net',
					'https://cdn-images.dzcdn.net',

					// TheAudioDB
					'https://www.theaudiodb.com',
					'https://r2.theaudiodb.com',

					// Artwork proxy
					'https://artwork.m8tec.top',
				],

				'media-src': [
					'self',
					'blob:',

					// JioSaavn
					'https://*.jiosaavncdn.com',
					'https://*.saavncdn.com',

					// Apple
					'https://mvod.itunes.apple.com',
					'https://*.itunes.apple.com',
					'https://*.mzstatic.com',

					// Deezer previews
					'https://cdns-preview-*.dzcdn.net',
				],

				'font-src': ['self'],

				'connect-src': [
					'self',

					env.PUBLIC_GOAT_COUNTER_URL ?? '',

					// Lyrics
					'https://lyrics.imreallyadi.space',
					'https://lyrics-api.boidu.dev',
					'https://lrclib.net',
					'https://unison.boidu.dev',
					'https://api.lrcmux.dev',

					// Binimum / am-lyrics: cache API + LyricsPlus KPOE servers + Genius fallback
					'https://lyrics-api.binimum.org',
					'https://lyricsplus.binimum.org',
					'https://lyricsplus-seven.vercel.app',
					'https://lyricsplus.prjktla.workers.dev',
					'https://lyrics-plus-backend.vercel.app',
					'https://fetch-genius.samidy.workers.dev',

					// Romanization (used by am-lyrics for CJK tracks)
					'https://translate.googleapis.com',

					// JioSaavn API
					'https://jiosaavn-apix.arcadopredator.workers.dev',
					'https://*.jiosaavncdn.com',
					'https://*.saavncdn.com',

					// Artwork proxy
					'https://artwork.m8tec.top',

					// TheAudioDB API
					'https://www.theaudiodb.com',

					// Apple
					'https://itunes.apple.com',
					'https://*.itunes.apple.com',
					'https://mvod.itunes.apple.com',
					'https://*.mzstatic.com',

					// Deezer API
					'https://api.deezer.com',
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
