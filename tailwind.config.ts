import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
      colors: {
        soil:   '#2c1f0e',
        bark:   '#3d2b14',
        moss:   '#4a5a2a',
        leaf:   '#5a7a35',
        sprout: '#7aab45',
        lime:   '#a8c96a',
        straw:  '#f5e6c0',
        cream:  '#faf6ed',
        sand:   '#e8d9b8',
        ochre:  '#c8882a',
        tomato: '#d94535',
        rust:   '#c04a25',
        sky:    '#4a8ab0',
      },
    },
  },
  plugins: [],
}
export default config
