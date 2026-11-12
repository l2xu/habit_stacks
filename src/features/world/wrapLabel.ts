const SOFT_HYPHEN = '\u00AD'
const plain = (s: string) => s.replaceAll(SOFT_HYPHEN, '')

/** Zerlegt ein zu langes Wort – bevorzugt an weichen Trennstellen, sonst hart. */
function splitWord(word: string, maxChars: number): string[] {
  const parts = word.split(SOFT_HYPHEN)
  const out: string[] = []
  let acc = ''
  for (const part of parts) {
    if (acc && (acc + part).length + 1 > maxChars) {
      out.push(`${acc}-`)
      acc = ''
    }
    acc += part
  }
  // Kein passender Trennpunkt: hart umbrechen
  while (acc.length > maxChars) {
    out.push(`${acc.slice(0, maxChars - 1)}-`)
    acc = acc.slice(maxChars - 1)
  }
  out.push(acc)
  return out
}

/** Bricht ein Label für eine Blockfläche in Zeilen um (Greedy, max. `maxLines`). */
export function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${plain(word)}` : plain(word)
    if (candidate.length <= maxChars) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    const pieces = plain(word).length <= maxChars ? [plain(word)] : splitWord(word, maxChars)
    lines.push(...pieces.slice(0, -1))
    line = pieces.at(-1) ?? ''
  }
  if (line) lines.push(line)

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, Math.max(1, maxChars - 1))}…`
  return kept
}
