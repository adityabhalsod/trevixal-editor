import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'
import { mount } from 'svelte'
import App from './App.svelte'

const host = document.querySelector('#app')
if (host) mount(App, { target: host })
