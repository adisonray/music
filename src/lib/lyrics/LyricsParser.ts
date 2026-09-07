function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function formatTTMLTime(ms: number): string {
    const safeMs = Math.max(0, Math.floor(ms))
    const totalSeconds = Math.floor(safeMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const msec = safeMs % 1000

    const mStr = String(minutes).padStart(2, '0')
    const sStr = String(seconds).padStart(2, '0')
    const msStr = String(msec).padStart(3, '0')
    return `${mStr}:${sStr}.${msStr}`
}

function parseCentiseconds(str?: string): number {
    if (!str) return 0
    if (str.length === 3) return parseInt(str, 10)
    if (str.length === 2) return parseInt(str, 10) * 10
    if (str.length === 1) return parseInt(str, 10) * 100
    return 0
}

export class LyricsParser {
    static toTTML(rawLyrics: string, durationMs: number, language = 'en'): string {
        const trimmed = rawLyrics.trim()
        if (!trimmed) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyrics">
  <body>
    <div></div>
  </body>
</tt>`
        }

        if (trimmed.startsWith('<tt') || trimmed.startsWith('<?xml') || trimmed.includes('xmlns="http://www.w3.org/ns/ttml"')) {
            return LyricsParser.filterTranslations(trimmed, language)
        }

        const lines = trimmed.split(/\r?\n/)
        const parsedLines: Array<{
            startMs: number
            endMs?: number
            text: string
            spans?: Array<{ startMs: number; endMs: number; text: string }>
        }> = []

        for (const line of lines) {
            const l = line.trim()
            if (!l) continue

            // Check QRC / LRC Mux format: [startMs,durMs]word(start,dur)...
            const qrcMatch = l.match(/^\[(\d+),(\d+)\](.*)$/)
            if (qrcMatch) {
                const lineStartMs = parseInt(qrcMatch[1]!, 10)
                const lineDurMs = parseInt(qrcMatch[2]!, 10)
                const lineEndMs = lineStartMs + lineDurMs
                const rest = qrcMatch[3] ?? ''

                const spans: Array<{ startMs: number; endMs: number; text: string }> = []
                const wordRegex = /([^(]+)\((\d+),(\d+)\)/g
                let match: RegExpExecArray | null
                let fullText = ''

                while ((match = wordRegex.exec(rest)) !== null) {
                    const wText = match[1]!
                    const wStart = parseInt(match[2]!, 10)
                    const wDur = parseInt(match[3]!, 10)
                    spans.push({
                        startMs: wStart,
                        endMs: wStart + wDur,
                        text: wText,
                    })
                    fullText += wText
                }

                if (spans.length > 0) {
                    parsedLines.push({
                        startMs: lineStartMs,
                        endMs: lineEndMs,
                        text: fullText,
                        spans,
                    })
                } else {
                    parsedLines.push({
                        startMs: lineStartMs,
                        endMs: lineEndMs,
                        text: rest,
                    })
                }
                continue
            }

            // Standard LRC timestamp: [mm:ss.xx] text or [mm:ss:xx] text
            const lrcMatch = l.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\]\s*(.*)$/)
            if (lrcMatch) {
                const min = parseInt(lrcMatch[1]!, 10)
                const sec = parseInt(lrcMatch[2]!, 10)
                const ms = parseCentiseconds(lrcMatch[3])
                const startMs = min * 60000 + sec * 1000 + ms
                const text = lrcMatch[4] ?? ''

                parsedLines.push({
                    startMs,
                    text,
                })
                continue
            }

            // Unsynced plain text line
            if (l) {
                parsedLines.push({
                    startMs: 0,
                    text: l,
                })
            }
        }

        if (parsedLines.length === 0) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyrics">
  <body>
    <div></div>
  </body>
</tt>`
        }

        // Fix end times for lines that don't specify duration
        for (let i = 0; i < parsedLines.length; i++) {
            const current = parsedLines[i]!
            if (current.endMs === undefined) {
                const next = parsedLines[i + 1]
                if (next && next.startMs > current.startMs) {
                    current.endMs = next.startMs
                } else {
                    current.endMs = current.startMs + 4000
                }
            }
        }

        let pXml = ''
        for (const line of parsedLines) {
            const beginAttr = formatTTMLTime(line.startMs)
            const endAttr = formatTTMLTime(line.endMs ?? line.startMs + 4000)

            if (line.spans && line.spans.length > 0) {
                let spansStr = ''
                for (const s of line.spans) {
                    const sb = formatTTMLTime(s.startMs)
                    const se = formatTTMLTime(s.endMs)
                    spansStr += `<span begin="${sb}" end="${se}">${escapeXml(s.text)}</span>`
                }
                pXml += `        <p begin="${beginAttr}" end="${endAttr}">${spansStr}</p>\n`
            } else {
                pXml += `        <p begin="${beginAttr}" end="${endAttr}">${escapeXml(line.text)}</p>\n`
            }
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyrics">
  <body>
    <div>
${pXml}    </div>
  </body>
</tt>`
    }

    private static filterTranslations(ttml: string, language: string): string {
        const keepChineseTranslations = language.toLowerCase().startsWith('zh-')
        return ttml.replace(
            /<span\b(?=[^>]*\bttm:role=["']x-translation["'])([^>]*)>[\s\S]*?<\/span>/gi,
            (match, attributes: string) => {
                const translationLanguage = attributes.match(/\bxml:lang=["']([^"']+)["']/i)?.[1]?.toLowerCase()
                return keepChineseTranslations && translationLanguage?.startsWith('zh-') ? match : ''
            },
        )
    }

    static parse(rawLyrics: string, durationMs: number): string {
        return LyricsParser.toTTML(rawLyrics, durationMs)
    }
}
