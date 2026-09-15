import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    // A static build, because there is nothing for a server to do here: the
    // route below is prerendered to HTML and the editor is built in the
    // browser. `build/` is what the browser suite serves.
    adapter: adapter({ fallback: undefined, strict: true }),
  },
}
