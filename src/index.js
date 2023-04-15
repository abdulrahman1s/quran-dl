#!/usr/bin/env node

import { isPathExists, ensureDir, extendedFetch, safeJoin } from './util.js'
import { QURAN_RECITER_REG } from './constants.js'
import fs from 'node:fs/promises'
import prompts from 'prompts'
import ora from 'ora'
import colors from 'kleur'
import os from 'node:os'
import chapters from './chapters.js'
import https, { Agent } from 'node:https'

console.clear()

https.globalAgent = new Agent({ keepAlive: true })

const env = process.env
const exitOnCancel = (state) => {
	if (state.aborted) process.nextTick(() => process.exit(0))
}
const exit = (msg) => {
	console.error(msg)
	process.exit(1)
}

const { RECITER_ID, DOWNLOAD_DIR } = await prompts([
	{
		type: 'text',
		name: 'RECITER_ID',
		message: 'The url of the reciter you want to download',
		initial: env['QURAN_DL_URL'] || 'https://quran.com/reciters/...',
		validate: (v) => !v.endsWith('...') && QURAN_RECITER_REG.test(v),
		format: (v) => v.match(QURAN_RECITER_REG)[2],
		onState: exitOnCancel
	},
	{
		type: 'text',
		message: 'Download directory path',
		name: 'DOWNLOAD_DIR',
		initial: env['QURAN_DL_DOWNLOAD_PATH'] || safeJoin(os.homedir(), 'Downloads'),
		validate: (v) => isPathExists(v),
		onState: exitOnCancel
	}
])

console.clear()

const fetch = extendedFetch({
	retries: 5,
	retryDelay: 1000
})

const spinner = ora(`Searching...`).start()

async function getReciterInfo(id) {
	const data = await fetch.json(
		`https://api.qurancdn.com/api/qdc/audio/reciters/${id}?locale=ar&fields=profile_picture,cover_image,bio`
	)

	return {
		name: data.reciter.name,
		transliteratedName: data.reciter.translated_name.name,
		cover: `https://static.qurancdn.com/${data.reciter.cover_image}`,
		avatar: `https://static.qurancdn.com/${data.reciter.profile_picture}`
	}
}

const reciter = await getReciterInfo(RECITER_ID).catch(() => null)

if (!reciter?.name) exit('The following reciter was not found.')

spinner.clear()
console.log(`\n${reciter.name} found.`)

const downloadFolderPath = safeJoin(DOWNLOAD_DIR, `${reciter.name} - ${reciter.transliteratedName}`)

await ensureDir(downloadFolderPath)

const { audio_files } = await fetch.json(
	`https://api.qurancdn.com/api/qdc/audio/reciters/${RECITER_ID}/audio_files?segments=true`
)

let i = 0

for (const chapter of audio_files) {
	const { name, arabicName } = chapters[chapter.chapter_id]
	const chapterName = `${chapter.chapter_id}. ${name} - ${arabicName}`
	const ext = '.' + chapter.format

	spinner.text = `[${++i}/114] Downloading ${colors.cyan().bold(chapterName)}`

	const data = await fetch.binary(chapter.audio_url)
	await fs.writeFile(safeJoin(downloadFolderPath, chapterName + ext), data)
}

spinner.succeed('Finished')
