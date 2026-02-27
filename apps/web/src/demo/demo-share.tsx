import { useState, useCallback } from 'react'
import { useDemoContext } from './demo-context.js'

interface ShareData {
  topExpense: string
  topAmount: number
}

function formatShareText(personaName: string, topExpense: string, topAmount: number): string {
  const dollars = (topAmount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
  return `I just discovered I'm a ${personaName}. Top expense: "${topExpense}" — ${dollars}. Find your spending persona: pancakemaker.com/demo`
}

export function DemoShareButton({ topExpense, topAmount }: ShareData) {
  const persona = useDemoContext()
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    if (!persona) return

    const text = formatShareText(persona.name, topExpense, topAmount)
    const url = `https://pancakemaker.com/demo/${persona.slug}`

    if (navigator.share) {
      try {
        await navigator.share({ title: `Pancakemaker — ${persona.name}`, text, url })
        return
      } catch {
        // user canceled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }, [persona, topExpense, topAmount])

  return (
    <button
      onClick={handleShare}
      className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-neon-magenta px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-neon-magenta/20 transition-transform hover:scale-105 active:scale-95 sm:static sm:shadow-none"
      aria-label="Share this persona"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
      {copied && (
        <span className="absolute -top-8 right-0 rounded bg-bg-card px-2 py-1 text-xs text-neon-cyan shadow sm:hidden">
          Copied!
        </span>
      )}
    </button>
  )
}
