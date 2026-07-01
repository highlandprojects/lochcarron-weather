const DATA = {
  daily: [],
  forecast: [],
  hourly: [],
  current: null,
  marine: null,
  weatherUpdatedAt: null,
  marineUpdatedAt: null,
  weatherSource: "local",
  marineSource: "none",
  rainRange: "recent",
  dateRange: "recent",
  rainSource: "bundled three-year fallback",
  rainLoading: false,
  byDate: new Map(),
  selectedBars: [],
  barHits: [],
  rainMode: "month",
  yearFilter: "all",
  hourlyDate: null,
  tideDate: null
};

const $ = (id) => document.getElementById(id);
const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long" });
const shortMonthFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast?latitude=57.405&longitude=-5.503&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset&timezone=Europe/London&forecast_days=14";
const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine?latitude=57.405&longitude=-5.503&hourly=sea_level_height_msl,wave_height,wave_direction,wave_period&timezone=Europe/London";
const WEATHER_CACHE_KEY = "lochcarron.openMeteo.weather.v7";
const MARINE_CACHE_KEY = "lochcarron.openMeteo.marine.v1";
const RAIN_ARCHIVE_CACHE_PREFIX = "lochcarron.openMeteo.rainArchive.v1.";
const THEME_CACHE_KEY = "lochcarron.themeMode";
const THOUGHTS_URL = "data/thoughts.json";
const THOUGHT_FALLBACK = {
  category: "Highland",
  text: "The weather changes every day. The beauty of Lochcarron never does."
};
const LIVE_REFRESH_MS = 15 * 60 * 1000;
const themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let displayedThoughtDate = null;
const RAIN_RANGES = {
  recent: {
    label: "Recent detailed view",
    start: "2017-01-01",
    model: "best_match",
    source: "Recent detailed view: 2017 to today. Higher-resolution modern Open-Meteo archive data for recent weather history."
  },
  long: {
    label: "Long history view",
    start: "1950-01-01",
    model: "best_match",
    source: "Long history view: 1950 to today. Older dates use long-term reanalysis data, not a local rain gauge."
  }
};

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

function parseOpenMeteo(json) {
  const d = json.daily || {};
  const valueAt = (series, i) => series?.[i] == null ? null : Number(series[i]);
  return (d.time || []).map((time, i) => ({
    date: time,
    rain: valueAt(d.precipitation_sum, i) ?? valueAt(d.rain_sum, i) ?? 0,
    max: valueAt(d.temperature_2m_max, i),
    min: valueAt(d.temperature_2m_min, i),
    weatherCode: valueAt(d.weather_code, i),
    wind: valueAt(d.wind_speed_10m_max, i),
    gust: valueAt(d.wind_gusts_10m_max, i),
    sunrise: d.sunrise?.[i] || null,
    sunset: d.sunset?.[i] || null
  }));
}

function parseOpenMeteoWithSource(json, sourceLabel) {
  return parseOpenMeteo(json).map((day) => ({ ...day, sourceLabel }));
}

function parseHourlyWeather(json) {
  const h = json?.hourly || {};
  const valueAt = (series, i) => series?.[i] == null ? null : Number(series[i]);
  return (h.time || []).map((time, i) => ({
    time,
    date: time.slice(0, 10),
    temp: valueAt(h.temperature_2m, i),
    rain: valueAt(h.precipitation, i) ?? 0,
    rainChance: valueAt(h.precipitation_probability, i),
    weatherCode: valueAt(h.weather_code, i),
    wind: valueAt(h.wind_speed_10m, i)
  }));
}

function addHourlyWindFallback(days, hours) {
  if (!days.length || !hours.length) return days;
  const dailyMax = new Map();
  hours.forEach((hour) => {
    if (hour.wind == null) return;
    const current = dailyMax.get(hour.date);
    dailyMax.set(hour.date, current == null ? hour.wind : Math.max(current, hour.wind));
  });
  return days.map((day) => ({
    ...day,
    wind: day.wind ?? dailyMax.get(day.date) ?? null
  }));
}

function readCache(key) {
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  const savedAt = new Date().toISOString();
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt, data }));
  } catch {
    // The page still works without storage.
  }
  return savedAt;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function yesterdayISO() {
  return addDays(todayISO(), -1);
}

