import type { Messages } from '../i18n'

/**
 * Every shipped catalogue, each loaded only when it is asked for: pass it as
 * the assembled editor's `languages`, or call one before `setLanguage`. A
 * bundler splits each into its own file, so none is downloaded unless picked.
 */
export const uiLanguageLoaders: Readonly<Record<string, () => Promise<Messages>>> = {
  de: () => import('./de').then((module) => module.default),
  fr: () => import('./fr').then((module) => module.default),
  es: () => import('./es').then((module) => module.default),
  pt: () => import('./pt').then((module) => module.default),
  hi: () => import('./hi').then((module) => module.default),
  ja: () => import('./ja').then((module) => module.default),
  zh: () => import('./zh').then((module) => module.default),
  ar: () => import('./ar').then((module) => module.default),
}
