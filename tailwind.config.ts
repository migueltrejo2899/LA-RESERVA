import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#EFE6D6',
        kraft: '#DDCBB3',
        ink: '#2C2D31',
        inksoft: '#5B5C60',
        crate: '#676F36',
        cratedark: '#4E5527',
        stamp: '#C2492A',
        azul: '#626F77',
        lila: '#A57F9B',
        line: '#CBBFA4',
        offwhite: '#FBF9F3',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        subtitle: ['var(--font-subtitle)'],
        body: ['var(--font-body)'],
        accent: ['var(--font-accent)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}
export default config