function archiveUrl(startDate, endDate, model = "best_match") {
  const params = new URLSearchParams({
    latitude: "57.405",
    longitude: "-5.503",
    start_date: startDate,
    end_date: endDate,
    daily: "precipitation_sum,rain_sum,temperature_2m_max,temperature_2m_min,sunrise,sunset",
    timezone: "Europe/London"
  });
  if (model && model !== "best_match") params.set("models", model);
  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

async function loadRainArchive(rangeKey) {
  const range = RAIN_RANGES[rangeKey] || RAIN_RANGES.recent;
  const end = yesterdayISO();
  const cacheKey = `${RAIN_ARCHIVE_CACHE_PREFIX}${rangeKey}.${range.start}.${end}`;
  DATA.rainLoading = true;
  updateRainSource(`Loading ${range.label.toLowerCase()}...`);
  try {
    const json = await fetchJson(archiveUrl(range.start, end, range.model));
    const updatedAt = writeCache(cacheKey, json);
    DATA.daily = parseOpenMeteoWithSource(json, range.source);
    DATA.rainSource = `${range.source} Updated ${hourLabel(updatedAt)}.`;
  } catch {
    const cached = readCache(cacheKey);
    if (cached?.data) {
      DATA.daily = parseOpenMeteoWithSource(cached.data, range.source);
      DATA.rainSource = `${range.source} Showing saved data from ${hourLabel(cached.savedAt)}.`;
    } else {
      DATA.rainSource = `Could not load ${range.label.toLowerCase()}. Showing the bundled three-year fallback. ${range.source}`;
    }
  }
  DATA.rainLoading = false;
  rebuildDateIndex();
  buildYearChoices();
  drawRainChart();
}

function rebuildDateIndex() {
  DATA.byDate = new Map();
  DATA.daily.forEach((day) => DATA.byDate.set(day.date, day));
  DATA.forecast.forEach((day) => DATA.byDate.set(day.date, day));
}

async function loadLiveWeather(notices) {
  try {
    const json = await fetchJson(WEATHER_API_URL);
    const updatedAt = writeCache(WEATHER_CACHE_KEY, json);
    return { json, source: "live", updatedAt };
  } catch (error) {
    const cached = readCache(WEATHER_CACHE_KEY);
    if (cached) {
      notices.push("Live weather unavailable. Showing the last saved Open-Meteo weather.");
      return { json: cached.data, source: "cache", updatedAt: cached.savedAt };
    }
    notices.push("Live weather unavailable. Showing bundled local weather data.");
    return { json: null, source: "local", error };
  }
}

async function loadLiveMarine(notices) {
  try {
    const json = await fetchJson(MARINE_API_URL);
    const updatedAt = writeCache(MARINE_CACHE_KEY, json);
    return { json, source: "live", updatedAt };
  } catch (error) {
    const cached = readCache(MARINE_CACHE_KEY);
    if (cached) {
      notices.push("Live marine data unavailable. Showing the last saved marine conditions.");
      return { json: cached.data, source: "cache", updatedAt: cached.savedAt };
    }
    notices.push("Live marine data unavailable. Marine conditions are hidden until the connection returns.");
    return { json: null, source: "none", error };
  }
}

function parseCurrentWeather(json) {
  const current = json?.current;
  if (!current) return null;
  return {
    date: (current.time || todayISO()).slice(0, 10),
    temp: current.temperature_2m == null ? null : Number(current.temperature_2m),
    apparentTemp: current.apparent_temperature == null ? null : Number(current.apparent_temperature),
    humidity: current.relative_humidity_2m == null ? null : Number(current.relative_humidity_2m),
    wind: current.wind_speed_10m == null ? null : Number(current.wind_speed_10m),
    weatherCode: current.weather_code == null ? null : Number(current.weather_code),
    isDay: current.is_day == null ? null : Number(current.is_day) === 1
  };
}

function parseMarine(json) {
  const hourly = json?.hourly;
  const times = hourly?.time || [];
  if (!times.length) return null;
  const now = Date.now();
  let index = 0;
  let bestDiff = Infinity;
  times.forEach((time, i) => {
    const diff = Math.abs(new Date(time).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      index = i;
    }
  });
  const valueAt = (series) => series?.[index] == null ? null : Number(series[index]);
  return {
    time: times[index],
    seaLevel: valueAt(hourly.sea_level_height_msl),
    waveHeight: valueAt(hourly.wave_height),
    waveDirection: valueAt(hourly.wave_direction),
    wavePeriod: valueAt(hourly.wave_period)
  };
}

function showNotices(notices) {
  const notice = $("dataNotice");
  if (!notice || !notices.length) return;
  notice.innerHTML = notices.map((item) => `<p>${item}</p>`).join("");
  notice.hidden = false;
}

async function loadData() {
  const notices = [];
  let history = window.LOCHCARRON_WEATHER_HISTORY;
  let forecast = window.LOCHCARRON_WEATHER_FORECAST;

  if (!history) {
    history = await fetch("data/weather-3y.json").then((r) => r.json());
  }

  if (!forecast) {
    forecast = await fetch("data/forecast.json").then((r) => r.json()).catch(() => null);
  }

  const liveWeather = await loadLiveWeather(notices);
  const liveMarine = await loadLiveMarine(notices);

  DATA.daily = parseOpenMeteoWithSource(history, "Bundled three-year fallback.");
  DATA.hourly = liveWeather.json ? parseHourlyWeather(liveWeather.json) : [];
  DATA.forecast = liveWeather.json
    ? addHourlyWindFallback(parseOpenMeteo(liveWeather.json), DATA.hourly)
    : forecast ? parseOpenMeteo(forecast) : [];
  DATA.current = liveWeather.json ? parseCurrentWeather(liveWeather.json) : null;
  DATA.marine = liveMarine.json ? parseMarine(liveMarine.json) : null;
  DATA.weatherSource = liveWeather.source;
  DATA.marineSource = liveMarine.source;
  DATA.weatherUpdatedAt = liveWeather.updatedAt || null;
  DATA.marineUpdatedAt = liveMarine.updatedAt || null;
  rebuildDateIndex();
  buildYearChoices();
  updateHeroToday();
  updateSevenDayOutlook();
  drawRainChart();
  $("factDate").value = todayISO();
  applyDateRange(DATA.dateRange);
  updateDateFacts();
  showNotices(notices);
  scheduleLiveRefresh();
  loadRainArchive(DATA.rainRange).catch(() => {});
  document.documentElement.classList.remove("is-loading");
}

async function refreshLivePanels() {
  const notices = [];
  const [liveWeather, liveMarine] = await Promise.all([
    loadLiveWeather(notices),
    loadLiveMarine(notices)
  ]);

  if (liveWeather.json) {
    DATA.hourly = parseHourlyWeather(liveWeather.json);
    DATA.forecast = addHourlyWindFallback(parseOpenMeteo(liveWeather.json), DATA.hourly);
    DATA.current = parseCurrentWeather(liveWeather.json);
    DATA.weatherSource = liveWeather.source;
    DATA.weatherUpdatedAt = liveWeather.updatedAt || DATA.weatherUpdatedAt;
    DATA.forecast.forEach((day) => DATA.byDate.set(day.date, day));
  }

  if (liveMarine.json) {
    DATA.marine = parseMarine(liveMarine.json);
    DATA.marineSource = liveMarine.source;
    DATA.marineUpdatedAt = liveMarine.updatedAt || DATA.marineUpdatedAt;
  }

  updateHeroToday();
  updateSevenDayOutlook();
}

function scheduleLiveRefresh() {
  if (DATA.refreshTimer) return;
  DATA.refreshTimer = window.setInterval(() => {
    refreshLivePanels().catch(() => {
      // Keep the last good on-screen data if the refresh fails.
    });
  }, LIVE_REFRESH_MS);
}

function filteredRainDays() {
  if (DATA.yearFilter === "all") return DATA.daily;
  return DATA.daily.filter((day) => day.date.startsWith(DATA.yearFilter));
}

function groupByMonth(days = filteredRainDays()) {
  const buckets = Array.from({ length: 12 }, (_, m) => ({ key: m, label: monthFmt.format(new Date(2025, m, 1)), rain: 0, days: 0 }));
  days.forEach((day) => {
    const m = new Date(`${day.date}T12:00:00`).getMonth();
    buckets[m].rain += day.rain;
    buckets[m].days += 1;
  });
  return buckets.map((b) => ({ ...b, value: b.days ? b.rain / b.days : 0, total: b.rain }));
}

function groupBySeason(days = filteredRainDays()) {
  const seasonFor = (m) => (m < 2 || m === 11 ? "Winter" : m < 5 ? "Spring" : m < 8 ? "Summer" : "Autumn");
  const order = ["Spring", "Summer", "Autumn", "Winter"];
  const buckets = new Map(order.map((s) => [s, { key: s, label: s, rain: 0, days: 0 }]));
  days.forEach((day) => {
    const m = new Date(`${day.date}T12:00:00`).getMonth();
    const b = buckets.get(seasonFor(m));
    b.rain += day.rain;
    b.days += 1;
  });
  return order.map((s) => {
    const b = buckets.get(s);
    return { ...b, value: b.rain / b.days, total: b.rain };
  });
}

function isoWeekNumber(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function groupByWeek(days = filteredRainDays()) {
  const buckets = new Map();
  days.forEach((day) => {
    const week = isoWeekNumber(day.date);
    if (!buckets.has(week)) {
      const month = new Date(`${day.date}T12:00:00`).getMonth();
      buckets.set(week, { key: week, label: `Week ${week}`, month, rain: 0, days: 0 });
    }
    const b = buckets.get(week);
    b.rain += day.rain;
    b.days += 1;
  });
  let lastMonth = -1;
  return [...buckets.values()]
    .sort((a, b) => a.key - b.key)
    .map((b) => {
      const axisLabel = b.month !== lastMonth ? shortMonthFmt.format(new Date(2025, b.month, 1)) : "";
      lastMonth = b.month;
      return { ...b, axisLabel, value: b.days ? b.rain / b.days : 0, total: b.rain };
    });
}

function groupByYear(days = filteredRainDays()) {
  const buckets = new Map();
  days.forEach((day) => {
    const y = day.date.slice(0, 4);
    if (!buckets.has(y)) buckets.set(y, { key: y, label: y, rain: 0, days: 0 });
    const b = buckets.get(y);
    b.rain += day.rain;
    b.days += 1;
  });
  return [...buckets.values()].map((b) => ({ ...b, value: b.total || b.rain, total: b.rain }));
}

function buildYearChoices() {
  const years = [...new Set(DATA.daily.map((day) => day.date.slice(0, 4)))].sort();
  $("yearChoices").innerHTML = [
    `<button class="choicebox is-active" type="button" data-year="all">All years</button>`,
    ...years.map((year) => `<button class="choicebox" type="button" data-year="${year}">${year}</button>`)
  ].join("");
  updateYearFilterVisibility();
}

function updateRainSource(text = DATA.rainSource) {
  const source = $("chartSource");
  if (source) source.textContent = text;
}

function withCurrentWeather(day) {
  if (!day || DATA.current?.date !== day.date) return day;
  return {
    ...day,
    currentTemp: DATA.current.temp,
    apparentTemp: DATA.current.apparentTemp,
    humidity: DATA.current.humidity,
    wind: DATA.current.wind ?? day.wind,
    weatherCode: DATA.current.weatherCode,
    isDay: DATA.current.isDay
  };
}

function updateHeroToday() {
  const dateString = todayISO();
  const weather = withCurrentWeather(DATA.forecast.find((day) => day.date === dateString) || DATA.byDate.get(dateString) || DATA.forecast[0]);
  const heroDate = weather?.date || dateString;
  const tides = tideWindows(heroDate);
  const windMph = weather ? kmhToMph(weather.wind) : null;
  const gustMph = weather ? kmhToMph(weather.gust) : null;
  const temp = weather?.currentTemp ?? weather?.max;
  const apparentTemp = weather?.apparentTemp ?? temp;
  const pollen = pollenEstimate(heroDate);
  const aurora = auroraEstimate(heroDate);

  $("heroWeatherIcon").dataset.weather = weather ? liveWeatherScene(weather.weatherCode, weather.isDay) : "cloud";
  $("heroWeather").textContent = temp == null ? "Unavailable" : `${Math.round(temp)}°C`;
  $("heroCondition").textContent = weather ? weatherConditionLabel(weather.weatherCode) : "Live weather unavailable";
  $("heroFeelsLike").textContent = apparentTemp == null ? "Feels like unavailable" : `Feels like ${Math.round(apparentTemp)}°C`;
  if ($("heroWind")) {
    $("heroWind").textContent = windMph == null ? "Wind n/a" : `${windMph.toFixed(0)} mph wind`;
  }
  if ($("heroHumidity")) {
    $("heroHumidity").textContent = weather?.humidity == null ? "Humidity n/a" : `${Math.round(weather.humidity)}% humidity`;
  }
  if ($("heroWeatherUpdated")) {
    $("heroWeatherUpdated").textContent = liveUpdateText(DATA.weatherUpdatedAt, DATA.weatherSource);
  }
  $("heroPollenLevel").textContent = pollen.level;
  $("heroPollenType").textContent = pollen.type;
  $("heroPollenDetail").textContent = pollen.detail;
  $("heroPollenMeter").style.setProperty("--meter", `${pollen.score}%`);
  $("heroAuroraLevel").textContent = aurora.level;
  $("heroAuroraDetail").textContent = aurora.detail;
  $("heroAuroraMeter").style.setProperty("--meter", `${aurora.score}%`);
  if ($("heroForecastRain")) {
    $("heroForecastRain").textContent = weather ? `${weather.rain.toFixed(1)} mm rain` : "Forecast unavailable";
  }
  if ($("heroForecastDetail")) {
    $("heroForecastDetail").textContent = weather
      ? `${weather.min?.toFixed(1) ?? "?"} to ${weather.max?.toFixed(1) ?? "?"} C${gustMph == null ? "" : ` · ${gustMph.toFixed(0)} mph gusts`}`
      : "Showing saved data if available";
  }
  if ($("heroTides")) {
    $("heroTides").innerHTML = tides.map((t) => `
      <div>
        <small>${t.type}</small>
        <strong>${timeLabel(t.time)}</strong>
        <em>${t.height.toFixed(1)}m est.</em>
      </div>
    `).join("");
  }
  updateHeroMarine();
  updateHeroHourly();
  $("heroDaylight").innerHTML = daylightPanel(heroDate, weather);
  const phase = moonPhase(heroDate);
  $("heroMoon").textContent = phase;
  $("heroMoonText").textContent = moonPhaseDescription(phase);
  $("heroMoonIcon").className = `moonphase ${moonPhaseClass(phase)}`;
}

function pollenEstimate(dateString) {
  const month = new Date(`${dateString}T12:00:00`).getMonth();
  if (month >= 4 && month <= 6) {
    return {
      level: "Moderate",
      type: "Grass pollen",
      detail: "Main Highland pollen season",
      score: 38
    };
  }
  if (month === 3 || month === 7) {
    return {
      level: "Low",
      type: month === 3 ? "Tree pollen" : "Grass pollen",
      detail: "Lower local seasonal levels",
      score: 18
    };
  }
  return {
    level: "Low",
    type: "Pollen season quiet",
    detail: "Very low local seasonal levels",
    score: 8
  };
}

function auroraEstimate(dateString) {
  const month = new Date(`${dateString}T12:00:00`).getMonth();
  if (month >= 9 || month <= 2) {
    return {
      level: "Low",
      detail: "Possible on clear dark nights",
      score: 18
    };
  }
  return {
    level: "Very low",
    detail: "Short Highland summer nights",
    score: 6
  };
}

function updateHeroHourly() {
  const tabs = hourlyDayTabs();
  if (tabs.length && !tabs.some((tab) => tab.date === DATA.hourlyDate)) {
    DATA.hourlyDate = tabs[0].date;
  }
  $("hourlyTabs").innerHTML = tabs.map(hourlyTabMarkup).join("");
  const hours = hourlyWindow(DATA.hourlyDate);
  if (!hours.length) {
    $("hourlySummary").textContent = "Hourly forecast unavailable";
    $("hourlyChart").innerHTML = `<p class="hourlyempty">Live hourly data is not available in this saved copy.</p>`;
    renderHeroHourlyTides(DATA.hourlyDate);
    $("hourlyTooltip").hidden = true;
    return;
  }
  const maxRain = Math.max(...hours.map((h) => h.rain ?? 0));
  const wettest = hours.find((h) => (h.rain ?? 0) === maxRain) || hours[0];
  $("hourlySummary").textContent = maxRain > 0
    ? `Most rain around ${hourLabel(wettest.time)}`
    : "Mostly workable windows";
  $("hourlyChart").innerHTML = hourlyChartMarkup(hours);
  renderHeroHourlyTides(DATA.hourlyDate);
  $("hourlyTooltip").hidden = true;
}

function renderHeroHourlyTides(dateString = DATA.hourlyDate || todayISO()) {
  if (!$("heroHourlyTides")) return;
  const tides = tideWindows(dateString);
  const weather = plannerWeatherForDate(dateString);
  $("heroHourlyTides").innerHTML = `
    <div class="hero-hourly-tides__weather" aria-label="Hourly weather cues for tide planning">
      ${tidePlannerWeatherMarkup(dateString, weather)}
    </div>
    <div class="hero-hourly-tides__head">
      <span>Tides</span>
      <strong>${dateString === todayISO() ? "Today" : dayName(dateString)}</strong>
    </div>
    <div class="hero-hourly-tides__chart">
      ${tidePlannerChartMarkup(dateString, weather, tides, "hero")}
    </div>
  `;
}

function hourlyDayTabs() {
  const today = todayISO();
  const forecastTabs = DATA.forecast
    .filter((day) => day.max != null && day.min != null)
    .slice(0, 14)
    .map((day) => ({
      date: day.date,
      label: day.date === today ? "Today" : shortDayDate(day.date),
      icon: weatherIcon(day.rain),
      max: day.max,
      min: day.min,
      rain: day.rain,
      wind: day.wind
    }));
  if (forecastTabs.length) return forecastTabs;
  return [...new Set(DATA.hourly.map((hour) => hour.date))].slice(0, 14).map((date) => ({
    date,
    label: date === today ? "Today" : shortDayDate(date),
    icon: weatherCodeIcon(DATA.hourly.find((hour) => hour.date === date)?.weatherCode),
    max: null,
    min: null,
    rain: null,
    wind: null
  }));
}

function hourlyTabMarkup(tab) {
  const selected = tab.date === DATA.hourlyDate;
  const temp = tab.max == null ? "" : `<strong>${Math.round(tab.max)} C</strong>`;
  const rain = tab.rain == null ? "" : `<p>${tab.rain.toFixed(1)} mm</p>`;
  const windMph = kmhToMph(tab.wind);
  const wind = windMph == null ? `<p class="windline">Wind n/a</p>` : `<p class="windline">${windMph.toFixed(0)} mph wind</p>`;
  const badge = tab.rain == null ? "" : `<div class="daybadge">${rainMood(tab.rain)}</div>`;
  return `
    <button class="hourlytab" type="button" data-hourly-date="${tab.date}" aria-selected="${selected}">
      <span>${tab.label}</span>
      <div class="forecasticon" aria-hidden="true">${tab.icon}</div>
      ${temp}
      ${rain}
      ${wind}
      ${badge}
    </button>
  `;
}

function hourlyWindow(dateString = DATA.hourlyDate) {
  if (!DATA.hourly.length) return [];
  const today = todayISO();
  const chosenDate = dateString || today;
  const start = new Date(`${chosenDate}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60000);
  const base = DATA.hourly.filter((hour) => {
    const time = new Date(hour.time);
    return time >= start && time < end;
  });
  const fallback = DATA.hourly.filter((hour) => hour.date === chosenDate);
  const source = base.length ? base : fallback;
  return sampleHours(source, 9);
}

function sampleHours(hours, maxPoints) {
  if (hours.length <= maxPoints) return hours;
  const indexes = new Set();
  for (let i = 0; i < maxPoints; i += 1) {
    indexes.add(Math.round(i * (hours.length - 1) / (maxPoints - 1)));
  }
  return [...indexes].map((index) => hours[index]).filter(Boolean);
}

function hourlyChartMarkup(hours) {
  const temps = hours.map((h) => h.temp ?? 0);
  const rains = hours.map((h) => Math.max(h.rain ?? 0, 0));
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = Math.max(max - min, 1);
  const maxRain = Math.max(...rains, 0.5);
  const points = hours.map((hour, i) => {
    const x = 48 + (i * (704 / Math.max(hours.length - 1, 1)));
    const y = 112 - (((hour.temp ?? min) - min) / range) * 62;
    const rain = Math.max(hour.rain ?? 0, 0);
    const rainY = 152 - (rain / maxRain) * 34;
    return { hour, rain, rainY, x, y };
  });
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const rainLine = points.map((p) => `${p.x.toFixed(1)},${p.rainY.toFixed(1)}`).join(" ");
  const area = `48,136 ${line} 752,136`;
  return `
    <svg class="hourlysvg" viewBox="0 0 800 206" role="img" aria-label="Temperature line and forecast rain for the next 24 hours">
      <path class="hourlyarea" d="M ${area} Z"></path>
      <polyline class="hourlyrainline" points="${rainLine}"></polyline>
      <polyline class="hourlyline" points="${line}"></polyline>
      ${points.map(({ hour, rain, rainY, x, y }, i) => `
        <g class="hourlypoint${i === 0 ? " is-active" : ""}" data-hour-index="${i}" tabindex="0" role="button" aria-label="${hourLabel(hour.time)} ${Math.round(hour.temp ?? 0)} C, ${hourlyRainLabel(hour)} rain, ${hour.rainChance ?? 0}% rain chance">
          <line x1="${x}" y1="${y}" x2="${x}" y2="136"></line>
          <circle class="hourlyrain-dot" cx="${x}" cy="${rainY}" r="3"></circle>
          <circle cx="${x}" cy="${y}" r="7"></circle>
          <text class="hourlytemp" x="${x}" y="${y - 14}">${Math.round(hour.temp ?? 0)} C</text>
          <text class="hourlydrop" x="${x - 26}" y="172" style="font-size:${rainDropSize(rain, maxRain)}px; opacity:${rainDropOpacity(rain)}">💧</text>
          <text class="hourlyrain" x="${x + 6}" y="172">${hourlyRainLabel(hour)}</text>
          <text class="hourlytime" x="${x}" y="194">${hourLabel(hour.time)}</text>
        </g>
      `).join("")}
    </svg>
  `;
}

function hourlyRainLabel(hour) {
  const rain = Math.max(hour.rain ?? 0, 0);
  if (rain > 0 && rain < 0.1) return "<0.1mm";
  return `${rain.toFixed(1)}mm`;
}

function rainDropSize(rain, maxRain) {
  if (rain <= 0) return 10;
  const scaled = Math.sqrt(Math.min(rain / Math.max(maxRain, 0.5), 1));
  return 12 + scaled * 12;
}

function rainDropOpacity(rain) {
  if (rain <= 0) return 0.35;
  return Math.min(0.55 + rain * 0.28, 1);
}

function setHourlyDetail(hour) {
  if (!hour) return "";
  const wind = hour.wind == null ? "wind n/a" : `${kmhToMph(hour.wind).toFixed(0)} mph wind`;
  const rainChance = hour.rainChance == null ? "rain chance n/a" : `${hour.rainChance}% rain chance`;
  return `${hourLabel(hour.time)}: ${Math.round(hour.temp ?? 0)} C, ${weatherConditionLabel(hour.weatherCode)}, ${hourlyRainLabel(hour)} rain, ${rainChance}, ${wind}.`;
}

function hourLabel(time) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(time));
}

function updateLochcarronClock() {
  const clock = $("lochcarronClock");
  if (!clock) return;
  const now = new Date();
  const dateText = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(now);
  const timeText = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(now).replace("am", "AM").replace("pm", "PM");
  clock.textContent = `${dateText} · ${timeText}`;
}

function liveUpdateText(updatedAt, source) {
  if (!updatedAt) return "Refreshes every 15 minutes";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(updatedAt));
  const sourceText = source === "cache" ? "saved data" : "live data";
  return `Updated ${time} from ${sourceText}. Refreshes every 15 minutes.`;
}

function updateHeroMarine() {
  if (!DATA.marine) {
    $("heroMarineStatus").textContent = "Unavailable";
    $("heroMarineDetail").textContent = "Live Open-Meteo Marine data could not be loaded.";
    $("heroMarineUpdated").textContent = "Refreshes every 15 minutes";
    return;
  }
  const marine = DATA.marine;
  $("heroMarineStatus").textContent = marineMood(marine.waveHeight);
  const wave = marine.waveHeight == null ? "Wave n/a" : `${marine.waveHeight.toFixed(1)} m waves`;
  const period = marine.wavePeriod == null ? "" : ` · ${marine.wavePeriod.toFixed(0)}s period`;
  const sea = marine.seaLevel == null ? "" : ` · ${marine.seaLevel.toFixed(2)} m sea level`;
  $("heroMarineDetail").textContent = `${wave}${period}${sea}`;
  $("heroMarineUpdated").textContent = liveUpdateText(DATA.marineUpdatedAt, DATA.marineSource);
}

function addDays(dateString, count) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function dayName(dateString) {
  return dayFmt.format(new Date(`${dateString}T12:00:00`));
}

function rainMood(rain) {
  if (rain < 1) return "Dry spell";
  if (rain < 4) return "Light rain";
  if (rain < 9) return "Showery";
  return "Wet day";
}

function weatherIcon(rain) {
  if (rain < 1) return "☀️";
  if (rain < 4) return "⛅";
  if (rain < 9) return "🌦️";
  return "☔";
}

function weatherCodeIcon(code) {
  if (code == null) return "?";
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "⛅";
  if (code === 3) return "⛅";
  if ([45, 48].includes(code)) return "🌫️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌦️";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌦️";
}

function liveWeatherIcon(code, isDay) {
  if (isDay === false) {
    if (code === 0 || code === 1) return "🌙";
    if ([2, 3].includes(code)) return "☁️";
    if ([45, 48].includes(code)) return "🌫️";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "☔";
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "❄️";
    if (code >= 95) return "⛈️";
  }
  return weatherCodeIcon(code);
}

function liveWeatherScene(code, isDay) {
  if (isDay === false && (code === 0 || code === 1)) return "night";
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if ([45, 48].includes(code)) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95) return "storm";
  return "cloud";
}

function tideWeatherIcon(code, isDay) {
  if (isDay) return weatherCodeIcon(code);
  if (code === 0 || code === 1) return "🌙";
  if ([2, 3].includes(code)) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "❄️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

function tideHourlyIcon(hourly, fallbackWeather, isDay) {
  const rain = hourly?.rain;
  if (rain != null && rain >= 1) return isDay ? "🌦️" : "🌧️";
  if (rain != null && rain >= 0.2) return isDay ? "🌦️" : "🌧️";
  if (rain != null && rain > 0) return "💧";
  const code = hourly?.weatherCode ?? fallbackWeather?.weatherCode;
  return code == null ? "·" : tideWeatherIcon(code, isDay);
}

function weatherConditionLabel(code) {
  if (code == null) return "Current conditions";
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([56, 57].includes(code)) return "Freezing drizzle";
  if ([61, 63, 65].includes(code)) return "Rain";
  if ([66, 67].includes(code)) return "Freezing rain";
  if ([71, 73, 75].includes(code)) return "Snow";
  if (code === 77) return "Snow grains";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Mixed weather";
}

function marineMood(waveHeight) {
  if (waveHeight == null) return "Marine check";
  if (waveHeight < 0.5) return "Calm";
  if (waveHeight < 1.2) return "Choppy";
  if (waveHeight < 2) return "Rough";
  return "Very rough";
}

function windMood(wind) {
  if (wind == null) return "Wind n/a";
  if (wind < 15) return "Light wind";
  if (wind < 25) return "Breezy";
  if (wind < 35) return "Windy";
  return "Very windy";
}

function kmhToMph(kmh) {
  return kmh == null ? null : kmh * 0.621371;
}

function shortDay(dateString) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${dateString}T12:00:00`));
}

function shortDayDate(dateString) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }).format(new Date(`${dateString}T12:00:00`));
}

