const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = {
  workflow: null,
  activeTab: "backtest",
  backtestMarket: "all-signals",
  backtestMetric: "distance_bps",
  paperGate: "backtest_to_paper",
  liveGate: "paper_to_live",
};

function byId(id) {
  return document.getElementById(id);
}

function loadJson(path) {
  return fetch(`${path}?_=${Date.now()}`).then((response) => {
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  });
}

function inflateRows(columns, rows) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0])) return rows || [];
  return rows.map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index]])));
}

function normalizeWorkflow(workflow) {
  const backtest = workflow.backtest || {};
  backtest.markets = inflateRows(backtest.market_columns, backtest.markets);
  backtest.series = inflateRows(backtest.series_columns, backtest.series);
  backtest.signals = inflateRows(backtest.signal_columns, backtest.signals);
  return workflow;
}

function shortDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function marketLabel(row) {
  const when = row.window_start
    ? new Date(row.window_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Unknown";
  const slug = String(row.slug || row.condition_id || "").replace("btc-updown-5m-", "");
  return `${when} | ${slug}${row.has_signal ? " | signal" : ""}`;
}

function metricLabel(metric) {
  if (metric === "signal_ask") return "Dominant-side ask";
  if (metric === "top5_capacity_dollars") return "Top-5 capacity";
  return "BTC distance";
}

function formatValue(value, metric) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  if (metric === "signal_ask") return Number(value).toFixed(2);
  if (metric === "top5_capacity_dollars") return money.format(value);
  return `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1)} bps`;
}

function formatActual(value) {
  if (value === null || value === undefined) return "--";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (Math.abs(value) <= 1 && value !== 0) return `${(value * 100).toFixed(1)}%`;
    return fmt.format(value);
  }
  return String(value);
}

function svgEmpty(message) {
  return `<div class="empty">${message}</div>`;
}

