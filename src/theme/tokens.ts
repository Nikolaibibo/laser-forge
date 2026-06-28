/** TS mirror of CSS custom properties for cases needing typed inline values
 *  (e.g. canvas 2D drawing). Prefer the CSS var() in JSX styles. */
export const tokens = {
  bgChrome: "#11151b",
  bgPanel: "#161b22",
  bgRaised: "#1c222b",
  bgHover: "#232a34",
  bgCanvas: "#f7f8fa",
  line: "#2a313b",
  lineStrong: "#39424f",
  textPrimary: "#e6e9ee",
  textSecondary: "#aab2bf",
  textMuted: "#8b95a3",
  accent: "#f97316",
  accentHover: "#fb8a3c",
  ok: "#3fb950",
  err: "#f85149",
} as const;
