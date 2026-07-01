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