function updateSevenDayOutlook() {
  const weatherDays = DATA.forecast.filter((day) => day.max != null && day.min != null);
  const weatherRangeLabel = $("weatherRangeLabel");
  const sevenWeather = $("sevenWeather");
  if (weatherRangeLabel) weatherRangeLabel.textContent = weatherDays.length ? `Next ${weatherDays.length} days` : "Forecast";
  if ($("tideRangeLabel")) $("tideRangeLabel").textContent = "Next 30 days";
  if (sevenWeather) {
    sevenWeather.innerHTML = weatherDays.length
      ? weatherDays.map((day) => {
        const windMph = kmhToMph(day.wind);
        const gustMph = kmhToMph(day.gust);
        return `
        <div class="forecastcard" title="${dayName(day.date)}: ${day.rain.toFixed(1)} mm rain, ${day.min.toFixed(1)} to ${day.max.toFixed(1)} C, wind ${windMph == null ? "not available" : `${windMph.toFixed(0)} mph`}${gustMph == null ? "" : `, gusts ${gustMph.toFixed(0)} mph`}">
          <span>${shortDay(day.date)}</span>
          <div class="forecasticon" aria-hidden="true">${weatherIcon(day.rain)}</div>
          <strong>${Math.round(day.max)} C</strong>
          <p>${day.rain.toFixed(1)} mm</p>
          <p class="windline">${windMph == null ? "Wind n/a" : `${windMph.toFixed(0)} mph wind`}</p>
          <div class="daybadge">${rainMood(day.rain)}</div>
        </div>
      `;
      }).join("")
      : `<div class="forecastcard"><p>Forecast data is not available in this saved copy.</p></div>`;
  }

  const start = weatherDays[0]?.date || todayISO();
  const tideDays = Array.from({ length: 30 }, (_, i) => addDays(start, i));
  if (!DATA.tideDate || !tideDays.includes(DATA.tideDate)) DATA.tideDate = tideDays[0];
  renderTidePlanner(tideDays);
}

