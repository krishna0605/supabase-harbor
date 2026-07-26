export const THEME_COOKIE = "harbor_theme";

export type Theme = "dark" | "light";

/** Dark is Harbor's default: the tide table is authored on a dark ground. */
export const DEFAULT_THEME: Theme = "dark";

export function resolveTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}

/**
 * Persist the theme for a year. Not HttpOnly by design — the toggle sets it
 * from the client, and it carries no secret. Lax keeps it on normal navigation.
 */
export function themeCookie(theme: Theme) {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
