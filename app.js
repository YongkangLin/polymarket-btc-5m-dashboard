const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ACTIVE_BACKTEST_KEY = "late_depth_fair_clean";
const ACTIVE_BACKTEST_VALUE = `candidate:${ACTIVE_BACKTEST_KEY}`;

const state = {
  workflow: null,
  activeTab: "backtest",
  marketFilter: "all",
  backtestMarket: "",
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
  const profileSkew = workflow.profile_skew || {};
  profileSkew.markets = inflateRows(profileSkew.market_columns, profileSkew.markets);
  const profileCheapPair = workflow.profile_cheap_pair || {};
  profileCheapPair.markets = inflateRows(profileCheapPair.market_columns, profileCheapPair.markets);
  (workflow.candidate_strategies || []).forEach((strategy) => {
    strategy.markets = inflateRows(strategy.market_columns, strategy.markets);
  });
  workflow._signalByMarket = new Map();
  (backtest.signals || []).forEach((signal) => {
    workflow._signalByMarket.set(signal.condition_id, signal);
  });
  workflow._seriesByMarket = new Map();
  (backtest.series || []).forEach((row) => {
    if (!workflow._seriesByMarket.has(row.condition_id)) workflow._seriesByMarket.set(row.condition_id, []);
    workflow._seriesByMarket.get(row.condition_id).push(row);
  });
  workflow._seriesByMarket.forEach((rows) => rows.sort((left, right) => Number(right.seconds_left || 0) - Number(left.seconds_left || 0)));
  return workflow;
}

function shortDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function signalRows() {
  return state.workflow?.backtest?.signals || [];
}

function marketRows() {
  return state.workflow?.backtest?.markets || [];
}

function signalForMarket(conditionId) {
  return state.workflow?._signalByMarket?.get(conditionId) || null;
}

function candidateStrategies() {
  return state.workflow?.candidate_strategies || [];
}

function candidateValue(strategy) {
  return `candidate:${strategy.key || strategy.strategy_id}`;
}

function candidateFromValue(value) {
  return candidateStrategies().find((strategy) => candidateValue(strategy) === value);
}

function activeCandidateStrategy() {
  const activeKey = state.workflow?.active_backtest_key || ACTIVE_BACKTEST_KEY;
  return candidateStrategies().find((strategy) => (strategy.key || strategy.strategy_id) === activeKey);
}

function activeBacktestValue() {
  const active = activeCandidateStrategy();
  const first = candidateStrategies()[0];
  return active ? candidateValue(active) : (first ? candidateValue(first) : "");
}

function selectedStrategyProfile(profileKey) {
  if (profileKey.startsWith("candidate:")) return candidateFromValue(profileKey) || {};
  return state.workflow?.[profileKey] || {};
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

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(2);
}

function formatPnl(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return moneyCents.format(value);
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

function metricNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value) {
  const number = metricNumber(value);
  return number === null ? "--" : `${(number * 100).toFixed(1)}%`;
}

function formatCents(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(1)}c`;
}

function formatSignedMoney(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${moneyCents.format(number)}`;
}

function formatSignedPercent(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(1)} pts`;
}

function compactNote(value, maxLength = 33) {
  const text = String(value ?? "--");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function humanReason(value) {
  const labels = {
    passes_test_fill_and_roi_gates: "Passes held-out fill and profit checks",
    best_positive_train_maker_route: "Best positive maker route on training data",
    needs_more_maker_fill_evidence: "Needs more maker-fill evidence",
    insufficient_train_maker_evidence: "Needs more training evidence",
  };
  return labels[value] || String(value || "");
}

function rejectReasonLabel(value) {
  const labels = {
    ask_outside_selected_table: "price outside rule",
    complement_ask_sum_too_high: "both asks too expensive",
    depth_imbalance_too_low: "book lean too weak",
    distance_too_large: "too far from strike",
    edge_below_threshold: "fair edge too small",
    missing_best_ask: "missing best ask",
    outside_time_window: "outside decision window",
    selected_table_match: "buy rule matched",
  };
  return labels[value] || String(value || "no rule match");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgEmpty(message) {
  return `<div class="empty">${message}</div>`;
}

function pathFrom(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function profitDomain(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return [0, 1];
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  min = Math.min(0, min);
  max = Math.max(0, max);
  if (min === max) {
    const pad = Math.abs(min || 1) * 0.1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

function formatBps(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(1)} bps`;
}

function sideKey(outcome) {
  return outcome === "Up" ? "up" : "down";
}

function oppositeSideKey(outcome) {
  return outcome === "Up" ? "down" : "up";
}

function sideField(row, side, field) {
  return metricNumber(row?.[`${side}_${field}`]);
}

function marketSeriesRows(conditionId) {
  return state.workflow?._seriesByMarket?.get(conditionId) || [];
}

function activeRule() {
  return state.workflow?.active_backtest?.method?.rule || state.workflow?.strategy?.rule || {};
}

function inRange(value, min, max) {
  const number = metricNumber(value);
  if (number === null) return false;
  if (min !== null && min !== undefined && number < Number(min)) return false;
  if (max !== null && max !== undefined && number > Number(max)) return false;
  return true;
}

function rangeText(min, max, suffix = "") {
  if (min !== null && min !== undefined && max !== null && max !== undefined) return `${min}-${max}${suffix}`;
  if (min !== null && min !== undefined) return `>= ${min}${suffix}`;
  if (max !== null && max !== undefined) return `<= ${max}${suffix}`;
  return "--";
}

