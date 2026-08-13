import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import type { ProjectSummary } from '../../shared/types'
import { plural } from '../../shared/plural'
import { projectColor } from '../lib/projectColor'
import { suppressNextClick } from '../lib/suppressNextClick'

/**
 * The projects grid, drag-reorderable.
 *
 * Unlike the board, this uses dnd-kit's stock sortable — `rectSortingStrategy`
 * with `closestCenter`. Our bespoke engine exists to solve kanban-specific
 * problems (cross-column moves, the dead zone in the gaps between cards, making
 * the commit equal the preview); a single-list grid reorder has none of them, so
 * reaching for the library's default is the smaller, better-tested option.
 *
 * Sensors match the board deliberately: a 5px nudge for mouse (so a plain click
 * still opens the project) and a 200ms long-press for touch (so a scroll stays a
 * scroll).
 */
export function ProjectGrid({
  projects,
  onReorder,
  children,
}: {
  projects: ProjectSummary[]
  onReorder: (projectId: string, toIndex: number) => void | Promise<void>
  /** The trailing "new project" affordance, which is not sortable. */
  children?: React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    // A tile is a link, so the browser's trailing click after a drop would
    // otherwise navigate into whatever project was released on.
    suppressNextClick()
    if (!over || active.id === over.id) return
    const to = projects.findIndex((p) => p.id === over.id)
    if (to >= 0) void onReorder(String(active.id), to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SortableContext items={projects.map((p) => p.id)} strategy={rectSortingStrategy}>
          {projects.map((project) => (
            <SortableTile key={project.id} project={project} />
          ))}
        </SortableContext>
        {children}
      </div>
    </DndContext>
  )
}

function SortableTile({ project }: { project: ProjectSummary }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  })
  const color = projectColor(project.name)

  return (
    <Link
      ref={setNodeRef}
      to={`/projects/${project.id}`}
      data-testid="project-tile"
      data-project={project.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex min-h-[7.5rem] cursor-grab flex-col overflow-hidden rounded-panel border border-line bg-surface transition-colors hover:border-line-strong hover:shadow-card ${
        isDragging ? 'z-10 opacity-80 shadow-overlay' : ''
      }`}
    >
      <div className="h-2 shrink-0" style={{ background: color.bar }} aria-hidden />
      <div className="flex flex-1 flex-col p-4" style={{ background: color.tint }}>
        <span className="font-medium">{project.name}</span>
        {project.description && (
          <span className="mt-1 line-clamp-2 text-sm text-ink-muted">{project.description}</span>
        )}
        <span className="mt-auto pt-3 text-xs text-ink-muted">
          {plural(project.cardCount, 'card')}
          {project.docCount > 0 && ` · ${plural(project.docCount, 'doc')}`}
        </span>
      </div>
    </Link>
  )
}
