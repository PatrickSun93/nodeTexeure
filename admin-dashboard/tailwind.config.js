const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Champagne brand palette. Values live in CSS custom properties
      // (src/app/globals.css) so a theme can redefine them in one place.
      colors: {
        brand: {
          DEFAULT: 'var(--admin-brand)',
          hover: 'var(--admin-brand-hover)',
          deep: 'var(--admin-brand-deep)',
          muted: 'var(--admin-brand-muted)',
          soft: 'var(--admin-brand-soft)',
          'soft-hover': 'var(--admin-brand-soft-hover)',
          softer: 'var(--admin-brand-softer)',
          border: 'var(--admin-brand-border)',
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;