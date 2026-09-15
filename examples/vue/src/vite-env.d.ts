/// <reference types="vite/client" />

// `vue-tsc` understands single-file components; plain `tsc` needs telling
// that a `.vue` import is a component.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
