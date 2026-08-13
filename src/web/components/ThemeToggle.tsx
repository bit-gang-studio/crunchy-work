import { useTheme, type ThemeChoice } from '../lib/theme'

/**
 * Icons, not words.
 *
 * Three text buttons held ~120px of a permanent bar for a setting most people
 * touch twice: once on the first day, and once when the seasons change. As
 * icons the control is a third of the width and stops competing with the
 * wordmark beside it — while staying three explicit choices rather than a
 * cycling button whose next state you cannot see.
 *
 * Every button keeps a real accessible name, so nothing is lost to a
 * screen reader by dropping the visible label.
 */
const CHOICES: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <>
        <circle cx="8" cy="8" r="3.25" />
        <path d="M8 1.5v1.25M8 13.25v1.25M14.5 8h-1.25M2.75 8H1.5M12.6 3.4l-.9.9M4.3 11.7l-.9.9M12.6 12.6l-.9-.9M4.3 4.3l-.9-.9" />
      </>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />,
  },
  {
    value: 'system',
    label: 'Auto',
    // A circle half-filled: the two themes in one mark, which is what "follow
    // the system" means.
    icon: (
      <>
        <circle cx="8" cy="8" r="5.75" />
        <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5Z" fill="currentColor" stroke="none" />
      </>
    ),
  },
]

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
          aria-label={option.label}
          title={option.label}
          onClick={() => choose(option.value)}
          className={`flex h-6 w-6 items-center justify-center rounded-control transition-colors ${
            choice === option.value
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-faint hover:text-ink'
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden
          >
            {option.icon}
          </svg>
        </button>
      ))}
    </div>
  )
}
