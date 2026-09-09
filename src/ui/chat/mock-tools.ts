import { z } from 'zod'
import type { Folder, MockRule, RuleChangeDraft, TrafficEntry } from '../../core/models'
import { createId } from '../../shared/ids'
import type { PageContext } from '../../shared/messages'

type ToolCall = { id: string; function: { name: string; arguments: string } }

export type ModelTool = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type MockToolContext = {
  rules: MockRule[]
  folders: Folder[]
  traffic: TrafficEntry[]
  page?: PageContext
  pageContextRead: boolean
  inspectedRuleIds: Set<string>
  inspectedTrafficIds: Set<string>
}

export type ToolExecution = {
  content: Record<string, unknown>
  action?: RuleChangeDraft
}

const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const urlModes = ['exact', 'prefix', 'wildcard', 'regex'] as const
const bodyTypes = ['json', 'text', 'empty'] as const
const headersParameters: Record<string, unknown> = { type: 'object', additionalProperties: { type: 'string', maxLength: 4000 } }
const matchParameters: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['url', 'urlMode', 'methods'], properties: {
    url: { type: 'string', minLength: 1, maxLength: 4096 }, urlMode: { type: 'string', enum: urlModes },
    methods: { type: 'array', minItems: 1, maxItems: httpMethods.length, items: { type: 'string', enum: httpMethods }, uniqueItems: true },
    query: headersParameters, requestHeaders: headersParameters, requestBodyMatcher: { type: 'string', maxLength: 10000 },
  },
}
const responseParameters: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['status', 'headersEnabled', 'headers', 'bodyType', 'body', 'delayMs'], properties: {
    status: { type: 'integer', minimum: 100, maximum: 599 }, headersEnabled: { type: 'boolean' }, headers: headersParameters,
    bodyType: { type: 'string', enum: bodyTypes }, body: {}, delayMs: { type: 'integer', minimum: 0, maximum: 120000 },
  },
}
const requestRewriteParameters: Record<string, unknown> = { type: 'object', additionalProperties: false, required: ['enabled', 'headers'], properties: { enabled: { type: 'boolean' }, headers: headersParameters } }
const ruleParameters: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['name', 'match', 'response'], properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 }, folderId: { type: ['string', 'null'] }, enabled: { type: 'boolean' }, priority: { type: 'integer', minimum: -10000, maximum: 10000 },
    match: matchParameters, requestRewrite: requestRewriteParameters, response: responseParameters,
  },
}
const updatePatchParameters: Record<string, unknown> = {
  type: 'object', additionalProperties: false, minProperties: 1, properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 }, folderId: { type: ['string', 'null'] }, enabled: { type: 'boolean' }, priority: { type: 'integer', minimum: -10000, maximum: 10000 },
    match: matchParameters, requestRewrite: requestRewriteParameters, response: responseParameters,
  },
}

const headersSchema = z.record(z.string().min(1).max(200), z.string().max(4000)).default({})
const matchSchema = z.object({
  url: z.string().trim().min(1).max(4096),
  urlMode: z.enum(urlModes).default('exact'),
  methods: z.array(z.enum(httpMethods)).min(1).max(httpMethods.length),
  query: headersSchema.optional(),
  requestHeaders: headersSchema.optional(),
  requestBodyMatcher: z.string().max(10000).optional(),
}).strict()
const responseSchema = z.object({
  status: z.number().int().min(100).max(599).default(200),
  headersEnabled: z.boolean().default(false),
  headers: headersSchema.default({ 'content-type': 'application/json' }),
  bodyType: z.enum(bodyTypes).default('json'),
  body: z.unknown().optional(),
  delayMs: z.number().int().min(0).max(120000).default(0),
}).strict().superRefine((response, issue) => {
  if (response.bodyType === 'text' && response.body !== undefined && typeof response.body !== 'string') issue.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'bodyType 为 text 时 body 必须是字符串' })
})
const requestRewriteSchema = z.object({
  enabled: z.boolean().default(false),
  headers: headersSchema.default({}),
}).strict()
const createSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  rule: z.object({
    name: z.string().trim().min(1).max(200),
    folderId: z.string().min(1).nullable().optional().default(null),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(-10000).max(10000).default(0),
    match: matchSchema,
    requestRewrite: requestRewriteSchema.optional(),
    response: responseSchema,
  }).strict(),
}).strict()
const updateSchema = z.object({
  ruleId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    folderId: z.string().min(1).nullable().optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(-10000).max(10000).optional(),
    match: matchSchema.optional(),
    requestRewrite: requestRewriteSchema.optional(),
    response: responseSchema.optional(),
  }).strict().refine((patch) => Object.keys(patch).length > 0, 'patch 至少包含一个字段'),
}).strict()
const ruleIdSchema = z.object({ ruleId: z.string().min(1) }).strict()