function pathFrom(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function niceDomain(values, metric) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return [0, 1];
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (metric === "signal_ask") return [Math.max(0, min - 0.02), Math.min(1, max + 0.02)];
  if (min === max) {
    const pad = Math.abs(min || 1) * 0.1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

function renderBacktestSelects() {
  const markets = state.workflow.backtest.markets || [];
  const signalMarkets = markets.filter((row) => row.has_signal);
  byId("backtestMarket").innerHTML = [
    `<option value="all-signals">All signal markets</option>`,
    ...signalMarkets.map((row) => `<option value="${row.condition_id}">${marketLabel(row)}</option>`),
    ...markets
      .filter((row) => !row.has_signal)
      .map((row) => `<option value="${row.condition_id}">${marketLabel(row)}</option>`),
  ].join("");
  byId("backtestMarket").value = state.backtestMarket;
  byId("backtestMetric").value = state.backtestMetric;
}

function renderBacktestChart() {
  const workflow = state.workflow;
  const signals = workflow.backtest.signals || [];
  const series = workflow.backtest.series || [];
  const metric = state.backtestMetric;
  const view = { width: 980, height: 470, left: 76, right: 28, top: 32, bottom: 64 };
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;

  if (state.backtestMarket === "all-signals") {
    if (!signals.length) {
      byId("backtestChart").innerHTML = svgEmpty("No backtest signals.");
      return;
    }
    const values = signals.map((row) => Number(row.cumulative_pnl_after_haircut || 0));
    const [minY, maxY] = niceDomain(values, "pnl");
    const xFor = (index) => view.left + (index / Math.max(signals.length - 1, 1)) * plotWidth;
    const yFor = (value) => view.top + ((maxY - value) / Math.max(maxY - minY, 1)) * plotHeight;
    const points = signals.map((row, index) => ({ row, x: xFor(index), y: yFor(Number(row.cumulative_pnl_after_haircut || 0)) }));
    const yTicks = [minY, (minY + maxY) / 2, maxY];
    const grid = yTicks.map((tick) => {
      const y = yFor(tick);
      return `<line class="grid" x1="${view.left}" y1="${y}" x2="${view.left + plotWidth}" y2="${y}"></line><text class="tick" x="${view.left - 10}" y="${y + 4}" text-anchor="end">${money.format(tick)}</text>`;
    }).join("");
    const dots = points.map(({ row, x, y }, index) => `
      <circle class="dot ${row.outcome_win ? "pass" : "fail"}" cx="${x}" cy="${y}" r="6">
        <title>${shortDate(row.window_start)} | ${row.intended_outcome} @ ${Number(row.signal_ask).toFixed(2)} | cumulative ${money.format(row.cumulative_pnl_after_haircut)}</title>
      </circle>
      <text class="tick" x="${x}" y="${view.top + plotHeight + 26}" text-anchor="middle">${index + 1}</text>`).join("");

    byId("backtestChart").innerHTML = `
      <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Backtest cumulative PnL">
        <rect class="plot" x="${view.left}" y="${view.top}" width="${plotWidth}" height="${plotHeight}"></rect>
        ${grid}
        <path class="line" d="${pathFrom(points)}"></path>
        ${dots}
        <text class="axis" x="${view.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">Historical signals</text>
        <text class="axis" x="20" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 20 ${view.top + plotHeight / 2})">Cumulative PnL after haircut</text>
      </svg>`;
    return;
  }

  const rows = series.filter((row) => row.condition_id === state.backtestMarket);
  const chartRows = rows.filter((row) => Number.isFinite(Number(row[metric])));
  if (!chartRows.length) {
    byId("backtestChart").innerHTML = svgEmpty("No values for this market and metric.");
    return;
  }
  const values = chartRows.map((row) => Number(row[metric]));
  const [minY, maxY] = niceDomain(values, metric);
  const xFor = (secondsLeft) => view.left + ((300 - Number(secondsLeft)) / 300) * plotWidth;
  const yFor = (value) => view.top + ((maxY - Number(value)) / Math.max(maxY - minY, 1)) * plotHeight;
  const points = chartRows.map((row) => ({ row, x: xFor(row.seconds_left), y: yFor(row[metric]) }));
  const xTicks = [300, 240, 180, 120, 60, 0];
  const yTicks = [minY, (minY + maxY) / 2, maxY];
  const grid = [
    ...xTicks.map((tick) => {
      const x = xFor(tick);
      return `<line class="grid" x1="${x}" y1="${view.top}" x2="${x}" y2="${view.top + plotHeight}"></line><text class="tick" x="${x}" y="${view.top + plotHeight + 26}" text-anchor="middle">${tick}s</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = yFor(tick);
      return `<line class="grid" x1="${view.left}" y1="${y}" x2="${view.left + plotWidth}" y2="${y}"></line><text class="tick" x="${view.left - 10}" y="${y + 4}" text-anchor="end">${formatValue(tick, metric)}</text>`;
    }),
  ].join("");
  const signalDots = rows.filter((row) => row.is_signal).map((row) => `
    <circle class="dot signal" cx="${xFor(row.seconds_left)}" cy="${yFor(row[metric])}" r="7">
      <title>Signal | ${row.intended_outcome} | ${formatValue(row[metric], metric)} | ${row.reason}</title>
    </circle>`).join("");

  byId("backtestChart").innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Backtest market metric">
      <rect class="plot" x="${view.left}" y="${view.top}" width="${plotWidth}" height="${plotHeight}"></rect>
      ${grid}
      <path class="line" d="${pathFrom(points)}"></path>
      ${signalDots}
      <text class="axis" x="${view.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">Seconds left</text>
      <text class="axis" x="20" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 20 ${view.top + plotHeight / 2})">${metricLabel(metric)}</text>
    </svg>`;
}

function checksFor(tab) {
  if (tab === "paper") {
    return (state.workflow.paper_trade.checks || []).filter((row) => row.group === state.paperGate);
  }
  return (state.workflow.live_trade.checks || []).filter((row) => row.group === state.liveGate);
}

function renderGateChart(tab) {
  const rows = checksFor(tab);
  const el = byId(tab === "paper" ? "paperChart" : "liveChart");
  if (!rows.length) {
    el.innerHTML = svgEmpty("No gate rows.");
    return;
  }
  const view = { width: 980, height: 470, left: 260, right: 38, top: 32, bottom: 42 };
  const plotWidth = view.width - view.left - view.right;
  const barHeight = Math.min(44, (view.height - view.top - view.bottom) / rows.length - 10);
  const gap = 10;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((tick) => {
    const x = view.left + tick * plotWidth;
    return `<line class="grid" x1="${x}" y1="${view.top - 8}" x2="${x}" y2="${view.height - view.bottom + 6}"></line><text class="tick" x="${x}" y="${view.height - 12}" text-anchor="middle">${Math.round(tick * 100)}%</text>`;
  }).join("");
  const bars = rows.map((row, index) => {
    const y = view.top + index * (barHeight + gap);
    const width = Math.max(0, Math.min(1, Number(row.progress || 0))) * plotWidth;
    const detail = `${formatActual(row.actual)} / ${formatActual(row.target)}`;
    return `
      <text class="bar-label" x="${view.left - 14}" y="${y + barHeight * 0.65}" text-anchor="end">${row.label}</text>
      <rect class="bar-bg" x="${view.left}" y="${y}" width="${plotWidth}" height="${barHeight}" rx="4"></rect>
      <rect class="bar ${row.passed ? "pass" : "fail"}" x="${view.left}" y="${y}" width="${width}" height="${barHeight}" rx="4"></rect>
      <text class="bar-value" x="${view.left + Math.max(width, 82) - 10}" y="${y + barHeight * 0.64}" text-anchor="end">${detail}</text>`;
  }).join("");

  el.innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="${tab} gate progress">
      ${grid}
      ${bars}
    </svg>`;
}

function renderStatus() {
  const q = state.workflow.data_quality || {};
  const b = state.workflow.backtest.summary || {};
  byId("statusText").textContent = `${fmt.format(q.clean_markets || 0)} clean markets | ${fmt.format(b.signals || 0)} signals | ${q.status || "unknown"}`;
}

function renderActiveTab() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === state.activeTab);
  });
  if (state.activeTab === "backtest") renderBacktestChart();
  if (state.activeTab === "paper") renderGateChart("paper");
  if (state.activeTab === "live") renderGateChart("live");
}

async function main() {
  state.workflow = normalizeWorkflow(await loadJson("data/workflow.json"));
  renderStatus();
  renderBacktestSelects();
  renderBacktestChart();
  renderGateChart("paper");
  renderGateChart("live");

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderActiveTab();
    });
  });
  byId("backtestMarket").addEventListener("change", (event) => {
    state.backtestMarket = event.target.value;
    renderBacktestChart();
  });
  byId("backtestMetric").addEventListener("change", (event) => {
    state.backtestMetric = event.target.value;
    renderBacktestChart();
  });
  byId("paperGate").addEventListener("change", (event) => {
    state.paperGate = event.target.value;
    renderGateChart("paper");
  });
}

main().catch((error) => {
  byId("statusText").textContent = `Load failed: ${error.message}`;
});
