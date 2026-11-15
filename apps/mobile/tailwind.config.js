const { FONT } = require("./src/lib/fonts.config");

const hsl = (name) => `hsl(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        background: hsl("background"),
        foreground: hsl("foreground"),
        primary: { DEFAULT: hsl("primary"), foreground: hsl("primary-foreground") },
        secondary: { DEFAULT: hsl("secondary"), foreground: hsl("secondary-foreground") },
        destructive: { DEFAULT: hsl("destructive"), foreground: hsl("primary-foreground") },
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        accent: { DEFAULT: hsl("accent"), foreground: hsl("accent-foreground") },
        popover: { DEFAULT: hsl("popover"), foreground: hsl("popover-foreground") },
        card: { DEFAULT: hsl("card"), foreground: hsl("card-foreground") },
        chart: {
          1: hsl("chart-1"),
          2: hsl("chart-2"),
          3: hsl("chart-3"),
          4: hsl("chart-4"),
          5: hsl("chart-5"),
        },
      },
      // React Native has no font fallback list and won't pick a bold file from
      // `font-bold` — each weight is its own family. `<Text>` (components/ui/text.tsx)
      // swaps sans/heading → the *-bold family for weight ≥ 500, same rule as web.
      fontFamily: {
        sans: [FONT.sans],
        "sans-bold": [FONT.sansBold],
        heading: [FONT.heading],
        "heading-bold": [FONT.headingBold],
        "sans-ja": [FONT.sansJa],
        "sans-ja-bold": [FONT.sansJaBold],
        "heading-ja": [FONT.headingJa],
        "heading-ja-bold": [FONT.headingJaBold],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
