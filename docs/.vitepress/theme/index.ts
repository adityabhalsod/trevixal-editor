import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import DropIn from './DropIn.vue'
import FullEditor from './FullEditor.vue'
import Playground from './Playground.vue'
import './styles.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Playground', Playground)
    app.component('FullEditor', FullEditor)
    app.component('DropIn', DropIn)
  },
} satisfies Theme