function renderTidePlanner(tideDays = Array.from({ length: 30 }, (_, i) => addDays(todayISO(), i))) {
  if (!$("tideTabs") || !$("tidePlannerDate") || !$("tidePlannerWeather") || !$("tidePlannerChart")) return;
  const selectedDate = DATA.tideDate || tideDays[0];
  const today = todayISO();
  $("tideTabs").innerHTML = tideDays.map((date) => {
    const weather = plannerWeatherForDate(date);
    const tides = tideWindows(date);
    const firstHigh = tides.find((tide) => tide.type === "High");
    const windMph = kmhToMph(weather?.wind);
    const selected = date === selectedDate;
    return `
      <button class="tide-tab" type="button" data-tide-date="${date}" aria-selected="${selected}">
        <span>${date === today ? "Today" : shortDayDate(date)}</span>
        ${weather ? `<div class="forecasticon" aria-hidden="true">${weatherCodeIcon(weather.weatherCode)}</div>` : ""}
        <strong>${weather?.max == null ? "Tide guide" : `${Math.round(weather.max)} C`}</strong>
        <p>${weather?.rain == null ? firstHigh ? `High ${timeLabel(firstHigh.time)}` : "Tide estimate" : `${weather.rain.toFixed(1)} mm`}</p>
        ${weather ? `<p class="windline">${windMph == null ? "Wind n/a" : `${windMph.toFixed(0)} mph wind`}</p>` : ""}
        <div class="daybadge">${weather?.rain == null ? "Tide estimate" : rainMood(weather.rain)}</div>
      </button>
    `;
  }).join("");
  const weather = plannerWeatherForDate(selectedDate);
  const tides = tideWindows(selectedDate);
  $("tidePlannerDate").innerHTML = `<span>Date:</span> <strong>${selectedDate === today ? "Today" : dayName(selectedDate)}</strong>`;
  $("tidePlannerWeather").innerHTML = tidePlannerWeatherMarkup(selectedDate, weather);
  $("tidePlannerChart").innerHTML = tidePlannerChartMarkup(selectedDate, weather, tides);
}

