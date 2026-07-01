function getThemeMode() {
  try {
    const saved = localStorage.getItem(THEME_CACHE_KEY);
    return ["auto", "light", "dark"].includes(saved) ? saved : "auto";
  } catch (error) {
    return "auto";
  }
}

function resolveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  return themeMedia?.matches ? "dark" : "light";
}

function updateThemeButtons(mode) {
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const active = button.dataset.themeChoice === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function applyThemeMode(mode = getThemeMode()) {
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = resolveTheme(mode);
  updateThemeButtons(mode);
}

function setThemeMode(mode) {
  if (!["auto", "light", "dark"].includes(mode)) return;
  try {
    localStorage.setItem(THEME_CACHE_KEY, mode);
  } catch (error) {
    // The switch should still work for this visit if storage is unavailable.
  }
  applyThemeMode(mode);
  if (DATA.daily.length && $("rainChart")) drawRainChart();
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function lochcarronDateISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function thoughtIndexForDate(dateString, count) {
  const [year, month, day] = dateString.split("-").map(Number);
  const daysSinceEpoch = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  return ((daysSinceEpoch % count) + count) % count;
}

function renderDailyThought(thought) {
  const category = $("dailyThoughtCategory");
  const text = $("dailyThoughtText");
  if (!category || !text) return;
  category.textContent = "Daily Thought";
  text.textContent = thought.text;
}

async function loadDailyThought() {
  const today = lochcarronDateISO();
  try {
    const response = await fetch(THOUGHTS_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Could not load thoughts: ${response.status}`);
    const thoughts = await response.json();
    const approvedThoughts = Array.isArray(thoughts)
      ? thoughts.filter((thought) => thought && Number.isFinite(Number(thought.id)) && thought.category && thought.text)
      : [];
    if (!approvedThoughts.length) throw new Error("No approved thoughts available");
    renderDailyThought(approvedThoughts[thoughtIndexForDate(today, approvedThoughts.length)]);
    displayedThoughtDate = today;
  } catch (error) {
    renderDailyThought(THOUGHT_FALLBACK);
    displayedThoughtDate = today;
  }
}

function refreshDailyThoughtIfNeeded() {
  if (displayedThoughtDate !== lochcarronDateISO()) {
    loadDailyThought().catch(() => renderDailyThought(THOUGHT_FALLBACK));
  }
}
