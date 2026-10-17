import {useState, type ReactNode} from 'react'
import {useTranslation} from 'react-i18next'
import {useShallow} from 'zustand/react/shallow'
import {downloadProfileRefFor, enabledDownloadProfiles} from '@shared/downloadProfiles.js'
import {WIZARD_MEDIA_KINDS, type WizardMediaKind} from '@shared/schemas.js'
import type {DownloadProfile} from '@shared/types.js'
import {useAppStore} from '../../../store/useAppStore.js'
import {wizardChangedAreas} from '../../../store/wizard/wizardProfileState.js'
import {Button} from '../../ui/button.js'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '../../ui/dialog.js'
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from '../../ui/select.js'
import {ToggleGroup, ToggleGroupItem} from '../../ui/toggle-group.js'

const KIND_LABEL_KEYS = {video: 'wizard.formats.kind.video', audio: 'wizard.formats.kind.audio', subtitles: 'wizard.formats.kind.subtitles'} as const satisfies Record<WizardMediaKind, string>

function isMediaKind(value: string | undefined): value is WizardMediaKind {
	return value !== undefined && (WIZARD_MEDIA_KINDS as readonly string[]).includes(value)
}

// "Pre-selected from <profile>" plus the Video / Audio / Subtitles switch.
// Picking another profile re-applies it to every setting, so it asks first
// when the user has changed something.
export function WizardProfileLine(): ReactNode {
	const {t} = useTranslation()
	const {profilesPrefs, wizardProfile, wizardMediaKind, hasVideo, hasAudio, hasSubtitles, hasEdits, setWizardMediaKind, chooseWizardProfile} = useAppStore(
		useShallow(state => ({
			profilesPrefs: state.settings?.profiles,
			wizardProfile: state.wizardProfile,
			wizardMediaKind: state.wizardMediaKind,
			hasVideo: !state.wizardIsAudioOnlySource && state.wizardFormats.some(f => !f.isAudioOnly),
			hasAudio: state.wizardFormats.length > 0,
			hasSubtitles: Object.keys(state.wizardSubtitles).length > 0 || Object.keys(state.wizardAutomaticCaptions).length > 0,
			hasEdits: wizardChangedAreas(state).length > 0,
			setWizardMediaKind: state.setWizardMediaKind,
			chooseWizardProfile: state.chooseWizardProfile
		}))
	)
	const [pending, setPending] = useState<DownloadProfile | null>(null)
	const profiles = enabledDownloadProfiles(profilesPrefs)
	// A profile turned off after this run started still shows as the current one.
	const options = wizardProfile && !profiles.some(profile => profile.id === wizardProfile.id) ? [wizardProfile, ...profiles] : profiles

	function apply(profile: DownloadProfile): void {
		chooseWizardProfile(downloadProfileRefFor(profile, profilesPrefs))
	}

	function pick(id: string | null): void {
		const profile = options.find(option => option.id === id)
		if (!profile || profile.id === wizardProfile?.id) return
		if (hasEdits) setPending(profile)
		else apply(profile)
	}

	const kindEnabled: Record<WizardMediaKind, boolean> = {video: hasVideo, audio: hasAudio, subtitles: hasSubtitles}

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="wizard-profile-line">
			<div className="flex min-w-0 items-center gap-2">
				<span className="text-sm text-muted-foreground">{t('wizard.formats.profile.preselected')}</span>
				<Select value={wizardProfile?.id ?? null} onValueChange={value => pick(value)}>
					<SelectTrigger size="sm" className="min-w-40 max-w-64" data-testid="wizard-profile-trigger" aria-label={t('wizard.formats.profile.preselected')}>
						<SelectValue>{() => wizardProfile?.name ?? ''}</SelectValue>
					</SelectTrigger>
					<SelectContent align="start">
						<SelectGroup>
							{options.map(profile => (
								<SelectItem key={profile.id} value={profile.id} data-testid={`wizard-profile-option-${profile.id}`}>
									{profile.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
			<ToggleGroup
				size="sm"
				variant="outline"
				value={[wizardMediaKind]}
				onValueChange={values => {
					const next = values[0]
					if (isMediaKind(next)) setWizardMediaKind(next)
				}}
				aria-label={t('wizard.formats.kind.label')}
				spacing={1}
				className="ms-auto flex-wrap"
				data-testid="wizard-media-kind"
			>
				{WIZARD_MEDIA_KINDS.map(kind => (
					<ToggleGroupItem key={kind} value={kind} disabled={!kindEnabled[kind]} data-testid={`wizard-media-kind-${kind}`}>
						{t(KIND_LABEL_KEYS[kind])}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			<Dialog open={pending !== null} onOpenChange={open => !open && setPending(null)}>
				<DialogContent data-testid="wizard-profile-switch-dialog">
					<DialogHeader>
						<DialogTitle>{t('wizard.formats.profile.switchTitle')}</DialogTitle>
						<DialogDescription>{t('wizard.formats.profile.switchBody')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setPending(null)}>
							{t('common.cancel')}
						</Button>
						<Button
							type="button"
							variant="glow"
							onClick={() => {
								if (pending) apply(pending)
								setPending(null)
							}}
						>
							{t('wizard.formats.profile.switchAction')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
