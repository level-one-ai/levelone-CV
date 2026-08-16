import type { Config } from "tailwindcss";

/**
 * Level One Design System — carried over from the proposal engine so both
 * tools read as the same product: a warm off-white canvas, near-black
 * typography, and muted neutral borders. No accent color.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#faf9f6",
        surface: "#ffffff",
        cream: "#faf9f6",
        // NOTE: never name a color "base" here — it would shadow Tailwind's
        // `text-base` font-size utility and compile it to `color: white`.
        canvas: {
          DEFAULT: "#faf9f6",
          deep: "#f1efe9",
        },
        ink: {
          DEFAULT: "#111110",
          soft: "#111110",
        },
        foreground: "#111110",
        muted: "#6b6a66",
        line: "#e8e6e0",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      fontSize: {
        // Fluid typography — scales cleanly from Galaxy Fold cover
        // screens (~280px) up to wide desktop without breakpoint jumps.
        "fluid-xs": "clamp(0.7rem, 0.65rem + 0.25vw, 0.8rem)",
        "fluid-sm": "clamp(0.8rem, 0.74rem + 0.3vw, 0.925rem)",
        "fluid-base": "clamp(0.925rem, 0.85rem + 0.4vw, 1.0625rem)",
        "fluid-lg": "clamp(1.05rem, 0.95rem + 0.55vw, 1.3rem)",
        "fluid-xl": "clamp(1.3rem, 1.1rem + 1vw, 1.75rem)",
        "fluid-2xl": "clamp(1.6rem, 1.3rem + 1.6vw, 2.4rem)",
        "fluid-3xl": "clamp(1.9rem, 1.5rem + 2.2vw, 3.1rem)",
      },
      screens: {
        fold: "280px",
        xs: "400px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 6px -1px rgb(15 23 42 / 0.06)",
        lift: "0 4px 6px -1px rgb(15 23 42 / 0.07), 0 10px 24px -6px rgb(15 23 42 / 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
