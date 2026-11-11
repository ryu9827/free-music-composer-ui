export async function exportScoreAsPdf(score, title, tempo) {
	const [{ jsPDF }, { svg2pdf }] = await Promise.all([
		import('jspdf'),
		import('svg2pdf.js'),
	])

	const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	const pageWidth = pdf.internal.pageSize.getWidth()
	const pageHeight = pdf.internal.pageSize.getHeight()
	const margin = 16
	const scoreWidth = Number(score.getAttribute('width'))
	const scoreHeight = Number(score.getAttribute('height'))
	const rowHeight = Number(score.dataset.rowHeight)
	const rowCount = Number(score.dataset.rowCount)
	const outputWidth = pageWidth - margin * 2
	const scale = outputWidth / scoreWidth

	if (!scoreWidth || !scoreHeight || !rowHeight || !rowCount) {
		throw new Error('The score dimensions are unavailable.')
	}

	score.querySelector('.score-interactions')?.remove()
	score.querySelectorAll('.vf-stavenote').forEach((note) => {
		if (['#216a5b', '#dd7655'].includes(note.getAttribute('fill'))) {
			note.setAttribute('fill', '#283834')
			note.setAttribute('stroke', '#283834')
		}
	})

	const canvas = document.createElement('canvas')
	canvas.width = 1800
	canvas.height = 140
	const context = canvas.getContext('2d')
	const compositionTitle = title.trim() || 'Untitled composition'
	let fontSize = 62
	context.font = `${fontSize}px 'DM Serif Display', 'Microsoft YaHei', sans-serif`
	while (
		context.measureText(compositionTitle).width > canvas.width &&
		fontSize > 20
	) {
		fontSize -= 2
		context.font = `${fontSize}px 'DM Serif Display', 'Microsoft YaHei', sans-serif`
	}
	context.fillStyle = '#253a34'
	context.textBaseline = 'middle'
	context.fillText(compositionTitle, 0, canvas.height / 2, canvas.width)
	pdf.addImage(
		canvas.toDataURL('image/png'),
		'PNG',
		margin,
		10,
		outputWidth,
		(outputWidth * canvas.height) / canvas.width,
	)
	pdf.setFont('helvetica', 'normal')
	pdf.setFontSize(10)
	pdf.setTextColor(95, 110, 102)
	pdf.text(`Tempo: ${tempo} BPM`, margin, 30)

	const host = document.createElement('div')
	host.setAttribute('aria-hidden', 'true')
	host.style.cssText =
		'position:fixed;left:-100000px;top:0;pointer-events:none;'
	document.body.appendChild(host)

	try {
		let firstRow = 0
		let pageNumber = 1
		while (firstRow < rowCount) {
			const top = pageNumber === 1 ? 35 : 16
			const rowsPerPage = Math.max(
				1,
				Math.floor((pageHeight - top - margin) / (rowHeight * scale)),
			)
			const rows = Math.min(rowsPerPage, rowCount - firstRow)
			const startY = firstRow * rowHeight
			const sliceHeight = Math.min(
				rows * rowHeight + (firstRow + rows === rowCount ? 20 : 0),
				scoreHeight - startY,
			)
			const pageScore = score.cloneNode(true)
			pageScore.setAttribute(
				'viewBox',
				`0 ${startY} ${scoreWidth} ${sliceHeight}`,
			)
			pageScore.setAttribute('width', String(scoreWidth))
			pageScore.setAttribute('height', String(sliceHeight))
			pageScore.removeAttribute('style')
			host.replaceChildren(pageScore)

			pdf.saveGraphicsState()
			pdf.rect(margin, top, outputWidth, sliceHeight * scale, null)
			pdf.clip()
			pdf.discardPath()
			await svg2pdf(pageScore, pdf, {
				x: margin,
				y: top,
				width: outputWidth,
				height: sliceHeight * scale,
			})
			pdf.restoreGraphicsState()
			pdf.setFont('helvetica', 'normal')
			pdf.setFontSize(9)
			pdf.setTextColor(130, 145, 135)
			pdf.text(String(pageNumber), pageWidth - margin, pageHeight - 8, {
				align: 'right',
			})

			firstRow += rows
			pageNumber += 1
			if (firstRow < rowCount) pdf.addPage()
		}
	} finally {
		host.remove()
	}

	const filename =
		compositionTitle
			.replace(/[\\/:*?"<>|]/g, '-')
			.replace(/\p{Cc}/gu, '-')
			.replace(/\.+$/, '')
			.slice(0, 80) || 'composition'
	pdf.save(`${filename}.pdf`)
}
