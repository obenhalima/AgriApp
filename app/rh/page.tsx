'use client'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {usesFortnightPayroll} from '@/lib/hrWorkflow'
import StandardRhDashboard from '@/components/rh/StandardRhDashboard'
import FortnightRhDashboard from '@/components/rh/FortnightRhDashboard'

export default function RHPage() {
  const {activeDomain} = useAuth()
  const {t} = useLanguage()
  if (!activeDomain) return <p>{t('Sélectionnez un client')}</p>
  if (!usesFortnightPayroll(activeDomain.domain_code)) return <StandardRhDashboard key={activeDomain.domain_id}/>
  return <FortnightRhDashboard key={activeDomain.domain_id} domain={activeDomain.domain_id} client={activeDomain.domain_code}/>
}
