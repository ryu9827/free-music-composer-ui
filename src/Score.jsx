import { useEffect, useRef, useState } from 'react'
import {
	Accidental,
	Beam,
	Formatter,
	Renderer,
	Stave,
	StaveNote,
	Voice,
} from 'vexflow'
import {
	durationFor,
	layoutMeasures,
	pitchKey,
	pitchName,
	shiftPitch,
} from './music.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgElement(name, attributes) {
	const element = document.createElementNS(SVG_NS, name)
	Object.entries(attributes).forEach(([key, value]) =>
		element.setAttribute(key, String(value)),
	)
	return element
}

export default function Score({
	notes,
	selectedId,
	playingId,
	onSelect,
	onInsert,
	onPitchChange,
	onReorder,
	onDelete,
	onPreview,
}) {
	const containerRef = useRef(null)
	const positionsRef = useRef([])
	const stavesRef = useRef([])
	const dragRef = useRef(null)
	const [width, setWidth] = useState(720)

	useEffect(() => {
		const observer = new ResizeObserver(([entry]) =>
			setWidth(Math.floor(entry.contentRect.width)),
		)
		observer.observe(containerRef.current)
		return () => observer.disconnect()
	}, [])

	useEffect(() => {
		const container = containerRef.current
		const measures = layoutMeasures(notes)
		const visibleMeasures = [...measures]
		while (visibleMeasures.length < 4) {
			visibleMeasures.push([
				{ ticks: 16, isRest: true, filler: true, offset: 0 },
			])
		}

		const columns = width >= 720 ? 2 : 1
		const largestMeasure = Math.max(
			...visibleMeasures.map((measure) => measure.length),
		)
		const minimumMeasureWidth =
			(columns === 1 ? 268 : 340) + Math.max(0, largestMeasure - 10) * 18
		const canvasWidth = Math.max(width, columns * minimumMeasureWidth + 32)
		const measureWidth = (canvasWidth - 32) / columns
		const rowHeight = 178
		const canvasHeight =
			Math.ceil(visibleMeasures.length / columns) * rowHeight + 20

		container.replaceChildren()
		const renderer = new Renderer(container, Renderer.Backends.SVG)
		renderer.resize(canvasWidth, canvasHeight)
		const context = renderer.getContext()
		const positions = []
		const staves = []

		visibleMeasures.forEach((measure, measureIndex) => {
			const column = measureIndex % columns
			const row = Math.floor(measureIndex / columns)
			const stave = new Stave(
				16 + column * measureWidth,
				20 + row * rowHeight,
				measureWidth,
			)
			if (column === 0) stave.addClef('treble')
			if (measureIndex === 0) stave.addTimeSignature('4/4')
			stave.setContext(context).draw()

			const drawnNotes = measure.map((event) => {
				const key = event.isRest ? 'b/4' : pitchKey(event.midi)
				const duration = `${durationFor(event.ticks).notation}${event.isRest ? 'r' : ''}`
				const note = new StaveNote({
					clef: 'treble',
					keys: [key],
					duration,
					auto_stem: true,
				})
				const color =
					event.id === playingId
						? '#dd7655'
						: event.id === selectedId
							? '#216a5b'
							: event.filler
								? '#c1c9c4'
								: '#283834'
				note.setStyle({ fillStyle: color, strokeStyle: color })
				return note
			})

			const voice = new Voice('4/4')
				.setMode(Voice.Mode.SOFT)
				.addTickables(drawnNotes)
			Accidental.applyAccidentals([voice], 'C')
			const beams = Beam.applyAndGetBeams(voice)
			new Formatter()
				.joinVoices([voice])
				.formatToStave([voice], stave, { stave })
			voice.setStave(stave).draw(context, stave)
			beams.forEach((beam) => beam.setContext(context).draw())

			const referenceNote = new StaveNote({
				keys: ['c/4'],
				duration: 'q',
			}).setStave(stave)
			staves.push({
				measureIndex,
				x: stave.getNoteStartX(),
				endX: stave.getNoteEndX(),
				top: stave.getYForLine(0) - 48,
				bottom: stave.getYForLine(4) + 48,
				c4Y: referenceNote.getYs()[0],
			})

			measure.forEach((event, index) => {
				if (event.filler) return
				const note = drawnNotes[index]
				positions.push({
					id: event.id,
					index: event.index,
					measureIndex,
					x: (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2,
					y: note.getYs()[0],
					midi: event.midi,
					isRest: event.isRest,
				})
			})
		})

		const svg = container.querySelector('svg')
		svg.setAttribute('aria-label', 'Editable music score')
		svg.dataset.rowHeight = String(rowHeight)
		svg.dataset.rowCount = String(Math.ceil(visibleMeasures.length / columns))
		const interactions = svgElement('g', { class: 'score-interactions' })
		staves.forEach((stave) => {
			interactions.appendChild(
				svgElement('rect', {
					x: stave.x,
					y: stave.top,
					width: stave.endX - stave.x,
					height: stave.bottom - stave.top,
					fill: 'transparent',
					class: 'staff-hit-area',
					'data-measure-index': stave.measureIndex,
				}),
			)
		})
		positions.forEach((position) => {
			if (position.id === selectedId) {
				interactions.appendChild(
					svgElement('circle', {
						cx: position.x,
						cy: position.y,
						r: 14,
						class: 'note-selection',
					}),
				)
			}
			interactions.appendChild(
				svgElement('circle', {
					cx: position.x,
					cy: position.y,
					r: 17,
					fill: 'transparent',
					class: 'note-hit-area',
					'data-note-id': position.id,
					tabindex: 0,
					role: 'button',
					'aria-label': position.isRest
						? 'Rest'
						: `Note ${pitchName(position.midi)}`,
				}),
			)
		})
		svg.appendChild(interactions)
		positionsRef.current = positions
		stavesRef.current = staves
	}, [notes, selectedId, playingId, width])

	function getPoint(event) {
		const svg = containerRef.current.querySelector('svg')
		const bounds = svg.getBoundingClientRect()
		return {
			x:
				((event.clientX - bounds.left) * Number(svg.getAttribute('width'))) /
				bounds.width,
			y:
				((event.clientY - bounds.top) * Number(svg.getAttribute('height'))) /
				bounds.height,
		}
	}

	function handlePointerDown(event) {
		if (event.button !== 0) return
		const noteId = event.target.getAttribute('data-note-id')
		const measureIndex = event.target.getAttribute('data-measure-index')
		const point = getPoint(event)

		if (noteId) {
			const position = positionsRef.current.find((item) => item.id === noteId)
			dragRef.current = {
				id: noteId,
				start: point,
				midi: position.midi,
				lastMidi: position.midi,
				isRest: position.isRest,
			}
			event.currentTarget.setPointerCapture(event.pointerId)
			onSelect(noteId)
			if (!position.isRest) onPreview(position.midi)
		} else if (measureIndex !== null) {
			const stave = stavesRef.current[Number(measureIndex)]
			const pitch = shiftPitch(60, Math.round((stave.c4Y - point.y) / 5))
			const inMeasure = positionsRef.current.filter(
				(item) => item.measureIndex === Number(measureIndex),
			)
			const next = inMeasure.find((item) => item.x > point.x)
			const index = next
				? next.index
				: inMeasure.length
					? inMeasure[inMeasure.length - 1].index + 1
					: notes.length
			onInsert(pitch, index)
		}
	}

	function handlePointerMove(event) {
		const drag = dragRef.current
		if (!drag) return
		const point = getPoint(event)
		if (!drag.isRest) {
			const midi = shiftPitch(
				drag.midi,
				Math.round((drag.start.y - point.y) / 5),
			)
			if (midi !== drag.lastMidi) {
				drag.lastMidi = midi
				onPitchChange(drag.id, midi)
				onPreview(midi)
			}
		}

		if (Math.abs(point.x - drag.start.x) < 12) return
		const stave = stavesRef.current.find(
			(item) =>
				point.y >= item.top &&
				point.y <= item.bottom &&
				point.x >= item.x &&
				point.x <= item.endX,
		)
		if (!stave) return
		const candidates = positionsRef.current.filter(
			(item) => item.measureIndex === stave.measureIndex && item.id !== drag.id,
		)
		const nearest = candidates.reduce(
			(best, item) =>
				!best || Math.abs(item.x - point.x) < Math.abs(best.x - point.x)
					? item
					: best,
			null,
		)
		if (nearest) onReorder(drag.id, nearest.id, point.x > nearest.x)
	}

	function handleKeyDown(event) {
		const noteId = event.target.getAttribute('data-note-id')
		const note = notes.find((item) => item.id === noteId)
		if (!note) return
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault()
			onDelete(noteId)
		} else if (
			(event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
			!note.isRest
		) {
			event.preventDefault()
			const midi = shiftPitch(note.midi, event.key === 'ArrowUp' ? 1 : -1)
			onPitchChange(noteId, midi)
			onPreview(midi)
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			onSelect(noteId)
			if (!note.isRest) onPreview(note.midi)
		}
	}

	return (
		<div
			ref={containerRef}
			className='score-canvas'
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={() => {
				dragRef.current = null
			}}
			onPointerCancel={() => {
				dragRef.current = null
			}}
			onKeyDown={handleKeyDown}
		/>
	)
}
