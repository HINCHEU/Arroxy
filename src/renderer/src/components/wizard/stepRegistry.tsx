import {createElement, lazy, type ReactNode} from 'react'
import {WIZARD_STEPS, type VisibleWizardStep} from '../../store/wizard/wizardStepGraph.js'
import {StepUrlInput} from './StepUrlInput.js'
import {ConfirmOrReview} from './ConfirmOrReview.js'

const lazySteps = {
	folder: lazy(() => import('./StepFolderConfirm.js').then(module => ({default: module.StepFolderConfirm}))),
	formats: lazy(() => import('./StepFormatSelect.js').then(module => ({default: module.StepFormatSelect}))),
	output: lazy(() => import('./StepOutput.js').then(module => ({default: module.StepOutput}))),
	playlistItems: lazy(() => import('./StepPlaylistItems.js').then(module => ({default: module.StepPlaylistItems}))),
	playlistPresets: lazy(() => import('./StepPlaylistPresets.js').then(module => ({default: module.StepPlaylistPresets}))),
	playlistProfiles: lazy(() => import('./StepPlaylistProfiles.js').then(module => ({default: module.StepPlaylistProfiles}))),
	sponsorblock: lazy(() => import('./StepSponsorBlock.js').then(module => ({default: module.StepSponsorBlock})))
}

export interface StepDescriptor {
	id: VisibleWizardStep
	render(): ReactNode
}

const RENDER_BY_STEP: Record<VisibleWizardStep, () => ReactNode> = {
	url: () => <StepUrlInput />,
	playlistItems: () => createElement(lazySteps.playlistItems),
	playlistPresets: () => createElement(lazySteps.playlistPresets),
	playlistProfiles: () => createElement(lazySteps.playlistProfiles),
	formats: () => createElement(lazySteps.formats),
	sponsorblock: () => createElement(lazySteps.sponsorblock),
	output: () => createElement(lazySteps.output),
	folder: () => createElement(lazySteps.folder),
	// A single video's last step is Review; a batch keeps its Confirm.
	confirm: () => <ConfirmOrReview />
}

export const STEP_REGISTRY: StepDescriptor[] = WIZARD_STEPS.map(id => ({id, render: RENDER_BY_STEP[id]}))
