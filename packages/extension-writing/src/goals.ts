export interface WritingGoal {
  readonly target: number
  readonly unit: 'words' | 'characters'
  /** Display name for the goal ("Chapter draft"); not part of the progress label. */
  readonly label?: string
}

export interface GoalProgress {
  readonly current: number
  readonly target: number
  /** Progress clamped to 0-1. */
  readonly fraction: number
  /** Whole-number percentage of `fraction`. */
  readonly percent: number
  /** Units still to write; 0 once reached. */
  readonly remaining: number
  readonly reached: boolean
  /** `"412 / 1,000 words"` */
  readonly label: string
}

const formatter = new Intl.NumberFormat('en-US')

/** Measure counts against a goal. A non-positive target counts as reached. */
export function goalProgress(
  goal: WritingGoal,
  counts: { readonly words: number; readonly characters: number },
): GoalProgress {
  const current = Math.max(0, goal.unit === 'words' ? counts.words : counts.characters)
  const target = Math.max(0, Math.floor(goal.target))
  const fraction = target > 0 ? Math.min(1, current / target) : 1
  return {
    current,
    target,
    fraction,
    percent: Math.round(fraction * 100),
    remaining: Math.max(0, target - current),
    reached: current >= target,
    label: `${formatter.format(current)} / ${formatter.format(target)} ${goal.unit}`,
  }
}