function percentText(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(0)}%`;
}

function decisionOutcome(row) {
  if (row?.intended_outcome === "Up" || row?.intended_outcome === "Down") return row.intended_outcome;
  return Number(row?.distance_bps || 0) >= 0 ? "Up" : "Down";
}

function noActionDecisionRow(market) {
  const rule = activeRule();
  const rows = marketSeriesRows(market.condition_id);
  const inWindow = rows.filter((row) => inRange(row.seconds_left, rule.min_seconds_left, rule.max_seconds_left));
  const useful = inWindow.filter((row) => row.reason && row.reason !== "outside_time_window");
  return useful[0] || inWindow[0] || rows[0] || null;
}

function linePathFor(rows, valueFor, xFor, yFor) {
  return pathFrom(
    rows
      .map((row) => ({ x: xFor(row), y: yFor(valueFor(row)) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  );
}

function renderBacktestSelects() {
  const allMarkets = marketRows();
  const boughtCount = allMarkets.filter((market) => market.has_signal).length;
  const noActionCount = allMarkets.length - boughtCount;
  const filteredMarkets = state.marketFilter === "bought"
    ? allMarkets.filter((market) => market.has_signal)
    : state.marketFilter === "no_action"
      ? allMarkets.filter((market) => !market.has_signal)
      : allMarkets;
  byId("marketFilter").innerHTML = [
    ["all", `All markets (${fmt.format(allMarkets.length)})`],
    ["bought", `Bought (${fmt.format(boughtCount)})`],
    ["no_action", `No action (${fmt.format(noActionCount)})`],
  ].map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("");
  byId("marketFilter").value = state.marketFilter;
  const allowed = new Set(filteredMarkets.map((market) => market.condition_id));
  if (!allowed.has(state.backtestMarket)) {
    const preferred = filteredMarkets.find((market) => market.has_signal) || filteredMarkets[0];
    state.backtestMarket = preferred?.condition_id || "";
  }
  byId("backtestMarket").innerHTML = filteredMarkets.map((market) => {
    const signal = signalForMarket(market.condition_id);
    const when = market.window_start
      ? new Date(market.window_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "Unknown";
    const status = signal
      ? `Bought ${signal.intended_outcome} ${moneyCents.format(signal.pnl_after_slippage_haircut || 0)}`
      : `No action: ${rejectReasonLabel(noActionDecisionRow(market)?.reason)}`;
    return `<option value="${escapeHtml(market.condition_id)}">${escapeHtml(`${when} | ${status} | ${market.slug}`)}</option>`;
  }).join("");
  byId("backtestMarket").value = state.backtestMarket;
}

function ruleLine() {
  const rule = activeRule();
  const pieces = [
    `${rangeText(rule.min_seconds_left, rule.max_seconds_left, "s")} left`,
    `ask ${rangeText(rule.min_ask, rule.max_ask)}`,
    `BTC move ${rangeText(rule.min_abs_distance_bps, rule.max_abs_distance_bps, " bps")}`,
    `depth >= ${money.format(rule.min_top5_capacity_dollars || 0)}`,
  ];
  if (rule.min_fair_edge_vs_bid !== null && rule.min_fair_edge_vs_bid !== undefined) {
    pieces.push(`fair edge >= ${formatCents(rule.min_fair_edge_vs_bid)}`);
  }
  if (rule.min_signal_depth_imbalance !== null && rule.min_signal_depth_imbalance !== undefined) {
    pieces.push(`book lean >= ${percentText(rule.min_signal_depth_imbalance)}`);
  }
  if (rule.max_complement_ask_sum !== null && rule.max_complement_ask_sum !== undefined) {
    pieces.push(`both asks <= ${formatPrice(rule.max_complement_ask_sum)}`);
  }
  if (rule.min_trade_flow_edge_dollars !== null && rule.min_trade_flow_edge_dollars !== undefined) {
    pieces.push(`flow >= ${money.format(rule.min_trade_flow_edge_dollars)}`);
  }
  return pieces.join(" | ");
}

function marketDecisionSummary(row, market, isSignal) {
  const outcome = decisionOutcome(row);
  const selectedSide = sideKey(outcome);
  const oppositeSide = oppositeSideKey(outcome);
  const selectedAsk = sideField(row, selectedSide, "ask") ?? metricNumber(row.signal_ask);
  const selectedBid = sideField(row, selectedSide, "bid") ?? metricNumber(row.signal_bid);
  const selectedDepth = sideField(row, selectedSide, "ask_depth_5") ?? metricNumber(row.signal_ask_depth_5);
  const selectedFlow = metricNumber(row[`${selectedSide}_signed_trade_notional_15s`]);
  const oppositeFlow = metricNumber(row[`${oppositeSide}_signed_trade_notional_15s`]);
  const flowEdge = metricNumber(row.trade_flow_edge_15s);
  const pnl = metricNumber(row.pnl_after_slippage_haircut);
  const headline = isSignal
    ? `Bought ${outcome} at ${formatPrice(selectedAsk)} with ${row.seconds_left}s left`
    : `No action with ${row.seconds_left}s left`;
  const result = isSignal
    ? `${row.winner} won | settlement ${row.outcome_win ? "1.00" : "0.00"} | ${formatSignedMoney(pnl)} PnL after safety cost`
    : `Stopped: ${rejectReasonLabel(row.reason)} | winner ${market.winner || row.winner || "--"}`;
  const reason = isSignal
    ? `Matched rule: ${ruleLine()}`
    : `Nearest decision row: ${ruleLine()}`;
  return {
    headline,
    result,
    reason,
    signals: [
      ["BTC move", formatBps(row.distance_bps)],
      ["Fair value", formatPrice(row.fair_probability)],
      ["Fair edge", formatCents(row.fair_edge_vs_signal_bid)],
      ["Bid/ask", `${formatPrice(selectedBid)} / ${formatPrice(selectedAsk)}`],
      ["Top-5 depth", money.format(selectedDepth || 0)],
      ["Book lean", percentText(row.signal_depth_imbalance ?? row[`${selectedSide}_depth_imbalance`])],
      ["15s flow edge", flowEdge === null ? `${money.format(selectedFlow || 0)} vs ${money.format(oppositeFlow || 0)}` : money.format(flowEdge)],
      ["Both asks", formatPrice(row.complement_ask_sum)],
    ],
  };
}

function renderBacktestSummary(market, row, isSignal) {
  const summary = marketDecisionSummary(row, market, isSignal);
  const signalItems = summary.signals.map(([label, value]) => `
    <div class="signal-cell">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`).join("");
  byId("backtestSummary").innerHTML = `
    <div class="decision-block decision-main">
      <span class="decision-kicker">${escapeHtml(shortDate(market.window_start))} | ${escapeHtml(market.slug || market.condition_id)}</span>
      <strong>${escapeHtml(summary.headline)}</strong>
      <span>${escapeHtml(summary.result)}</span>
    </div>
    <div class="decision-block decision-rule">
      <span class="decision-kicker">Algorithm Reason</span>
      <strong>${escapeHtml(isSignal ? "Rule matched" : rejectReasonLabel(row.reason))}</strong>
      <span>${escapeHtml(summary.reason)}</span>
    </div>
    <div class="decision-block decision-signals">
      ${signalItems}
    </div>`;
}

function tradeTitle(row) {
  const rule = activeRule();
  const entry = Number(row.signal_ask);
  const exit = Number(row.settlement_exit_price);
  const pnl = Number(row.pnl_after_slippage_haircut);
  const rawPnl = Number(row.pnl_dollars);
  const oppositeAsk = row.intended_outcome === "Up" ? row.down_ask : row.up_ask;
  return [
    `Signal ${signalNumber(row)}: bought ${row.intended_outcome} at ${entry.toFixed(2)} with ${row.seconds_left}s left`,
    `Held to settlement: ${row.winner} won, exit ${exit.toFixed(2)}`,
    `Profit: ${moneyCents.format(pnl)} after 2c safety cost (${moneyCents.format(rawPnl)} raw)`,
    `Why: ${rangeText(rule.min_seconds_left, rule.max_seconds_left, "s")} left, BTC moved ${Number(row.abs_distance_bps).toFixed(1)} bps, buy price was ${rangeText(rule.min_ask, rule.max_ask)}, fair edge was ${formatCents(row.fair_edge_vs_signal_bid)}`,
    `Book then: ${row.intended_outcome} bid/ask ${formatPrice(row.signal_bid)}/${formatPrice(entry)}; other side ask ${formatPrice(oppositeAsk)}`,
  ].join(" | ");
}

function noActionTitle(row, market) {
  return [
    `${market.slug}: no action with ${row.seconds_left}s left`,
    `Reason: ${rejectReasonLabel(row.reason)}`,
    `Candidate side: ${decisionOutcome(row)}`,
    `BTC move: ${formatBps(row.distance_bps)}`,
    `Fair edge: ${formatCents(row.fair_edge_vs_signal_bid)}`,
  ].join(" | ");
}

function decisionGateRows(row, isSignal) {
  const rule = activeRule();
  const absDistance = Math.abs(Number(row.abs_distance_bps || 0));
  const fairEdgeGateEnabled = rule.min_fair_edge_vs_bid !== null && rule.min_fair_edge_vs_bid !== undefined;
  const bookLeanGateEnabled = rule.min_signal_depth_imbalance !== null && rule.min_signal_depth_imbalance !== undefined;
  const pairGateEnabled = rule.max_complement_ask_sum !== null && rule.max_complement_ask_sum !== undefined;
  const rows = [
    ["Time", `${row.seconds_left}s`, inRange(row.seconds_left, rule.min_seconds_left, rule.max_seconds_left)],
    ["Move", formatBps(absDistance), inRange(absDistance, rule.min_abs_distance_bps, rule.max_abs_distance_bps)],
    ["Entry ask", formatPrice(row.signal_ask), inRange(row.signal_ask, rule.min_ask, rule.max_ask)],
    ["Depth", money.format(row.top5_capacity_dollars || 0), Number(row.top5_capacity_dollars || 0) >= Number(rule.min_top5_capacity_dollars || 0)],
  ];
  if (fairEdgeGateEnabled) {
    rows.push(["Fair edge", formatCents(row.fair_edge_vs_signal_bid), Number(row.fair_edge_vs_signal_bid || 0) >= Number(rule.min_fair_edge_vs_bid)]);
  }
  if (bookLeanGateEnabled) {
    rows.push(["Book lean", `${((Number(row.signal_depth_imbalance || 0)) * 100).toFixed(0)}%`, Number(row.signal_depth_imbalance || 0) >= Number(rule.min_signal_depth_imbalance)]);
  }
  if (pairGateEnabled) {
    rows.push(["Both asks", formatPrice(row.complement_ask_sum), Number(row.complement_ask_sum || 99) <= Number(rule.max_complement_ask_sum)]);
  }
  rows.push(
    isSignal
      ? ["Result", `${row.winner} won, ${moneyCents.format(row.pnl_after_slippage_haircut || 0)}`, Number(row.pnl_after_slippage_haircut || 0) > 0]
      : ["Decision", rejectReasonLabel(row.reason), row.reason === "selected_table_match"]
  );
  return rows;
}

function renderSignalDecisionChart(signal, options = {}) {
  const isSignal = options.isSignal !== false;
  const market = options.market || {};
  const rows = marketSeriesRows(signal.condition_id);
  if (!rows.length) {
    byId("backtestChart").innerHTML = svgEmpty("No market path for this selection.");
    return;
  }

  const view = { width: 980, height: 580 };
  const plot = { left: 74, right: 350, top: 34, height: 200 };
  const book = { left: 74, right: 350, top: 286, height: 176 };
  const plotWidth = view.width - plot.left - plot.right;
  const seconds = rows.map((row) => Number(row.seconds_left)).filter(Number.isFinite);
  const minSec = Math.min(...seconds);
  const maxSec = Math.max(...seconds);
  const spanSec = Math.max(1, maxSec - minSec);
  const xFor = (row) => plot.left + ((maxSec - Number(row.seconds_left || minSec)) / spanSec) * plotWidth;
  const distanceValues = rows.map((row) => Number(row.distance_bps)).filter(Number.isFinite);
  const maxAbsDistance = Math.max(30, ...distanceValues.map((value) => Math.abs(value))) * 1.15;
  const yDistance = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? plot.top + ((maxAbsDistance - number) / (maxAbsDistance * 2)) * plot.height : Number.NaN;
  };
  const yPrice = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? book.top + ((1 - Math.max(0, Math.min(1, number))) * book.height) : Number.NaN;
  };
  const selectedOutcome = decisionOutcome(signal);
  const selectedSide = sideKey(selectedOutcome);
  const oppositeSide = oppositeSideKey(selectedOutcome);
  const markerX = plot.left + ((maxSec - Number(signal.seconds_left || minSec)) / spanSec) * plotWidth;
  const selectedAsk = sideField(signal, selectedSide, "ask");
  const selectedBid = sideField(signal, selectedSide, "bid");
  const oppositeAsk = sideField(signal, oppositeSide, "ask");
  const selectedDepth = sideField(signal, selectedSide, "ask_depth_5");
  const selectedFlow = metricNumber(signal[`${selectedSide}_signed_trade_notional_15s`]);
  const oppositeFlow = metricNumber(signal[`${oppositeSide}_signed_trade_notional_15s`]);
  const selectedImbalance = metricNumber(signal.signal_depth_imbalance ?? signal[`${selectedSide}_depth_imbalance`]);
  const gateRows = decisionGateRows(signal, isSignal);
  const bookRows = [
    [`${selectedOutcome} bid/ask`, `${formatPrice(selectedBid)} / ${formatPrice(selectedAsk)}`],
    [`Other ask`, formatPrice(oppositeAsk)],
    ["Fair value", formatPrice(signal.fair_probability)],
    ["Fair edge", formatCents(signal.fair_edge_vs_signal_bid)],
    ["Top-5 depth", money.format(selectedDepth || 0)],
    ["Book lean", selectedImbalance === null ? "--" : `${(selectedImbalance * 100).toFixed(0)}%`],
    ["15s flow", `${money.format(selectedFlow || 0)} vs ${money.format(oppositeFlow || 0)}`],
    ["Both asks", formatPrice(signal.complement_ask_sum)],
  ];
  const xTicks = [maxSec, Math.round((maxSec + minSec) / 2), minSec].map((tick) => {
    const x = plot.left + ((maxSec - tick) / spanSec) * plotWidth;
    return `<line class="grid" x1="${x}" y1="${plot.top}" x2="${x}" y2="${book.top + book.height}"></line><text class="tick" x="${x}" y="${book.top + book.height + 24}" text-anchor="middle">${tick}s</text>`;
  }).join("");
  const distanceTicks = [-30, 0, 30].map((tick) => {
    const y = yDistance(tick);
    return `<line class="${tick === 0 ? "axis-zero" : "grid"}" x1="${plot.left}" y1="${y}" x2="${plot.left + plotWidth}" y2="${y}"></line><text class="tick" x="${plot.left - 10}" y="${y + 4}" text-anchor="end">${formatBps(tick)}</text>`;
  }).join("");
  const priceTicks = [0, 0.5, 1].map((tick) => {
    const y = yPrice(tick);
    return `<line class="grid" x1="${book.left}" y1="${y}" x2="${book.left + plotWidth}" y2="${y}"></line><text class="tick" x="${book.left - 10}" y="${y + 4}" text-anchor="end">${tick.toFixed(2)}</text>`;
  }).join("");
  const selectedAskPath = linePathFor(rows, (row) => sideField(row, selectedSide, "ask"), xFor, yPrice);
  const selectedBidPath = linePathFor(rows, (row) => sideField(row, selectedSide, "bid"), xFor, yPrice);
  const oppositeAskPath = linePathFor(rows, (row) => sideField(row, oppositeSide, "ask"), xFor, yPrice);
  const gateText = gateRows.map(([label, value, passed], index) => {
    const y = 88 + index * 24;
    return `
      <text class="bar-label" x="708" y="${y}">${escapeHtml(label)}</text>
      <text class="bar-value ${passed ? "pass-text" : "fail-text"}" x="948" y="${y}" text-anchor="end">${escapeHtml(value)}</text>`;
  }).join("");
  const bookText = bookRows.map(([label, value], index) => {
    const y = 344 + index * 24;
    return `
      <text class="bar-label" x="708" y="${y}">${escapeHtml(label)}</text>
      <text class="bar-value" x="948" y="${y}" text-anchor="end">${escapeHtml(value)}</text>`;
  }).join("");
  const title = isSignal ? tradeTitle(signal) : noActionTitle(signal, market);
  const markerClass = isSignal ? "signal" : "fail";
  const noteTitle = isSignal ? "Trade rule and result" : "No-action reason";

  byId("backtestChart").innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Selected backtest decision context">
      <title>${escapeHtml(title)}</title>
      <rect class="plot" x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plot.height}"></rect>
      <rect class="plot" x="${book.left}" y="${book.top}" width="${plotWidth}" height="${book.height}"></rect>
      ${xTicks}
      ${distanceTicks}
      ${priceTicks}
      <path class="line line-distance" d="${linePathFor(rows, (row) => Number(row.distance_bps), xFor, yDistance)}"></path>
      <line class="signal-marker" x1="${markerX}" y1="${plot.top}" x2="${markerX}" y2="${book.top + book.height}"></line>
      <circle class="dot ${markerClass}" cx="${markerX}" cy="${yDistance(Number(signal.distance_bps || 0))}" r="6"></circle>
      <path class="line line-ask" d="${selectedAskPath}"></path>
      <path class="line line-bid" d="${selectedBidPath}"></path>
      <path class="line line-other" d="${oppositeAskPath}"></path>
      <circle class="dot ${markerClass}" cx="${markerX}" cy="${yPrice(Number(signal.signal_ask || selectedAsk || 0))}" r="6"></circle>
      <text class="axis" x="${plot.left + plotWidth / 2}" y="${plot.top - 12}" text-anchor="middle">BTC move from start</text>
      <text class="axis" x="${book.left + plotWidth / 2}" y="${book.top - 12}" text-anchor="middle">${selectedOutcome} book price at the decision</text>
      <text class="legend ask" x="${book.left + 8}" y="${book.top + 20}">ask</text>
      <text class="legend bid" x="${book.left + 52}" y="${book.top + 20}">bid</text>
      <text class="legend other" x="${book.left + 92}" y="${book.top + 20}">other ask</text>
      <text class="axis" x="${book.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">Seconds left in the market</text>
      <rect class="note-box" x="686" y="36" width="274" height="238" rx="6"></rect>
      <text class="axis" x="708" y="64">${escapeHtml(noteTitle)}</text>
      ${gateText}
      <rect class="note-box" x="686" y="300" width="274" height="202" rx="6"></rect>
      <text class="axis" x="708" y="324">Book snapshot</text>
      ${bookText}
    </svg>`;
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
  const [minY, maxY] = profitDomain(values);
  const xFor = (index) => view.left + ((index + 0.5) / signals.length) * plotWidth;
  const yFor = (value) => view.top + ((maxY - value) / Math.max(maxY - minY, 1)) * plotHeight;
  const dense = signals.length > 80;
  const barWidth = dense
    ? Math.max(1, plotWidth / signals.length * 0.72)
    : Math.min(54, Math.max(14, plotWidth / signals.length * 0.42));
  const yZero = yFor(0);
  const yTicks = [minY, 0, (minY + maxY) / 2, maxY]
    .filter((value, index, array) => array.findIndex((other) => Math.abs(other - value) < 0.001) === index);
  const grid = yTicks.map((tick) => {
    const y = yFor(tick);
    return `<line class="${Math.abs(tick) < 0.001 ? "axis-zero" : "grid"}" x1="${view.left}" y1="${y}" x2="${view.left + plotWidth}" y2="${y}"></line><text class="tick" x="${view.left - 10}" y="${y + 4}" text-anchor="end">${formatPnl(tick)}</text>`;
  }).join("");
  const bars = signals.map((row, index) => {
    const pnl = Number(row.pnl_after_slippage_haircut || 0);
    const x = xFor(index) - barWidth / 2;
    const y = yFor(Math.max(pnl, 0));
    const height = Math.max(2, Math.abs(yFor(pnl) - yZero));
    const labelStep = dense ? Math.ceil(signals.length / 12) : 1;
    const label = !dense || index % labelStep === 0 || index === signals.length - 1
      ? `<text class="tick" x="${xFor(index)}" y="${view.top + plotHeight + 26}" text-anchor="middle">${signalNumber(row) || index + 1}</text>`
      : "";
    return `
      <rect class="pnl-bar ${pnl >= 0 ? "pass" : "fail"}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4">
        <title>${tradeTitle(row)}</title>
      </rect>
      ${label}`;
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
      <text class="axis" x="${view.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">${signals.length} market buys: bar = each entry, line = total profit</text>
      <text class="axis" x="20" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 20 ${view.top + plotHeight / 2})">Profit after 2c safety cost</text>
    </svg>`;
}

function profileMarketTitle(row) {
  const pnl = Number(row.pnl_dollars || 0);
  const cost = Number(row.total_cost || 0);
  return [
    `${row.slug || row.condition_id}`,
    `Winner: ${row.winner}`,
    `Cost: ${moneyCents.format(cost)}`,
    `Payout: ${moneyCents.format(row.payout || 0)}`,
    `PnL: ${moneyCents.format(pnl)}`,
    `Filled quotes: ${fmt.format(row.filled_quotes || 0)}`,
  ].join(" | ");
}

function profileChartTitle(profileKey, profile) {
  if (profileKey.startsWith("candidate:")) return profile.strategy_name || "Candidate Strategy";
  if (profileKey === "profile_cheap_pair") return "Cheap Pair";
  if (profileKey === "profile_skew") return "Late Skew";
  return profile.strategy_name || "Profile Strategy";
}

function walletProfileRead(profileKey) {
  if (profileKey.startsWith("candidate:")) {
    const profile = candidateFromValue(profileKey) || {};
    return {
      label: "Backtest candidate",
      read: profile.method?.description,
      engine_rule: profile.method?.description,
      risk: profile.method?.risk,
    };
  }
  return state.workflow?.wallet_profiles?.strategy_map?.[profileKey] || {};
}

function renderProfileSkewChart(profileKey = "profile_skew") {
  const profile = selectedStrategyProfile(profileKey);
  const summary = profile.summary || {};
  const method = profile.method || {};
  const walletRead = walletProfileRead(profileKey);
  const displayTitle = profileChartTitle(profileKey, profile);
  const rows = (profile.markets || [])
    .filter((row) => row.traded)
    .sort((left, right) => new Date(left.window_start) - new Date(right.window_start));
  if (!rows.length) {
    byId("backtestChart").innerHTML = svgEmpty(`No ${displayTitle.toLowerCase()} fills in this dataset.`);
    return;
  }
  const view = { width: 980, height: 500, left: 76, right: 300, top: 32, bottom: 64 };
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;
  const cumulative = [];
  let running = 0;
  rows.forEach((row) => {
    running += Number(row.pnl_dollars || 0);
    cumulative.push(running);
  });
  const pnlValues = rows.map((row) => Number(row.pnl_dollars || 0));
  const [minY, maxY] = profitDomain([0, ...pnlValues, ...cumulative]);
  const xFor = (index) => view.left + ((index + 0.5) / rows.length) * plotWidth;
  const yFor = (value) => view.top + ((maxY - value) / Math.max(maxY - minY, 1)) * plotHeight;
  const yZero = yFor(0);
  const barWidth = Math.max(1, plotWidth / rows.length * 0.72);
  const grid = [minY, 0, (minY + maxY) / 2, maxY].map((tick) => {
    const y = yFor(tick);
    return `<line class="${Math.abs(tick) < 0.001 ? "axis-zero" : "grid"}" x1="${view.left}" y1="${y}" x2="${view.left + plotWidth}" y2="${y}"></line><text class="tick" x="${view.left - 10}" y="${y + 4}" text-anchor="end">${formatPnl(tick)}</text>`;
  }).join("");
  const bars = rows.map((row, index) => {
    const pnl = Number(row.pnl_dollars || 0);
    const x = xFor(index) - barWidth / 2;
    const y = yFor(Math.max(pnl, 0));
    const height = Math.max(1, Math.abs(yFor(pnl) - yZero));
    return `
      <rect class="pnl-bar ${pnl >= 0 ? "pass" : "fail"}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="1">
        <title>${escapeHtml(profileMarketTitle(row))}</title>
      </rect>`;
  }).join("");
  const linePoints = rows.map((row, index) => ({
    x: xFor(index),
    y: yFor(cumulative[index]),
  }));
  const makerRoi = metricNumber(summary.maker_test_roi_on_planned_cost);
  const makerRows = makerRoi === null
    ? []
    : [
        ["Maker route", summary.maker_route_label || "Proxy route"],
        ["Maker test", `${fmt.format(summary.maker_test_fills || 0)} / ${fmt.format(summary.maker_test_signals || 0)} fills, ${formatPercent(makerRoi)}`],
      ];
  const noteRows = [
    ["Profile read", walletRead.read || method.description || "Historical profile rule"],
    ["Rule", walletRead.engine_rule || profile.strategy_name || displayTitle],
    ["Clean markets", fmt.format(summary.clean_markets_scanned || 0)],
    ["Filled markets", `${fmt.format(summary.traded_markets || 0)} (${formatPercent(summary.fill_market_rate)})`],
    ["Cost", moneyCents.format(summary.filled_cost || 0)],
    ["PnL", moneyCents.format(summary.pnl_dollars || 0)],
    ["ROI", formatPercent(summary.roi_on_filled_cost)],
    ["Positive markets", formatPercent(summary.positive_market_rate)],
    ["Positive days", formatPercent(summary.positive_day_rate)],
    ...makerRows,
    ["Main risk", walletRead.risk || "Needs live maker-fill proof"],
  ].map(([label, value], index) => {
    const y = 96 + index * 28;
    return `
      <text class="bar-label" x="722" y="${y}">${escapeHtml(label)}</text>
      <text class="bar-value" x="936" y="${y}" text-anchor="end">${escapeHtml(compactNote(value))}</text>`;
  }).join("");

  byId("backtestChart").innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Profile skew backtest market PnL">
      <rect class="plot" x="${view.left}" y="${view.top}" width="${plotWidth}" height="${plotHeight}"></rect>
      ${grid}
      ${bars}
      <path class="line" d="${pathFrom(linePoints)}"></path>
      <text class="axis" x="${view.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">${fmt.format(rows.length)} filled markets: bars = each market, line = total PnL</text>
      <text class="axis" x="20" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 20 ${view.top + plotHeight / 2})">Profit after settlement</text>
      <rect class="note-box" x="696" y="42" width="252" height="356" rx="6"></rect>
      <text class="axis" x="722" y="68">${escapeHtml(displayTitle)}</text>
      ${noteRows}
      <text class="tick" x="722" y="420">${escapeHtml(walletRead.label || "Historical proxy only.")}</text>
      <text class="tick" x="722" y="444">Paper-fill proof required before live money.</text>
    </svg>`;
}

