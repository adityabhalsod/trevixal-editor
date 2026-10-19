import {
  type Editor,
  Fragment,
  ReplaceInlineStep,
  type SuggestionListHandle,
  type SuggestionListState,
  TextSelection,
  type TriggerMatch,
  pos,
  suggestionList,
} from '@trevixal/core'
import { EMOJI_GROUPS } from './data'

export interface EmojiItem {
  /** Shortcode without colons, e.g. `"smile"`. */
  readonly name: string
  /** The emoji character itself. */
  readonly char: string
  readonly keywords?: readonly string[]
  /** Unicode's group for it, `"Smileys & Emotion"`: where a picker files it. */
  readonly group?: string
  /** Unicode's name for it, `"grinning face"`: what a picker shows on hover. */
  readonly description?: string
}

/**
 * Every emoji, in Unicode's groups and order (see `data.ts`). The familiar
 * ones keep their short codes, `:smile:` and `:thumbsup:`, with Unicode's
 * name as a keyword; the rest go by Unicode's name, `:grinning_face:`.
 */
export function defaultEmoji(): readonly EmojiItem[] {
  return EMOJI
}

/** The most matches the `:` trigger lists: the popup is for picking, not browsing. */
const MAX_SUGGESTIONS = 50

/** The short codes people type, and words they look for them by. */
const COMMON: readonly EmojiItem[] = [
  { name: 'smile', char: '😄', keywords: ['happy', 'joy'] },
  { name: 'grin', char: '😁' },
  { name: 'laughing', char: '😆', keywords: ['lol'] },
  { name: 'joy', char: '😂', keywords: ['tears', 'lol'] },
  { name: 'wink', char: '😉' },
  { name: 'blush', char: '😊' },
  { name: 'heart_eyes', char: '😍', keywords: ['love'] },
  { name: 'thinking', char: '🤔', keywords: ['hmm'] },
  { name: 'neutral_face', char: '😐' },
  { name: 'sweat_smile', char: '😅' },
  { name: 'cry', char: '😢', keywords: ['sad', 'tear'] },
  { name: 'sob', char: '😭', keywords: ['sad'] },
  { name: 'angry', char: '😠' },
  { name: 'scream', char: '😱', keywords: ['shock'] },
  { name: 'sunglasses', char: '😎', keywords: ['cool'] },
  { name: 'sleeping', char: '😴', keywords: ['zzz'] },
  { name: 'thumbsup', char: '👍', keywords: ['+1', 'like', 'yes'] },
  { name: 'thumbsdown', char: '👎', keywords: ['-1', 'no'] },
  { name: 'clap', char: '👏', keywords: ['applause'] },
  { name: 'wave', char: '👋', keywords: ['hello', 'bye'] },
  { name: 'pray', char: '🙏', keywords: ['thanks', 'please'] },
  { name: 'muscle', char: '💪', keywords: ['strong'] },
  { name: 'ok_hand', char: '👌' },
  { name: 'point_right', char: '👉' },
  { name: 'eyes', char: '👀', keywords: ['look'] },
  { name: 'brain', char: '🧠' },
  { name: 'heart', char: '❤️', keywords: ['love'] },
  { name: 'broken_heart', char: '💔' },
  { name: 'sparkles', char: '✨', keywords: ['shiny', 'new'] },
  { name: 'star', char: '⭐' },
  { name: 'fire', char: '🔥', keywords: ['hot', 'lit'] },
  { name: 'boom', char: '💥', keywords: ['explosion'] },
  { name: 'tada', char: '🎉', keywords: ['party', 'celebrate'] },
  { name: 'confetti_ball', char: '🎊' },
  { name: 'balloon', char: '🎈' },
  { name: 'gift', char: '🎁', keywords: ['present'] },
  { name: 'rocket', char: '🚀', keywords: ['ship', 'launch'] },
  { name: 'airplane', char: '✈️' },
  { name: 'car', char: '🚗' },
  { name: 'bike', char: '🚲' },
  { name: 'sun', char: '☀️', keywords: ['sunny'] },
  { name: 'moon', char: '🌙' },
  { name: 'cloud', char: '☁️' },
  { name: 'rain', char: '🌧️' },
  { name: 'snowflake', char: '❄️' },
  { name: 'rainbow', char: '🌈' },
  { name: 'zap', char: '⚡', keywords: ['lightning', 'fast'] },
  { name: 'coffee', char: '☕', keywords: ['cafe'] },
  { name: 'tea', char: '🍵' },
  { name: 'beer', char: '🍺' },
  { name: 'pizza', char: '🍕' },
  { name: 'burger', char: '🍔' },
  { name: 'cake', char: '🍰', keywords: ['dessert'] },
  { name: 'birthday', char: '🎂' },
  { name: 'apple', char: '🍎' },
  { name: 'banana', char: '🍌' },
  { name: 'avocado', char: '🥑' },
  { name: 'dog', char: '🐶', keywords: ['puppy'] },
  { name: 'cat', char: '🐱', keywords: ['kitten'] },
  { name: 'bird', char: '🐦' },
  { name: 'fish', char: '🐟' },
  { name: 'bug', char: '🐛', keywords: ['insect', 'error'] },
  { name: 'bee', char: '🐝' },
  { name: 'turtle', char: '🐢' },
  { name: 'unicorn', char: '🦄' },
  { name: 'check', char: '✅', keywords: ['done', 'yes', 'white_check_mark'] },
  { name: 'x', char: '❌', keywords: ['no', 'cross'] },
  { name: 'warning', char: '⚠️', keywords: ['caution'] },
  { name: 'question', char: '❓' },
  { name: 'exclamation', char: '❗' },
  { name: 'bulb', char: '💡', keywords: ['idea', 'light'] },
  { name: 'book', char: '📖', keywords: ['read'] },
  { name: 'books', char: '📚' },
  { name: 'memo', char: '📝', keywords: ['note', 'pencil'] },
  { name: 'calendar', char: '📅', keywords: ['date'] },
  { name: 'clock', char: '🕐', keywords: ['time'] },
  { name: 'hourglass', char: '⏳', keywords: ['wait'] },
  { name: 'lock', char: '🔒', keywords: ['secure'] },
  { name: 'key', char: '🔑' },
  { name: 'hammer', char: '🔨', keywords: ['build', 'tool'] },
  { name: 'wrench', char: '🔧', keywords: ['fix', 'tool'] },
  { name: 'gear', char: '⚙️', keywords: ['settings'] },
  { name: 'link', char: '🔗', keywords: ['url'] },
  { name: 'paperclip', char: '📎', keywords: ['attach'] },
  { name: 'inbox', char: '📥' },
  { name: 'email', char: '📧', keywords: ['mail'] },
  { name: 'phone', char: '📱', keywords: ['mobile'] },
  { name: 'computer', char: '💻', keywords: ['laptop', 'code'] },
  { name: 'keyboard', char: '⌨️' },
  { name: 'chart', char: '📈', keywords: ['graph', 'up'] },
  { name: 'chart_down', char: '📉', keywords: ['graph', 'down'] },
  { name: 'money', char: '💰', keywords: ['cash', 'dollar'] },
  { name: 'gem', char: '💎', keywords: ['diamond'] },
  { name: 'trophy', char: '🏆', keywords: ['win', 'award'] },
  { name: 'medal', char: '🏅' },
  { name: 'soccer', char: '⚽', keywords: ['football'] },
  { name: 'basketball', char: '🏀' },
  { name: 'game', char: '🎮', keywords: ['controller', 'video'] },
  { name: 'dice', char: '🎲' },
  { name: 'music', char: '🎵', keywords: ['note', 'song'] },
  { name: 'guitar', char: '🎸' },
  { name: 'art', char: '🎨', keywords: ['palette', 'paint'] },
  { name: 'camera', char: '📷', keywords: ['photo'] },
  { name: 'movie', char: '🎬', keywords: ['film', 'clapper'] },
  { name: 'globe', char: '🌍', keywords: ['world', 'earth'] },
  { name: 'mountain', char: '⛰️' },
  { name: 'beach', char: '🏖️', keywords: ['vacation'] },
  { name: 'house', char: '🏠', keywords: ['home'] },
  { name: 'office', char: '🏢', keywords: ['building', 'work'] },
  { name: 'hundred', char: '💯', keywords: ['100', 'perfect'] },
  { name: 'shrug', char: '🤷', keywords: ['dunno'] },
  { name: 'facepalm', char: '🤦' },
  { name: 'handshake', char: '🤝', keywords: ['deal', 'agree'] },
  { name: 'raised_hands', char: '🙌', keywords: ['hooray', 'praise'] },
]

