// A single-video interactive download starts from a download profile. This
// module is the pure bridge between the two: profile + probe → every wizard
// setting (the "baseline"), the wizard's current settings → which areas the
// user changed, and those settings → a profile to save. Kept I/O-free so the
// store slices only call it and `set()` the result.

import {resolveFilenameTemplate} from '@shared/downloadProfiles.js'
import {isH264, resolveProfileSelection, videoHeight, type FitNotice} from '@shared/profileSelection.js'
import {PLAYLIST_VIDEO_TIERS} from '@shared/schemas.js'
import type {AudioSelection, DownloadProfile, NativeAudioPreference, PlaylistVideoTier, SponsorBlockCategory, SponsorBlockMode, SubtitleFormat, SubtitleMode, WizardMediaKind} from '@shared/schemas.js'
import type {FormatOption, SubtitleMap} from '@shared/types.js'

export interface WizardSettingsSnapshot {
	mediaKind: WizardMediaKind
	videoFormatId: string
	audioSelection: AudioSelection
	subtitleLanguages: string[]
	subtitleMode: SubtitleMode
	subtitleFormat: SubtitleFormat
	sponsorBlockMode: SponsorBlockMode
	sponsorBlockCategories: SponsorBlockCategory[]
	embed: DownloadProfile['embed']
	outputDir: string
	subfolderEnabled: boolean
	subfolderName: string
	filenameTemplate: string
}

export interface ProfileApplicationInput {
	profile: DownloadProfile
	formats: readonly FormatOption[]
	subtitles: SubtitleMap
	automaticCaptions: SubtitleMap
	isAudioOnlySource: boolean
	nativeAudioPreference: NativeAudioPreference
	// Folder a `default`-output profile saves into: the global download folder.
	baseOutputDir: string
	globalFilenameTemplate: string | undefined
}

export function applyProfileToWizard(input: ProfileApplicationInput): {snapshot: WizardSettingsSnapshot; notices: FitNotice[]} {
	const {profile} = input
	const selection = resolveProfileSelection(input)
	const outputDir = profile.output.kind === 'fixed' ? profile.output.dir : input.baseOutputDir
	return {
		snapshot: {
			mediaKind: selection.media.kind,
			videoFormatId: selection.media.videoFormatId,
			audioSelection: selection.media.audioSelection,
			subtitleLanguages: selection.subtitleLanguages,
			subtitleMode: profile.subtitles.mode,
			subtitleFormat: profile.subtitles.format,
			sponsorBlockMode: profile.sponsorBlock.mode,
			sponsorBlockCategories: [...profile.sponsorBlock.categories],
			embed: {...profile.embed},
			outputDir,
			subfolderEnabled: profile.subfolder.enabled,
			subfolderName: profile.subfolder.name,
			filenameTemplate: resolveFilenameTemplate(profile, input.globalFilenameTemplate)
		},
		notices: selection.notices
	}
}

// The Review screen's rows, in screen order. `format` covers the Format screen.
export type ChangedArea = 'format' | 'subtitles' | 'sponsorBlock' | 'extras' | 'saveTo' | 'fileName'
export type ReviewRow = Exclude<ChangedArea, 'format'>

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
	return a.length === b.length && a.every(item => b.includes(item))
}

function sameAudio(a: AudioSelection, b: AudioSelection): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

export function changedFromProfile(baseline: WizardSettingsSnapshot, current: WizardSettingsSnapshot): ChangedArea[] {
	const changed: ChangedArea[] = []
	if (baseline.mediaKind !== current.mediaKind || baseline.videoFormatId !== current.videoFormatId || !sameAudio(baseline.audioSelection, current.audioSelection)) changed.push('format')
	if (!sameSet(baseline.subtitleLanguages, current.subtitleLanguages) || baseline.subtitleMode !== current.subtitleMode || baseline.subtitleFormat !== current.subtitleFormat) changed.push('subtitles')
	if (baseline.sponsorBlockMode !== current.sponsorBlockMode || !sameSet(baseline.sponsorBlockCategories, current.sponsorBlockCategories)) changed.push('sponsorBlock')
	if (JSON.stringify(baseline.embed) !== JSON.stringify(current.embed)) changed.push('extras')
	if (baseline.outputDir !== current.outputDir || baseline.subfolderEnabled !== current.subfolderEnabled || baseline.subfolderName !== current.subfolderName) changed.push('saveTo')
	if (baseline.filenameTemplate !== current.filenameTemplate) changed.push('fileName')
	return changed
}

