import { useRef, useState } from 'react'
import type { FileAssetReference } from '../../core/models'

type FileResponseFieldProps = {
  file?: FileAssetReference
  onAttach: (file: File) => Promise<void>
  onRemove: () => void
}

export function FileResponseField({ file, onAttach, onRemove }: FileResponseFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)
  const [fileName, setFileName] = useState('mock-response.txt')
  const [mimeType, setMimeType] = useState('text/plain;charset=utf-8')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function attach(selectedFile: File): Promise<void> {
    setSaving(true)
    setError('')
    try {
      await onAttach(selectedFile)
      setCreating(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '响应文件保存失败。')
    } finally {
      setSaving(false)
    }
  }

  function createTextFile(): void {
    const normalizedName = fileName.trim()
    const normalizedMimeType = mimeType.trim() || 'text/plain'
    if (!normalizedName) {
      setError('请输入文件名。')
      return
    }
    if (/[\u0000-\u001f\u007f]/.test(normalizedMimeType)) {
      setError('MIME 类型不能包含控制字符。')
      return
    }

    void attach(new File([content], normalizedName, { type: normalizedMimeType }))
  }

  return (
    <div className="field form-grid--full">
      <span>响应文件</span>
      <div className="file-response">
        {file
          ? <FileDetails file={file} />
          : <span className="muted">尚未关联响应文件。</span>}
        <input
          ref={input}
          type="file"
          hidden
          onChange={(event) => {
            const selectedFile = event.target.files?.[0]
            if (selectedFile) void attach(selectedFile)
            event.target.value = ''
          }}
        />
        <div className="row">
          <button
            type="button"
            className="button button--ghost"
            disabled={saving}
            onClick={() => input.current?.click()}
          >
            {file ? '替换文件' : '选择本地文件'}
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={saving}
            onClick={() => setCreating((value) => !value)}
          >
            {creating ? '取消创建' : '创建文本文件'}
          </button>
          {file && (
            <button
              type="button"
              className="button button--danger"
              disabled={saving}
              onClick={onRemove}
            >
              解除引用
            </button>
          )}
        </div>
        {creating && <TextFileCreator
          fileName={fileName}
          mimeType={mimeType}
          content={content}
          saving={saving}
          onFileNameChange={setFileName}
          onMimeTypeChange={setMimeType}
          onContentChange={setContent}
          onCreate={createTextFile}
        />}
        {error && <span className="field__error" role="alert">{error}</span>}
      </div>
      <span className="muted">
        文件作为响应内容返回，单个文件最大 20 MB。解除引用或删除 Mock 后，
        不再被其他规则使用的文件会自动删除。
      </span>
    </div>
  )
}

function FileDetails({ file }: { file: FileAssetReference }) {
  return (
    <div className="file-response__details">
      <strong>{file.name}</strong>
      <span>{file.mimeType} · {formatFileSize(file.size)}</span>
    </div>
  )
}

function TextFileCreator({
  fileName,
  mimeType,
  content,
  saving,
  onFileNameChange,
  onMimeTypeChange,
  onContentChange,
  onCreate,
}: {
  fileName: string
  mimeType: string
  content: string
  saving: boolean
  onFileNameChange: (value: string) => void
  onMimeTypeChange: (value: string) => void
  onContentChange: (value: string) => void
  onCreate: () => void
}) {
  return (
    <div className="file-response__creator">
      <label className="field">
        <span>文件名</span>
        <input value={fileName} onChange={(event) => onFileNameChange(event.target.value)} />
      </label>
      <label className="field">
        <span>MIME 类型</span>
        <input
          value={mimeType}
          onChange={(event) => onMimeTypeChange(event.target.value)}
          placeholder="text/plain;charset=utf-8"
        />
      </label>
      <label className="field form-grid--full">
        <span>文件内容</span>
        <textarea rows={6} value={content} onChange={(event) => onContentChange(event.target.value)} />
      </label>
      <button type="button" className="button" disabled={saving} onClick={onCreate}>
        {saving ? '保存中…' : '创建并使用文件'}
      </button>
    </div>
  )
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
