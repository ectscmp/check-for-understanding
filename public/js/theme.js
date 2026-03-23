/**
 * theme.js — shared across index, admin, and helper
 *
 * Reads/writes only the settings keys inside the "quizSettings"
 * localStorage object so it never clobbers other settings.
 *
 * Call applyStored() once at the very top of each page's
 * <body> to eliminate flash-of-wrong-theme, then call it again
 * (or wire up the toggle) from your page JS.
 */

window.ThemeManager = (function () {
  const STORAGE_KEY = "quizSettings";
  const DEFAULTS = {
    theme: "light",
    accent: "#10b981",
    fontSize: 16,
  };

  function _load() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function _save(patch) {
    try {
      const current = _load();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...current, ...patch }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  /** Return "light" | "dark" | "system" from storage, defaulting to "light" */
  function getTheme() {
    return _load().theme || "light";
  }

  /** Persist a theme choice ("light" | "dark" | "system") */
  function setTheme(theme) {
    _save({ theme });
  }

  /** Resolve "system" to the actual OS preference */
  function resolve(theme) {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return theme;
  }

  /**
   * Parse a hex colour (#rrggbb or #rgb) into { r, g, b }.
   * Returns null if the string isn't a valid hex colour.
   */
  function _hexToRgb(hex) {
    if (!hex || typeof hex !== "string") return null;
    const clean = hex.trim();
    // Expand shorthand #rgb → #rrggbb
    const full =
      clean.length === 4
        ? "#" + clean[1] + clean[1] + clean[2] + clean[2] + clean[3] + clean[3]
        : clean;
    const m = full.match(/^#([0-9a-fA-F]{6})$/);
    if (!m) return null;
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
    };
  }

  /**
   * Clamp a value between min and max.
   */
  function _clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /**
   * Darken a hex colour by mixing it toward black by `amount` (0–1).
   */
  function _darken(hex, amount) {
    const c = _hexToRgb(hex);
    if (!c) return hex;
    const r = Math.round(c.r * (1 - amount));
    const g = Math.round(c.g * (1 - amount));
    const b = Math.round(c.b * (1 - amount));
    return (
      "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0")
    );
  }

  /**
   * Lighten a hex colour by mixing it toward white by `amount` (0–1).
   */
  function _lighten(hex, amount) {
    const c = _hexToRgb(hex);
    if (!c) return hex;
    const r = Math.round(c.r + (255 - c.r) * amount);
    const g = Math.round(c.g + (255 - c.g) * amount);
    const b = Math.round(c.b + (255 - c.b) * amount);
    return (
      "#" +
      _clamp(r, 0, 255).toString(16).padStart(2, "0") +
      _clamp(g, 0, 255).toString(16).padStart(2, "0") +
      _clamp(b, 0, 255).toString(16).padStart(2, "0")
    );
  }

  /**
   * Derive and stamp all accent-related CSS custom properties onto
   * :root from a single hex accent colour.
   */
  function _applyAccent(hex) {
    const c = _hexToRgb(hex);
    if (!c) return;
    const { r, g, b } = c;

    const el = document.documentElement;
    el.style.setProperty("--accent", hex);
    el.style.setProperty("--accent-dim", `rgba(${r},${g},${b},0.15)`);
    el.style.setProperty("--accent-glow", `rgba(${r},${g},${b},0.25)`);
    el.style.setProperty("--accent-dark", _darken(hex, 0.18));
    el.style.setProperty("--accent-light", _lighten(hex, 0.22));

    // Shadow glow used on cards etc.
    el.style.setProperty("--shadow-glow", `0 0 20px rgba(${r},${g},${b},0.12)`);
  }

  /**
   * Apply a theme string to <body>, update the toggle button icon,
   * and optionally sync any .sd-pill elements in the settings drawer.
   */
  function apply(theme) {
    const resolved = resolve(theme);
    document.body.classList.remove("light", "dark");
    document.body.classList.add(resolved);

    // Update toggle button icon if present
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = resolved === "light" ? "🌙" : "☀️";

    // Sync settings-drawer pills if present (index page)
    document.querySelectorAll(".sd-pill").forEach((p) => {
      p.classList.toggle("active", p.dataset.theme === theme);
    });
  }

  /**
   * Read from storage and apply immediately — call this right after <body> opens.
   * Applies theme class, accent colour (and all derived variables), and font size.
   */
  function applyStored() {
    const s = _load();

    // Theme (light / dark / system)
    apply(s.theme);

    // Accent colour and all derived CSS variables
    _applyAccent(s.accent);

    // Font size
    document.documentElement.style.setProperty(
      "--quiz-font-size",
      s.fontSize + "px",
    );
  }

  /**
   * Wire up a theme toggle button that flips between light and dark.
   * Pass the button element or its id string.
   */
  function bindToggle(btnOrId) {
    const btn =
      typeof btnOrId === "string" ? document.getElementById(btnOrId) : btnOrId;
    if (!btn) return;
    btn.addEventListener("click", () => {
      const current = resolve(getTheme());
      const next = current === "light" ? "dark" : "light";
      setTheme(next);
      apply(next);
    });
  }

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getTheme() === "system") apply("system");
    });

  return {
    getTheme,
    setTheme,
    resolve,
    apply,
    applyStored,
    bindToggle,
    applyAccent: _applyAccent,
  };
})();
