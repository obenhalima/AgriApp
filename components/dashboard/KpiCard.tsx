type KpiCardProps = {
  label: string
  value: string
  sub?: string
  color?: 'tomato' | 'green' | 'blue' | 'amber' | 'purple' | 'red' | 'default'
  icon?: string
  progress?: number
}

const COLOR_MAP = {
  tomato: { top: '#e05c3b', text: '#f07050' },
  green: { top: '#3fb950', text: '#3fb950' },
  blue: { top: '#388bfd', text: '#388bfd' },
  amber: { top: '#d29922', text: '#d29922' },
  purple: { top: '#a371f7', text: '#a371f7' },
  red: { top: '#f85149', text: '#f85149' },
  default: { top: '#30363d', text: '#8b949e' },
}

export function KpiCard({ label, value, sub, color = 'default', icon, progress }: KpiCardProps) {
  const c = COLOR_MAP[color]

  return (
    <div className="kpi-card" style={{ borderTop: `2px solid ${c.top}` }}>
      {icon && (
        <div className="absolute right-4 top-4 text-3xl opacity-10">{icon}</div>
      )}
      <div className="text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="font-display text-2xl font-extrabold mb-1.5 leading-none">
        {value}
      </div>
      {sub && (
        <div className="text-xs text-[#8b949e]" style={{ color: sub.startsWith('▲') ? '#3fb950' : sub.startsWith('⚠') ? '#f85149' : undefined }}>
          {sub}
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 bg-[#232c3d] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(progress, 100)}%`,
              background: c.top,
            }}
          />
        </div>
      )}
    </div>
  )
}
