'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LanguageSwitcher, useLanguage } from '@/lib/i18n'
import { BRAND } from '@/lib/brand'
import { motion } from 'framer-motion'
import { Leaf, AlertCircle, LogIn } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input as TInput, Field } from '@/components/ui/Input'

export default function LoginPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { t } = useLanguage()
  const router = useRouter()
  const { user, signIn, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && user) router.replace(new URLSearchParams(window.location.search).get('next') === 'validations' ? '/validations' : '/')
  }, [user, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true); setError('')
    try {
      await signIn(email, password)
      router.replace(new URLSearchParams(window.location.search).get('next') === 'validations' ? '/validations' : '/')
    } catch (err: any) {
      setError(err?.message?.includes('Invalid') ? t('Email ou mot de passe incorrect') : (err?.message ?? t('Erreur de connexion')))
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-surface-sunk flex items-center justify-center p-lg relative overflow-hidden">
      {/* Halos décoratifs */}
      <div aria-hidden className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--neon), transparent 70%)' }} />
      <div aria-hidden className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #d4a72c, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-full max-w-[1080px] relative z-10 grid lg:grid-cols-[1.3fr_1fr] rounded-3xl overflow-hidden border border-border shadow-2xl bg-white"
      >
        <section aria-label="ItriX Agri Intelligence" className="flex flex-col bg-[#f7faf4]">
          <div className="px-6 py-6 sm:px-10 sm:py-10">
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1.8 / 1' }}>
              {/* Le cadrage retire visuellement les marges blanches, sans modifier le logo fourni. */}
              <img src="/itrix-logo.png" alt="ITRIX Agri Intelligence — Des données à de meilleurs horizons" className="absolute max-w-none" style={{ width: '150%', left: '-25%', top: '-35%' }} />
            </div>
          </div>
          <div className="relative flex-1 bg-[#073c2c] px-7 py-8 sm:px-10 sm:py-10 text-white">
            <div className="flex items-center gap-2 text-[#d8bd71] text-xs font-semibold tracking-[0.18em] uppercase"><Leaf size={16} /> {BRAND.name}</div>
            <h1 className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{t('Votre exploitation.')}<br />{t('Une vision claire.')}</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/75">{t('De la serre à la performance, rassemblez vos données pour piloter votre activité agricole.')}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/85">
              {['Production', 'Traçabilité', 'Coûts & performance'].map(label => <span key={label} className="rounded-full border border-white/20 px-3 py-2">{t(label)}</span>)}
            </div>
            <p className="mt-8 text-xs text-white/55">{BRAND.company}</p>
          </div>
        </section>
        <Card variant="flat" className="p-7 sm:p-10 !rounded-none !border-0 flex flex-col justify-center">
          <div className="mb-7">
            <div className="mb-5 flex justify-end"><LanguageSwitcher /></div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">{t('Bienvenue sur')} {BRAND.name}</p>
            <h2 className="mt-3 font-display text-2xl font-bold text-fg-primary">{t('Connectez-vous à votre espace')}</h2>
            <p className="mt-2 text-sm text-fg-tertiary">{t('Retrouvez votre exploitation et vos indicateurs.')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-md">
            <Field label={t('Email')}>
              <TInput type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={_ui("vous@exploitation.ma")} required autoFocus />
            </Field>
            <Field label={t('Mot de passe')}>
              <TInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required />
            </Field>
            <div className="text-right"><Link href="/forgot-password" className="text-caption font-semibold text-brand hover:underline">{t('Mot de passe oublié ?')}</Link></div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm flex items-center gap-2"
              >
                <AlertCircle size={14} /> {_uiNode(error)}
              </motion.div>
            )}

            <Button type="submit" loading={loading} disabled={!email || !password} variant="primary" size="lg" className="w-full">
              <LogIn size={14} strokeWidth={2.5} /> {t('Se connecter')}
            </Button>
          </form>

          <div className="mt-lg rounded-md bg-surface-sunk border border-border p-md text-caption text-fg-tertiary leading-relaxed">
            {t('Pas encore de compte ? Contactez votre administrateur pour recevoir une invitation.')}
          </div>
          <p className="mt-lg text-center text-caption text-fg-tertiary">{BRAND.signature}</p>
        </Card>
      </motion.div>
    </div>
  )
}
