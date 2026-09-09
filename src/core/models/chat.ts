import type { RuleChangeDraft } from './draft'

export type ChatReference = { type: 'rule' | 'folder'; id: string; label: string }

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  references?: ChatReference[]
  attachments?: ChatAttachment[]
  createdAt: number
}

export type ChatAttachment = {
  id: string
  name: string
  type: string
  size: number
  kind: 'image' | 'document'
}

export type ChatConversation = {
  id: string
  title: string
  messages: ChatMessage[]
  drafts: RuleChangeDraft[]
  createdAt: number
  updatedAt: number
}

export type ChatConfig = {
  historyLimit: number
  enablePdfParsing: boolean
  enableDocxParsing: boolean
  pdfProcessing: 'hybrid' | 'text' | 'vision'
  pdfTextThreshold: number
  pdfMaxVisualPages: number
}

export type ModelConfig = {
  baseUrl: string
  apiKey: string
  model: string
  extraHeaders: Record<string, string>
}
