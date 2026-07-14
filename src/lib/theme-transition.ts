// Wraps a theme change in the View Transitions API so the new theme
// radially reveals from a given point instead of snapping instantly.
// Falls back to a plain, instant change on browsers without support
// (Firefox, older Safari).
export function setThemeWithTransition(
  setTheme: (theme: string) => void,
  theme: string,
  origin: { x: number; y: number },
) {
  if (typeof document === "undefined" || !document.startViewTransition) {
    setTheme(theme);
    return;
  }

  document.documentElement.style.setProperty("--theme-x", `${origin.x}px`);
  document.documentElement.style.setProperty("--theme-y", `${origin.y}px`);
  document.startViewTransition(() => setTheme(theme));
}
