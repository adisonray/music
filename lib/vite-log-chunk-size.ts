import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** @public */
export const logChunkSizePlugin = (): Plugin => {
	let outDir = 'build'

	return {
		name: 'vite-plugin-log-chunk-size',
		apply: 'build',
		enforce: 'post',

		configResolved(config) {
			outDir = config.build.outDir
		},

		async writeBundle() {
			if (this.environment.name === 'ssr') return

			const immutableDir = path.join(outDir, '_app', 'immutable')

			try {
				const dirSize = async (directory: string) => {
					const jsInfo = { size: 0, count: 0 }
					const totalInfo = { size: 0, count: 0 }

					const processDirectory = async (dir: string) => {
						const files = readdirSync(dir)

						for (const file of files) {
							const filePath = path.join(dir, file)
							const stat = statSync(filePath)

							if (stat.isDirectory()) {
								await processDirectory(filePath)
						} else {
								if (file.endsWith('.js')) {
									jsInfo.size += stat.size
									jsInfo.count += 1
								}
								totalInfo.size += stat.size
								totalInfo.count += 1
							}
						}
					}

					await processDirectory(directory)
					return { jsInfo, totalInfo }
				}

				const { jsInfo, totalInfo } = await dirSize(immutableDir)

				console.info(
					'Size of JS chunks:',
					jsInfo.size / 1024,
					'KB. Files count:',
					jsInfo.count,
				)
				console.info(
					'Size of all files:',
					totalInfo.size / 1024,
					'KB. Files count:',
					totalInfo.count,
				)
			} catch (error) {
				// The output directory can differ between adapters/environments.
				// Chunk-size reporting must never make an otherwise successful build fail.
				console.warn('Could not calculate chunk sizes:', error)
			}
		},
	}
}