const EMOJI: readonly EmojiItem[] = everyEmoji()

/** The familiar ones' characters, which a search offers first, in their own order. */
const FAMILIAR: ReadonlyMap<string, number> = new Map(
  COMMON.map((item, index) => [item.char, index]),
)

function everyEmoji(): EmojiItem[] {
  const common = new Map(COMMON.map((item) => [item.char, item]))
  // A familiar code keeps its emoji: Unicode's 🐕 "dog" is `dog2`, as on
  // GitHub, since `:dog:` is the 🐶 people already type it for.
  const familiar = new Set(COMMON.map((item) => item.name))
  const items: EmojiItem[] = []
  for (const group of EMOJI_GROUPS) {
    for (const pair of group.emoji.split(';')) {
      const space = pair.indexOf(' ')
      const char = pair.slice(0, space)
      const code = pair.slice(space + 1)
      const known = common.get(char)
      common.delete(char)
      const unicode = { group: group.name, description: code.replace(/_/g, ' ') }
      items.push(
        known
          ? { ...known, keywords: [...(known.keywords ?? []), code], ...unicode }
          : { name: familiar.has(code) ? `${code}2` : code, char, ...unicode },
      )
    }
  }
  // A familiar one Unicode lists under another spelling still answers its code.
  return [...items, ...common.values()]
}

