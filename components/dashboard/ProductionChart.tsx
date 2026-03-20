'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const DATA = [
  { sem: 'S35', prev: 42, reel: 38 }, { sem: 'S36', prev: 48, reel: 45 },
  { sem: 'S37', prev: 55, reel: 52 }, { sem: 'S38', prev: 62, reel: 59 },
  { sem: 'S39', prev: 70, reel: 68 }, { sem: 'S40', prev: 75, reel: 73 },
  { sem: 'S41', prev: 82, reel: 79 }, { sem: 'S42', prev: 78, reel: 72 },
  { sem: 'S43', prev: 71, reel: 69 }, { sem: 'S44', prev: 68, reel: 65 },
  { sem: 'S45', prev: 64, reel: null }, { sem: 'S46', prev: 58, reel: null },
  { sem: 'S47', prev: 50, reel: null }, { sem: 'S48', prev: 44, reel: null },
]

export function ProductionChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={DATA}>
        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
        <XAxis dataKey="sem" tick={{ fill: '#8b949e', fontSize: 10 }} />
        <YAxis tick={{ fill: '#8b949e', fontSize: 10 }} unit="t" />
        <Tooltip
          contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#e6edf3' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
        <Line type="monotone" dataKey="prev" name="Prévisionnelle" stroke="#388bfd" strokeDasharray="5 4" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="reel" name="Réelle" stroke="#e05c3b" strokeWidth={2.5} dot={{ r: 3, fill: '#e05c3b' }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
