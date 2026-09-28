import { app, BrowserWindow, Menu, shell, session, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import net from 'node:net'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = process.env.ADI_MUSIC_URL || 'https://music.imreallyadi.space'
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1219911045926223914'

let mainWindow
let discordSocket
let discordBuffer = Buffer.alloc(0)
let discordReady = false
let pendingDiscordState
let discordReconnectTimer
let discordPipeIndex = 0

const getDiscordPipes = () => {
	if (process.platform === 'win32') {
		return Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`)
	}

	const dirs = [
		process.env.XDG_RUNTIME_DIR,
		process.env.TMPDIR,
		process.env.TMP,
		process.env.TEMP,
		'/tmp',
	].filter(Boolean)

	return [...new Set(dirs)].flatMap((dir) =>
		Array.from({ length: 10 }, (_, index) => path.join(dir, `discord-ipc-${index}`)),
	)
}

const getNextDiscordPipe = () => {
	const pipes = getDiscordPipes()

	for (let offset = 0; offset < pipes.length; offset += 1) {
		const index = (discordPipeIndex + offset) % pipes.length
		if (fs.existsSync(pipes[index])) {
			discordPipeIndex = index
			return pipes[index]
		}
	}

	return pipes[0]
}

const writeDiscordFrame = (opcode, payload) => {
	if (!discordSocket || !discordSocket.writable) return
	const body = Buffer.from(JSON.stringify(payload))
	const frame = Buffer.alloc(8 + body.length)
	frame.writeInt32LE(opcode, 0)
	frame.writeInt32LE(body.length, 4)
	body.copy(frame, 8)
	discordSocket.write(frame)
}

const scheduleDiscordReconnect = () => {
	if (discordReconnectTimer || !DISCORD_CLIENT_ID) return

	discordReconnectTimer = setTimeout(() => {
		discordReconnectTimer = undefined
		discordPipeIndex = (discordPipeIndex + 1) % getDiscordPipes().length
		connectDiscord()
	}, 1000)
}

const connectDiscord = () => {
	if (!DISCORD_CLIENT_ID || discordSocket) return

	const pipe = getNextDiscordPipe()
	console.log('[Discord RPC] Connecting to', pipe)

	const socket = net.createConnection(pipe)
	discordSocket = socket

	socket.on('connect', () => {
		console.log('[Discord RPC] IPC connected:', pipe)
		discordReady = false
		writeDiscordFrame(0, {
			v: 1,
			client_id: DISCORD_CLIENT_ID,
		})
	})

	socket.on('data', (chunk) => {
		discordBuffer = Buffer.concat([discordBuffer, chunk])

		while (discordBuffer.length >= 8) {
			const length = discordBuffer.readInt32LE(4)
			if (discordBuffer.length < 8 + length) break

			const opcode = discordBuffer.readInt32LE(0)
			const payload = JSON.parse(
				discordBuffer.subarray(8, 8 + length).toString(),
			)
			discordBuffer = discordBuffer.subarray(8 + length)

			console.log(
				'[Discord RPC] Response:',
				JSON.stringify(
					{
						opcode,
						evt: payload?.evt,
						cmd: payload?.cmd,
						data: payload?.data,
					},
					null,
					2,
				),
			)

			if (payload?.evt === 'ERROR') {
				console.error(
					'[Discord RPC] ERROR:',
					payload.data?.code,
					payload.data?.message || 'Unknown Discord RPC error',
				)
				continue
			}

			if (opcode === 1 && payload?.evt === 'READY') {
				console.log('[Discord RPC] READY')
				discordReady = true

				if (pendingDiscordState !== undefined) {
					const state = pendingDiscordState
					pendingDiscordState = undefined
					setDiscordPresence(state)
				}
			}
		}
	})

	socket.on('error', (error) => {
		discordReady = false
		console.warn('[Discord RPC] Connection error:', error.message)
	})

	socket.on('close', () => {
		discordReady = false
		discordSocket = undefined
		discordBuffer = Buffer.alloc(0)
		console.log('[Discord RPC] IPC disconnected')
		scheduleDiscordReconnect()
	})
}

const setDiscordPresence = (state) => {
	if (!DISCORD_CLIENT_ID) return

	pendingDiscordState = state

	if (!discordReady) {
		connectDiscord()
		return
	}

	pendingDiscordState = undefined

	let activity = null

	if (state) {
		const position = Number.isFinite(state.position) ? Math.max(0, state.position) : 0
		const duration = Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0
		const now = Math.floor(Date.now() / 1000)
		const artist = state.artist || 'Adi Music'
		const title = state.title || 'Listening to music'

		activity = {
			type: 2,
			name: artist,
			details: title,
			state: artist,
		}

		if (state.playing && duration > 0 && position < duration) {
			activity.timestamps = {
				start: now - Math.floor(position),
				end: now + Math.ceil(duration - position),
			}
		}

		const artwork = typeof state.artwork === 'string' ? state.artwork.trim() : ''
		if (artwork) {
			activity.assets = {
				large_image: artwork,
				large_text: 'music.imreallyadi.space',
				small_text: artist,
			}
		}

		const url = typeof state.url === 'string' ? state.url.trim() : ''
		if (url && /^https:\/\//.test(url)) {
			activity.buttons = [
				{
					label: 'Open in Adi Music',
					url,
				},
			]
		}
	}

	console.log(
		'[Discord RPC] SET_ACTIVITY:',
		JSON.stringify(activity, null, 2),
	)

	writeDiscordFrame(1, {
		cmd: 'SET_ACTIVITY',
		args: {
			pid: process.pid,
			activity,
		},
		nonce: crypto.randomUUID(),
	})
}

ipcMain.on('discord:set-presence', (_event, state) => {
	setDiscordPresence(state)
})

ipcMain.on('discord:clear-presence', () => {
	setDiscordPresence(undefined)
})

ipcMain.on('media:set-now-playing', () => {})

const createWindow = async () => {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 900,
		minHeight: 600,
		show: false,
		backgroundColor: '#ffffff',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	})

	mainWindow.once('ready-to-show', () => mainWindow.show())

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('https://')) {
			shell.openExternal(url)
		}
		return { action: 'deny' }
	})

	await mainWindow.loadURL(APP_URL)
}

app.whenReady().then(async () => {
	Menu.setApplicationMenu(null)
	await session.defaultSession.clearCache()
	await createWindow()
	connectDiscord()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		}
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})