/**
 * Search the emoji set, best match first.
 *
 * Typing a whole shortcode has to land on that shortcode: `:heart` must offer
 * `heart` before `heart_eyes`, so an exact name outranks a mere prefix of a
 * longer name. Below those, a shortcode substring beats a keyword hit, because
 * the user is typing shortcodes here, not synonyms.
 *
 * Ranking collects into per-tier buckets rather than sorting by score, so
 * equally-ranked items keep the source order of the set instead of depending
 * on the sort's tiebreak. Within a tier the familiar ones come first, in
 * their own order: `:fi` offers 🔥 before Unicode's firefighter, which its
 * order files earlier.
 */
export function searchEmoji(query: string, items: readonly EmojiItem[] = EMOJI): EmojiItem[] {
  const needle = query.toLowerCase()
  if (!needle) return [...items]
  const rank = (item: EmojiItem): number => FAMILIAR.get(item.char) ?? -1
  const tiers: EmojiItem[][] = [[], [], [], []]
  for (const item of items) {
    const keyword = item.keywords?.some((word) => word.startsWith(needle)) === true
    // A familiar one's words are as good as a short code: `:lol` is 😆, not 🍭.
    const tier =
      item.name === needle
        ? 0
        : item.name.startsWith(needle) || (keyword && rank(item) >= 0)
          ? 1
          : item.name.includes(needle)
            ? 2
            : keyword
              ? 3
              : -1
    if (tier >= 0) tiers[tier]?.push(item)
  }
  return tiers.flatMap((tier) => [
    ...tier.filter((item) => rank(item) >= 0).sort((a, b) => rank(a) - rank(b)),
    ...tier.filter((item) => rank(item) < 0),
  ])
}

/** Replace the `:query` trigger with the emoji character. */
export function insertEmoji(editor: Editor, item: EmojiItem, match: TriggerMatch): void {
  const tr = editor.state.tr.step(
    new ReplaceInlineStep(
      match.path,
      match.from,
      match.to,
      Fragment.of(editor.schema.text(item.char)),
    ),
  )
  tr.setSelection(new TextSelection(pos(match.path, match.from + item.char.length)))
  editor.dispatch(tr)
}

export type EmojiState = SuggestionListState<EmojiItem>

export interface EmojiOptions {
  /** Emoji set to search; defaults to the built-in list. */
  readonly items?: readonly EmojiItem[]
  /** Suppress the popup until the query reaches this length (default 1). */
  readonly minQueryLength?: number
  /** Render hook for the popup: state while open, null when closed. */
  readonly onState: (state: EmojiState | null) => void
}

/** Wire a `:shortcode` emoji picker onto the editor. */
/**
 * `suggestionList` reports a pick as two closes: once when the popup clears
 * and again when the resulting edit leaves the trigger range. Collapse the
 * repeat so a renderer sees one open/close pair.
 */
function closeOnce<T>(onState: (state: T | null) => void): (state: T | null) => void {
  let closed = true
  return (state) => {
    if (state === null && closed) return
    closed = state === null
    onState(state)
  }
}

export function emoji(editor: Editor, options: EmojiOptions): SuggestionListHandle {
  const items = options.items ?? EMOJI
  const min = options.minQueryLength ?? 1
  return suggestionList<EmojiItem>(editor, {
    char: ':',
    items: (query) =>
      query.length < min ? [] : searchEmoji(query, items).slice(0, MAX_SUGGESTIONS),
    onState: closeOnce(options.onState),
    onSelect: (item, match) => insertEmoji(editor, item, match),
  })
}