function plannerWeatherForDate(dateString) {
  const forecastDay = DATA.forecast.find((day) => day.date === dateString);
  if (forecastDay) return withCurrentWeather(forecastDay);
  const hours = DATA.hourly.filter((hour) => hour.date === dateString);
  if (!hours.length) return null;
  const temps = hours.map((hour) => hour.temp).filter((temp) => temp != null);
  return {
    date: dateString,
    max: temps.length ? Math.max(...temps) : null,
    min: temps.length ? Math.min(...temps) : null,
    rain: hours.reduce((sum, hour) => sum + Math.max(hour.rain ?? 0, 0), 0),
    wind: Math.max(...hours.map((hour) => hour.wind ?? 0)),
    weatherCode: hours.find((hour) => hour.weatherCode != null)?.weatherCode ?? null
  };
}

function tidePlannerWeatherMarkup(dateString, weather) {
  const daylight = tideDaylightWindow(dateString, weather);
  const sampleHours = Array.from({ length: 24 }, (_, hour) => hour);
  return sampleHours.map((hour) => {
    const hourly = DATA.hourly.find((item) => item.date === dateString && new Date(item.time).getHours() === hour);
    const isDay = hour >= daylight.sunrise && hour < daylight.sunset;
    const windMph = kmhToMph(hourly?.wind ?? weather?.wind);
    const rain = hourly?.rain;
    return `
      <div class="tide-weather-hour${isDay ? "" : " is-night"}">
        <span>${hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}</span>
        <div class="forecasticon" aria-hidden="true">${tideHourlyIcon(hourly, weather, isDay)}</div>
        <strong>${windMph == null ? "n/a" : windMph.toFixed(0)}</strong>
        <small>mph</small>
        <em>${rain == null ? "rain n/a" : `${rain.toFixed(1)} mm`}</em>
      </div>
    `;
  }).join("");
}

function tideDaylightWindow(dateString, weather) {
  const estimated = sunTimes(dateString);
  return {
    sunrise: clockHours(weather?.sunrise) ?? estimated.sunrise,
    sunset: clockHours(weather?.sunset) ?? estimated.sunset
  };
}

function tideHeightAt(dateString, hour) {
  const events = tideWindows(dateString)
    .flatMap((event) => [-24, 0, 24].map((offset) => ({ ...event, time: event.time + offset })))
    .sort((a, b) => a.time - b.time);
  let previous = events[0];
  let next = events[events.length - 1];
  for (let i = 1; i < events.length; i += 1) {
    if (events[i].time >= hour) {
      previous = events[i - 1];
      next = events[i];
      break;
    }
  }
  const span = Math.max(next.time - previous.time, 0.1);
  const progress = Math.max(0, Math.min(1, (hour - previous.time) / span));
  const eased = (1 - Math.cos(progress * Math.PI)) / 2;
  return previous.height + (next.height - previous.height) * eased;
}