export interface SaveProfileContext {
	id: string
	name: string
	now: string
	defaultOutputDir: string
	globalFilenameTemplate: string | undefined
}

const NUMERIC_TIERS = PLAYLIST_VIDEO_TIERS.filter((tier): tier is Exclude<PlaylistVideoTier, 'best'> => tier !== 'best')

function tierFor(video: FormatOption, formats: readonly FormatOption[]): PlaylistVideoTier {
	if (formats.find(f => !f.isAudioOnly)?.formatId === video.formatId) return 'best'
	const height = videoHeight(video.resolution)
	return NUMERIC_TIERS.find(tier => Number(tier) <= height) ?? '144'
}

function audioOnlyMedia(selection: AudioSelection): Extract<DownloadProfile['media'], {kind: 'audio-only'}> {
	if (selection.kind === 'convert-lossy') return {kind: 'audio-only', audio: {format: selection.target, bitrateKbps: selection.bitrateKbps}}
	if (selection.kind === 'convert-lossless') return {kind: 'audio-only', audio: {format: 'wav'}}
	return {kind: 'audio-only', audio: {format: 'best'}}
}

function mediaFromWizard(base: DownloadProfile, snapshot: WizardSettingsSnapshot, formats: readonly FormatOption[]): DownloadProfile['media'] {
	if (snapshot.mediaKind === 'subtitles') return {kind: 'subtitles-only'}
	if (snapshot.mediaKind === 'audio') return audioOnlyMedia(snapshot.audioSelection)
	const video = formats.find(f => f.formatId === snapshot.videoFormatId)
	if (!video) return base.media
	const baseCodec = base.media.kind === 'video-audio' || base.media.kind === 'video-only' ? base.media.codec : 'best'
	const codec = baseCodec === 'mp4' && isH264(video) ? 'mp4' : 'best'
	const tiers = [tierFor(video, formats)]
	if (snapshot.audioSelection.kind === 'none' && video.isVideoOnly) return {kind: 'video-only', codec, tiers}
	const audioId = snapshot.audioSelection.kind === 'native' ? snapshot.audioSelection.formatId : null
	const pickedM4a = audioId !== null && formats.find(f => f.formatId === audioId)?.ext === 'm4a'
	const baseM4a = base.media.kind === 'video-audio' && base.media.audio.format === 'm4a'
	return {kind: 'video-audio', codec, tiers, audio: {format: baseM4a && pickedM4a ? 'm4a' : 'best'}}
}

function baseLanguageCode(trackKey: string): string {
	return trackKey.endsWith('-orig') ? trackKey.slice(0, -'-orig'.length) : trackKey
}

export function profileFromWizard(base: DownloadProfile, snapshot: WizardSettingsSnapshot, formats: readonly FormatOption[], context: SaveProfileContext): DownloadProfile {
	const languages = [...new Set(snapshot.subtitleLanguages.map(baseLanguageCode))]
	const pickedAuto = snapshot.subtitleLanguages.some(key => key.endsWith('-orig'))
	const source = pickedAuto && base.subtitles.source === 'manual-only' ? 'manual-first' : base.subtitles.source
	const defaultTemplate = resolveFilenameTemplate(undefined, context.globalFilenameTemplate)
	return {
		id: context.id,
		name: context.name,
		icon: base.icon,
		enabled: true,
		media: mediaFromWizard(base, snapshot, formats),
		subtitles: {enabled: languages.length > 0, languages, source, mode: snapshot.subtitleMode, format: snapshot.subtitleFormat},
		sponsorBlock: {mode: snapshot.sponsorBlockMode, categories: [...snapshot.sponsorBlockCategories]},
		embed: {...snapshot.embed},
		output: snapshot.outputDir === context.defaultOutputDir ? {kind: 'default'} : {kind: 'fixed', dir: snapshot.outputDir},
		filename: snapshot.filenameTemplate === defaultTemplate ? {kind: 'default'} : {kind: 'custom', template: snapshot.filenameTemplate},
		subfolder: {enabled: snapshot.subfolderEnabled, name: snapshot.subfolderName},
		createdAt: context.now,
		updatedAt: context.now
	}
}
