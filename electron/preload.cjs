const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('adiNative', {
	platform: process.platform,
	isDesktop: true,
	discord: {
		setPresence: (presence) => ipcRenderer.send('discord:set-presence', presence),
		clearPresence: () => ipcRenderer.send('discord:clear-presence'),
	},
	media: {
		setNowPlaying: (metadata) => ipcRenderer.send('media:set-now-playing', metadata),
	},
})
