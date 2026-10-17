// Download profile + probe → the concrete pre-selection of the single-video
// Format screen. The profile describes intent ("up to 720p, MP4"); the probe
// lists what this video has. The result names exact format ids so sizes and
// the review are exact, plus fit notices for every part of the profile this
// video can't honour. Mirrors the yt-dlp format sort the profile path uses
// (`mediaIntentSpec`: `vcodec:h264` before `res:N`), so Interactive and Quick
// Download pick the same streams.

import {DEFAULT_AUDIO_BITRATE} from './schemas.js'
import type {AudioBitrate, AudioSelection, DownloadProfile, DownloadProfileAudioFormat, NativeAudioPreference, PlaylistVideoTier, WizardMediaKind} from './schemas.js'
import type {FormatOption, SubtitleMap} from './types.js'
import {preferredNativeAudioId} from './nativeAudioPreference.js'
import {matchesSubtitleLanguage} from './subtitleLanguages.js'

export interface ProfileSelectionInput {
	profile: DownloadProfile
	formats: readonly FormatOption[]
	subtitles: SubtitleMap
	automaticCaptions: SubtitleMap
	isAudioOnlySource: boolean
	nativeAudioPreference: NativeAudioPreference
}

export interface MediaSelection {
	kind: WizardMediaKind
	videoFormatId: string
	audioSelection: AudioSelection
}

export type FitNotice = {kind: 'video-tier-fallback'; wanted: Exclude<PlaylistVideoTier, 'best'>; picked: number} | {kind: 'mp4-unavailable'} | {kind: 'no-video'} | {kind: 'subtitle-languages-missing'; languages: string[]}

export interface ProfileSelection {
	media: MediaSelection
	subtitleLanguages: string[]
	notices: FitNotice[]
}

const AUTO_CAPTION_SUFFIX = '-orig'
const NO_AUDIO: AudioSelection = {kind: 'none'}

// yt-dlp's `res` is the smaller dimension, so portrait 1080x1920 is 1080.
export function videoHeight(resolution: string): number {
	const dims = /(\d+)\s*x\s*(\d+)/.exec(resolution)
	if (dims) return Math.min(Number(dims[1]), Number(dims[2]))
	const p = /(\d{3,4})p/.exec(resolution)
	if (p) return Number(p[1])
	const any = /(\d{3,4})/.exec(resolution)
	return any ? Number(any[1]) : 0
}

export function isH264(format: FormatOption): boolean {
	const codec = format.videoCodec?.toLowerCase() ?? ''
	return codec.startsWith('avc1') || codec.startsWith('h264')
}

function nativeAudio(audioFormats: readonly FormatOption[], preference: NativeAudioPreference): AudioSelection {
	const id = preferredNativeAudioId(audioFormats, preference)
	return id === null ? NO_AUDIO : {kind: 'native', formatId: id}
}

// Highest stream at or below the tier; else the smallest one above it.
function pickVideo(videos: readonly FormatOption[], tier: PlaylistVideoTier): FormatOption | undefined {
	if (tier === 'best') return videos[0]
	const limit = Number(tier)
	const atOrBelow = videos.find(f => videoHeight(f.resolution) <= limit)
	if (atOrBelow) return atOrBelow
	const smallest = Math.min(...videos.map(f => videoHeight(f.resolution)))
	return videos.find(f => videoHeight(f.resolution) === smallest)
}

function audioOnlySelection(profileAudio: {format: DownloadProfileAudioFormat; bitrateKbps?: AudioBitrate}, audioFormats: readonly FormatOption[], preference: NativeAudioPreference): AudioSelection {
	if (profileAudio.format === 'wav') return {kind: 'convert-lossless', target: 'wav'}
	if (profileAudio.format !== 'best') return {kind: 'convert-lossy', target: profileAudio.format, bitrateKbps: profileAudio.bitrateKbps ?? DEFAULT_AUDIO_BITRATE}
	// A source with no separable audio track can only give audio by converting
	// its muxed stream; "native" would land on the disabled "No audio" row.
	if (audioFormats.length === 0) return {kind: 'convert-lossy', target: 'mp3', bitrateKbps: DEFAULT_AUDIO_BITRATE}
	return nativeAudio(audioFormats, preference)
}

