import {lazy, type ReactNode} from 'react'
import {useAppStore} from '../../store/useAppStore.js'

const StepConfirm = lazy(() => import('./StepConfirm.js').then(module => ({default: module.StepConfirm})))
const StepReview = lazy(() => import('./StepReview.js').then(module => ({default: module.StepReview})))

// The last wizard step: a single video's Review (rows that open in place), or
// a batch's Confirm.
export function ConfirmOrReview(): ReactNode {
	const single = useAppStore(state => state.wizardMode === 'single')
	return single ? <StepReview /> : <StepConfirm />
}
