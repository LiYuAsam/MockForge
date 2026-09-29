export type UrlMode = 'exact' | 'prefix' | 'wildcard' | 'regex'
export type BodyType = 'json' | 'text' | 'empty'
export type MockBodyType = BodyType | 'file'

export type FileAssetReference = {
  id: string
  name: string
  mimeType: string
  size: number
}

export type FileAsset = FileAssetReference & {
  blob: Blob
  createdAt: number
}

export type RequestMatch = {
  url: string
  urlMode: UrlMode
  methods: string[]
  query?: Record<string, string>
  requestHeaders?: Record<string, string>
  requestBodyMatcher?: string
}

export type MockRule = {
  id: string
  name: string
  folderId: string | null
  enabled: boolean
  priority: number
  match: RequestMatch
  requestRewrite?: { enabled?: boolean; headers?: Record<string, string> }
  response: {
    status: number
    headersEnabled?: boolean
    headers: Record<string, string>
    bodyType: MockBodyType
    body: unknown
    delayMs: number
    file?: FileAssetReference
  }
  metadata: {
    createdAt: number
    updatedAt: number
    sortOrder?: number
    source: 'manual' | 'ai' | 'import' | 'traffic'
  }
}

export type RuleDraft = Omit<MockRule, 'id' | 'metadata'> & { id?: string }
