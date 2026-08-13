import { useTheme, type ThemeChoice } from '../lib/theme'

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
]

/**
 * Three explicit options rather than a cycling icon button.
 *
 * A single button that rotates light → dark → system is smaller, and it is also
 * a control whose next state you cannot see and whose current state you can
 * only infer from the screen — including "am I on Auto, or on the light that
 * Auto happens to be right now?", which are different answers when the sun goes
 * down. Three buttons cost about 120px and say what is true.
 *
 * `aria-pressed` rather than a radio group: these are buttons that take effect
 * on press, not a value being edited and submitted.
 */
export function ThemeToggle() {
  const { choice, choose } = useTheme()

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-control bg-sunken p-0.5"
    >
      {CHOICES.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={choice === option.value}
          onClick={() => choose(option.value)}
          className={`rounded-control px-2 py-0.5 text-xs transition-colors ${
            choice === option.value
              ? 'bg-surface font-medium text-ink shadow-card'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
