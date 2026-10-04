export interface ToolRedirectIntent {
  id: string
  toolName: string
  toolUrl: string
  toolIcon: string
  toolDesc: string
  message: string
  quickSuggestions?: string[]
}

export interface ToolRedirectOptions {
  hasImageAttachment?: boolean
}

export function getToolRedirectIntent(
  text: string,
  options?: ToolRedirectOptions,
): ToolRedirectIntent | null