function renderBacktestChart() {
  const market = marketRows().find((row) => row.condition_id === state.backtestMarket);
  if (!market) {
    byId("backtestSummary").innerHTML = "";
    byId("backtestChart").innerHTML = svgEmpty("No market selected.");
    return;
  }
  const signal = signalForMarket(market.condition_id);
  if (signal) {
    renderBacktestSummary(market, signal, true);
    renderSignalDecisionChart(signal, { isSignal: true, market });
    return;
  }
  const decision = noActionDecisionRow(market);
  if (!decision) {
    byId("backtestSummary").innerHTML = "";
    byId("backtestChart").innerHTML = svgEmpty("No decision rows for this market.");
    return;
  }
  renderBacktestSummary(market, decision, false);
  renderSignalDecisionChart(decision, { isSignal: false, market });
}

function checksFor(tab) {
  if (tab === "paper") {
    return (state.workflow.paper_trade.checks || []).filter((row) => row.group === "live_paper");
  }
  return liveStatusRows();
}

function gateRow(id, label, actual, target, passed, detail, title) {
  let progress = 0;
  if (typeof actual === "boolean") {
    progress = actual ? 1 : 0;
  } else if (metricNumber(actual) !== null && metricNumber(target) !== null && metricNumber(target) !== 0) {
    progress = Math.min(Math.max(metricNumber(actual) / metricNumber(target), 0), 1);
  } else {
    progress = passed ? 1 : 0;
  }
  return { id, label, actual, target, progress, passed: Boolean(passed), detail, title };
}

