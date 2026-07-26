"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { themeCookie, type Theme } from "@/shared/theme";

/**
 * The server paints `data-theme` on <html> from the cookie, so there is never a
 * flash. This only has to keep the attribute and the cookie in step afterwards.
 */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    document.cookie = themeCookie(next);
    setTheme(next);
  }

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    // Cross-fade the whole document where the browser supports it. Respect the
    // reduced-motion preference by skipping straight to the swap.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && "startViewTransition" in document) {
      (
        document as Document & {
          startViewTransition: (callback: () => void) => void;
        }
      ).startViewTransition(() => apply(next));
      return;
    }

    apply(next);
  }

  return (
    <button
      type="button"
      className="button button-quiet button-small"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
