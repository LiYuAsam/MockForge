import type { ChatAttachment, ChatConfig } from '../../core/models'
import type { PDFPageProxy } from 'pdfjs-dist'
import { createId } from '../../shared/ids'

export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_DOCUMENT_CHARACTERS = 80_000

export type RuntimeAttachment = {
  metadata: ChatAttachment
  textParts: string[]
  imageDataUrls: string[]
  omittedPageCount?: number
}

export type PendingAttachment = {
  metadata: ChatAttachment
  status: 'preparing' | 'ready' | 'error'
  error?: string
  runtime?: RuntimeAttachment
}

export function createPendingAttachment(file: File): PendingAttachment {
  return {
    metadata: { id: createId('attachment'), name: file.name, type: file.type || getMimeType(file.name), size: file.size, kind: file.type.startsWith('image/') ? 'image' : 'document' },
    status: 'preparing',
  }
}

export async function parseAttachment(file: File, metadata: ChatAttachment, config: ChatConfig): Promise<RuntimeAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('单个附件不能超过 5MB。')
  if (file.type.startsWith('image/')) return { metadata, textParts: [], imageDataUrls: [await readAsDataUrl(file)] }

  const extension = getExtension(file.name)
  if (extension === 'pdf') {
    if (!config.enablePdfParsing) throw new Error('请先在设置中启用本地 PDF 解析。')
    return parsePdf(file, metadata, config)
  }
  if (extension === 'docx') {
    if (!config.enableDocxParsing) throw new Error('请先在设置中启用本地 DOCX 解析。')
    return parseDocx(file, metadata)
  }
  if (['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'csv'].includes(extension)) {
    const text = limitText(await file.text())
    return { metadata, textParts: [`附件「${file.name}」内容：\n${text}`], imageDataUrls: [] }
  }
  throw new Error('仅支持图片、PDF、DOCX、TXT、Markdown、JSON、YAML 和 CSV 文件。')
}

async function parsePdf(file: File, metadata: ChatAttachment, config: ChatConfig): Promise<RuntimeAttachment> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await loadingTask.promise
  const textParts: string[] = []
  const imageDataUrls: string[] = []
  let omittedPageCount = 0
  let remainingTextCharacters = MAX_DOCUMENT_CHARACTERS

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items.map((item) => 'str' in item ? item.str : '').join(' ').trim()
      const sendAsImage = config.pdfProcessing === 'vision' || (config.pdfProcessing === 'hybrid' && pageText.length < config.pdfTextThreshold)
      if (!sendAsImage || config.pdfProcessing === 'text') {
        if (remainingTextCharacters > 0) {
          const textForModel = pageText || '（未检测到可复制文本）'
          const clippedText = textForModel.slice(0, remainingTextCharacters)
          textParts.push(`PDF「${file.name}」第 ${pageNumber} 页：\n${clippedText}${clippedText.length < textForModel.length ? '\n（内容已截断）' : ''}`)
          remainingTextCharacters -= clippedText.length
        } else {
          omittedPageCount += 1
        }
      } else if (imageDataUrls.length < config.pdfMaxVisualPages) {
        imageDataUrls.push(await renderPdfPage(page))
      } else {
        omittedPageCount += 1
      }
    }
  } finally {
    await loadingTask.destroy()
  }
  return { metadata, textParts, imageDataUrls, omittedPageCount: omittedPageCount || undefined }
}

async function renderPdfPage(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1.45 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建 PDF 页图。')
  await page.render({ canvasContext: context, canvas, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.84)
}

async function parseDocx(file: File, metadata: ChatAttachment): Promise<RuntimeAttachment> {
  const mammoth = await import('mammoth')
  const imageDataUrls: string[] = []
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      if (imageDataUrls.length >= 5) return { src: '' }
      imageDataUrls.push(`data:${image.contentType};base64,${await image.readAsBase64String()}`)
      return { src: 'embedded-image-sent-separately' }
    }),
  })
  const html = result.value.replace(/<img\b[^>]*>/gi, '<p>（DOCX 内嵌图片已作为图片附件发送。）</p>').trim()
  if (!html) throw new Error('未能从 DOCX 中提取可用内容。')
  return { metadata, textParts: [`DOCX「${file.name}」内容（HTML 结构保留标题、列表与表格）：\n${limitText(html)}`], imageDataUrls }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取图片。'))
    reader.onerror = () => reject(new Error('无法读取图片。'))
    reader.readAsDataURL(file)
  })
}

function limitText(text: string): string {
  return text.length > MAX_DOCUMENT_CHARACTERS ? `${text.slice(0, MAX_DOCUMENT_CHARACTERS)}\n\n（内容已截断）` : text
}

function getExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function getMimeType(name: string): string {
  const extension = getExtension(name)
  return extension === 'pdf' ? 'application/pdf' : extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain'
}
