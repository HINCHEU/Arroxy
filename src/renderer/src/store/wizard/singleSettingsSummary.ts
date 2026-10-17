// One-line values for everything the single-video Review holds, shared by the
// Format screen's summary line and the Review rows' collapsed values.

import {isYouTubeExtractor} from '@shared/ytdlp/extractorPredicates.js'
import {formatHomeRelativePath} from '@renderer/lib/utils.js'
import {effectiveOutputDir} from '@renderer/lib/path.js'
import {resolveSubtitleLabel, SUBTITLE_MODE_I18N_KEYS} from '../../lib/subtitleLabel.js'
import type {AppState} from '../types.js'

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface SingleSettingsSummary {
	subtitles: string
	subtitlesOn: boolean
	subtitlesAvailable: number
	// Null when SponsorBlock doesn't apply (not YouTube, or nothing with video).
	sponsorBlock: string | null
	extras: string
	saveTo: string
	fileName: string
}

const EXTRA_LABEL_KEYS = [
	['wizardEmbedChapters', 'wizard.output.embedChapters.label'],
	['wizardEmbedMetadata', 'wizard.output.embedMetadata.label'],
	['wizardEmbedThumbnail', 'wizard.output.embedThumbnail.label'],
	['wizardWriteDescription', 'wizard.output.writeDescription.label'],
	['wizardWriteThumbnail', 'wizard.output.writeThumbnail.label']
] as const

export function sponsorBlockApplies(state: Pick<AppState, 'wizardExtractor' | 'wizardMediaKind'>): boolean {
	return isYouTubeExtractor(state.wizardExtractor) && state.wizardMediaKind === 'video'
}

export function buildSingleSettingsSummary(state: AppState, ctx: {t: Translate; language: string}): SingleSettingsSummary {
	const {t} = ctx
	const languages = state.wizardSubtitleLanguages
	const subtitlesAvailable = Object.keys(state.wizardSubtitles).length + Object.keys(state.wizardAutomaticCaptions).filter(code => !state.wizardSubtitles[code]).length
	const subtitles =
		languages.length === 0
			? t('wizard.review.value.subtitlesOff')
			: [languages.map(code => resolveSubtitleLabel(code, state.wizardSubtitles, state.wizardAutomaticCaptions, ctx.language)).join(', '), state.wizardSubtitleMode === 'embed' ? null : state.wizardSubtitleFormat.toUpperCase(), t(SUBTITLE_MODE_I18N_KEYS[state.wizardSubtitleMode])].filter(Boolean).join(' · ')
	const sponsorBlock = sponsorBlockApplies(state) ? (state.wizardSponsorBlockMode === 'off' ? t('wizard.review.value.sponsorBlockOff') : t(`wizard.sponsorblock.mode.${state.wizardSponsorBlockMode}`)) : null
	const extras = EXTRA_LABEL_KEYS.filter(([field]) => state[field]).map(([, key]) => t(key))
	const saveTo = formatHomeRelativePath(effectiveOutputDir(state.wizardOutputDir, state.wizardSubfolderEnabled, state.wizardSubfolderName), state.commonPaths)
	return {subtitles, subtitlesOn: languages.length > 0, subtitlesAvailable, sponsorBlock, extras: extras.length > 0 ? extras.join(', ') : t('wizard.review.value.extrasNone'), saveTo, fileName: state.wizardFilenameTemplate}
}
