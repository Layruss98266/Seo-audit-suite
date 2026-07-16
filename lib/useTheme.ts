"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "seo-audit-theme";

// Sidebar ThemeToggle and the Settings page toggle can be mounted at the same
// time; a plain localStorage read only syncs on next mount/reload, so this
// pub-sub keeps every mounted instance in sync the moment either one flips.
type Listener = () => void;
const listeners = new Set<Listener>();

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

function getSnapshot(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? stored === "dark" : document.documentElement.classList.contains("dark");
}

// Always `false` for SSR/the first client render so hydration matches — the
// inline themeInitScript in <head> already applies the real `.dark` class
// before hydration to avoid a visual flash. useSyncExternalStore then re-syncs
// React to the true value right after mount, which is exactly the case it's
// built for (this used to be a manual setState-in-effect; useSyncExternalStore
// is the React-native way to do it without an extra render-then-fix pass).
function getServerSnapshot(): boolean {
  return false;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setDark(next: boolean) {
  applyTheme(next);
  try {
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setDarkCb = useCallback((next: boolean) => setDark(next), []);
  const toggle = useCallback(() => setDark(!dark), [dark]);

  return { dark, setDark: setDarkCb, toggle };
}

/** Inline script for app/layout.tsx <head>, sets .dark before hydration to avoid a flash of the wrong theme. */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
