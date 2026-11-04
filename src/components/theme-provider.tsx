import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

/** The user's theme choice; "system" follows the OS setting. */
export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "designapp-theme" // also read by the pre-paint script in index.html
/** Media query that matches when the OS is in dark mode. */
const darkQuery = "(prefers-color-scheme: dark)"

/** What {@link useTheme} returns. */
type ThemeContextValue = {
  /** The user's choice. */
  theme: Theme
  /** The theme actually shown, with "system" resolved. */
  resolvedTheme: "light" | "dark"
  /** Changes and remembers the choice. */
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Reads the saved choice, defaulting to "system". */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") return stored
  } catch {
    // Storage can be blocked (private mode); fall back to the system theme.
  }
  return "system"
}

/**
 * Resolves "system" to light or dark using the OS setting.
 * @param theme - The user's choice.
 */
function resolve(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme
  return matchMedia(darkQuery).matches ? "dark" : "light"
}

/**
 * Applies the theme (the `dark` class on `<html>`), follows OS changes and remembers the choice.
 * @param props.children - The app.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState(() => resolve(theme))

  useEffect(() => {
    const apply = () => {
      const next = resolve(theme)
      setResolvedTheme(next)
      document.documentElement.classList.toggle("dark", next === "dark")
    }
    apply()
    if (theme !== "system") return
    const media = matchMedia(darkQuery)
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice still applies for this session.
    }
  }, [])

  return <ThemeContext value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext>
}

/**
 * The current theme and a setter.
 * @throws Error when used outside {@link ThemeProvider}.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside ThemeProvider")
  return context
}
