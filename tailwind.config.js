/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bank: {
          50: '#eef4fb',
          100: '#d6e5f6',
          200: '#adc9ec',
          300: '#7fa9df',
          400: '#4d84cd',
          500: '#2d64b3',
          600: '#1f4d92',
          700: '#1a3f78',
          800: '#173561',
          900: '#122850',
          950: '#0b1a35',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
}
