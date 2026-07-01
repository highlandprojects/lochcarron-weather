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
