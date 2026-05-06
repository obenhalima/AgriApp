'use client'
import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

type ModulePlaceholderProps = {
  title: string
  description: string
}

export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Module en attente"
        icon={Construction}
        iconColor="#f59e0b"
        description="Ce module n'utilise plus de données de démonstration."
      />
      <Card animate variant="ghost" className="border-dashed">
        <div className="flex flex-col items-center text-center py-2xl gap-md">
          <div className="rounded-2xl flex items-center justify-center bg-warning/10 text-warning"
               style={{ width: 64, height: 64 }}>
            <Construction size={28} strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="font-display text-heading-lg text-fg-primary mb-2">Module en attente de branchement</h3>
            <p className="text-body-sm text-fg-tertiary max-w-md">{description}</p>
          </div>
          <p className="text-caption font-mono text-fg-tertiary uppercase tracking-wider">
            Les boutons d'action ont été neutralisés tant que le flux n'est pas implémenté.
          </p>
        </div>
      </Card>
    </div>
  )
}
