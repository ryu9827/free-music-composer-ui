export const DURATIONS = [
	{ ticks: 16, notation: 'w', label: 'Whole', fraction: '1/1' },
	{ ticks: 8, notation: 'h', label: 'Half', fraction: '1/2' },
	{ ticks: 4, notation: 'q', label: 'Quarter', fraction: '1/4' },
	{ ticks: 2, notation: '8', label: 'Eighth', fraction: '1/8' },
	{ ticks: 1, notation: '16', label: 'Sixteenth', fraction: '1/16' },
]

const PITCH_NAMES = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B',
]
const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11]
const DIATONIC_STEPS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const SHARP_PITCHES = new Set([1, 3, 6, 8, 10])

export const MIN_PITCH = 48
export const MAX_PITCH = 84

export function createNote(midi = 60, ticks = 4, isRest = false) {
	return { id: crypto.randomUUID(), midi, ticks, isRest }
}

export function initialNotes() {
	return [
		[60, 4],
		[62, 2],
		[64, 2],
		[67, 4],
		[64, 4],
		[65, 4],
		[64, 2],
		[62, 2],
		[60, 8],
		[67, 4],
		[69, 4],
		[71, 4],
		[72, 4],
	].map(([midi, ticks]) => createNote(midi, ticks))
}

export function pitchName(midi) {
	return `${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}

export function pitchKey(midi) {
	const pitch = pitchName(midi)
	return `${pitch.slice(0, -1).toLowerCase()}/${pitch.slice(-1)}`
}

export function shiftPitch(midi, distance) {
	const pitchClass = midi % 12
	const start = Math.floor(midi / 12) * 7 + DIATONIC_STEPS[pitchClass]
	const step = start + distance
	const octave = Math.floor(step / 7)
	const degree = ((step % 7) + 7) % 7
	const sharp = SHARP_PITCHES.has(pitchClass) ? 1 : 0
	return Math.max(
		MIN_PITCH,
		Math.min(MAX_PITCH, octave * 12 + NATURAL_PITCHES[degree] + sharp),
	)
}

export function durationFor(ticks) {
	return DURATIONS.find((duration) => duration.ticks === ticks) ?? DURATIONS[2]
}

export function layoutMeasures(notes) {
	const measures = []
	let events = []
	let remaining = 16

	function finishMeasure() {
		while (remaining > 0) {
			const duration = DURATIONS.find((item) => item.ticks <= remaining)
			events.push({
				ticks: duration.ticks,
				isRest: true,
				filler: true,
				offset: 16 - remaining,
			})
			remaining -= duration.ticks
		}
		measures.push(events)
		events = []
		remaining = 16
	}

	notes.forEach((note, index) => {
		if (note.ticks > remaining) finishMeasure()
		events.push({ ...note, index, offset: 16 - remaining })
		remaining -= note.ticks
		if (remaining === 0) finishMeasure()
	})

	if (events.length > 0 || measures.length === 0) finishMeasure()
	return measures
}
