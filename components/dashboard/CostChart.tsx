'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

const PROD_DATA = [
  { sem: 'S35', prev: 42, reel: 38 }, { sem: 'S36', prev: 48, reel: 45 },
  { sem: 'S37', prev: 55, reel: 52 }, { sem: 'S38', prev: 62, reel: 59 },
  { sem: 'S39', prev: 70, reel: 68 }, { sem: 'S40', prev: 75, reel: 73 },
  { sem: 'S41', prev: 82, reel: 79 }, { sem: 'S42', prev: 78, reel: 72 },
  { sem: 'S43', prev: 71, reel: 69 }, { sem: 'S44', prev: 68, reel: 65 },
  { sem: 'S45', prev: 64 }, { sem: 'S46', prev: 58 }, { sem: 'S47', prev: 50 },
]

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#faf6ed', border: '1px solid #d8c9a8',
    borderRadius: 10, fontSize: 12, color: '#2c1f0e',
    boxShadow: '0 4px 12px rgba(44,31,14,0.12)'
  },
  labelStyle: { color: '#2c1f0e', fontWeight: 700 }
}

export function ProductionChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={PROD_DATA}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8d9b8" />
        <XAxis dataKey="sem" tick={{ fill: '#9b8a6e', fontSize: 10 }} />
        <YAxis tick={{ fill: '#9b8a6e', fontSize: 10 }} unit="t" />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#6b5a3e' }} />
        <Line type="monotone" dataKey="prev" name="Prévisionnelle" stroke="#c8882a" strokeDasharray="5 4" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="reel" name="Réelle" stroke="#5a7a35" strokeWidth={2.5} dot={{ r: 3, fill: '#5a7a35' }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

const COST_DATA = [
  { cat: 'Semences', prev: 245, reel: 238 }, { cat: 'Engrais', prev: 380, reel: 412 },
  { cat: 'Phyto', prev: 185, reel: 178 },   { cat: 'Irrigation', prev: 210, reel: 198 },
  { cat: 'Énergie', prev: 320, reel: 345 },  { cat: 'M.O.', prev: 850, reel: 780 },
  { cat: 'Emballage', prev: 620, reel: 590 },{ cat: 'Transport', prev: 290, reel: 268 },
]

export function CostChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={COST_DATA} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8d9b8" />
        <XAxis dataKey="cat" tick={{ fill: '#9b8a6e', fontSize: 9 }} />
        <YAxis tick={{ fill: '#9b8a6e', fontSize: 10 }} unit="k" />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}k MAD`]} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#6b5a3e' }} />
        <Bar dataKey="prev" name="Prévu" fill="#a8c96a" radius={[4,4,0,0]} />
        <Bar dataKey="reel" name="Réel" radius={[4,4,0,0]}
          fill="transparent"
          label={false}
        >
          {COST_DATA.map((entry, i) => (
            <Cell key={i} fill={entry.reel > entry.prev ? '#c04a25' : '#5a7a35'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

const MARKET_DATA = [
  { name: 'Marché Local',    value: 28, color: '#7aab45' },
  { name: 'Grande Distrib.', value: 18, color: '#4a8ab0' },
  { name: 'Export France',   value: 32, color: '#d94535' },
  { name: 'Export Espagne',  value: 14, color: '#c8882a' },
  { name: 'Export UK',       value: 8,  color: '#5a7a35' },
]

export function MarketPieChart() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={MARKET_DATA} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" paddingAngle={3}>
          {MARKET_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`]} />
        <Legend formatter={(value) => <span style={{ color: '#6b5a3e', fontSize: 11 }}>{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  )
}
