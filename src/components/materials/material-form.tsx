"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TiptapEditor } from "./tiptap-editor"
import { FileUploader } from "./file-uploader"

type MaterialType = "COPY" | "TOPIC" | "VIDEO" | "IMAGE" | "AUDIO" | "IDEA" | "REFERENCE"
type IdeaStatus = "DRAFT" | "ADOPTED" | "DISCARDED"

interface MaterialFormData {
  title: string
  content?: string
  tags: string[]
  fileKey?: string
  fileSize?: number
  fileMime?: string
  url?: string
  ideaStatus?: IdeaStatus
}

interface MaterialFormProps {
  type: MaterialType
  initialData?: Partial<MaterialFormData>
  onSave: (data: MaterialFormData) => void | Promise<void>
  onCancel?: () => void
}

export function MaterialForm({
  type,
  initialData,
  onSave,
  onCancel,
}: MaterialFormProps) {
  const [title, setTitle] = useState(initialData?.title || "")
  const [content, setContent] = useState(initialData?.content || "")
  const [tags, setTags] = useState<string[]>(initialData?.tags || [])
  const [tagInput, setTagInput] = useState("")
  const [url, setUrl] = useState(initialData?.url || "")
  const [ideaStatus, setIdeaStatus] = useState<IdeaStatus>(
    initialData?.ideaStatus || "DRAFT"
  )
  const [fileKey, setFileKey] = useState<string | undefined>(initialData?.fileKey)
  const [fileSize, setFileSize] = useState<number | undefined>(initialData?.fileSize)
  const [fileMime, setFileMime] = useState<string | undefined>(initialData?.fileMime)
  const [fileUrl, setFileUrl] = useState<string | undefined>(initialData?.url)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingFile, setIsUploadingFile] = useState(false)

  const handleAddTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (type === "VIDEO" || type === "IMAGE" || type === "AUDIO") {
      if (isUploadingFile) {
        alert("文件正在上传中，请稍候")
        return
      }
      if (!fileKey) {
        alert("请先选择并上传文件")
        return
      }
    }
    setIsSubmitting(true)
    try {
      await onSave({
        title,
        content: type === "COPY" || type === "TOPIC" || type === "REFERENCE" ? content : undefined,
        tags,
        fileKey: type === "VIDEO" || type === "IMAGE" || type === "AUDIO" ? fileKey : undefined,
        fileSize: type === "VIDEO" || type === "IMAGE" || type === "AUDIO" ? fileSize : undefined,
        fileMime: type === "VIDEO" || type === "IMAGE" || type === "AUDIO" ? fileMime : undefined,
        url: type === "REFERENCE" ? url : type === "VIDEO" || type === "IMAGE" || type === "AUDIO" ? fileUrl : undefined,
        ideaStatus: type === "IDEA" ? ideaStatus : undefined,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderTypeSpecificField = () => {
    switch (type) {
      case "COPY":
        return (
          <div className="space-y-2">
            <Label htmlFor="content">文案内容</Label>
            <TiptapEditor
              content={content}
              onChange={setContent}
              placeholder="输入文案内容，支持富文本格式..."
            />
          </div>
        )

      case "TOPIC":
        return (
          <div className="space-y-2">
            <Label htmlFor="content">选题描述</Label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="描述选题的核心内容、目标受众、创作角度..."
              className="w-full min-h-[120px] rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        )

      case "VIDEO":
      case "IMAGE":
      case "AUDIO":
        return (
          <FileUploader
            type={type}
            onUploadComplete={(result) => {
              setFileKey(result.key)
              setFileUrl(result.url)
              setFileSize(result.size)
              setFileMime(result.mime)
            }}
            onUploadingChange={setIsUploadingFile}
          />
        )

      case "IDEA":
        return (
          <div className="space-y-2">
            <Label htmlFor="ideaStatus">状态</Label>
            <select
              id="ideaStatus"
              value={ideaStatus}
              onChange={(e) => setIdeaStatus(e.target.value as IdeaStatus)}
              className="w-full h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="DRAFT">构思中</option>
              <option value="ADOPTED">已采用</option>
              <option value="DISCARDED">已废弃</option>
            </select>
          </div>
        )

      case "REFERENCE":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">参考链接</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">摘要</Label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="记录参考资料的核心要点..."
                className="w-full min-h-[100px] rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入素材标题"
          required
        />
      </div>

      {renderTypeSpecificField()}

      <div className="space-y-2">
        <Label htmlFor="tags">标签</Label>
        <div className="flex gap-2">
          <Input
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAddTag()
              }
            }}
            placeholder="输入标签后按回车添加"
          />
          <Button type="button" onClick={handleAddTag} variant="outline">
            添加
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-destructive"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || isUploadingFile}>
          {isSubmitting ? "保存中..." : isUploadingFile ? "等待上传..." : "保存"}
        </Button>
      </div>
    </form>
  )
}

