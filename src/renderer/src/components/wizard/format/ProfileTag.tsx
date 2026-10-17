import type {ReactNode} from 'react'
import {useTranslation} from 'react-i18next'
import {Badge} from '../../ui/badge.js'

// Marks the stream the download profile picked for this video.
// `closest`: the video can't honour the profile, and this is the nearest stream.
export function ProfileTag({closest = false}: {closest?: boolean}): ReactNode {
	const {t} = useTranslation()
	return (
		<Badge variant="secondary" size="sm" className="shrink-0" data-testid="profile-pick-tag">
			{closest ? t('wizard.formats.profile.closestTag') : t('wizard.formats.profile.tag')}
		</Badge>
	)
}
