/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b0e14', // Deep Charcoal
        card: '#11141b', // Slightly lighter for contrast
        accent: {
          green: '#22c55e', // Neon Green (Safe)
          blue: '#3b82f6',  // Electric Blue (Traffic)
          red: '#ef4444',   // Crimson Red (Threat)
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
