# Images, media and drawings

This page covers the media tools: image galleries, alt text, markup, the
camera and screen capture, drawings, recordings, video chapters and the
providers a pasted link can embed.

## Images

- **Image gallery.** *Insert > Image gallery...* uploads the images you pick
  and lays them out as a grid, three across. To make a gallery from images
  already in the document, select one and choose *Gallery* on the image
  toolbar. It takes in the images right beside it too.
- **Full size.** Double-click any image to see it full size over the page.
  The arrows, or the left and right arrow keys, step through the gallery the
  image is in, or through the whole document when it is in none. Press
  Escape to close it.
- **Alt text.** A new image asks what it shows, whether it was uploaded,
  pasted or captured. Write a description, or tick *Decorative only* for an
  image that needs none. *Decorative* on the image toolbar does the same
  later, so screen readers pass the image by.
- **Mark up.** *Mark up...* on the image toolbar draws over the image:
  arrows, boxes, words, and a blur that turns a region into an unreadable
  mosaic. *Apply* burns the markup into the image's pixels, as a crop does,
  and one undo takes it off again.
- **Camera and screen.** *Insert > Camera photo...* shows the camera's live
  picture. *Take photo* freezes it, and *Insert* puts it in the document.
  *Insert > Screenshot...* asks the browser which screen, window or tab to
  share, and offers its first frame.
- **SVG.** An uploaded SVG is cleaned before it is stored. Scripts, event
  handlers, embedded HTML, animation and links to other files are removed,
  and the picture itself is kept.

## Drawings and whiteboards

*Insert > Drawing...* opens a board to draw on. The pen follows the pointer,
and draws thicker as a stylus presses harder. For a whiteboard, the other
tools draw lines, arrows to join things, boxes, ellipses and text. Click a
tool, then drag on the board. *Text* places the words typed in its box
wherever you click. The eraser removes whatever you click, and *Undo* takes
back the last thing drawn.

A drawing is saved in the document as its shapes. Double-click it to draw on
it again. It shows as an SVG on screen, in print and in saved HTML.

## Recording audio

*Insert > Record audio...* records from the microphone. The meter shows the
level and the timer shows the length. *Stop* ends the recording, and
*Insert* puts it in the document with its waveform above the player. The
browser asks for the microphone only when you press *Record*, and releases it
when you press *Stop*. With no server to store the recording, it is kept
inside the document.

## Video chapters

With a video selected, *Insert > Video chapters...* takes one chapter per
line, its start time then its title, as in a video's description:

```
0:00 Welcome
2:15 The demo
1:02:30 Questions
```

The chapters are listed under the video, and clicking one plays the video
from there. In a saved page each chapter links to that point in the video's
file.

## Embeds

*Insert > Embed a link...*, or a pasted link, plays these in place:

- YouTube and Vimeo videos
- posts on X
- GitHub gists
- CodePen pens
- CodeSandbox and StackBlitz projects
- Figma files
- Google Maps places and searches
- Spotify tracks, albums, playlists and episodes
- SoundCloud tracks
- Loom recordings

Each link becomes the provider's own embed page. Nothing is fetched to
find the embed page, so it also works offline.
