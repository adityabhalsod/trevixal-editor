import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import DropIn from './DropIn.vue'
import FullEditor from './FullEditor.vue'
import GitHubStars from './GitHubStars.vue'
import NpmDownloads from './NpmDownloads.vue'
import Playground from './Playground.vue'
import './styles.css'

export default {
  extends: DefaultTheme,
  // `socialLinks` takes an icon and a link and nothing else, so the star count
  // goes in the slot beside it rather than in the config.
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => [h(NpmDownloads), h(GitHubStars)],
    }),
  enhanceApp({ app }) {
    app.component('Playground', Playground)
    app.component('FullEditor', FullEditor)
    app.component('DropIn', DropIn)
  },
} satisfies Theme
