import { useEffect, useRef, useState } from 'react'
import {
	Check,
	ChevronDown,
	ChevronUp,
	CircleAlert,
	CirclePause,
	CirclePlay,
	Download,
	Headphones,
	KeyboardMusic,
	ListMusic,
	Minus,
	Music2,
	Plus,
	Settings2,
	Square,
	Trash2,
	Volume2,
	VolumeX,
	WandSparkles,
} from 'lucide-react'
import * as Tone from 'tone'
import Score from './Score.jsx'
import {
	createNote,
	durationFor,
	DURATIONS,
	initialNotes,
	layoutMeasures,
	MAX_PITCH,
	MIN_PITCH,
	pitchName,
} from './music.js'

const STORAGE_KEY = 'cadence-compositions-v2'
const LEGACY_STORAGE_KEY = 'cadence-composition-v1'
const STORAGE_READ_ERROR = 'Saved compositions could not be read. Changes will not be saved.'
const STORAGE_WRITE_ERROR = 'Could not save your compositions in the browser.'
const SAMPLE_FILES = {
	C3: 'C3.mp3',
	'D#3': 'Ds3.mp3',
	'F#3': 'Fs3.mp3',
	A3: 'A3.mp3',
	C4: 'C4.mp3',
	'D#4': 'Ds4.mp3',
	'F#4': 'Fs4.mp3',
	A4: 'A4.mp3',
	C5: 'C5.mp3',
	'D#5': 'Ds5.mp3',
	'F#5': 'Fs5.mp3',
	A5: 'A5.mp3',
	C6: 'C6.mp3',
}
const WHITE_KEYS = [
	48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79,
	81, 83, 84,
]

function readComposition(saved) {
	if (!saved || !Array.isArray(saved.notes)) return null
	const notes = saved.notes.filter(
		(note) =>
			note &&
			typeof note.id === 'string' &&
			Number.isInteger(note.midi) &&
			note.midi >= MIN_PITCH &&
			note.midi <= MAX_PITCH &&
			DURATIONS.some((duration) => duration.ticks === note.ticks),
	)
	if (notes.length !== saved.notes.length) return null
	return {
		title:
			typeof saved.title === 'string' ? saved.title : 'Untitled composition',
		tempo: Number.isFinite(saved.tempo)
			? Math.max(40, Math.min(200, saved.tempo))
			: 108,
		notes,
	}
}

function readLibrary() {
	let readError = false
	let legacy = null
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored !== null) {
			const saved = JSON.parse(stored)
			if (!saved || !Array.isArray(saved.compositions) || !saved.compositions.length) {
				throw new Error('Invalid composition library')
			}
			const compositions = saved.compositions.map((item) => {
				const composition = readComposition(item)
				return composition && typeof item.id === 'string'
					? { id: item.id, ...composition }
					: null
			})
			if (!compositions.every(Boolean) || new Set(compositions.map((item) => item.id)).size !== compositions.length) {
				throw new Error('Invalid composition library')
			}
			return {
				library: {
					compositions,
					activeId: compositions.some((item) => item.id === saved.activeId)
						? saved.activeId
						: compositions[0].id,
				},
				readError: false,
			}
		}
	} catch {
		readError = true
	}
	try {
		const stored = localStorage.getItem(LEGACY_STORAGE_KEY)
		if (stored !== null) {
			legacy = readComposition(JSON.parse(stored))
			if (!legacy) readError = true
		}
	} catch {
		readError = true
	}
	const composition = {
		id: crypto.randomUUID(),
		...(legacy ?? {
			title: 'Untitled composition',
			tempo: 108,
			notes: initialNotes(),
		}),
	}
	return {
		library: { compositions: [composition], activeId: composition.id },
		readError,
	}
}

