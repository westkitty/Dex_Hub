/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080d1c",
        accent: {
          primary: "#38bdf8",
          secondary: "#f97316",
        },
      },
      animation: {
        'status-pulse': 'status-pulse 1.5s ease-in-out infinite',
        'fade-in':      'fadeIn      0.20s ease both',
        'scale-in':     'scaleIn     0.22s ease both',
        'slide-up':     'fadeSlideUp 0.24s ease both',
        'slide-left':   'slideInLeft 0.20s ease both',
        'pin-glow':     'pin-glow    2.0s ease-in-out infinite',
      },
      keyframes: {
        'status-pulse': {
          '0%, 100%': { opacity: '1'   },
          '50%':       { opacity: '0.3' },
        },
        'fadeIn': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'scaleIn': {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to:   { opacity: '1', transform: 'scale(1)'    },
        },
        'fadeSlideUp': {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)'       },
        },
        'slideInLeft': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)'    },
        },
        'pin-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(56, 189, 248, 0)'   },
          '50%':       { boxShadow: '0 0 8px 2px rgba(56, 189, 248, 0.4)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
