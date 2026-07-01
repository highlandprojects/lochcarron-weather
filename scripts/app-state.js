var DATA = {
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

var $ = (id) => document.getElementById(id);
var fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
var dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
var monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long" });
var shortMonthFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });
var WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast?latitude=57.405&longitude=-5.503&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset&timezone=Europe/London&forecast_days=14";
var MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine?latitude=57.405&longitude=-5.503&hourly=sea_level_height_msl,wave_height,wave_direction,wave_period&timezone=Europe/London";
var WEATHER_CACHE_KEY = "lochcarron.openMeteo.weather.v7";
var MARINE_CACHE_KEY = "lochcarron.openMeteo.marine.v1";
var RAIN_ARCHIVE_CACHE_PREFIX = "lochcarron.openMeteo.rainArchive.v1.";
var THEME_CACHE_KEY = "lochcarron.themeMode";
var THOUGHTS_URL = "data/thoughts.json";
var THOUGHT_FALLBACK = {
  category: "Highland",
  text: "The weather changes every day. The beauty of Lochcarron never does."
};
var LIVE_REFRESH_MS = 15 * 60 * 1000;
var themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
var displayedThoughtDate = null;
var RAIN_RANGES = {
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
