import { ImageResponse } from 'next/og'
export const runtime = 'edge'
export function GET(_request: Request, { params }: { params: { icon: string } }) {
  const size = params.icon === 'icon-512.png' ? 512 : params.icon === 'apple.png' ? 180 : 192
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#166534', color: 'white', fontSize: size * .38, fontWeight: 800 }}>FP</div>, { width: size, height: size })
}
