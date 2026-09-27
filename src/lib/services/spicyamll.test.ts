import { describe, expect, it } from 'vitest'
import { normalizeTracks, spicyamll } from './spicyamll.ts'

describe('SpicyAMLL normalization', () => {
	it('normalizes common song fields', () => {
		const tracks = normalizeTracks({ data: [{ songId: 1687014447, songName: 'Test', artistName: 'Artist' }] })
		expect(tracks[0]).toMatchObject({
			id: 1687014447,
			name: 'Test',
			artists: ['Artist'],
		})
	})
})

	it('builds the required native stream URL without changing its parameters', () => {
		expect(spicyamll.streamUrl(1640353346)).toBe(
			'https://api.spicyamll.online/stream?song=1640353346&codec=aac&fallback=true&l=en-US&websupport=true',
		)
	})
