# Cadence

A local music composition workspace for editing a treble-clef score and listening to it with a sampled grand piano.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Compositions are saved in the current browser's local storage. Use the compositions list in the top-right corner to create, switch between, or delete scores. Deleting the last score creates a new empty composition. A score saved by the earlier single-composition version is migrated automatically.

Select or drag a note on the score to edit it. Drag vertically to change pitch and horizontally to reorder notes. Click the staff to add a note, choose its duration in the toolbar, and use the playback controls to hear the composition. The piano keyboard can be used to audition pitches. Use **Export PDF** to download the score as a printable PDF.

## Audio attribution

The bundled piano samples are from [Salamander Grand Piano](https://github.com/Tonejs/audio/tree/master/salamander), created by Alexander Holm and distributed under the [Creative Commons Attribution 3.0 license](https://creativecommons.org/licenses/by/3.0/). The samples were converted to MP3 for the Tone.js audio collection.
