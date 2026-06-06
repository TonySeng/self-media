'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { MaterialForm } from './material-form';
import type { MaterialType, IdeaStatus } from '@prisma/client';

const TYPE_LABEL: Record<MaterialType, string> = {
  COPY: '文案',
  TOPIC: '选题',
  VIDEO: '视频',
  IMAGE: '图片',
  AUDIO: '音频',
  IDEA: '创意',
  REFERENCE: '参考',
};

const TYPE_DESC: Record<MaterialType, string> = {
  COPY: '富文本格式的文案内容',
  TOPIC: '选题主题与方向',
  VIDEO: '视频文件素材',
  IMAGE: '图片文件素材',
  AUDIO: '音频文件素材',
  IDEA: '灵感与创意笔记',
  REFERENCE: '外部参考资料链接',
};

type MaterialFormData = {
  title: string;
  content?: string;
  tags: string[];
  fileKey?: string;
  fileSize?: number;
  fileMime?: string;
  url?: string;
  ideaStatus?: IdeaStatus;
};

type Props = {
  open: boolean;
  onClose: () => void;
  type: MaterialType;
  initialData?: Partial<MaterialFormData>;
  materialId?: string;
};

export function MaterialFormDialog({ open, onClose, type, initialData, materialId }: Props) {
  async function handleSave(data: MaterialFormData) {
    const url = materialId ? `/api/materials/${materialId}` : '/api/materials';
    const method = materialId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...data }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || '保存失败');
    }

    onClose();
    window.location.reload();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader onClose={onClose}>
          <DialogTitle description={TYPE_DESC[type]}>
            {materialId ? '编辑' : '新建'}
            <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {TYPE_LABEL[type]}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <MaterialForm
            type={type}
            initialData={initialData}
            onSave={handleSave}
            onCancel={onClose}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