function tidePlannerChartMarkup(dateString, weather, tides, variant = "main") {
  const width = 980;
  const height = 330;
  const fillId = `tidePlannerFill-${variant}`;
  const pad = { left: 58, right: 24, top: 26, bottom: 48 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const points = Array.from({ length: 97 }, (_, i) => {
    const hour = i * 0.25;
    return { hour, height: tideHeightAt(dateString, hour) };
  });
  const maxHeight = Math.max(...points.map((point) => point.height), ...tides.map((tide) => tide.height));
  const minHeight = Math.min(...points.map((point) => point.height), ...tides.map((tide) => tide.height), 0);
  const range = Math.max(maxHeight - minHeight, 0.5);
  const xFor = (hour) => pad.left + (hour / 24) * chartW;
  const yFor = (value) => pad.top + chartH - ((value - minHeight) / range) * chartH;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.hour).toFixed(1)} ${yFor(point.height).toFixed(1)}`).join(" ");
  const today = todayISO();
  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const showNow = dateString === today;
  const nowX = xFor(nowHour);
  const nowHeight = tideHeightAt(dateString, nowHour);
  return `
    <svg class="tideplanner-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tide height curve for ${dayName(dateString)}">
      <defs>
        <linearGradient id="${fillId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--rain)" stop-opacity="0.42"></stop>
          <stop offset="100%" stop-color="var(--rain)" stop-opacity="0.08"></stop>
        </linearGradient>
      </defs>
      ${[0, 6, 12, 18, 24].map((hour) => `
        <g class="tideplanner-tick">
          <line x1="${xFor(hour)}" y1="${pad.top}" x2="${xFor(hour)}" y2="${pad.top + chartH}"></line>
          <text x="${xFor(hour)}" y="${height - 17}">${hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : hour === 24 ? "12 AM" : `${hour - 12} PM`}</text>
        </g>
      `).join("")}
      ${[minHeight, (minHeight + maxHeight) / 2, maxHeight].map((heightValue) => `
        <g class="tideplanner-height">
          <line x1="${pad.left}" y1="${yFor(heightValue)}" x2="${width - pad.right}" y2="${yFor(heightValue)}"></line>
          <text x="16" y="${yFor(heightValue) + 5}">${heightValue.toFixed(1)}m</text>
        </g>
      `).join("")}
      <path class="tideplanner-fill" d="${path} L ${width - pad.right} ${pad.top + chartH} L ${pad.left} ${pad.top + chartH} Z" style="fill:url(#${fillId})"></path>
      <path class="tideplanner-line" d="${path}"></path>
      ${tides.map((tide) => {
        const normalized = ((tide.time % 24) + 24) % 24;
        return `
          <g class="tideplanner-event" transform="translate(${xFor(normalized).toFixed(1)} ${yFor(tide.height).toFixed(1)})">
            <circle r="6"></circle>
            <text y="${tide.type === "High" ? -14 : 25}">${tide.type} ${timeLabel(tide.time)} · ${tide.height.toFixed(1)}m</text>
          </g>
        `;
      }).join("")}
      ${showNow ? `
        <g class="tideplanner-now">
          <line x1="${nowX.toFixed(1)}" y1="${pad.top}" x2="${nowX.toFixed(1)}" y2="${pad.top + chartH}"></line>
          <circle cx="${nowX.toFixed(1)}" cy="${yFor(nowHeight).toFixed(1)}" r="7"></circle>
          <text x="${Math.min(nowX + 10, width - 70).toFixed(1)}" y="${pad.top + 18}">NOW</text>
        </g>
      ` : ""}
    </svg>
  `;
}

function currentGroups() {
  const mode = DATA.rainMode;
  if (mode === "week") return groupByWeek();
  if (mode === "season") return groupBySeason();
  if (mode === "year") return groupByYear();
  return groupByMonth();
}

function drawRainChart() {
  const canvas = $("rainChart");
  const ctx = canvas.getContext("2d");
  const groups = currentGroups();
  const mode = DATA.rainMode;
  const titleMap = {
    month: "Average daily rainfall",
    week: "Average daily rainfall by week",
    season: "Average daily rainfall by season",
    year: "Total rainfall by year"
  };
  const unitMap = {
    month: "Millimetres per day",
    week: "Millimetres per day",
    season: "Millimetres per day",
    year: "Millimetres per year"
  };
  $("chartTitle").textContent = titleMap[mode] || "Rainfall";
  $("chartUnit").textContent = unitMap[mode] || "Millimetres";
  updateRainSource();
  DATA.selectedBars = groups;
  DATA.barHits = [];
  const max = Math.max(...groups.map((g) => g.value), 1);
  const pad = { left: 116, right: 24, top: 34, bottom: 78 };
  const w = canvas.width;
  const h = canvas.height;
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const gap = groups.length > 24 ? 4 : 12;
  const barW = (chartW - gap * (groups.length - 1)) / groups.length;
  const paper = cssVar("--paper") || "#f8faf5";
  const ink = cssVar("--ink") || "#182426";
  const muted = cssVar("--muted") || "#61706d";
  const line = cssVar("--line") || "#dce5de";
  const panel = cssVar("--panel") || "#ffffff";
  const sea = cssVar("--sea") || "#1f6f7a";
  const rain = cssVar("--rain") || "#6ea7c8";
  const sun = cssVar("--sun") || "#e3ab3b";

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.lineTo(w - pad.right, pad.top + chartH);
  ctx.stroke();

  ctx.font = "20px system-ui, sans-serif";
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  [0, 0.25, 0.5, 0.75, 1].forEach((tick) => {
    const y = pad.top + chartH - chartH * tick;
    const value = max * tick;
    ctx.fillText(`${value.toFixed(0)}mm`, pad.left - 14, y + 7);
    ctx.strokeStyle = tick === 0 ? line : panel;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  });

  groups.forEach((g, i) => {
    const x = pad.left + i * (barW + gap);
    const barH = (g.value / max) * chartH;
    const y = pad.top + chartH - barH;
    DATA.barHits[i] = { x, y, w: barW, h: barH, group: g };
    const dryScore = 1 - g.value / max;
    ctx.fillStyle = dryScore > 0.66 ? sun : dryScore > 0.38 ? sea : rain;
    roundRect(ctx, x, y, barW, barH, 8);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = groups.length > 24 ? "16px system-ui, sans-serif" : "22px system-ui, sans-serif";
    ctx.textAlign = "center";
    const label = chartLabel(g, mode, i, groups.length);
    if (label) ctx.fillText(label, x + barW / 2, pad.top + chartH + 34);
  });

  const best = [...groups].sort((a, b) => a.value - b.value)[0];
  setChartDetail(best);
  updateComfort(best);
}

function chartLabel(group, mode, index = 0, total = 0) {
  const label = group.label;
  if (mode === "week") return group.axisLabel || "";
  if (mode === "year" && total > 18) {
    const year = Number(label);
    if (index === 0 || index === total - 1 || year % 10 === 0) return label;
    return "";
  }
  const monthLabels = {
    January: "Jan",
    February: "Feb",
    March: "Mar",
    April: "Apr",
    May: "May",
    June: "Jun",
    July: "Jul",
    August: "Aug",
    September: "Sept",
    October: "Oct",
    November: "Nov",
    December: "Dec"
  };
  return monthLabels[label] || label;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
}

function setChartDetail(group) {
  const unit = DATA.rainMode === "year" ? "total rainfall" : "average daily rainfall";
  const mood = group.value < 3 ? "dry" : group.value < 6 ? "wet" : "soggy";
  const tips = {
    dry: "One of the better-looking options for easier days out, with normal Highland backup layers.",
    wet: "Still very usable for holidays, especially with flexible plans and cafe or indoor time ready.",
    soggy: "Better for cosy days, dramatic views, waterfalls and short weather-window trips."
  };
  $("chartDetail").innerHTML = `<strong>${group.label}</strong> has about <strong>${group.value.toFixed(1)} mm</strong> ${unit}. ${tips[mood]}`;
}

function chartHoverText(group) {
  const unit = DATA.rainMode === "year" ? "total rainfall" : "avg daily rainfall";
  return `<strong>${group.label}</strong><span>${group.value.toFixed(1)} mm ${unit}</span>`;
}

function updateComfort(group) {
  const score = Math.max(8, Math.round(100 - Math.min(group.value, 10) * 9));
  $("comfortBar").style.width = `${score}%`;
  $("comfortText").textContent = `${score}/100 visitor comfort`;
}

function timeLabel(hours) {
  const normalized = ((hours % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.round((normalized - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function tideWindows(dateString) {
  const base = Date.UTC(2026, 5, 26, 6, 48);
  const day = new Date(`${dateString}T12:00:00Z`);
  const days = (day.getTime() - base) / 86400000;
  const drift = (days * 0.84) % 12.42;
  const high1 = 6.8 + drift;
  const springCycle = (Math.cos((2 * Math.PI * days) / 14.765) + 1) / 2;
  const highHeight = 4.2 + springCycle * 0.8;
  const lowHeight = 1.3 - springCycle * 0.45;
  return [
    { type: "High", time: high1, height: highHeight, note: "Fuller loch views, boats sitting prettier, easy arrival photos." },
    { type: "Low", time: high1 + 6.21, height: lowHeight, note: "More shore to explore, rock pools and textured foregrounds." },
    { type: "High", time: high1 + 12.42, height: highHeight - 0.1, note: "Good for reflections and sheltered shoreline watching." },
    { type: "Low", time: high1 + 18.63, height: lowHeight + 0.1, note: "Extra beach shape, but watch slippery weed and returning tide." }
  ].sort((a, b) => (a.time % 24) - (b.time % 24));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function moonPhase(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNewMoon) / 86400000;
  const age = ((days % 29.53058867) + 29.53058867) % 29.53058867;
  if (age < 1.8 || age > 27.7) return "New Moon";
  if (age < 6.4) return "Waxing Crescent";
  if (age < 8.4) return "First Quarter";
  if (age < 13.8) return "Waxing Gibbous";
  if (age < 15.8) return "Full Moon";
  if (age < 21.1) return "Waning Gibbous";
  if (age < 23.1) return "Last Quarter";
  return "Waning Crescent";
}

function moonPhaseClass(phase) {
  return {
    "New Moon": "phase-new",
    "Waxing Crescent": "phase-waxing-crescent",
    "First Quarter": "phase-first-quarter",
    "Waxing Gibbous": "phase-waxing-gibbous",
    "Full Moon": "phase-full",
    "Waning Gibbous": "phase-waning-gibbous",
    "Last Quarter": "phase-last-quarter",
    "Waning Crescent": "phase-waning-crescent"
  }[phase] || "phase-new";
}

function moonPhaseDescription(phase) {
  return {
    "New Moon": "The Moon is not visible as the side facing Earth is not illuminated.",
    "Waxing Crescent": "A small portion of the Moon is lit and getting larger.",
    "First Quarter": "Half of the Moon is lit with the right side illuminated.",
    "Waxing Gibbous": "More than half of the Moon is lit and still getting larger.",
    "Full Moon": "The whole face of the Moon is illuminated.",
    "Waning Gibbous": "More than half of the Moon is lit but the light is decreasing.",
    "Last Quarter": "Half of the Moon is lit with the left side illuminated.",
    "Waning Crescent": "A small portion of the Moon is lit and getting smaller."
  }[phase] || "Moon phase information.";
}

function daylightHours(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((date - start) / 86400000);
  const lat = 57.4 * Math.PI / 180;
  const decl = 0.409 * Math.sin((2 * Math.PI / 365) * dayOfYear - 1.39);
  const angle = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl))));
  return (24 / Math.PI) * angle;
}

function sunTimes(dateString) {
  const daylight = daylightHours(dateString);
  return {
    daylight,
    sunrise: 12 - daylight / 2,
    sunset: 12 + daylight / 2
  };
}

function timeLabel12(hours) {
  const normalized = ((hours % 24) + 24) % 24;
  let h = Math.floor(normalized);
  let m = Math.round((normalized - h) * 60);
  if (m === 60) {
    h = (h + 1) % 24;
    m = 0;
  }
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

function clockHours(value) {
  if (!value) return null;
  const time = value.includes("T") ? value.split("T")[1] : value;
  const [hour, minute] = time.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour + minute / 60 : null;
}

function daylightFromSun(sunrise, sunset) {
  if (sunrise == null || sunset == null) return null;
  return ((sunset - sunrise + 24) % 24) || 24;
}

function daylightPanel(dateString, weather = null) {
  const estimated = sunTimes(dateString);
  const sunrise = clockHours(weather?.sunrise) ?? estimated.sunrise;
  const sunset = clockHours(weather?.sunset) ?? estimated.sunset;
  const daylight = daylightFromSun(sunrise, sunset) ?? estimated.daylight;
  return `
    <div class="sunpoint">
      <strong>${timeLabel12(sunrise)}</strong>
      <small>Sunrise</small>
    </div>
    <div class="daylightmiddle">
      <strong>${daylight.toFixed(1)} hours</strong>
      <small>of daylight</small>
      <i></i>
    </div>
    <div class="sunpoint">
      <strong>${timeLabel12(sunset)}</strong>
      <small>Sunset</small>
    </div>
  `;
}

function holidayName(dateString) {
  const [, month, day] = dateString.split("-");
  if (`${month}-${day}` === "12-25") return "Christmas Day";
  if (`${month}-${day}` === "01-01") return "New Year's Day";
  if (`${month}-${day}` === "12-31") return "Hogmanay";
  if (`${month}-${day}` === "06-21") return "Around midsummer";
  return "A Lochcarron day";
}

async function getWeatherForDate(dateString) {
  const forecastDay = DATA.forecast.find((day) => day.date === dateString);
  if (forecastDay) {
    return withCurrentWeather({
      ...forecastDay,
      sourceLabel: "Live Open-Meteo forecast data."
    });
  }
  if (DATA.byDate.has(dateString)) return withCurrentWeather(DATA.byDate.get(dateString));
  const source = archiveSourceForDate(dateString);
  if (!source) return null;
  try {
    const cacheKey = `${RAIN_ARCHIVE_CACHE_PREFIX}day.${dateString}.${source.model}`;
    let json;
    const cached = readCache(cacheKey);
    if (cached?.data) {
      json = cached.data;
    } else {
      json = await fetchJson(archiveUrl(dateString, dateString, source.model));
      writeCache(cacheKey, json);
    }
    return parseOpenMeteoWithSource(json, source.label)[0] || null;
  } catch {
    return null;
  }
}

function archiveSourceForDate(dateString) {
  if (dateString < "1950-01-01") return null;
  if (dateString >= "2017-01-01") {
    return {
      model: "best_match",
      label: "Recent detailed view: 2017 onwards uses higher-resolution modern Open-Meteo archive data."
    };
  }
  return {
    model: "best_match",
    label: "Long history view: older dates use long-term reanalysis data, not a local rain gauge."
  };
}

function dateRangeNote(rangeKey = DATA.dateRange) {
  if (rangeKey === "long") {
    return "Long history view: 1950 to today. Older dates use long-term reanalysis data, not a local rain gauge.";
  }
  return "Recent detailed view: 2017 onwards uses higher-resolution modern Open-Meteo archive data.";
}

function applyDateRange(rangeKey = DATA.dateRange) {
  DATA.dateRange = rangeKey;
  setActiveChoice("dateRangeChoices", "dateRange", DATA.dateRange);
  $("dateRangeNote").textContent = dateRangeNote(DATA.dateRange);
  const min = DATA.dateRange === "long" ? "1950-01-01" : "2017-01-01";
  $("factDate").min = min;
  if ($("factDate").value && $("factDate").value < min) {
    $("factDate").value = min;
  }
  buildDateSelectors();
  syncDateSelectorsFromInput();
}

function buildDateSelectors() {
  const minYear = DATA.dateRange === "long" ? 1950 : 2017;
  const maxYear = new Date().getFullYear();
  const currentYear = $("factYear").value || String(maxYear);
  $("factYear").innerHTML = Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
    const year = maxYear - i;
    return `<option value="${year}">${year}</option>`;
  }).join("");
  $("factYear").value = Math.min(Math.max(Number(currentYear), minYear), maxYear);

  $("factMonth").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const value = String(i + 1).padStart(2, "0");
    return `<option value="${value}">${shortMonthFmt.format(new Date(2025, i, 1))}</option>`;
  }).join("");
}

function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function syncDateSelectorsFromInput() {
  const value = $("factDate").value || todayISO();
  const [year, month, day] = value.split("-");
  $("factYear").value = year;
  $("factMonth").value = month;
  buildDayChoices(day);
}

function buildDayChoices(preferredDay = $("factDay").value || "01") {
  const year = $("factYear").value || String(new Date().getFullYear());
  const month = $("factMonth").value || "01";
  const maxDay = daysInMonth(year, month);
  const selectedDay = Math.min(Number(preferredDay), maxDay);
  $("factDay").innerHTML = Array.from({ length: maxDay }, (_, i) => {
    const value = String(i + 1).padStart(2, "0");
    return `<option value="${value}">${i + 1}</option>`;
  }).join("");
  $("factDay").value = String(selectedDay).padStart(2, "0");
}

function syncInputFromDateSelectors() {
  buildDayChoices();
  $("factDate").value = `${$("factYear").value}-${$("factMonth").value}-${$("factDay").value}`;
}

async function updateDateFacts() {
  const dateString = $("factDate").value || todayISO();
  const date = new Date(`${dateString}T12:00:00`);
  const weather = await getWeatherForDate(dateString);
  const tides = tideWindows(dateString);
  const windMph = weather ? kmhToMph(weather.wind) : null;
  const gustMph = weather ? kmhToMph(weather.gust) : null;
  const conditionLabel = weather?.weatherCode == null ? "Archive weather" : weatherConditionLabel(weather.weatherCode);
  const weatherSummary = weather
    ? `${conditionLabel} · ${weather.rain.toFixed(1)} mm rain · ${weather.min?.toFixed(1) ?? "?"} to ${weather.max?.toFixed(1) ?? "?"} C`
    : "Weather lookup unavailable";
  const windSummary = windMph == null ? "Wind n/a" : `${windMph.toFixed(0)} mph wind${gustMph == null ? "" : ` · ${gustMph.toFixed(0)} mph gusts`}`;
  const bookingTip = weather && weather.rain < 2
    ? "A promising dry-day pattern for outdoor plans."
    : weather && weather.rain < 8
      ? "Good with flexible plans and waterproofs."
      : "Make it cosy, scenic, and weather-aware.";
  const phase = moonPhase(dateString);

  $("dateFacts").innerHTML = `
    <p class="kicker">${holidayName(dateString)}</p>
    <h3>${fmt.format(date)}</h3>
    <div class="datefact-panels">
      <div class="datefact-card weatherfact">
        <span>Weather</span>
        <div class="forecasticon" aria-hidden="true">${weather ? weatherIcon(weather.rain) : "?"}</div>
        <strong>${weather?.currentTemp == null && weather?.max == null ? "No temp" : `${Math.round(weather.currentTemp ?? weather.max)} C`}</strong>
        <p>${weatherSummary}</p>
        <p class="windline">${windSummary}</p>
      </div>
      <div class="datefact-card tidefact">
        <span>Tides</span>
        <div class="tidegrid">
          ${tides.map((t) => `
            <div>
              <small>${t.type}</small>
              <strong>${timeLabel(t.time)}</strong>
              <em>${t.height.toFixed(1)}m est.</em>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="datefact-card smallfact daylightfact">
        <span>Daylight</span>
        <div class="daylightpanel">${daylightPanel(dateString, weather)}</div>
      </div>
      <div class="datefact-card smallfact moonfact">
        <span>Moon</span>
        <div class="mooncopy">
          <strong>${phase}</strong>
          <p>${moonPhaseDescription(phase)}</p>
        </div>
        <div class="moonphase ${moonPhaseClass(phase)}" aria-hidden="true"></div>
      </div>
    </div>
    <p>${bookingTip}</p>
    <p class="data-source">${weather?.sourceLabel || "Weather archive data is available from 1950 onwards."}</p>
  `;
}

function setActiveChoice(groupId, dataName, value) {
  document.querySelectorAll(`#${groupId} .choicebox`).forEach((button) => {
    button.classList.toggle("is-active", button.dataset[dataName] === value);
  });
}

function updateYearFilterVisibility() {
  $("yearFilterGroup").hidden = DATA.rainMode === "year";
}

$("rainModeChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-mode]");
  if (!button) return;
  DATA.rainMode = button.dataset.mode;
  setActiveChoice("rainModeChoices", "mode", DATA.rainMode);
  if (DATA.rainMode === "year") {
    DATA.yearFilter = "all";
    setActiveChoice("yearChoices", "year", DATA.yearFilter);
  }
  updateYearFilterVisibility();
  drawRainChart();
});