function PianoKeyboard({ activeMidi, onPlay }) {
	return (
		<div className='piano-keyboard' aria-label='Piano keyboard'>
			{WHITE_KEYS.map((midi, index) => {
				const hasBlackKey =
					index < WHITE_KEYS.length - 1 && WHITE_KEYS[index + 1] - midi === 2
				return (
					<div className='piano-key-slot' key={midi}>
						<button
							type='button'
							className={`piano-key white-key ${activeMidi === midi ? 'active' : ''}`}
							title={pitchName(midi)}
							aria-label={`Play ${pitchName(midi)}`}
							onPointerDown={(event) => {
								event.preventDefault()
								onPlay(midi)
							}}
							onClick={(event) => {
								if (event.detail === 0) onPlay(midi)
							}}
						>
							{midi % 12 === 0 && <span>{pitchName(midi)}</span>}
						</button>
						{hasBlackKey && (
							<button
								type='button'
								className={`piano-key black-key ${activeMidi === midi + 1 ? 'active' : ''}`}
								title={pitchName(midi + 1)}
								aria-label={`Play ${pitchName(midi + 1)}`}
								onPointerDown={(event) => {
									event.preventDefault()
									onPlay(midi + 1)
								}}
								onClick={(event) => {
									if (event.detail === 0) onPlay(midi + 1)
								}}
							/>
						)}
					</div>
				)
			})}
		</div>
	)
}

