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
