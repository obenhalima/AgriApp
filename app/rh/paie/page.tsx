'use client'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {usesFortnightPayroll} from '@/lib/hrWorkflow'
import StandardPayroll from '@/components/rh/StandardPayroll'
import PayrollPreparation from './preparation/page'

export default function PayrollPage() {
  const {activeDomain} = useAuth()
  const {t} = useLanguage()
  if (!activeDomain) return <p role="status">{t('Sélectionnez un client')}</p>
  return usesFortnightPayroll(activeDomain.domain_code) ? <PayrollPreparation key={activeDomain.domain_id}/> : <StandardPayroll key={activeDomain.domain_id}/>
}
