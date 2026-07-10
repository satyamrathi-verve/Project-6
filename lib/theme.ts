/*
  Dark mode: a `dark` class on <html>, toggled by the sidebar button and
  persisted in localStorage. The inline script in layout.tsx applies the
  saved class before paint so there's no flash of the wrong theme.
*/

export const THEME_KEY = "ar_theme";
export type Theme = "light" | "dark";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}