function resolveMedia(input: ProfileSelectionInput, notices: FitNotice[]): MediaSelection {
	const {profile, formats, nativeAudioPreference} = input
	const media = profile.media
	const videos = formats.filter(f => !f.isAudioOnly)
	const audioFormats = formats.filter(f => f.isAudioOnly)

	if (media.kind === 'subtitles-only') return {kind: 'subtitles', videoFormatId: '', audioSelection: NO_AUDIO}
	if (media.kind === 'audio-only') return {kind: 'audio', videoFormatId: '', audioSelection: audioOnlySelection(media.audio, audioFormats, nativeAudioPreference)}

	if (input.isAudioOnlySource || videos.length === 0) {
		notices.push({kind: 'no-video'})
		return {kind: 'audio', videoFormatId: '', audioSelection: audioOnlySelection({format: 'best'}, audioFormats, nativeAudioPreference)}
	}

	let candidates = videos
	if (media.codec === 'mp4') {
		const h264 = videos.filter(isH264)
		if (h264.length > 0) candidates = h264
		else notices.push({kind: 'mp4-unavailable'})
	}

	const tier = media.tiers[0] ?? 'best'
	const picked = pickVideo(candidates, tier)
	if (!picked) return {kind: 'video', videoFormatId: '', audioSelection: NO_AUDIO}
	const pickedHeight = videoHeight(picked.resolution)
	if (tier !== 'best' && pickedHeight !== Number(tier)) notices.push({kind: 'video-tier-fallback', wanted: tier, picked: pickedHeight})

	if (media.kind === 'video-only' || !picked.isVideoOnly) return {kind: 'video', videoFormatId: picked.formatId, audioSelection: NO_AUDIO}
	const m4a = audioFormats.filter(f => f.ext === 'm4a')
	const pool = media.audio.format === 'm4a' && m4a.length > 0 ? m4a : audioFormats
	return {kind: 'video', videoFormatId: picked.formatId, audioSelection: nativeAudio(pool, nativeAudioPreference)}
}

function baseLanguage(trackKey: string): string {
	return trackKey.endsWith(AUTO_CAPTION_SUFFIX) ? trackKey.slice(0, -AUTO_CAPTION_SUFFIX.length) : trackKey
}

function matchingKeys(code: string, map: SubtitleMap): string[] {
	return Object.keys(map).filter(key => matchesSubtitleLanguage(code, baseLanguage(key)))
}

function resolveSubtitles(input: ProfileSelectionInput, notices: FitNotice[]): string[] {
	const {profile, subtitles, automaticCaptions} = input
	const wanted = profile.media.kind === 'subtitles-only' || profile.subtitles.enabled ? profile.subtitles.languages : []
	const source = profile.subtitles.source
	const picked: string[] = []
	const missing: string[] = []
	for (const code of wanted) {
		const manual = source === 'auto-only' ? [] : matchingKeys(code, subtitles)
		const auto = source === 'manual-only' || manual.length > 0 ? [] : matchingKeys(code, automaticCaptions)
		const keys = [...manual, ...auto]
		if (keys.length === 0) missing.push(code)
		for (const key of keys) if (!picked.includes(key)) picked.push(key)
	}
	if (missing.length > 0) notices.push({kind: 'subtitle-languages-missing', languages: missing})
	return picked
}

export function resolveProfileSelection(input: ProfileSelectionInput): ProfileSelection {
	const notices: FitNotice[] = []
	const media = resolveMedia(input, notices)
	const subtitleLanguages = resolveSubtitles(input, notices)
	return {media, subtitleLanguages, notices}
}
