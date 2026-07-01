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
