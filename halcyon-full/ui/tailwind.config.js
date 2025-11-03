/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f1115',
        panel: '#141821',
        accent: '#0ea5a5',
        muted: '#a2a8b0'
      }
    }
  },
  plugins: []
}
