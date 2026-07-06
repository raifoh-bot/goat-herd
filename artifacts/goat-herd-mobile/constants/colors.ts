/**
 * Semantic design tokens for MyGoatHerd Mobile.
 *
 * These are converted from the sibling web artifact's index.css HSL variables
 * (forest green + warm gold on a soft cream-green background) so both apps
 * share one visual identity.
 */

const colors = {
  light: {
    // Legacy aliases
    text: "#133928",
    tint: "#2e6b4f",

    // Core surfaces
    background: "#f2f8f5",
    foreground: "#133928",

    // Cards / elevated surfaces
    card: "#fcfbf8",
    cardForeground: "#133928",

    // Primary action color (forest green)
    primary: "#2e6b4f",
    primaryForeground: "#f2f8f5",

    // Secondary (warm gold)
    secondary: "#d9a520",
    secondaryForeground: "#302303",

    // Muted / subdued
    muted: "#e0ebe6",
    mutedForeground: "#527a67",

    // Accent (soft purple)
    accent: "#8f7ab8",
    accentForeground: "#f9f8fb",

    // Destructive
    destructive: "#cc3333",
    destructiveForeground: "#ffffff",

    // Warning / due (amber)
    warning: "#b45309",
    warningForeground: "#78350f",
    warningBg: "#fef3c7",
    warningBorder: "#fcd34d",

    // Borders and inputs
    border: "#d1e0d9",
    input: "#d1e0d9",
  },

  dark: {
    text: "#e0ebe8",
    tint: "#3d8f69",

    background: "#0d261a",
    foreground: "#e0ebe8",

    card: "#173627",
    cardForeground: "#e0ebe8",

    primary: "#3d8f69",
    primaryForeground: "#f9fafa",

    secondary: "#a38129",
    secondaryForeground: "#fefcf5",

    muted: "#1a3328",
    mutedForeground: "#8bab9c",

    accent: "#8f7ab8",
    accentForeground: "#f9f8fb",

    destructive: "#d94f4f",
    destructiveForeground: "#ffffff",

    warning: "#fbbf24",
    warningForeground: "#fde68a",
    warningBg: "#3a2f0a",
    warningBorder: "#78560f",

    border: "#265941",
    input: "#265941",
  },

  // Corner radius in px (web --radius: 0.75rem = 12px).
  radius: 12,
};

export default colors;
