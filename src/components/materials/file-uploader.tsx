"use client"

import { useState, useRef, useCallback } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type MaterialType = "VIDEO" | "IMAGE" | "AUDIO"

interface FileUploaderProps {
  type: MaterialType
  onUploadComplete: (result: { key: string; url: string }) => void
  className?: string
}

const ACCEPT_MAP: Record<MaterialType, string> = {
  VIDEO: "video/*",
  IMAGE: "image/*",
  AUDIO: "audio/*",
}

const TYPE_LABEL: Record<MaterialType, string> = {
  VIDEO: "视频",
  IMAGE: "图片",
  AUDIO: "音频",
}

export function FileUploader({
  type,
  onUploadComplete,
  className,
}: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback(
    (selectedFile: File): boolean => {
      const acceptTypes = ACCEPT_MAP[type].split(",").map((t) => t.trim())
      return acceptTypes.some((acceptType) => {
        if (acceptType.endsWith("/*")) {
          const prefix = acceptType.slice(0, -2)
          return selectedFile.type.startsWith(prefix)
        }
        return selectedFile.type === acceptType
      })
    },
    [type]
  )

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      if (!validateFile(selectedFile)) {
        setError(`请选择有效的${TYPE_LABEL[type]}文件`)
        return
      }

      setFile(selectedFile)
      setError(null)

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(selectedFile))
    },
    [type, previewUrl, validateFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) {
        handleFileSelect(droppedFile)
      }
    },
    [handleFileSelect]
  )

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      const result = await new Promise<{ key: string; url: string }>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText)
              reject(new Error(errorData.error || '上传失败'))
            } catch {
              reject(new Error('上传失败'))
            }
          }
        })
        xhr.addEventListener('error', () => reject(new Error('网络错误')))
        xhr.open('POST', '/api/materials/upload')
        xhr.send(formData)
      })

      onUploadComplete(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      <Label>上传{TYPE_LABEL[type]}</Label>
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          'hover:border-primary/50'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_MAP[type]}
          onChange={(e) => {
            const selectedFile = e.target.files?.[0]
            if (selectedFile) handleFileSelect(selectedFile)
          }}
          className="hidden"
        />

        {previewUrl && type === 'IMAGE' && (
          <Image
            src={previewUrl}
            alt="Preview"
            width={400}
            height={192}
            className="mx-auto mb-4 max-h-48 w-auto rounded"
            unoptimized
          />
        )}

        {previewUrl && type === 'VIDEO' && (
          <video src={previewUrl} controls className="mx-auto mb-4 max-h-48 rounded" />
        )}

        {previewUrl && type === 'AUDIO' && (
          <audio src={previewUrl} controls className="mx-auto mb-4 w-full" />
        )}

        {file ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            拖拽文件到此处或点击选择{TYPE_LABEL[type]}
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          选择文件
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {file && !isUploading && (
        <Button onClick={handleUpload} className="w-full">
          上传
        </Button>
      )}

      {isUploading && (
        <div className="space-y-2">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-center text-muted-foreground">上传中... {uploadProgress}%</p>
        </div>
      )}
    </div>
  )
}
