import { createContext, useContext } from 'react'
import { useParams } from 'react-router-dom'

export interface DemoPersonaInfo {
  slug: string
  name: string
  emoji: string
  tagline: string
}

export const DemoContext = createContext<DemoPersonaInfo | null>(null)

export function useDemoContext(): DemoPersonaInfo | null {
  return useContext(DemoContext)
}

export function isDemoSubdomain(): boolean {
  return window.location.hostname.startsWith('demo.')
}

export function useRoutePrefix(): string {
  const { persona } = useParams<{ persona: string }>()
  if (!persona) return ''
  return isDemoSubdomain() ? `/${persona}` : `/demo/${persona}`
}
