import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { ProjectSummary } from '../../shared/types'
import { plural } from '../../shared/plural'
import { projectHue } from '../lib/projectColor'
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
  // Only the hue crosses from JS into CSS; how light it is per theme is decided
  // in index.css, with the rest of the palette.
  const hue = projectHue(project.name)

  return (
    <Link
      ref={setNodeRef}
      to={`/projects/${project.id}`}
      data-testid="project-tile"
      data-project={project.id}
      style={
        {
          transform: CSS.Transform.toString(transform),
          transition,
          '--project-hue': hue,
        } as CSSProperties
      }
      {...attributes}
      {...listeners}
      className={`flex min-h-[9rem] cursor-grab flex-col gap-3 rounded-panel border border-line bg-surface p-4 transition-colors hover:border-line-strong ${
        isDragging ? 'z-10 opacity-80 shadow-overlay' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {/* The monogram is the only place the project's colour appears. Two
            letters, because one is ambiguous across a list and three stops
            being a mark and starts being a word. */}
        <span
          aria-hidden
          className="project-swatch flex h-10 w-10 shrink-0 items-center justify-center rounded-card text-sm font-semibold"
        >
          {monogram(project.name)}
        </span>
        {/* Docs only. The card count is carried by the progress line at the
            bottom — "1 of 8 done" already says there are eight — and a tile
            that says "8 cards" up here and "1 of 8 done" down there is stating
            the same number twice in two different shapes. */}
        <span className="min-w-0 flex-1">
          <span data-testid="project-name" className="block truncate font-medium">
            {project.name}
          </span>
          {project.docCount > 0 && (
            <span className="block text-xs text-ink-faint">{plural(project.docCount, 'doc')}</span>
          )}
        </span>
      </div>

      {project.description && (
        <span className="line-clamp-2 text-sm text-ink-muted">{project.description}</span>
      )}

      {/*
        * Progress, not a pile size.
        *
        * "8 cards" tells you how much there is, never how it is going — which is
        * the question you actually open this screen with. Linear leads its
        * project list with a progress bar and GitHub leads with recency for the
        * same reason: the number that changes is the one worth showing.
        *
        * A project with no cards gets no bar at all rather than an empty one:
        * 0 of 0 is not 0% done, it is "not started", and a permanently empty
        * track on every new project reads as a broken component.
        */}
      {project.cardCount > 0 ? (
        <span className="mt-auto flex items-center gap-2">
          <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover-strong">
            <span
              className="project-progress block h-full rounded-full"
              style={{ width: `${Math.round((project.doneCount / project.cardCount) * 100)}%` }}
            />
          </span>
          <span className="shrink-0 text-xs tabular-nums text-ink-faint">
            {project.doneCount} of {project.cardCount} done
          </span>
        </span>
      ) : (
        /* Every tile ends on the same line, so the grid reads as a set rather
           than as cards of different kinds. An empty project says so instead of
           leaving a hole where the progress bar lives on its neighbours. */
        <span className="mt-auto text-xs text-ink-faint">Nothing on the board yet</span>
      )}
    </Link>
  )
}

/**
 * Up to two letters for the swatch: initials for a multi-word name, the first
 * two characters otherwise. Falls back to a dash rather than rendering an empty
 * square, because a name is only blank mid-rename.
 */
function monogram(name: string): string {
  const words = name.trim().split(/[\s—–-]+/).filter(Boolean)
  if (words.length === 0) return '–'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}
