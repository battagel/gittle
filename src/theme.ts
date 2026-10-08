// Colours and fonts the canvas needs as JS values. Keep in sync with the @theme block in index.css.
export const colours = {
  paper: '#fbfaf7',
  surface: '#ffffff',
  ink: '#1f2328',
  muted: '#8a8f98',
  line: '#ebe8e1',
  neutral: '#c3c7ce', // commits on no branch (detached, tag-only, deleted branches)
}

export const branchPalette = [
  '#5b6cf0', // indigo (main)
  '#ff6b6b', // coral
  '#34c9a0', // mint
  '#ffb020', // amber
  '#3ba7f5', // sky
  '#9b6cf0', // violet
  '#14b8b8', // teal
  '#9bd13a', // lime
]

export const fonts = {
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
}

export const difficultyColour = {
  easy: 'mint',
  medium: 'amber',
  pro: 'coral',
} as const

export type Difficulty = keyof typeof difficultyColour
