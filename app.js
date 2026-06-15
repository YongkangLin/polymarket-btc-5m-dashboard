const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const state = {
  workflow: null,
  activeTab: "backtest",
  backtestMarket: "all-signals",
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

function signalRows() {
  return state.workflow?.backtest?.signals || [];
}

function signalNumber(row) {
  const index = signalRows().findIndex((signal) => signal.condition_id === row.condition_id);
  return index >= 0 ? index + 1 : "";
}

function signalLabel(row, index) {
  const when = row.window_start
    ? new Date(row.window_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Unknown";
  const pnl = Number(row.pnl_after_slippage_haircut || 0);
  return `Signal ${index + 1}: ${when} | ${row.intended_outcome} | ${moneyCents.format(pnl)}`;
}

function metricLabel(metric) {
  if (metric === "trade_pnl") return "Profit";
  if (metric === "buy_price") return "Buy price";
  if (metric === "btc_move") return "BTC move";
  if (metric === "available_size") return "Available size";
  return "Value";
}

function formatValue(value, metric) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  if (metric === "trade_pnl") return moneyCents.format(value);
  if (metric === "buy_price") return Number(value).toFixed(2);
  if (metric === "available_size") return money.format(value);
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
  if (metric === "buy_price") return [Math.max(0, min - 0.02), Math.min(1, max + 0.02)];
  if (metric === "available_size") return [0, max * 1.12 || 1];
  if (metric === "trade_pnl") {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    const pad = Math.abs(min || 1) * 0.1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

function renderBacktestSelects() {
  const signals = signalRows();
  const allowed = new Set(["all-signals", ...signals.map((row) => row.condition_id)]);
  if (!allowed.has(state.backtestMarket)) state.backtestMarket = "all-signals";
  byId("backtestMarket").innerHTML = [
    `<option value="all-signals">All Buy Signals (${signals.length})</option>`,
    ...signals.map((row, index) => `<option value="${row.condition_id}">${signalLabel(row, index)}</option>`),
  ].join("");
  byId("backtestMarket").value = state.backtestMarket;
}

function tradeTitle(row) {
  const entry = Number(row.signal_ask);
  const exit = Number(row.settlement_exit_price);
  const pnl = Number(row.pnl_after_slippage_haircut);
  const rawPnl = Number(row.pnl_dollars);
  const oppositeAsk = row.intended_outcome === "Up" ? row.down_ask : row.up_ask;
  return [
    `Signal ${signalNumber(row)}: bought ${row.intended_outcome} at ${entry.toFixed(2)} with ${row.seconds_left}s left`,
    `Held to settlement: ${row.winner} won, exit ${exit.toFixed(2)}`,
    `Profit: ${moneyCents.format(pnl)} after 2c safety cost (${moneyCents.format(rawPnl)} raw)`,
    `Why: final minute, BTC moved ${Number(row.abs_distance_bps).toFixed(1)} bps, buy price was 0.70-0.98, available size was ${money.format(row.top5_capacity_dollars || 0)}`,
    `Book then: ${row.intended_outcome} bid/ask ${formatValue(row.signal_bid, "buy_price")}/${formatValue(entry, "buy_price")}; other side ask ${formatValue(oppositeAsk, "buy_price")}`,
  ].join(" | ");
}

function renderTradePnlChart(signals) {
  if (!signals.length) {
    byId("backtestChart").innerHTML = svgEmpty("No backtest trades for this selection.");
    return;
  }
  const view = { width: 980, height: 470, left: 76, right: 28, top: 32, bottom: 64 };
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;
  const pnlValues = signals.map((row) => Number(row.pnl_after_slippage_haircut || 0));
  const cumulativeValues = signals.map((row) => Number(row.cumulative_pnl_after_haircut || 0));
  const values = [0, ...pnlValues, ...cumulativeValues];
  const [minY, maxY] = niceDomain(values, "trade_pnl");
  const xFor = (index) => view.left + ((index + 0.5) / signals.length) * plotWidth;
  const yFor = (value) => view.top + ((maxY - value) / Math.max(maxY - minY, 1)) * plotHeight;
  const barWidth = Math.min(54, Math.max(14, plotWidth / signals.length * 0.42));
  const yZero = yFor(0);
  const yTicks = [minY, 0, (minY + maxY) / 2, maxY]
    .filter((value, index, array) => array.findIndex((other) => Math.abs(other - value) < 0.001) === index);
  const grid = yTicks.map((tick) => {
    const y = yFor(tick);
    return `<line class="${Math.abs(tick) < 0.001 ? "axis-zero" : "grid"}" x1="${view.left}" y1="${y}" x2="${view.left + plotWidth}" y2="${y}"></line><text class="tick" x="${view.left - 10}" y="${y + 4}" text-anchor="end">${formatValue(tick, "trade_pnl")}</text>`;
  }).join("");
  const bars = signals.map((row, index) => {
    const pnl = Number(row.pnl_after_slippage_haircut || 0);
    const x = xFor(index) - barWidth / 2;
    const y = yFor(Math.max(pnl, 0));
    const height = Math.max(2, Math.abs(yFor(pnl) - yZero));
    return `
      <rect class="pnl-bar ${pnl >= 0 ? "pass" : "fail"}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4">
        <title>${tradeTitle(row)}</title>
      </rect>
      <text class="tick" x="${xFor(index)}" y="${view.top + plotHeight + 26}" text-anchor="middle">${signalNumber(row) || index + 1}</text>`;
  }).join("");
  const linePoints = signals.map((row, index) => ({
    row,
    x: xFor(index),
    y: yFor(Number(row.cumulative_pnl_after_haircut || 0)),
  }));
  const dots = linePoints.map(({ row, x, y }) => `
    <circle class="dot ${row.outcome_win ? "pass" : "fail"}" cx="${x}" cy="${y}" r="5">
      <title>${tradeTitle(row)} | Cumulative ${moneyCents.format(row.cumulative_pnl_after_haircut || 0)}</title>
    </circle>`).join("");

  byId("backtestChart").innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Backtest trade PnL">
      <rect class="plot" x="${view.left}" y="${view.top}" width="${plotWidth}" height="${plotHeight}"></rect>
      ${grid}
      ${bars}
      <path class="line" d="${pathFrom(linePoints)}"></path>
      ${dots}
      <text class="axis" x="${view.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">Buy signals: bar = each trade, line = total profit</text>
      <text class="axis" x="20" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 20 ${view.top + plotHeight / 2})">Profit after 2c safety cost</text>
    </svg>`;
}

function renderBacktestChart() {
  const workflow = state.workflow;
  const signals = workflow.backtest.signals || [];
  const selectedSignals = state.backtestMarket === "all-signals"
    ? signals
    : signals.filter((row) => row.condition_id === state.backtestMarket);

  if (!selectedSignals.length) {
    byId("backtestChart").innerHTML = svgEmpty("No buy signals for this selection.");
    return;
  }
  renderTradePnlChart(selectedSignals);
}

function checksFor(tab) {
  if (tab === "paper") {
    return (state.workflow.paper_trade.checks || []).filter((row) => row.group === "live_paper");
  }
  return (state.workflow.live_trade.checks || []).filter((row) => row.group === state.liveGate);
}

function plainCheckLabel(row) {
  const labels = {
    backtest_signals: "Historical buys",
    backtest_days: "Days with buys",
    backtest_win_rate: "Historical wins",
    backtest_roi_after_haircut: "Profit rate",
    capacity_rate: "Enough size",
    live_signals: "Paper buys found",
    signal_days: "Paper buy days",
    win_rate: "Paper wins",
    roi_after_haircut: "Paper profit rate",
    worst_day_after_haircut: "Worst day",
    start_price_source_verified: "Start price verified",
    no_missed_start_captures: "No missed starts",
    paper_signals: "Paper buys found",
    paper_days: "Paper buy days",
    paper_start_source: "Start price verified",
    manual_live_enable: "Manual live enable",
  };
  return labels[row.id] || row.label;
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
      <text class="bar-label" x="${view.left - 14}" y="${y + barHeight * 0.65}" text-anchor="end">${plainCheckLabel(row)}</text>
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

function paperStatusRows() {
  const summary = state.workflow.paper_trade.summary || {};
  return [
    {
      label: "Book checks",
      value: Number(summary.evaluations || 0),
      detail: `${fmt.format(summary.evaluations || 0)} live checks`,
      title: "Each check pulls the live Polymarket Up/Down order books and BTC price.",
    },
    {
      label: "Markets watched",
      value: Number(summary.evaluated_markets || 0),
      detail: fmt.format(summary.evaluated_markets || 0),
      title: "Unique BTC 5-minute markets seen by the paper watcher.",
    },
    {
      label: "Start prices",
      value: Number(summary.start_prices_captured || 0),
      detail: fmt.format(summary.start_prices_captured || 0),
      title: "Markets where the watcher captured the BTC start price near the window open.",
    },
    {
      label: "Paper buys",
      value: Number(summary.paper_signals || 0),
      detail: fmt.format(summary.paper_signals || 0),
      title: "Live paper buys that matched the same rule as the backtest.",
    },
    {
      label: "Settled buys",
      value: Number(summary.settled_signals || 0),
      detail: fmt.format(summary.settled_signals || 0),
      title: "Paper buys with a completed win/loss result.",
    },
    {
      label: "Paper profit",
      value: Math.abs(Number(summary.pnl_after_slippage_haircut || 0)),
      detail: moneyCents.format(summary.pnl_after_slippage_haircut || 0),
      title: "Paper PnL after the same 2c safety cost used in backtest.",
    },
  ];
}

function renderValueBarChart(el, rows, emptyMessage, axisText) {
  const chartRows = rows.filter((row) => Number.isFinite(row.value));
  if (!chartRows.length) {
    el.innerHTML = svgEmpty(emptyMessage);
    return;
  }
  const view = { width: 980, height: 470, left: 230, right: 44, top: 32, bottom: 54 };
  const plotWidth = view.width - view.left - view.right;
  const maxValue = Math.max(...chartRows.map((row) => row.value), 1);
  const barHeight = Math.min(42, (view.height - view.top - view.bottom) / chartRows.length - 10);
  const gap = 10;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const grid = ticks.map((tick) => {
    const x = view.left + tick * plotWidth;
    return `<line class="grid" x1="${x}" y1="${view.top - 8}" x2="${x}" y2="${view.height - view.bottom + 6}"></line>`;
  }).join("");
  const bars = chartRows.map((row, index) => {
    const y = view.top + index * (barHeight + gap);
    const width = Math.max(2, (Math.max(0, row.value) / maxValue) * plotWidth);
    return `
      <text class="bar-label" x="${view.left - 14}" y="${y + barHeight * 0.65}" text-anchor="end">${row.label}</text>
      <rect class="bar-bg" x="${view.left}" y="${y}" width="${plotWidth}" height="${barHeight}" rx="4"></rect>
      <rect class="bar pass" x="${view.left}" y="${y}" width="${width}" height="${barHeight}" rx="4">
        <title>${row.title || `${row.label}: ${row.detail}`}</title>
      </rect>
      <text class="bar-value" x="${view.left + Math.max(width, 92) - 10}" y="${y + barHeight * 0.64}" text-anchor="end">${row.detail}</text>`;
  }).join("");

  el.innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="${axisText}">
      ${grid}
      ${bars}
      <text class="axis" x="${view.left + plotWidth / 2}" y="${view.height - 16}" text-anchor="middle">${axisText}</text>
    </svg>`;
}

function renderPaperChart() {
  renderValueBarChart(byId("paperChart"), paperStatusRows(), "No paper evidence yet.", "Live paper evidence so far");
}

function renderStatus() {
  const q = state.workflow.data_quality || {};
  const b = state.workflow.backtest.summary || {};
  byId("statusText").textContent = `${fmt.format(q.clean_markets || 0)} clean windows scanned | ${fmt.format(b.signals || 0)} buys | ${moneyCents.format(b.pnl_after_slippage_haircut || 0)} test profit`;
}

function renderActiveTab() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === state.activeTab);
  });
  if (state.activeTab === "backtest") renderBacktestChart();
  if (state.activeTab === "paper") renderPaperChart();
  if (state.activeTab === "live") renderGateChart("live");
}

async function main() {
  state.workflow = normalizeWorkflow(await loadJson("data/workflow.json"));
  renderStatus();
  renderBacktestSelects();
  renderBacktestChart();
  renderPaperChart();
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
}

main().catch((error) => {
  byId("statusText").textContent = `Load failed: ${error.message}`;
});
