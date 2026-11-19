export const DURATIONS = [
	{ ticks: 16, notation: 'w', label: 'Whole', fraction: '1/1' },
	{ ticks: 8, notation: 'h', label: 'Half', fraction: '1/2' },
	{ ticks: 4, notation: 'q', label: 'Quarter', fraction: '1/4' },
	{ ticks: 2, notation: '8', label: 'Eighth', fraction: '1/8' },
	{ ticks: 1, notation: '16', label: 'Sixteenth', fraction: '1/16' },
]

export const DURATION_DRAG_TYPE = 'application/x-cadence-duration'

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
const ACCIDENTAL_STEPS = { sharp: 1, flat: -1 }

export const MIN_PITCH = 48
export const MAX_PITCH = 84

export function createNote(midi = 60, ticks = 4, isRest = false, accidental) {
	return { id: crypto.randomUUID(), midi, ticks, isRest, accidental }
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

export function pitchName(midi, accidental) {
	const pitchClass = midi % 12
	const name =
		accidentalOf({ midi, accidental }) === 'flat'
			? `${PITCH_NAMES[pitchClass + 1]}b`
			: PITCH_NAMES[pitchClass]
	return `${name}${Math.floor(midi / 12) - 1}`
}

export function pitchKey(midi, accidental) {
	const pitch = pitchName(midi, accidental)
	return `${pitch.slice(0, -1).toLowerCase()}/${pitch.slice(-1)}`
}

export function stepsFromMiddleC(midi) {
	return (Math.floor(midi / 12) - 5) * 7 + DIATONIC_STEPS[midi % 12]
}

// Only black keys carry an accidental; they are spelled as sharps unless marked flat.
export function accidentalOf({ midi, accidental }) {
	if (!SHARP_PITCHES.has(midi % 12)) return null
	return accidental === 'flat' ? 'flat' : 'sharp'
}

export function applyAccidental(note, accidental) {
	const natural = note.midi - (ACCIDENTAL_STEPS[accidentalOf(note)] ?? 0)
	if (!accidental) return { midi: natural, accidental }
	const midi = natural + ACCIDENTAL_STEPS[accidental]
	return SHARP_PITCHES.has(midi % 12) && midi >= MIN_PITCH && midi <= MAX_PITCH
		? { midi, accidental }
		: null
}

export function shiftPitch(midi, distance, accidental) {
	const offset = ACCIDENTAL_STEPS[accidentalOf({ midi, accidental })] ?? 0
	const natural = midi - offset
	const start = Math.floor(natural / 12) * 7 + DIATONIC_STEPS[natural % 12]
	const step = start + distance
	const octave = Math.floor(step / 7)
	const degree = ((step % 7) + 7) % 7
	return Math.max(
		MIN_PITCH,
		Math.min(MAX_PITCH, octave * 12 + NATURAL_PITCHES[degree] + offset),
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
