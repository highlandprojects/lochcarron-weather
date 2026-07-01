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

  updateHeroWeatherPhoto(weather);
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

function updateHeroWeatherPhoto(weather) {
  const photo = $("heroWeatherPhoto");
  if (!photo) return;
  const img = photo.querySelector("img");
  if (!img) return;
  const asset = weatherPhotoAsset(weather);
  photo.dataset.weather = asset.key;
  img.src = asset.src;
}

function weatherPhotoAsset(weather) {
  const code = weather?.weatherCode;
  const windMph = weather?.wind == null ? 0 : kmhToMph(weather.wind);
  const key = weatherPhotoKey(code, weather?.isDay, windMph);
  return {
    key,
    src: `assets/live/weather-${key}.png`
  };
}

function weatherPhotoKey(code, isDay, windMph = 0) {
  if (isDay === false) return "night";
  if (windMph >= 26 || code >= 95) return "windy";
  if ([45, 48].includes(code)) return "fog";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 0 || code === 1) return "sunny";
  return "cloudy";
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
    <div class="planner-section__head">
      <span>Tide Planner</span>
      <strong>${dateString === todayISO() ? "Today" : dayName(dateString)}</strong>
    </div>
    <div class="hero-hourly-tides__weather planner-hourly-cues" aria-label="Hourly weather cues for tide planning">
      ${tidePlannerWeatherMarkup(dateString, weather)}
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
