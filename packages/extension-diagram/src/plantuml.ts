import { escapeHTML } from '@trevixal/core'
import type { DiagramRenderer } from './controller'

/** The public PlantUML server, which draws a diagram from its source in the URL. */
export const PLANTUML_SERVER = 'https://www.plantuml.com/plantuml'

/** PlantUML's own base64 alphabet: digits, letters, then `-` and `_`. */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

/** Bytes in PlantUML's base64, three bytes to four characters. */
function encode64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i] as number
    const b2 = bytes[i + 1] ?? 0
    const b3 = bytes[i + 2] ?? 0
    out +=
      (ALPHABET[b1 >> 2] as string) +
      (ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)] as string) +
      (ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)] as string) +
      (ALPHABET[b3 & 0x3f] as string)
  }
  return out
}

/** Raw deflate, where the browser has it. */
async function deflate(source: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([source]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * A diagram's source as the server reads it in a URL: deflated and in its
 * base64, or, where the browser cannot deflate, as hex after `~h`.
 */
export async function encodePlantUML(source: string): Promise<string> {
  const packed = await deflate(source)
  if (packed) return encode64(packed)
  const bytes = new TextEncoder().encode(source)
  return `~h${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Draw PlantUML through a PlantUML server, as a picture: the diagram's
 * source goes to the server in the picture's address, so a host that must
 * not send its documents anywhere runs its own server, or leaves PlantUML
 * off. A picture rather than the server's SVG put in the page: whatever the
 * server sends, nothing in it can run.
 */
export function createPlantUMLRenderer(server: string = PLANTUML_SERVER): DiagramRenderer {
  const base = server.replace(/\/+$/, '')
  return async (code) => {
    const src = `${base}/svg/${await encodePlantUML(code)}`
    return `<img class="trevixal-diagram__picture" src="${escapeHTML(src)}" alt="PlantUML diagram">`
  }
}
