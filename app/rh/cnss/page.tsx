'use client'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import SocialContributionPayments from '@/components/rh/SocialContributionPayments'

export default function CNSSPage() {
  const {activeDomain} = useAuth()
  const {t} = useLanguage()
  return activeDomain ? <SocialContributionPayments key={activeDomain.domain_id} domain={activeDomain.domain_id} client={activeDomain.domain_code}/> : <p>{t('Sélectionnez un client')}</p>
}
