// persistFormatPrefs — bridge between batch wizard state and SettingsStore.
// Playlist and bulk runs remember their choices for next time. A single-video
// run starts from a download profile instead and remembers nothing: keeping a
// set of edits is an explicit "Save as profile".

import type {GetState, SetState} from '../types.js'

export async function persistFormatPrefs(set: SetState, get: GetState): Promise<void> {
	const {settings, wizardMode, playlistSelection} = get()
	if (!settings) return
	if (wizardMode !== 'playlist' && wizardMode !== 'bulk') return

	const common = {
		lastSponsorBlockMode: get().wizardSponsorBlockMode,
		lastSponsorBlockCategories: get().wizardSponsorBlockCategories,
		embedChapters: get().wizardEmbedChapters,
		embedMetadata: get().wizardEmbedMetadata,
		embedThumbnail: get().wizardEmbedThumbnail,
		writeDescription: get().wizardWriteDescription,
		writeThumbnail: get().wizardWriteThumbnail,
		...(wizardMode !== 'bulk' ? {writeM3u: get().wizardWriteM3u} : {}),
		lastSubfolderEnabled: get().wizardSubfolderEnabled,
		lastSubfolder: get().wizardSubfolderName.trim()
	}
	const playlist = {...(playlistSelection ? {lastPlaylistSelection: playlistSelection} : {})}
	const result = await window.appApi.settings.update({common, playlist})
	if (result.ok) set({settings: result.data})
}
