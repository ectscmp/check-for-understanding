/**
 * settings.js — shared settings drawer for admin.html and helper.html
 * Depends on theme.js being loaded first (window.ThemeManager must exist).
 *
 * Drop this script at the end of <body>, after the drawer HTML is present.
 */

(function () {
  const STORAGE_KEY = "quizSettings";

  const DEFAULTS = {
    username: "",
    theme: "light",
    accent: "#10b981",
    fontSize: 16,
    confirm: false,
    sounds: true,
    keyboard: true,
    progress: true,
  };

  /* ── Storage helpers ── */
  function loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable */
    }
  }

  /* ── Apply theme + accent + font size to the page ── */
  function applySettings(s) {
    ThemeManager.apply(s.theme);
    ThemeManager.applyAccent(s.accent);
    document.documentElement.style.setProperty(
      "--quiz-font-size",
      s.fontSize + "px",
    );
  }

  /* ── Sync drawer UI controls to match a settings object ── */
  function syncSettingsUI(s) {
    const usernameEl = document.getElementById("setting-username");
    if (usernameEl) usernameEl.value = s.username;

    const rangeEl = document.getElementById("fontSizeRange");
    if (rangeEl) rangeEl.value = s.fontSize;

    const sizeLabel = document.getElementById("fontSizeValue");
    if (sizeLabel) sizeLabel.textContent = s.fontSize + "px";

    document
      .querySelectorAll(".sd-pill")
      .forEach((p) =>
        p.classList.toggle("active", p.dataset.theme === s.theme),
      );

    document
      .querySelectorAll(".sd-swatch")
      .forEach((sw) =>
        sw.classList.toggle("active", sw.dataset.color === s.accent),
      );

    const picker = document.getElementById("customAccentPicker");
    if (picker) picker.value = s.accent;

    ["confirm", "sounds", "keyboard", "progress"].forEach((key) => {
      const el = document.getElementById(`setting-${key}`);
      if (el) el.checked = s[key];
    });
  }

  /* ── Apply on page load ── */
  applySettings(loadSettings());

  /* ── Keep "system" in sync if OS preference changes ── */
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const s = loadSettings();
      if (s.theme === "system") applySettings(s);
    });

  /* ── Drawer open / close ── */
  const drawer = document.getElementById("settingsDrawer");
  const overlay = document.getElementById("settingsOverlay");

  function openSettings() {
    drawer.classList.add("open");
    overlay.classList.add("open");
    syncSettingsUI(loadSettings());
  }

  function closeSettings() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
  }

  document
    .getElementById("settingsBtn")
    ?.addEventListener("click", openSettings);

  document
    .getElementById("closeSettingsBtn")
    ?.addEventListener("click", closeSettings);

  overlay?.addEventListener("click", closeSettings);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer?.classList.contains("open"))
      closeSettings();
  });

  /* ── Username ── */
  document.getElementById("saveUsernameBtn")?.addEventListener("click", () => {
    const s = loadSettings();
    s.username =
      document.getElementById("setting-username")?.value.trim() ?? "";
    saveSettings(s);

    const btn = document.getElementById("saveUsernameBtn");
    if (!btn) return;
    btn.textContent = "✓ Saved";
    btn.classList.add("sd-saved");
    setTimeout(() => {
      btn.textContent = "Save";
      btn.classList.remove("sd-saved");
    }, 1400);
  });

  /* ── Theme pills ── */
  document.querySelectorAll(".sd-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const s = loadSettings();
      s.theme = pill.dataset.theme;
      saveSettings(s);
      applySettings(s);
      document
        .querySelectorAll(".sd-pill")
        .forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });

  /* ── Accent swatches ── */
  document.querySelectorAll(".sd-swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      const s = loadSettings();
      s.accent = sw.dataset.color;
      saveSettings(s);
      applySettings(s);
      document
        .querySelectorAll(".sd-swatch")
        .forEach((el) => el.classList.remove("active"));
      sw.classList.add("active");
      const picker = document.getElementById("customAccentPicker");
      if (picker) picker.value = s.accent;
    });
  });

  document
    .getElementById("customAccentPicker")
    ?.addEventListener("input", (e) => {
      const s = loadSettings();
      s.accent = e.target.value;
      saveSettings(s);
      applySettings(s);
      document
        .querySelectorAll(".sd-swatch")
        .forEach((el) => el.classList.remove("active"));
    });

  /* ── Font size ── */
  document.getElementById("fontSizeRange")?.addEventListener("input", (e) => {
    const s = loadSettings();
    s.fontSize = parseInt(e.target.value, 10);
    saveSettings(s);
    applySettings(s);
    const label = document.getElementById("fontSizeValue");
    if (label) label.textContent = s.fontSize + "px";
  });

  /* ── Boolean toggles ── */
  ["confirm", "sounds", "keyboard", "progress"].forEach((key) => {
    document
      .getElementById(`setting-${key}`)
      ?.addEventListener("change", (e) => {
        const s = loadSettings();
        s[key] = e.target.checked;
        saveSettings(s);
      });
  });

  /* ── Reset ── */
  document.getElementById("resetSettingsBtn")?.addEventListener("click", () => {
    if (!confirm("Reset all settings to defaults?")) return;
    saveSettings({ ...DEFAULTS });
    applySettings(DEFAULTS);
    syncSettingsUI(DEFAULTS);
  });
})();