export default function App() {
	const [initialLibrary] = useState(readLibrary)
	const [library, setLibrary] = useState(initialLibrary.library)
	const composition = library.compositions.find(
		(item) => item.id === library.activeId,
	)
	const { title, tempo, notes } = composition
	const [selectedId, setSelectedId] = useState(null)
	const [duration, setDuration] = useState(4)
	const [isRest, setIsRest] = useState(false)
	const [playingId, setPlayingId] = useState(null)
	const [playbackState, setPlaybackState] = useState('stopped')
	const [audioState, setAudioState] = useState('loading')
	const [volume, setVolume] = useState(75)
	const [activeMidi, setActiveMidi] = useState(null)
	const [notice, setNotice] = useState('')
	const [saveFailed, setSaveFailed] = useState(initialLibrary.readError)
	const [isExporting, setIsExporting] = useState(false)
	const [isLibraryOpen, setIsLibraryOpen] = useState(false)
	const samplerRef = useRef(null)
	const scoreRef = useRef(null)
	const libraryRef = useRef(null)
	const libraryButtonRef = useRef(null)
	const eventsRef = useRef([])
	const playbackVersionRef = useRef(0)
	const previewTimeoutRef = useRef(null)
	const noticeTimeoutRef = useRef(null)
	const selectedNote = notes.find((note) => note.id === selectedId)
	const selectedDuration = selectedNote ? selectedNote.ticks : duration
	const selectedIsRest = selectedNote ? selectedNote.isRest : isRest
	const isPlaying = playbackState === 'playing'

	function updateCompositionField(field, update) {
		setLibrary((current) => ({
			...current,
			compositions: current.compositions.map((item) =>
				item.id === current.activeId
					? {
							...item,
							[field]:
								typeof update === 'function' ? update(item[field]) : update,
						}
					: item,
			),
		}))
	}

	function setTitle(update) {
		updateCompositionField('title', update)
	}

	function setTempo(update) {
		updateCompositionField('tempo', update)
	}

	function setNotes(update) {
		updateCompositionField('notes', update)
	}

	useEffect(() => {
		if (initialLibrary.readError) return
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
			setSaveFailed(false)
			setNotice((current) => current === STORAGE_WRITE_ERROR ? '' : current)
		} catch {
			setSaveFailed(true)
			setNotice(STORAGE_WRITE_ERROR)
		}
	}, [library, initialLibrary.readError])

	useEffect(() => {
		if (!isLibraryOpen) return
		function handlePointerDown(event) {
			if (!libraryRef.current?.contains(event.target)) setIsLibraryOpen(false)
		}
		function handleKeyDown(event) {
			if (event.key === 'Escape') {
				setIsLibraryOpen(false)
				libraryButtonRef.current?.focus()
			}
		}
		document.addEventListener('pointerdown', handlePointerDown)
		document.addEventListener('keydown', handleKeyDown)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown)
			document.removeEventListener('keydown', handleKeyDown)
		}
	}, [isLibraryOpen])

	useEffect(() => {
		const sampler = new Tone.Sampler({
			urls: SAMPLE_FILES,
			baseUrl: `${import.meta.env.BASE_URL}samples/`,
			release: 1,
			onload: () => setAudioState('ready'),
			onerror: () => setAudioState('error'),
		}).toDestination()
		samplerRef.current = sampler
		return () => {
			const transport = Tone.getTransport()
			eventsRef.current.forEach((id) => transport.clear(id))
			transport.stop()
			sampler.dispose()
			clearTimeout(previewTimeoutRef.current)
			clearTimeout(noticeTimeoutRef.current)
		}
	}, [])

	useEffect(() => {
		if (samplerRef.current)
			samplerRef.current.volume.value =
				volume === 0 ? -Infinity : Tone.gainToDb(volume / 100)
	}, [volume])

	function showNotice(message) {
		setNotice(message)
		clearTimeout(noticeTimeoutRef.current)
		noticeTimeoutRef.current = setTimeout(() => setNotice(''), 3500)
	}

	function clearPlayback() {
		playbackVersionRef.current += 1
		const transport = Tone.getTransport()
		transport.stop()
		eventsRef.current.forEach((id) => transport.clear(id))
		eventsRef.current = []
		samplerRef.current?.releaseAll()
		setPlaybackState('stopped')
		setPlayingId(null)
		setActiveMidi(null)
	}

	function previewNote(midi) {
		if (audioState !== 'ready') {
			showNotice(
				audioState === 'error'
					? 'Piano samples could not be loaded.'
					: 'Piano is still loading.',
			)
			return
		}
		Tone.start()
			.then(() => {
				samplerRef.current?.triggerAttackRelease(pitchName(midi), 0.6)
				setActiveMidi(midi)
				clearTimeout(previewTimeoutRef.current)
				previewTimeoutRef.current = setTimeout(() => setActiveMidi(null), 420)
			})
			.catch(() => showNotice('Audio could not be started in this browser.'))
	}

	async function togglePlayback() {
		if (isPlaying) {
			clearPlayback()
			return
		}
		if (notes.length === 0) {
			showNotice('Add a note before playing your composition.')
			return
		}
		if (audioState !== 'ready') {
			showNotice(
				audioState === 'error'
					? 'Piano samples could not be loaded.'
					: 'Piano is still loading.',
			)
			return
		}

		clearPlayback()
		const version = playbackVersionRef.current
		try {
			await Tone.start()
			if (version !== playbackVersionRef.current) return
			const transport = Tone.getTransport()
			transport.bpm.value = tempo
			transport.position = 0
			let position = 0

			layoutMeasures(notes)
				.flat()
				.forEach((note) => {
					const beats = note.ticks / 4
					const eventId = transport.schedule((time) => {
						if (!note.isRest)
							samplerRef.current?.triggerAttackRelease(
								pitchName(note.midi),
								(60 / tempo) * beats * 0.95,
								time,
							)
						Tone.getDraw().schedule(() => {
							if (version !== playbackVersionRef.current) return
							setPlayingId(note.id ?? null)
							setActiveMidi(note.isRest ? null : note.midi)
						}, time)
					}, `${position}i`)
					eventsRef.current.push(eventId)
					position += beats * transport.PPQ
				})

			eventsRef.current.push(
				transport.schedule((time) => {
					Tone.getDraw().schedule(() => {
						if (version === playbackVersionRef.current) clearPlayback()
					}, time)
				}, `${position}i`),
			)
			setPlaybackState('playing')
			transport.start()
		} catch {
			clearPlayback()
			showNotice('Audio could not be started in this browser.')
		}
	}

	function insertNote(midi = 60, index = notes.length) {
		clearPlayback()
		const note = createNote(midi, duration, isRest)
		setNotes((current) => [
			...current.slice(0, index),
			note,
			...current.slice(index),
		])
		setSelectedId(note.id)
		if (!note.isRest) previewNote(midi)
	}

	function updateNote(id, changes) {
		clearPlayback()
		setNotes((current) =>
			current.map((note) => (note.id === id ? { ...note, ...changes } : note)),
		)
	}

	function reorderNote(id, targetId, after) {
		clearPlayback()
		setNotes((current) => {
			const from = current.findIndex((note) => note.id === id)
			const target = current.findIndex((note) => note.id === targetId)
			if (from < 0 || target < 0) return current
			const to = target + (after ? 1 : 0) - (from < target ? 1 : 0)
			if (from === to) return current
			const next = [...current]
			const [moved] = next.splice(from, 1)
			next.splice(to, 0, moved)
			return next
		})
	}

	function deleteNote(id) {
		clearPlayback()
		setNotes((current) => current.filter((note) => note.id !== id))
		setSelectedId((current) => (current === id ? null : current))
	}

	function changeDuration(ticks) {
		setDuration(ticks)
		if (selectedId) updateNote(selectedId, { ticks })
	}

	function changeNoteType(rest) {
		setIsRest(rest)
		if (selectedId) updateNote(selectedId, { isRest: rest })
	}

	function selectNote(id) {
		const note = notes.find((item) => item.id === id)
		if (note) {
			setDuration(note.ticks)
			setIsRest(note.isRest)
		}
		setSelectedId(id)
	}

	function changeTempo(value) {
		clearPlayback()
		setTempo(Math.max(40, Math.min(200, Number(value) || 40)))
	}

	function newComposition() {
		clearPlayback()
		const next = {
			id: crypto.randomUUID(),
			title: 'Untitled composition',
			tempo: 108,
			notes: [],
		}
		setLibrary((current) => ({
			compositions: [...current.compositions, next],
			activeId: next.id,
		}))
		setSelectedId(null)
		setDuration(4)
		setIsRest(false)
		setIsLibraryOpen(false)
	}

	function switchComposition(id) {
		if (id !== library.activeId) {
			clearPlayback()
			setLibrary((current) => ({ ...current, activeId: id }))
			setSelectedId(null)
			setDuration(4)
			setIsRest(false)
		}
		setIsLibraryOpen(false)
	}

	function deleteComposition(item) {
		const name = item.title.trim() || 'Untitled composition'
		const lastComposition = library.compositions.length === 1
		const message = `Delete "${name}"? This cannot be undone.${lastComposition ? ' A new empty composition will be created.' : ''}`
		if (!window.confirm(message)) return

		if (item.id === library.activeId) {
			clearPlayback()
			setSelectedId(null)
			setDuration(4)
			setIsRest(false)
		}
		const emptyComposition = {
			id: crypto.randomUUID(),
			title: 'Untitled composition',
			tempo: 108,
			notes: [],
		}
		setLibrary((current) => {
			const index = current.compositions.findIndex((entry) => entry.id === item.id)
			if (index < 0) return current
			const compositions = current.compositions.filter((entry) => entry.id !== item.id)
			if (compositions.length === 0) {
				return { ...current, compositions: [emptyComposition], activeId: emptyComposition.id }
			}
			return {
				...current,
				compositions,
				activeId: current.activeId === item.id
					? compositions[Math.min(index, compositions.length - 1)].id
					: current.activeId,
			}
		})
	}

	async function exportPdf() {
		const svg = scoreRef.current?.querySelector('svg')
		if (!svg) {
			showNotice('The score is not ready to export.')
			return
		}
		const snapshot = svg.cloneNode(true)
		setIsExporting(true)
		try {
			const { exportScoreAsPdf } = await import('./exportPdf.js')
			await exportScoreAsPdf(snapshot, title, tempo)
		} catch (error) {
			console.error('PDF export failed:', error)
			showNotice('Could not export the score as a PDF.')
		} finally {
			setIsExporting(false)
		}
	}

	return (
		<div className='app-shell'>
			<header className='topbar'>
				<div className='brand'>
					<div className='brand-mark'>
						<Music2 size={20} strokeWidth={2.2} />
					</div>
					<div>
						<span className='brand-name'>
							cadence<span className='brand-dot'>.</span>
						</span>
						<span className='brand-subtitle'>MUSIC STUDIO</span>
					</div>
				</div>
				<div className='header-center'>
					<span className='header-dot' /> YOUR CREATIVE SPACE
				</div>
				<div className='header-actions'>
					<span className={`save-indicator${saveFailed ? ' failed' : ''}`}>
						{saveFailed ? <CircleAlert size={14} /> : <Check size={14} />}
						{saveFailed ? 'Not saved' : 'Saved locally'}
					</span>
					<div className='library-control' ref={libraryRef}>
						<button
							ref={libraryButtonRef}
							className='icon-button header-library'
							type='button'
							title='Compositions'
							aria-label='Compositions'
							aria-expanded={isLibraryOpen}
							aria-controls='composition-library'
							onClick={() => setIsLibraryOpen((open) => !open)}
						>
							<ListMusic size={19} />
						</button>
						{isLibraryOpen && (
							<div
								className='library-menu'
								id='composition-library'
								role='region'
								aria-label='Compositions'
							>
								<div className='library-heading'>
									<span>YOUR COMPOSITIONS</span>
									<span>{library.compositions.length}</span>
								</div>
								<div className='library-items'>
									{library.compositions.map((item) => (
										<div
											key={item.id}
											className={`library-item${item.id === library.activeId ? ' active' : ''}`}
										>
											<button
												type='button'
												className='library-item-select'
												aria-current={item.id === library.activeId ? 'true' : undefined}
												title={item.title || 'Untitled composition'}
												onClick={() => switchComposition(item.id)}
											>
												<span className='library-item-icon'><Music2 size={16} /></span>
												<span className='library-item-content'>
													<strong>{item.title || 'Untitled composition'}</strong>
													<small>{item.notes.length} {item.notes.length === 1 ? 'note' : 'notes'}</small>
												</span>
												{item.id === library.activeId && <Check size={16} />}
											</button>
											<button
												type='button'
												className='library-item-delete'
												title='Delete composition'
												aria-label={`Delete ${item.title.trim() || 'Untitled composition'}`}
												onClick={() => deleteComposition(item)}
											>
												<Trash2 size={16} />
											</button>
										</div>
									))}
								</div>
								<button type='button' className='library-new' onClick={newComposition}>
									<Plus size={16} /> New composition
								</button>
							</div>
						)}
					</div>
				</div>
			</header>

			<main className='workspace'>
				<div className='workspace-intro'>
					<div>
						<div className='eyebrow'>
							<span /> YOUR MUSIC, YOUR WAY
						</div>
						<h1>
							Make a little <em>music.</em>
						</h1>
						<p>A little space for your next big idea.</p>
					</div>
					<div className='intro-art' aria-hidden='true'>
						<span className='art-line line-one' />
						<span className='art-line line-two' />
						<Music2 size={34} />
						<span className='art-sparkle'>✳</span>
					</div>
				</div>

				<div className='editor-grid'>
					<section
						className='composition-panel'
						aria-label='Composition editor'
					>
						<div className='composition-header'>
							<div className='composition-heading'>
								<span className='section-icon'>
									<ListMusic size={19} />
								</span>
								<div>
									<span className='overline'>CURRENT COMPOSITION</span>
									<input
										aria-label='Composition title'
										className='composition-title'
										maxLength={70}
										value={title}
										onChange={(event) => setTitle(event.target.value)}
										onBlur={() => {
											if (!title.trim()) setTitle('Untitled composition')
										}}
									/>
								</div>
							</div>
							<div className='composition-meta'>
								<span className='meta-pill'>
									<span /> Editing
								</span>
								<button
									type='button'
									className='export-button'
									title='Export PDF'
									aria-label='Export PDF'
									disabled={isExporting}
									onClick={exportPdf}
								>
									<Download size={16} />
									<span>{isExporting ? 'Exporting' : 'Export PDF'}</span>
								</button>
							</div>
						</div>

						<div className='score-toolbar'>
							<div className='toolbar-group'>
								<span className='toolbar-label'>NOTE VALUE</span>
								<div
									className='duration-buttons'
									role='group'
									aria-label='Note duration'
								>
									{DURATIONS.map((item) => (
										<button
											key={item.ticks}
											type='button'
											title={`${item.label} note`}
											aria-label={`${item.label} note`}
											aria-pressed={selectedDuration === item.ticks}
											className={
												selectedDuration === item.ticks ? 'active' : ''
											}
											onClick={() => changeDuration(item.ticks)}
										>
											<span
												className={`duration-symbol duration-${item.notation}`}
											>
												{item.ticks === 16
													? '𝅝'
													: item.ticks === 8
														? '𝅗𝅥'
														: item.ticks === 4
															? '♩'
															: item.ticks === 2
																? '♪'
																: '𝅘𝅥𝅯'}
											</span>
											<span>{item.fraction}</span>
										</button>
									))}
								</div>
							</div>
							<div className='toolbar-separator' />
							<div className='toolbar-group'>
								<span className='toolbar-label'>TYPE</span>
								<div
									className='type-buttons'
									role='group'
									aria-label='Note type'
								>
									<button
										type='button'
										aria-pressed={!selectedIsRest}
										className={!selectedIsRest ? 'active' : ''}
										onClick={() => changeNoteType(false)}
										title='Note'
									>
										<Music2 size={17} /> Note
									</button>
									<button
										type='button'
										aria-pressed={selectedIsRest}
										className={selectedIsRest ? 'active' : ''}
										onClick={() => changeNoteType(true)}
										title='Rest'
									>
										<span className='rest-symbol'>𝄽</span> Rest
									</button>
								</div>
							</div>
							<div className='toolbar-spacer' />
							<button
								className='toolbar-icon'
								type='button'
								title='Delete selected note'
								aria-label='Delete selected note'
								disabled={!selectedNote}
								onClick={() => selectedId && deleteNote(selectedId)}
							>
								<Trash2 size={17} />
							</button>
							<button
								className='add-note-button'
								type='button'
								onClick={() => insertNote(selectedNote?.midi ?? 60)}
							>
								<Plus size={16} /> Add note
							</button>
						</div>

						<div className='sheet-area'>
							<div className='sheet-heading'>
								<div>
									<span className='sheet-kicker'>THE SCORE</span>
									<h2>{title || 'Untitled composition'}</h2>
								</div>
								<div className='sheet-tempo'>♩ = {tempo}</div>
							</div>
							<div className='score-scroll' ref={scoreRef}>
								<Score
									notes={notes}
									selectedId={selectedId}
									playingId={playingId}
									onSelect={selectNote}
									onInsert={insertNote}
									onPitchChange={(id, midi) => updateNote(id, { midi })}
									onReorder={reorderNote}
									onDelete={deleteNote}
									onPreview={previewNote}
								/>
							</div>
							<div className='sheet-footer'>
								<span>
									<span className='sheet-footer-dot' /> TREBLE CLEF
								</span>
								<span>4 / 4 TIME</span>
								<span>
									{notes.length} {notes.length === 1 ? 'NOTE' : 'NOTES'}
								</span>
							</div>
						</div>
					</section>

					<aside className='sidebar'>
						<section className='side-section playback-section'>
							<div className='side-heading'>
								<span className='side-icon peach'>
									<Headphones size={17} />
								</span>
								<div>
									<span className='overline'>LISTEN BACK</span>
									<h2>Playback</h2>
								</div>
							</div>
							<div className='playback-controls'>
								<button
									className='play-button'
									type='button'
									aria-label={isPlaying ? 'Stop playback' : 'Play composition'}
									title={isPlaying ? 'Stop playback' : 'Play composition'}
									onClick={togglePlayback}
								>
									{isPlaying ? (
										<CirclePause size={23} />
									) : (
										<CirclePlay size={23} />
									)}
									<span>{isPlaying ? 'Stop' : 'Play'}</span>
								</button>
								<button
									className='stop-button'
									type='button'
									aria-label='Stop playback'
									title='Stop playback'
									disabled={!isPlaying}
									onClick={clearPlayback}
								>
									<Square size={15} fill='currentColor' />
								</button>
								<div className='playback-label'>
									<strong>{isPlaying ? 'Now playing' : 'Ready to play'}</strong>
									<span>Grand piano</span>
								</div>
							</div>
							<div className='side-divider' />
							<div className='setting-row'>
								<div>
									<span className='setting-label'>Tempo</span>
									<small>Beats per minute</small>
								</div>
								<div className='tempo-control'>
									<button
										type='button'
										aria-label='Decrease tempo'
										title='Decrease tempo'
										onClick={() => changeTempo(tempo - 1)}
									>
										<Minus size={13} />
									</button>
									<input
										aria-label='Tempo'
										type='number'
										min='40'
										max='200'
										value={tempo}
										onChange={(event) => changeTempo(event.target.value)}
									/>
									<button
										type='button'
										aria-label='Increase tempo'
										title='Increase tempo'
										onClick={() => changeTempo(tempo + 1)}
									>
										<Plus size={13} />
									</button>
								</div>
							</div>
							<div className='volume-row'>
								<span>
									{volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
								</span>
								<input
									aria-label='Volume'
									type='range'
									min='0'
									max='100'
									value={volume}
									onChange={(event) => setVolume(Number(event.target.value))}
								/>
								<span>{volume}%</span>
							</div>
						</section>

						<section className='side-section note-section'>
							<div className='side-heading'>
								<span className='side-icon green'>
									<Settings2 size={17} />
								</span>
								<div>
									<span className='overline'>FINE TUNE</span>
									<h2>Note details</h2>
								</div>
							</div>
							{selectedNote ? (
								<div className='note-details'>
									<div className='detail-top'>
										<span className='detail-note-icon'>
											<Music2 size={20} />
										</span>
										<div>
											<strong>
												{selectedNote.isRest
													? 'Rest'
													: pitchName(selectedNote.midi)}
											</strong>
											<small>
												{durationFor(selectedNote.ticks).label}{' '}
												{selectedNote.isRest ? 'rest' : 'note'}
											</small>
										</div>
										<span className='selected-badge'>SELECTED</span>
									</div>
									<div className='detail-row'>
										<span>Pitch</span>
										<div className='pitch-control'>
											<button
												type='button'
												aria-label='Lower pitch'
												title='Lower pitch'
												disabled={
													selectedNote.isRest || selectedNote.midi <= MIN_PITCH
												}
												onClick={() => {
													const midi = selectedNote.midi - 1
													updateNote(selectedId, { midi })
													previewNote(midi)
												}}
											>
												<ChevronDown size={16} />
											</button>
											<strong>
												{selectedNote.isRest
													? '—'
													: pitchName(selectedNote.midi)}
											</strong>
											<button
												type='button'
												aria-label='Raise pitch'
												title='Raise pitch'
												disabled={
													selectedNote.isRest || selectedNote.midi >= MAX_PITCH
												}
												onClick={() => {
													const midi = selectedNote.midi + 1
													updateNote(selectedId, { midi })
													previewNote(midi)
												}}
											>
												<ChevronUp size={16} />
											</button>
										</div>
									</div>
									<div className='detail-row'>
										<span>Duration</span>
										<strong>{durationFor(selectedNote.ticks).fraction}</strong>
									</div>
								</div>
							) : (
								<div className='empty-selection'>
									<span className='empty-music'>♪</span>
									<strong>No note selected</strong>
									<span>Select a note on the score</span>
								</div>
							)}
						</section>
						<section className='side-note'>
							<WandSparkles size={16} />
							<p>Every melody starts with a single note.</p>
						</section>
					</aside>
				</div>

				<section className='keyboard-section' aria-label='Piano'>
					<div className='keyboard-heading'>
						<div className='keyboard-title'>
							<span className='side-icon lavender'>
								<KeyboardMusic size={18} />
							</span>
							<div>
								<span className='overline'>FIND YOUR NOTES</span>
								<h2>Piano keyboard</h2>
							</div>
						</div>
						<div className='instrument-name'>
							<span /> GRAND PIANO <ChevronDown size={13} />
						</div>
					</div>
					<div className='piano-scroll'>
						<PianoKeyboard activeMidi={activeMidi} onPlay={previewNote} />
					</div>
					<div className='keyboard-footer'>
						<span>PIANO</span>
						<span>
							{audioState === 'ready'
								? 'SAMPLES READY'
								: audioState === 'error'
									? 'SAMPLES UNAVAILABLE'
									: 'LOADING SAMPLES'}
						</span>
					</div>
				</section>
				<footer className='app-footer'>
					<span>
						MADE FOR THE MUSIC IN YOU <span>✳</span>
					</span>
					<span>YOUR IDEAS, SAVED LOCALLY</span>
				</footer>
			</main>
			{(notice || saveFailed) && (
				<div role='status' className='notice'>
					{notice || (initialLibrary.readError ? STORAGE_READ_ERROR : STORAGE_WRITE_ERROR)}
				</div>
			)}
		</div>
	)
}
