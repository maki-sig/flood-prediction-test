"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  try {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    // noop
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const getInitialTheme = (): Theme => {
      const stored = localStorage.getItem("theme");
      if (stored === "dark" || stored === "light") {
        return stored;
      }
      // If there is no custom theme or if it was "system" from a prior version,
      // default to the device/system preference.
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    };

    const initialTheme = getInitialTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const stored = localStorage.getItem("theme");
      // Only follow system changes if the user has not explicitly locked in a preference
      if (stored !== "dark" && stored !== "light") {
        const systemTheme = mql.matches ? "dark" : "light";
        setTheme(systemTheme);
        applyTheme(systemTheme);
      }
    };

    mql.addEventListener ? mql.addEventListener("change", onChange) : mql.addListener(onChange);
    return () => {
      mql.removeEventListener ? mql.removeEventListener("change", onChange) : mql.removeListener(onChange);
    };
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      // noop
    }
    applyTheme(next);
  };

  // Render a visual skeleton matching the button dimensions during SSR to prevent layout shifts
  if (!mounted) {
    return (
      <div className="w-7 h-7 border border-border-surface bg-bg-crust/50 rounded-[4px]" />
    );
  }

  const title = theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";

  return (
    <button
      onClick={toggle}
      title={title}
      aria-label={title}
      className="w-7 h-7 flex items-center justify-center border border-border-surface bg-bg-crust/50 text-text-muted hover:text-primary-blue hover:border-primary-blue/40 rounded-[4px] cursor-pointer transition-colors duration-200"
    >
      {theme === "dark" ? (
        // Sun icon (click to switch to light mode)
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        // Moon icon (click to switch to dark mode)
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

