import { describeUnconverted, type UnconvertedSummary } from '../lib/currency.js'

interface UnconvertedNoteProps {
  summary: UnconvertedSummary
}

export function UnconvertedNote({ summary }: UnconvertedNoteProps) {
  const message = describeUnconverted(summary)
  if (!message) return null
  return <p className="mt-1 font-mono text-[10px] text-neon-amber">{message}</p>
}
