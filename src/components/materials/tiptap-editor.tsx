"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { cn } from "@/lib/utils"

interface TiptapEditorProps {
  content?: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}

export function TiptapEditor({
  content = "",
  onChange,
  placeholder = "开始输入文案内容...",
  className,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none min-h-[200px] p-3",
          className
        ),
      },
    },
  })

  return (
    <div className="rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 transition-colors">
      <EditorContent editor={editor} />
    </div>
  )
}
