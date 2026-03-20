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
        sans: ['DM Sans', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      },
      colors: {
        bg: {
          0: '#0d1117',
          1: '#161b22',
          2: '#1c2333',
          3: '#232c3d',
        },
        border: '#30363d',
        tomato: {
          DEFAULT: '#e05c3b',
          light: '#f07050',
          dim: '#3d1a0d',
        },
        accent: {
          green: '#3fb950',
          blue: '#388bfd',
          amber: '#d29922',
          purple: '#a371f7',
          red: '#f85149',
        }
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
export default config
