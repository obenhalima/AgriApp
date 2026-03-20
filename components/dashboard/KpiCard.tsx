type KpiCardProps = {
  label: string
  value: string
  sub?: string
  color?: 'tomato' | 'green' | 'amber' | 'blue' | 'leaf' | 'rust' | 'neutral'
  icon?: string
  progress?: number
}

const SUB_COLOR: Record<string, string> = {
  tomato: '#d94535', green: '#5a7a35', amber: '#c8882a',
  blue: '#4a8ab0', leaf: '#7aab45', rust: '#c04a25', neutral: '#9b8a6e'
}

export function KpiCard({ label, value, sub, color = 'neutral', icon, progress }: KpiCardProps) {
  const c = SUB_COLOR[color]
  return (
    <div className={`kpi-card kpi-${color}`}>
      {icon && (
        <div className="absolute right-4 top-4 text-3xl opacity-15">{icon}</div>
      )}
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mb-1.5 leading-none" style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: 24, fontWeight: 700, color: 'var(--text-main)'
      }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{
          color: sub.startsWith('▲') ? 'var(--leaf)' : sub.startsWith('⚠') ? 'var(--rust)' : 'var(--text-sub)'
        }}>
          {sub}
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sand)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(progress, 100)}%`, background: c }} />
        </div>
      )}
    </div>
  )
}
