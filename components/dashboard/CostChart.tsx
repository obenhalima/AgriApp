'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COST_DATA = [
  { cat: 'Semences', prev: 245, reel: 238 }, { cat: 'Engrais', prev: 380, reel: 412 },
  { cat: 'Phyto', prev: 185, reel: 178 }, { cat: 'Irrigation', prev: 210, reel: 198 },
  { cat: 'Énergie', prev: 320, reel: 345 }, { cat: 'M.O.', prev: 850, reel: 780 },
  { cat: 'Emballage', prev: 620, reel: 590 }, { cat: 'Transport', prev: 290, reel: 268 },
]

export function CostChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={COST_DATA}>
        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
        <XAxis dataKey="cat" tick={{ fill: '#8b949e', fontSize: 9 }} />
        <YAxis tick={{ fill: '#8b949e', fontSize: 10 }} unit="k" />
        <Tooltip
          contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [`${v}k MAD`]}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
        <Bar dataKey="prev" name="Prévu" fill="rgba(56,139,253,0.5)" radius={[3,3,0,0]} />
        <Bar dataKey="reel" name="Réel" radius={[3,3,0,0]}
          fill="#e05c3b"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

const MARKET_DATA = [
  { name: 'Local Souss', value: 28, color: '#3fb950' },
  { name: 'Grande Distrib.', value: 18, color: '#388bfd' },
  { name: 'Export France', value: 32, color: '#e05c3b' },
  { name: 'Export Espagne', value: 14, color: '#a371f7' },
  { name: 'Export UK', value: 8, color: '#d29922' },
]

export function MarketPieChart() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={MARKET_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
          {MARKET_DATA.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [`${v}%`]}
        />
        <Legend
          formatter={(value) => <span style={{ color: '#8b949e', fontSize: 11 }}>{value}</span>}
          wrapperStyle={{ fontSize: 11 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