export const mockTools: ModelTool[] = [
  tool('get_current_page_context', '读取当前聊天所关联页面的标题、URL 和 Tab ID。仅在用户明确提及“当前页面”或“这个页面”时调用。', {
    type: 'object', additionalProperties: false, properties: {},
  }),
  tool('list_current_page_traffic', '列出当前页面 Tab 的近期监听 API 流量。默认只列出实际放行的接口；同一方法和路径会合并计数。调用前应先调用 get_current_page_context。', {
    type: 'object', additionalProperties: false, properties: { decision: { type: 'string', enum: ['passed', 'mocked', 'error'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
  }),
  tool('list_traffic_apis', '查看近期监听到的 API 流量清单。默认列出未被 Mock 拦截、实际放行的接口；同一方法和路径会合并计数。需要请求或响应详情时调用 get_traffic_api_detail。', {
    type: 'object', additionalProperties: false, properties: { decision: { type: 'string', enum: ['passed', 'mocked', 'error'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
  }),
  tool('get_traffic_api_detail', '读取一条监听流量的完整请求与响应详情，包括 Query、Header、请求 Body、状态码和响应 Body。', {
    type: 'object', additionalProperties: false, required: ['trafficId'], properties: { trafficId: { type: 'string', minLength: 1 } },
  }),
  tool('list_mock_rules', '查看当前 API Mock 规则列表。先用此工具了解可操作接口；需要某条规则的完整匹配条件和响应时，再调用 get_mock_rule。', {
    type: 'object', additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
  }),
  tool('search_mock_rules', '按规则名称、URL 或文件夹名称检索已有 Mock 规则；修改或删除前必须先使用它确认目标。', {
    type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 10 } },
  }),
  tool('get_mock_rule', '读取一条已有 Mock 规则的完整可编辑信息。', {
    type: 'object', additionalProperties: false, required: ['ruleId'], properties: { ruleId: { type: 'string' } },
  }),
  tool('create_mock_rule', '生成一条新的、待用户确认的完整 Mock 规则。不得声称已保存或已生效。', {
    type: 'object', additionalProperties: false, required: ['reason', 'rule'], properties: {
      reason: { type: 'string', minLength: 1, maxLength: 500 }, rule: ruleParameters,
    },
  }),
  tool('update_mock_rule', '生成对一条已有规则的待确认修改。调用前必须读取或检索目标规则。', {
    type: 'object', additionalProperties: false, required: ['ruleId', 'reason', 'patch'], properties: {
      ruleId: { type: 'string', minLength: 1 }, reason: { type: 'string', minLength: 1, maxLength: 500 },
      patch: updatePatchParameters,
    },
  }),
  tool('delete_mock_rule', '生成对一条已有规则的待确认删除操作。调用前必须读取或检索目标规则。', {
    type: 'object', additionalProperties: false, required: ['ruleId', 'reason'], properties: { ruleId: { type: 'string', minLength: 1 }, reason: { type: 'string', minLength: 1, maxLength: 500 } },
  }),
]

export function executeMockTool(call: ToolCall, context: MockToolContext): ToolExecution {
  const args = parseArguments(call.function.arguments)
  if (!args.ok) return { content: { ok: false, error: args.error } }
  try {
    switch (call.function.name) {
      case 'get_current_page_context': return getCurrentPageContext(args.value, context)
      case 'list_current_page_traffic': return listCurrentPageTraffic(args.value, context)
      case 'list_traffic_apis': return listTrafficApis(args.value, context)
      case 'get_traffic_api_detail': return getTrafficApiDetail(args.value, context)
      case 'list_mock_rules': return listRules(args.value, context)
      case 'search_mock_rules': return searchRules(args.value, context)
      case 'get_mock_rule': return getRule(args.value, context)
      case 'create_mock_rule': return createRule(args.value, call.id, context)
      case 'update_mock_rule': return updateRule(args.value, call.id, context)
      case 'delete_mock_rule': return deleteRule(args.value, call.id, context)
      default: return { content: { ok: false, error: `未知工具：${call.function.name}` } }
    }
  } catch (error) {
    return { content: { ok: false, error: error instanceof Error ? error.message : '工具参数校验失败' } }
  }
}

function getCurrentPageContext(value: unknown, context: MockToolContext): ToolExecution {
  z.object({}).strict().parse(value)
  context.pageContextRead = true
  return context.page ? { content: { ok: true, page: context.page } } : { content: { ok: false, error: '未找到与当前聊天关联的普通网页。请在目标网页的悬浮面板或侧边栏中打开聊天后重试。' } }
}

function listCurrentPageTraffic(value: unknown, context: MockToolContext): ToolExecution {
  z.object({}).passthrough().parse(value)
  if (!context.pageContextRead) return { content: { ok: false, error: '请先调用 get_current_page_context，再查询当前页面流量。' } }
  if (!context.page) return { content: { ok: false, error: '缺少当前页面上下文，请先调用 get_current_page_context。' } }
  return listTrafficApis(value, context, context.page.tabId)
}

function listTrafficApis(value: unknown, context: MockToolContext, tabId?: number): ToolExecution {
  const input = z.object({ decision: z.enum(['passed', 'mocked', 'error']).default('passed'), limit: z.number().int().min(1).max(50).default(30) }).strict().parse(value)
  const groups = new Map<string, { latest: TrafficEntry; count: number }>()
  const entries = context.traffic.filter((entry) => entry.decision === input.decision && (tabId === undefined || entry.tabId === tabId))
  entries.sort((left, right) => right.startedAt - left.startedAt).forEach((entry) => {
    const key = `${entry.method} ${trafficPath(entry.url)}`
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { latest: entry, count: 1 })
  })
  const results = [...groups.values()].slice(0, input.limit).map(({ latest, count }) => ({
    trafficId: latest.id, method: latest.method, url: trafficPath(latest.url), latestUrl: latest.url, count, source: latest.source,
    latestStatus: latest.status ?? null, lastSeenAt: latest.startedAt, durationMs: latest.durationMs ?? null,
    hasRequestBody: Boolean(latest.requestBody), hasResponseBody: Boolean(latest.response?.body), matchedRuleId: latest.matchedRuleId ?? null,
  }))
  results.forEach((item) => context.inspectedTrafficIds.add(item.trafficId))
  return { content: { ok: true, ...(tabId === undefined ? {} : { page: context.page }), decision: input.decision, totalEntries: entries.length, returned: results.length, hasMore: groups.size > results.length, apis: results } }
}

function getTrafficApiDetail(value: unknown, context: MockToolContext): ToolExecution {
  const { trafficId } = z.object({ trafficId: z.string().min(1) }).strict().parse(value)
  const entry = context.traffic.find((item) => item.id === trafficId)
  if (!entry) return { content: { ok: false, error: `未找到流量记录 ${trafficId}` } }
  context.inspectedTrafficIds.add(entry.id)
  return { content: {
    ok: true,
    traffic: {
      id: entry.id, method: entry.method, url: entry.url, query: getQuery(entry.url), source: entry.source, decision: entry.decision,
      startedAt: entry.startedAt, durationMs: entry.durationMs ?? null, status: entry.status ?? null, matchedRuleId: entry.matchedRuleId ?? null,
      requestHeaders: entry.requestHeaders ?? {}, requestBody: modelValue(entry.requestBody),
      response: entry.response ? { bodyType: entry.response.bodyType, headers: entry.response.headers, body: modelValue(entry.response.body) } : null,
    },
  } }
}

function listRules(value: unknown, context: MockToolContext): ToolExecution {
  const input = z.object({ limit: z.number().int().min(1).max(50).default(30) }).strict().parse(value)
  const foldersById = new Map(context.folders.map((folder) => [folder.id, folder.name]))
  const results = context.rules.slice(0, input.limit).map((rule) => ({
    id: rule.id, name: rule.name, methods: rule.match.methods, url: rule.match.url, urlMode: rule.match.urlMode,
    folderName: rule.folderId ? foldersById.get(rule.folderId) ?? null : null, enabled: rule.enabled, priority: rule.priority,
    hasQueryMatch: Boolean(rule.match.query && Object.keys(rule.match.query).length), hasRequestBodyMatch: Boolean(rule.match.requestBodyMatcher), responseStatus: rule.response.status,
  }))
  results.forEach((rule) => context.inspectedRuleIds.add(rule.id))
  return { content: { ok: true, total: context.rules.length, returned: results.length, hasMore: context.rules.length > results.length, rules: results } }
}

function searchRules(value: unknown, context: MockToolContext): ToolExecution {
  const input = z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(10).default(5) }).strict().parse(value)
  const query = input.query.toLocaleLowerCase()
  const foldersById = new Map(context.folders.map((folder) => [folder.id, folder.name]))
  const results = context.rules.filter((rule) => [rule.name, rule.match.url, rule.folderId ? foldersById.get(rule.folderId) : ''].some((text) => text?.toLocaleLowerCase().includes(query))).slice(0, input.limit)
    .map((rule) => ({ id: rule.id, name: rule.name, method: rule.match.methods, url: rule.match.url, folderName: rule.folderId ? foldersById.get(rule.folderId) ?? null : null, enabled: rule.enabled }))
  results.forEach((rule) => context.inspectedRuleIds.add(rule.id))
  return { content: { ok: true, results } }
}

function getRule(value: unknown, context: MockToolContext): ToolExecution {
  const { ruleId } = ruleIdSchema.parse(value)
  const rule = context.rules.find((item) => item.id === ruleId)
  if (rule) context.inspectedRuleIds.add(rule.id)
  return rule ? { content: { ok: true, rule } } : { content: { ok: false, error: `未找到规则 ${ruleId}` } }
}

function createRule(value: unknown, callId: string, context: MockToolContext): ToolExecution {
  const input = createSchema.parse(value)
  if (input.rule.folderId && !context.folders.some((folder) => folder.id === input.rule.folderId)) throw new Error('folderId 不存在，请使用 null 或先检索文件夹。')
  const now = Date.now()
  const rule: MockRule = {
    id: createId('rule'),
    ...input.rule,
    match: { ...input.rule.match, methods: [...new Set(input.rule.match.methods)] },
    response: normalizeResponse(input.rule.response),
    metadata: { createdAt: now, updatedAt: now, source: 'ai' },
  }
  const action: RuleChangeDraft = { type: 'create', id: callId, reason: input.reason, rule }
  return { content: { ok: true, message: '已生成一条待确认的新 Mock 规则。', draftId: action.id, ruleId: rule.id }, action }
}

function updateRule(value: unknown, callId: string, context: MockToolContext): ToolExecution {
  const input = updateSchema.parse(value)
  if (!context.rules.some((rule) => rule.id === input.ruleId)) throw new Error(`未找到规则 ${input.ruleId}`)
  if (!context.inspectedRuleIds.has(input.ruleId)) throw new Error('修改前必须先调用 search_mock_rules 或 get_mock_rule 确认目标规则。')
  if (input.patch.folderId && !context.folders.some((folder) => folder.id === input.patch.folderId)) throw new Error('folderId 不存在，请使用 null 或先检索文件夹。')
  const patch = { ...input.patch, ...(input.patch.response ? { response: normalizeResponse(input.patch.response) } : {}) }
  const action: RuleChangeDraft = { type: 'update', id: callId, ruleId: input.ruleId, reason: input.reason, patch }
  return { content: { ok: true, message: '已生成一条待确认的规则修改。', draftId: action.id }, action }
}

function deleteRule(value: unknown, callId: string, context: MockToolContext): ToolExecution {
  const input = z.object({ ruleId: z.string().min(1), reason: z.string().trim().min(1).max(500) }).strict().parse(value)
  if (!context.rules.some((rule) => rule.id === input.ruleId)) throw new Error(`未找到规则 ${input.ruleId}`)
  if (!context.inspectedRuleIds.has(input.ruleId)) throw new Error('删除前必须先调用 search_mock_rules 或 get_mock_rule 确认目标规则。')
  const action: RuleChangeDraft = { type: 'delete', id: callId, ruleId: input.ruleId, reason: input.reason }
  return { content: { ok: true, message: '已生成一条待确认的删除操作。', draftId: action.id }, action }
}

function normalizeResponse(response: z.infer<typeof responseSchema>): MockRule['response'] {
  const body = response.bodyType === 'empty' ? null : response.body ?? (response.bodyType === 'json' ? {} : '')
  return { ...response, body }
}

function parseArguments(value: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try { return { ok: true, value: JSON.parse(value) } } catch { return { ok: false, error: '工具 arguments 必须是有效 JSON；请修正后重试。' } }
}

function trafficPath(url: string): string {
  try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}` } catch { return url.split('?')[0] }
}

function getQuery(url: string): Record<string, string> {
  try { return Object.fromEntries(new URL(url).searchParams.entries()) } catch { return {} }
}

function modelValue(value: unknown): unknown {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  if (!serialized || serialized.length <= 16000) return value
  return { truncated: true, preview: serialized.slice(0, 16000), originalLength: serialized.length }
}

function tool(name: string, description: string, parameters: Record<string, unknown>): ModelTool {
  return { type: 'function', function: { name, description, parameters } }
}
