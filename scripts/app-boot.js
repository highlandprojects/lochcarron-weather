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
