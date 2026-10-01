import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "anova4all-theme";
const ThemeContext = createContext<ThemeState | null>(null);

function systemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function storedTheme(fallback: Theme): Theme {
  const t = localStorage.getItem(STORAGE_KEY);
  return t === "dark" || t === "light" || t === "system" ? t : fallback;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() =>
    storedTheme(defaultTheme),
  );
  const [system, setSystem] = useState(systemTheme);
  const resolved = theme === "system" ? system : theme;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  }, [resolved]);

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
