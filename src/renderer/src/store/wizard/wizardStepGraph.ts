import type {PlaylistSelection} from '@shared/types.js'
import {playlistSelectionProducesVideo} from '@shared/mediaIntent.js'
import {isYouTubeExtractor} from '@shared/ytdlp/extractorPredicates.js'
import {wizardStepNameSchema} from '@shared/schemas.js'
import type {WizardMode, WizardStep} from '../types.js'

export type VisibleWizardStep = Exclude<WizardStep, 'error'>
export type WizardStepDirection = 'forward' | 'backward'

export interface WizardStepGraphInput {
	wizardStep: WizardStep
	wizardMode: WizardMode
	playlistSelection: PlaylistSelection | null
	wizardExtractor: string
	multiProfileMode: boolean
}

export interface WizardStepGraph {
	current: WizardStep
	steps: VisibleWizardStep[]
	activeIndex: number
	isDownloadHome: boolean
	state: WizardStepGraphInput
}

// Derived from the shared step schema rather than hand-typed, so this list
// can't drift from WizardStep/WizardStepName. 'error' is the one step this
// graph never routes through (it has its own screen outside the graph).
export const WIZARD_STEPS: readonly VisibleWizardStep[] = wizardStepNameSchema.options.filter((step): step is VisibleWizardStep => step !== 'error')

function isBatchMode(mode: WizardMode): boolean {
	return mode === 'playlist' || mode === 'bulk'
}

function isMultiProfile(state: WizardStepGraphInput): boolean {
	return state.multiProfileMode && isBatchMode(state.wizardMode)
}

function stepApplies(step: VisibleWizardStep, state: WizardStepGraphInput): boolean {
	if (step === 'url') return true
	// A single video is two screens: Format (what to download) and Review
	// (everything else, as rows that open in place).
	if (!isBatchMode(state.wizardMode)) return step === 'formats' || step === 'confirm'
	if (step === 'formats') return false
	if (step === 'playlistItems') return true
	if (step === 'playlistProfiles') return isMultiProfile(state)
	// A profile carries media, subtitles, SponsorBlock, output and filename, so
	// every step that would collect them again is redundant in this mode.
	if (isMultiProfile(state) && step !== 'confirm') return false
	if (step === 'sponsorblock') {
		if (!isYouTubeExtractor(state.wizardExtractor)) return false
		return state.playlistSelection ? playlistSelectionProducesVideo(state.playlistSelection) : true
	}
	// Output collects embed/sidecar options for a media file; a subtitles
	// batch produces none.
	if (step === 'output') return state.playlistSelection?.kind !== 'subtitles'
	return true
}

export function buildWizardStepGraph(state: WizardStepGraphInput): WizardStepGraph {
	const steps = WIZARD_STEPS.filter(step => stepApplies(step, state))
	return {current: state.wizardStep, steps, activeIndex: state.wizardStep === 'error' ? -1 : steps.indexOf(state.wizardStep), isDownloadHome: state.wizardStep === 'url', state}
}

export function visibleWizardSteps(graph: WizardStepGraph): readonly VisibleWizardStep[] {
	return graph.steps
}

export function nextWizardStep(graph: WizardStepGraph, direction: WizardStepDirection): VisibleWizardStep | null {
	if (graph.current === 'error') return null
	const i = WIZARD_STEPS.indexOf(graph.current)
	if (i < 0) return null
	const delta = direction === 'forward' ? 1 : -1
	const visibleSteps = new Set(graph.steps)
	let cursor = i + delta
	while (cursor >= 0 && cursor < WIZARD_STEPS.length) {
		const step = WIZARD_STEPS[cursor]
		if (visibleSteps.has(step)) return step
		cursor += delta
	}
	return null
}
