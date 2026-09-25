import { argbFromRgb } from '@material/material-color-utilities'
import { isSafari } from '$lib/helpers/utils/ua'

const getArtworkArgb = async (src: string): Promise<number | null> => {
	if (typeof window === 'undefined') return null

	return new Promise((resolve) => {
		const image = new Image()
		image.crossOrigin = 'anonymous'
		image.onload = () => {
			try {
				const size = 32
				const canvas = document.createElement('canvas')
				canvas.width = size
				canvas.height = size
				const context = canvas.getContext('2d', { willReadFrequently: true })
				if (!context) return resolve(null)

				context.drawImage(image, 0, 0, size, size)
				const data = context.getImageData(0, 0, size, size).data
				let red = 0
				let green = 0
				let blue = 0
				let weight = 0

				for (let i = 0; i < data.length; i += 4) {
					const alpha = data[i + 3] / 255
					if (alpha < 0.2) continue
					const saturation =
						Math.max(data[i], data[i + 1], data[i + 2]) -
						Math.min(data[i], data[i + 1], data[i + 2])
					const pixelWeight = alpha * (0.35 + saturation / 255)
					red += data[i] * pixelWeight
					green += data[i + 1] * pixelWeight
					blue += data[i + 2] * pixelWeight
					weight += pixelWeight
				}

				if (!weight) return resolve(null)
				resolve(
					argbFromRgb(
						Math.round(red / weight),
						Math.round(green / weight),
						Math.round(blue / weight),
					),
				)
			} catch {
				resolve(null)
			}
		}
		image.onerror = () => resolve(null)
		image.src = /^https:\/\//i.test(src)
			? `/api/artwork?url=${encodeURIComponent(src)}`
			: src
	})
}

const updateThemeMetaElement = (element: Element) => {
	const surfaceColor = window.getComputedStyle(document.documentElement).backgroundColor
	element.setAttribute('content', surfaceColor)
}

const updateWindowTileBarColor = (isDark: boolean) => {
	if (isSafari()) {
		const metaTags = document.querySelectorAll('meta[name="theme-color"]')
		for (const element of metaTags) updateThemeMetaElement(element)
		return
	}

	const element = document.querySelector(
		`meta[name="theme-color"][media="(prefers-color-scheme: ${isDark ? 'dark' : 'light'})"]`,
	)
	if (element) updateThemeMetaElement(element)
}

export const setupTheme = (): void => {
	const player = usePlayer()
	const mainStore = useMainStore()

	$effect.pre(() => {
		document.documentElement.classList.toggle('dark', mainStore.isThemeDark)
	})

	let initial = true
	let artworkColorRequest = 0

	$effect.pre(() => {
		const isDark = mainStore.isThemeDark
		const configuredArtworkArgb = mainStore.pickColorFromArtwork
			? player.activeTrack?.primaryColor
			: undefined
		const artworkSrc = mainStore.pickColorFromArtwork ? player.artworkSrc : undefined
		const requestId = ++artworkColorRequest

		if (configuredArtworkArgb) {
			void import('$lib/theme.ts').then(({ updateThemeCssVariables }) => {
				updateThemeCssVariables(configuredArtworkArgb, isDark)
				updateWindowTileBarColor(isDark)
			})
			initial = false
			return
		}

		if (artworkSrc) {
			void getArtworkArgb(artworkSrc).then((artworkArgb) => {
				if (requestId !== artworkColorRequest) return
				const argbOrHex = artworkArgb ?? mainStore.customThemePaletteHex
				void import('$lib/theme.ts').then(({ updateThemeCssVariables }) => {
					updateThemeCssVariables(argbOrHex, isDark)
					updateWindowTileBarColor(isDark)
				})
			})
			initial = false
			return
		}

		const argbOrHex = mainStore.customThemePaletteHex
		if (initial) {
			initial = false
			if (isSafari()) updateWindowTileBarColor(isDark)
			if (!argbOrHex) return
		}
		void import('$lib/theme.ts').then(({ updateThemeCssVariables }) => {
			updateThemeCssVariables(argbOrHex, isDark)
			updateWindowTileBarColor(isDark)
		})
	})
}