$("rainRangeChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) return;
  DATA.rainRange = button.dataset.range;
  setActiveChoice("rainRangeChoices", "range", DATA.rainRange);
  loadRainArchive(DATA.rainRange).catch(() => {});
});

$("yearChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-year]");
  if (!button) return;
  DATA.yearFilter = button.dataset.year;
  setActiveChoice("yearChoices", "year", DATA.yearFilter);
  drawRainChart();
});

$("rainChart").addEventListener("click", (event) => {
  const canvas = $("rainChart");
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  const hit = DATA.barHits.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (hit) {
    setChartDetail(hit.group);
    updateComfort(hit.group);
  }
});
$("rainChart").addEventListener("mousemove", (event) => {
  const canvas = $("rainChart");
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  const hit = DATA.barHits.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  const tooltip = $("chartTooltip");
  if (!hit) {
    tooltip.hidden = true;
    canvas.style.cursor = "default";
    return;
  }
  const panelRect = tooltip.parentElement.getBoundingClientRect();
  tooltip.innerHTML = chartHoverText(hit.group);
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX - panelRect.left}px`;
  tooltip.style.top = `${event.clientY - panelRect.top}px`;
  canvas.style.cursor = "pointer";
});
$("rainChart").addEventListener("mouseleave", () => {
  $("chartTooltip").hidden = true;
  $("rainChart").style.cursor = "default";
});
$("factButton").addEventListener("click", updateDateFacts);
["factYear", "factMonth", "factDay"].forEach((id) => {
  $(id).addEventListener("change", () => {
    syncInputFromDateSelectors();
    updateDateFacts();
  });
});
$("dateRangeChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-date-range]");
  if (!button) return;
  applyDateRange(button.dataset.dateRange);
  updateDateFacts();
});
$("hourlyTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-hourly-date]");
  if (!button) return;
  DATA.hourlyDate = button.dataset.hourlyDate;
  updateHeroHourly();
});
$("tideTabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tide-date]");
  if (!button) return;
  DATA.tideDate = button.dataset.tideDate;
  const start = DATA.forecast.find((day) => day.max != null && day.min != null)?.date || todayISO();
  renderTidePlanner(Array.from({ length: 30 }, (_, i) => addDays(start, i)));
});
$("hourlyChart").addEventListener("pointerover", (event) => {
  const point = event.target.closest(".hourlypoint");
  if (!point) return;
  activateHourlyPoint(point, event);
});
$("hourlyChart").addEventListener("click", (event) => {
  const point = event.target.closest(".hourlypoint");
  if (!point) return;
  activateHourlyPoint(point, event);
});
$("hourlyChart").addEventListener("focusin", (event) => {
  const point = event.target.closest(".hourlypoint");
  if (!point) return;
  activateHourlyPoint(point);
});
$("hourlyChart").addEventListener("pointerleave", () => {
  $("hourlyTooltip").hidden = true;
});
$("hourlyChart").addEventListener("focusout", (event) => {
  if ($("hourlyChart").contains(event.relatedTarget)) return;
  $("hourlyTooltip").hidden = true;
});

document.querySelector(".theme-toggle")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-choice]");
  if (!button) return;
  setThemeMode(button.dataset.themeChoice);
});

if (themeMedia) {
  const handleThemeChange = () => {
    if (getThemeMode() === "auto") {
      applyThemeMode("auto");
      if (DATA.daily.length && $("rainChart")) drawRainChart();
    }
  };
  if (themeMedia.addEventListener) {
    themeMedia.addEventListener("change", handleThemeChange);
  } else if (themeMedia.addListener) {
    themeMedia.addListener(handleThemeChange);
  }
}

function activateHourlyPoint(point, event = null) {
  document.querySelectorAll(".hourlypoint").forEach((item) => item.classList.remove("is-active"));
  point.classList.add("is-active");
  const hours = hourlyWindow(DATA.hourlyDate);
  const text = setHourlyDetail(hours[Number(point.dataset.hourIndex)]);
  const tooltip = $("hourlyTooltip");
  tooltip.textContent = text;
  tooltip.hidden = false;
  positionHourlyTooltip(point, tooltip, event);
}

function positionHourlyTooltip(point, tooltip, event) {
  const panelRect = document.querySelector(".hero-hourly").getBoundingClientRect();
  let x;
  let y;
  if (event && Number.isFinite(event.clientX)) {
    x = event.clientX - panelRect.left;
    y = event.clientY - panelRect.top;
  } else {
    const pointRect = point.getBoundingClientRect();
    x = pointRect.left + pointRect.width / 2 - panelRect.left;
    y = pointRect.top - panelRect.top;
  }
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.max(10, Math.min(x - tooltipRect.width / 2, panelRect.width - tooltipRect.width - 10));
  const top = Math.max(10, y - tooltipRect.height - 14);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

loadDailyThought().catch(() => renderDailyThought(THOUGHT_FALLBACK));
updateLochcarronClock();
applyThemeMode();
setInterval(() => {
  updateLochcarronClock();
  refreshDailyThoughtIfNeeded();
}, 60 * 1000);

loadData().catch((error) => {
  document.documentElement.classList.remove("is-loading");
  document.body.insertAdjacentHTML("afterbegin", `<p style="padding:12px;background:#ffe8c2;margin:0">Could not load local weather data: ${error.message}</p>`);
});
