import { createContext, useContext } from 'react'
import { useLocation, useParams } from 'react-router-dom'

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

export function useRoutePrefix(): string {
  const location = useLocation()
  const { persona } = useParams<{ persona: string }>()
  if (location.pathname.startsWith('/demo/') && persona) {
    return `/demo/${persona}`
  }
  return ''
}
