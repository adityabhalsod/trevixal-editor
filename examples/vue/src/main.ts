import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'
import { createApp } from 'vue'
import App from './App.vue'

const host = document.querySelector('#app')
if (host) createApp(App).mount(host)
