'use client'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {usesFortnightPayroll} from '@/lib/hrWorkflow'
import FortnightAttendance from '@/components/rh/FortnightAttendance'
import TaskAttendance from './taches/page'

export default function AttendancePage() {
  const {activeDomain} = useAuth()
  const {t} = useLanguage()
  if (!activeDomain) return <p role="status">{t('Sélectionnez un client')}</p>
  return usesFortnightPayroll(activeDomain.domain_code) ? <FortnightAttendance key={activeDomain.domain_id}/> : <TaskAttendance key={activeDomain.domain_id}/>
}
