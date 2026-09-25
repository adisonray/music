import { describe, expect, it } from 'vitest'
import { normalizeTracks } from './spicyamll.ts'

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