function liveStatusRows() {
  const policy = state.workflow.live_trade.execution_policy || {};
  const paperChecks = (state.workflow.paper_trade.checks || [])
    .filter((row) => row.group === "live_paper")
    .map((row) => ({ ...row, detail: `${formatActual(row.actual)} / ${formatActual(row.target)}` }));
  const manualChecks = (state.workflow.live_trade.checks || [])
    .filter((row) => row.group === state.liveGate && row.id === "manual_live_enable")
    .map((row) => ({ ...row, detail: `${formatActual(row.actual)} / ${formatActual(row.target)}` }));
  const fillRate = metricNumber(policy.test_fill_rate);
  const makerRoi = metricNumber(policy.test_roi_on_planned_cost);
  const lift = metricNumber(policy.roi_lift_vs_always_taker);
  return [
    gateRow(
      "maker_route",
      "Maker route",
      Boolean(policy.maker_route_ready),
      true,
      Boolean(policy.maker_route_ready),
      policy.selected_route_label || "No route selected",
      `${policy.selected_route_label || "No route selected"} | ${humanReason(policy.maker_route_ready_reason || policy.selection_reason)}`
    ),
    gateRow(
      "historical_maker_fill_rate",
      "Maker fills",
      fillRate,
      0.1,
      fillRate !== null && fillRate >= 0.1,
      `${fmt.format(policy.test_fills || 0)} of ${fmt.format(policy.test_signals || 0)} test signals`,
      `Proxy fill test uses same-outcome sell flow after the signal. Average quote ${formatPrice(policy.test_avg_quote_price)} vs ask ${formatPrice(policy.test_avg_signal_ask)}.`
    ),
    gateRow(
      "maker_profit",
      "Maker profit",
      makerRoi,
      0.03,
      makerRoi !== null && makerRoi >= 0.03,
      `${moneyCents.format(policy.test_pnl_dollars || 0)} | ${formatPercent(makerRoi)}`,
      `Held-out maker proxy PnL on planned quote cost. Fill-level ROI: ${formatPercent(policy.test_roi_on_filled_cost)}.`
    ),
    gateRow(
      "maker_lift",
      "Versus taking",
      lift,
      0.01,
      lift !== null && lift >= 0.01,
      `${formatSignedPercent(lift)} vs taker`,
      `Taker test ROI: ${formatPercent(policy.always_taker_test_roi_on_planned_cost)}. Maker route ROI: ${formatPercent(policy.test_roi_on_planned_cost)}.`
    ),
    ...paperChecks,
    ...manualChecks,
  ];
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
    maker_fills: "Paper maker fills",
    maker_fill_days: "Maker fill days",
    maker_fill_rate: "Paper fill rate",
    maker_win_rate: "Maker wins",
    maker_roi_on_filled_cost: "Maker profit rate",
    maker_worst_day: "Worst maker day",
    paper_signals: "Paper buys found",
    paper_days: "Paper buy days",
    maker_route: "Maker route",
    historical_maker_fill_rate: "Maker fills",
    maker_profit: "Maker profit",
    maker_lift: "Versus taking",
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
    const detail = row.detail || `${formatActual(row.actual)} / ${formatActual(row.target)}`;
    const title = row.title ? `<title>${escapeHtml(row.title)}</title>` : "";
    return `
      <text class="bar-label" x="${view.left - 14}" y="${y + barHeight * 0.65}" text-anchor="end">${plainCheckLabel(row)}</text>
      <rect class="bar-bg" x="${view.left}" y="${y}" width="${plotWidth}" height="${barHeight}" rx="4"></rect>
      <rect class="bar ${row.passed ? "pass" : "fail"}" x="${view.left}" y="${y}" width="${width}" height="${barHeight}" rx="4">${title}</rect>
      <text class="bar-value" x="${view.left + Math.max(width, 220) - 10}" y="${y + barHeight * 0.64}" text-anchor="end">${escapeHtml(detail)}</text>`;
  }).join("");

  el.innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="${tab} gate progress">
      ${grid}
      ${bars}
    </svg>`;
}

function paperStatusRows() {
  const summary = state.workflow.paper_trade.summary || {};
  const isCheapPair = state.workflow.paper_trade.edge_id === "profile_cheap_pair" || Number(summary.pair_quote_markets || 0) > 0;
  if (isCheapPair) {
    return [
      {
        label: "Book checks",
        value: Number(summary.evaluations || 0),
        detail: `${fmt.format(summary.evaluations || 0)} checks`,
        title: "Each check pulls the live Polymarket Up/Down books and BTC price.",
      },
      {
        label: "Pair quotes",
        value: Number(summary.pair_quote_markets || 0),
        detail: `${fmt.format(summary.pair_quote_markets || 0)} markets`,
        title: "Markets where the paper bot opened both Up and Down post-only quotes.",
      },
      {
        label: "Avg pair cost",
        value: Math.max(0, Number(summary.pair_avg_quote_sum || 0) * 100),
        detail: formatPrice(summary.pair_avg_quote_sum),
        title: "Average Up quote plus Down quote. Below 1.00 is the paired-cost edge.",
      },
      {
        label: "Both legs filled",
        value: Number(summary.pair_both_legs_filled_markets || 0),
        detail: `${fmt.format(summary.pair_both_legs_filled_markets || 0)} markets`,
        title: `Both-leg fill rate: ${formatPercent(summary.pair_both_leg_fill_rate)}.`,
      },
      {
        label: "One-leg risk",
        value: Number(summary.pair_one_leg_filled_markets || 0),
        detail: `${fmt.format(summary.pair_one_leg_filled_markets || 0)} markets`,
        title: `One-leg risk rate: ${formatPercent(summary.pair_one_leg_risk_rate)}. This is the danger in cheap-pair quoting.`,
      },
      {
        label: "Locked edge",
        value: Math.abs(Number(summary.pair_locked_edge_dollars || 0)),
        detail: moneyCents.format(summary.pair_locked_edge_dollars || 0),
        title: "Estimated dollars locked by matched Up/Down shares where pair cost was below 1.00.",
      },
      {
        label: "Unpaired cost",
        value: Math.abs(Number(summary.pair_unpaired_cost || 0)),
        detail: moneyCents.format(summary.pair_unpaired_cost || 0),
        title: "Filled exposure that did not have the opposite side filled yet.",
      },
      {
        label: "Settled profit",
        value: Math.abs(Number(summary.maker_pnl_dollars || 0)),
        detail: moneyCents.format(summary.maker_pnl_dollars || 0),
        title: "Maker paper PnL from filled shadow quotes after settlement.",
      },
      {
        label: "Toxic fills",
        value: Number(summary.maker_toxic_fills || 0),
        detail: `${fmt.format(summary.maker_toxic_fills || 0)} toxic`,
        title: `A fill is toxic when fair value after fill is below our quote. Toxic rate: ${formatPercent(summary.maker_toxic_fill_rate)}.`,
      },
    ];
  }
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
      label: "Table matches",
      value: Number(summary.paper_signals || 0),
      detail: fmt.format(summary.paper_signals || 0),
      title: "Live moments that matched the selected table before maker-route fill simulation.",
    },
    {
      label: "Maker quotes",
      value: Number(summary.maker_quotes || 0),
      detail: fmt.format(summary.maker_quotes || 0),
      title: "Post-only shadow quotes opened by the selected maker route.",
    },
    {
      label: "Maker fills",
      value: Number(summary.maker_fills || 0),
      detail: `${fmt.format(summary.maker_fills || 0)} filled`,
      title: "Shadow maker quotes inferred filled from same-outcome public SELL flow or conservative book-queue evidence.",
    },
    {
      label: "Fill events",
      value: Number(summary.maker_fill_events || 0),
      detail: `${fmt.format(summary.maker_fill_events || 0)} events`,
      title: "Partial maker fills can create multiple events for one shadow quote.",
    },
    {
      label: "Toxic fills",
      value: Number(summary.maker_toxic_fills || 0),
      detail: `${fmt.format(summary.maker_toxic_fills || 0)} toxic`,
      title: `A fill is toxic when fair value after fill is below our quote. Toxic rate: ${formatPercent(summary.maker_toxic_fill_rate)}.`,
    },
    {
      label: "Post-fill edge",
      value: Math.abs(Number(summary.maker_avg_post_fill_edge || 0) * 100),
      detail: formatCents(summary.maker_avg_post_fill_edge),
      title: "Average fair-after-fill minus quote price. Positive is the core maker-quality metric.",
    },
    {
      label: "Settled buys",
      value: Number(summary.maker_settled_fills || 0),
      detail: fmt.format(summary.maker_settled_fills || 0),
      title: "Maker paper fills with a completed win/loss result.",
    },
    {
      label: "Maker profit",
      value: Math.abs(Number(summary.maker_pnl_dollars || 0)),
      detail: moneyCents.format(summary.maker_pnl_dollars || 0),
      title: "Maker paper PnL from filled shadow quotes.",
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
  const active = activeCandidateStrategy();
  const activeSummary = active?.summary || state.workflow.active_backtest?.summary || {};
  const activeBuys = Number(activeSummary.traded_markets || activeSummary.quoted_markets || b.signals || 0);
  const activeRoi = metricNumber(activeSummary.roi_on_filled_cost ?? b.roi_after_slippage_haircut);
  const makerRoi = metricNumber(activeSummary.maker_test_roi_on_planned_cost);
  const makerText = makerRoi === null ? "" : ` | maker test ${formatPercent(makerRoi)}`;
  const generated = state.workflow.generated_at
    ? new Date(state.workflow.generated_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "unknown build";
  byId("statusText").textContent = `Loaded ${generated} | active backtest: ${fmt.format(activeBuys)} buys | ROI ${formatPercent(activeRoi)}${makerText} | ${fmt.format(q.clean_markets || 0)} clean windows`;
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
  byId("marketFilter").addEventListener("change", (event) => {
    state.marketFilter = event.target.value;
    renderBacktestSelects();
    renderBacktestChart();
  });
}

main().catch((error) => {
  byId("statusText").textContent = `Load failed: ${error.message}`;
});
