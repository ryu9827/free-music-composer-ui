# Cadence

A local music composition workspace for editing a treble-clef score and listening to it with a sampled grand piano.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Compositions are saved in the current browser's local storage. Use the compositions list in the top-right corner to create, switch between, or delete scores. Deleting the last score creates a new empty composition. A score saved by the earlier single-composition version is migrated automatically.

Select or drag a note on the score to edit it. Drag vertically to change pitch and horizontally to reorder notes; the note sounds when you drop it. Press Esc to release the selected note. When no note is selected, click the staff to add a note. Use the note panel beside the score to choose the duration (the dot button makes it dotted), switch between note and rest, or add a sharp or flat to the selected note. Drag a note value from the panel onto the staff to add a note of that length where you drop it. Choose 4/4, 3/4 or 3/8 time in the toolbar above the score; note values longer than one bar are unavailable in that time. Playback starts from the selected note, or from the beginning when nothing is selected. The piano keyboard can be used to audition pitches. Use **Export PDF** to download the score as a printable PDF.

## Audio attribution

The bundled piano samples are from [Salamander Grand Piano](https://github.com/Tonejs/audio/tree/master/salamander), created by Alexander Holm and distributed under the [Creative Commons Attribution 3.0 license](https://creativecommons.org/licenses/by/3.0/). The samples were converted to MP3 for the Tone.js audio collection.
