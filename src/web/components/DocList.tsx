import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import type { DocSummary } from '../../shared/types'
import { formatRelative } from '../../shared/time'
import { suppressNextClick } from '../lib/suppressNextClick'

/**
 * A project's docs, drag-reorderable.
 *
 * Same call as {@link ProjectGrid}: dnd-kit's stock sortable, because a
 * single-list reorder has none of the kanban problems our bespoke engine exists
 * to solve. `verticalListSortingStrategy` here rather than `rectSortingStrategy`
 * — rows, not a grid.
 *
 * The whole row is the grip (a small handle would mean aiming), and the grip
 * glyph is a *signal*, not the target — it fades in on hover to say "this
 * moves", which a plain list of links otherwise never announces.
 */
export function DocList({
  projectId,
  docs,
  onReorder,
}: {
  projectId: string
  docs: DocSummary[]
  onReorder: (docId: string, toIndex: number) => void | Promise<void>
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    // A row is a link, so the browser's trailing click after a drop would
    // otherwise open whichever doc was released on.
    suppressNextClick()
    if (!over || active.id === over.id) return
    const to = docs.findIndex((d) => d.id === over.id)
    if (to >= 0) void onReorder(String(active.id), to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <SortableContext items={docs.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {docs.map((doc) => (
            <SortableRow key={doc.id} projectId={projectId} doc={doc} />
          ))}
        </SortableContext>
      </ul>
    </DndContext>
  )
}

function SortableRow({ projectId, doc }: { projectId: string; doc: DocSummary }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: doc.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative bg-white ${isDragging ? 'z-10 shadow-lg' : ''}`}
    >
      <Link
        to={`/projects/${projectId}/docs/${doc.id}`}
        data-testid="doc-row"
        data-doc={doc.id}
        {...attributes}
        {...listeners}
        className={`flex cursor-grab items-baseline gap-3 px-4 py-3 hover:bg-neutral-50 active:cursor-grabbing ${
          isDragging ? 'opacity-80' : ''
        }`}
      >
        <span
          aria-hidden
          className="select-none text-xs leading-5 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
        >
          ⠿
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span>
        <span className="shrink-0 text-xs text-neutral-500">{formatRelative(doc.updatedAt)}</span>
      </Link>
    </li>
  )
}
