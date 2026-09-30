export {
  ENGLISH_STOPWORDS,
  IRREGULAR_PARTICIPLES,
  type KeywordDensityOptions,
  type KeywordEntry,
  type LongSentence,
  type PassiveMatch,
  type RepeatedWord,
  type SentenceSpan,
  type TextAnalysis,
  type TextAnalysisOptions,
  type TimeEstimate,
  type WordSpan,
  analyzeText,
  countSyllables,
  findLongSentences,
  findPassiveSentences,
  findRepeatedWords,
  fleschKincaidGrade,
  fleschReadingEase,
  keywordDensity,
  readabilityLabel,
  readingTime,
  sentenceSpans,
  speakingTime,
  splitSentences,
  splitWords,
  wordSpans,
} from './analysis'
export {
  GRAMMAR_RULES,
  type GrammarIssue,
  type GrammarRuleId,
  checkGrammar,
  matchCase,
  wantsAn,
} from './grammar'
export {
  WRITING_ISSUE_ATTR,
  WRITING_KIND_LABELS,
  type WritingAssistant,
  type WritingAssistantOptions,
  type WritingIssue,
  type WritingIssueKind,
  type WritingReport,
  blockText,
  createWritingAssistant,
} from './assistant'
export {
  type WritingInlineMessages,
  type WritingInlineUI,
  type WritingInlineUIOptions,
  createWritingInlineUI,
  issueTitle,
} from './inline-ui'
export { SPELLCHECK_NOTE, isSpellcheckEnabled, setSpellcheck } from './spellcheck'
export { type GoalProgress, type WritingGoal, goalProgress } from './goals'
export {
  CLICHES,
  INCLUSIVE_TERMS,
  type StyleEntry,
  type StyleMatch,
  TONE_PHRASES,
  findPhrases,
} from './style-checks'
export {
  type ReadingHeatmap,
  type ReadingLevel,
  createReadingHeatmap,
  readingLevel,
} from './heatmap'
export {
  ACCESSIBILITY_KIND_LABELS,
  type AccessibilityAuditOptions,
  type AccessibilityIssue,
  type AccessibilityIssueKind,
  MINIMUM_CONTRAST,
  auditAccessibility,
  contrastRatio,
  parseCSSColor,
} from './accessibility'
export {
  COMMON_SYNONYMS,
  type SynonymLookup,
  type ThesaurusOptions,
  enableThesaurus,
  wordListThesaurus,
} from './thesaurus'
export {
  type DuplicateOptions,
  type DuplicatePassage,
  type DuplicateSource,
  findDuplicatePassages,
} from './duplicates'
export { type Finding, type FindingsReport, openFindingsReport } from './report-dialog'
export {
  type AssistAction,
  AssistError,
  type AssistRequest,
  type WritingProvider,
  createRulesProvider,
  rewriteByRules,
  summariseByRules,
} from './provider'
