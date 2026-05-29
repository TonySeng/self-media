'use client';

import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { IdeaStatus } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type IdeaMaterial = {
  id: string;
  title: string;
  ideaStatus: IdeaStatus;
  createdAt: string;
  tags: { id: string; name: string; color: string | null }[];
};

type IdeaBoardProps = {
  materials: IdeaMaterial[];
  onStatusChange: (id: string, newStatus: IdeaStatus) => Promise<void>;
  onCardClick: (id: string) => void;
};

const COLUMN_CONFIG: Record<
  IdeaStatus,
  { label: string; bgClass: string }
> = {
  DRAFT: { label: '构思中', bgClass: 'bg-blue-50 dark:bg-blue-950/20' },
  ADOPTED: { label: '已采用', bgClass: 'bg-green-50 dark:bg-green-950/20' },
  DISCARDED: { label: '已废弃', bgClass: 'bg-gray-50 dark:bg-gray-950/20' },
};

function DraggableCard({
  material,
  onClick,
}: {
  material: IdeaMaterial;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: material.id,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging ? 'opacity-50' : ''}
    >
      <Card
        className="cursor-grab transition-all hover:shadow-md active:cursor-grabbing"
        onClick={onClick}
      >
        <CardHeader className="pb-3">
          <CardTitle className="line-clamp-2 text-base">{material.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {material.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb',
                  color: tag.color || '#6b7280',
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(material.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IdeaCard({ material }: { material: IdeaMaterial }) {
  return (
    <Card className="cursor-pointer transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="line-clamp-2 text-base">{material.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {material.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb',
                color: tag.color || '#6b7280',
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(material.createdAt).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}

function DroppableColumn({
  status,
  materials,
  onCardClick,
}: {
  status: IdeaStatus;
  materials: IdeaMaterial[];
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const config = COLUMN_CONFIG[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[600px] flex-1 flex-col rounded-lg border p-4 transition-colors ${
        config.bgClass
      } ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{config.label}</h3>
        <span className="text-sm text-muted-foreground">{materials.length}</span>
      </div>
      <div className="space-y-3">
        {materials.map((material) => (
          <DraggableCard
            key={material.id}
            material={material}
            onClick={() => onCardClick(material.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function IdeaBoard({ materials, onStatusChange, onCardClick }: IdeaBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const materialId = active.id as string;
    const targetStatus = over.id as IdeaStatus;

    const material = materials.find((m) => m.id === materialId);
    if (!material || material.ideaStatus === targetStatus) return;

    await onStatusChange(materialId, targetStatus);
  };

  const activeMaterial = activeId
    ? materials.find((m) => m.id === activeId)
    : null;

  const columnMaterials = {
    DRAFT: materials.filter((m) => m.ideaStatus === 'DRAFT'),
    ADOPTED: materials.filter((m) => m.ideaStatus === 'ADOPTED'),
    DISCARDED: materials.filter((m) => m.ideaStatus === 'DISCARDED'),
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4">
        {(['DRAFT', 'ADOPTED', 'DISCARDED'] as IdeaStatus[]).map((status) => (
          <DroppableColumn
            key={status}
            status={status}
            materials={columnMaterials[status]}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeMaterial ? <IdeaCard material={activeMaterial} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
