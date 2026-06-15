const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ACTIVE_BACKTEST_KEY = "late_depth_fair_clean";
const ACTIVE_BACKTEST_VALUE = `candidate:${ACTIVE_BACKTEST_KEY}`;
const PAPER_CURRENT_VALUE = "__current__";
const PAPER_REFRESH_MS = 5000;
const LIVE_TICK_RENDER_THROTTLE_MS = 250;
const LIVE_TICK_STALE_MS = 10000;
const LIVE_TICK_RECONNECT_MS = 2000;
const LIVE_TICK_MAX_POINTS = 3000;
const BINANCE_TRADE_STREAMS = [
  "wss://data-stream.binance.vision/stream?streams=btcusdt@trade&timeUnit=MICROSECOND",
  "wss://stream.binance.com:9443/stream?streams=btcusdt@trade&timeUnit=MICROSECOND",
  "wss://stream.binance.com:443/stream?streams=btcusdt@trade&timeUnit=MICROSECOND",
];
const LIVE_BTC_SOURCES = [
  {
    venue: "binance",
    url: "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
    parse: (payload) => Number(payload?.price),
  },
  {
    venue: "coinbase",
    url: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    parse: (payload) => Number(payload?.data?.amount),
  },
  {
    venue: "kraken",
    url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    parse: (payload) => Number(Object.values(payload?.result || {})[0]?.c?.[0]),
  },
];

const state = {
  workflow: null,
  activeTab: "backtest",
  marketFilter: "all",
  backtestMarket: "",
  paperGraph: PAPER_CURRENT_VALUE,
  liveBtcPoint: null,
  liveBtcTicksByMarket: new Map(),
  liveSyntheticMarket: null,
  liveTickStatus: {
    state: "idle",
    venue: "binance_ws",
    lastTickAt: null,
    lastError: null,
    url: null,
  },
  liveGate: "paper_to_live",
};

let workflowRefreshInFlight = false;
let liveBtcRefreshInFlight = false;
let liveTickSocket = null;
let liveTickReconnectTimer = null;
let liveTickRenderTimer = null;
let liveTickSourceIndex = 0;

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
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0]) || !Array.isArray(columns)) return rows || [];
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
  const paperTrade = workflow.paper_trade || {};
  workflow.paper_trade = paperTrade;
  const graphs = paperTrade.graphs || {};
  const graphColumns = paperTrade.graph_columns || {};
  if (Array.isArray(graphs)) {
    graphs.forEach((graph) => {
      const key = paperGraphKey(graph);
      graph.market_key = key;
      graph.points = inflateRows(graphColumns.points || graph.point_columns, graph.points).map((row) => ({
        ...row,
        market_key: key,
        condition_id: row.condition_id || graph.condition_id,
        slug: row.slug || graph.slug,
        question: row.question || graph.question,
      }));
      graph.markers = inflateRows(graphColumns.markers || graph.marker_columns, graph.markers).map((row) => ({
        ...row,
        market_key: key,
        condition_id: row.condition_id || graph.condition_id,
        slug: row.slug || graph.slug,
        question: row.question || graph.question,
      }));
    });
    paperTrade._graphMarkets = graphs;
  } else if (graphs && typeof graphs === "object") {
    graphs.markets = inflateRows(graphs.market_columns || graphs.markets_columns, graphs.markets);
    graphs.points = inflateRows(graphs.point_columns || graphs.points_columns, graphs.points);
    graphs.markers = inflateRows(graphs.marker_columns || graphs.markers_columns, graphs.markers);
    paperTrade._graphMarkets = graphs.markets || [];
    paperTrade.graphs = graphs;
  }
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
  workflow._paperPointsByMarket = new Map();
  const graphPointRows = Array.isArray(paperTrade.graphs)
    ? paperTrade.graphs.flatMap((graph) => graph.points || [])
    : (paperTrade.graphs?.points || []);
  graphPointRows.forEach((row) => {
    const key = paperGraphKey(row);
    if (!key) return;
    if (!workflow._paperPointsByMarket.has(key)) workflow._paperPointsByMarket.set(key, []);
    workflow._paperPointsByMarket.get(key).push(row);
  });
  workflow._paperPointsByMarket.forEach((rows) => {
    rows.sort((left, right) => {
      const leftTime = Date.parse(left.generated_at || left.ts || "");
      const rightTime = Date.parse(right.generated_at || right.ts || "");
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
      return Number(right.seconds_left ?? 0) - Number(left.seconds_left ?? 0);
    });
  });
  workflow._paperMarkersByMarket = new Map();
  const graphMarkerRows = Array.isArray(paperTrade.graphs)
    ? paperTrade.graphs.flatMap((graph) => graph.markers || [])
    : (paperTrade.graphs?.markers || []);
  graphMarkerRows.forEach((row) => {
    const key = paperGraphKey(row);
    if (!key) return;
    if (!workflow._paperMarkersByMarket.has(key)) workflow._paperMarkersByMarket.set(key, []);
    workflow._paperMarkersByMarket.get(key).push(row);
  });
  workflow._paperMarkersByMarket.forEach((rows) => {
    rows.sort((left, right) => {
      const leftTime = Date.parse(left.generated_at || left.ts || "");
      const rightTime = Date.parse(right.generated_at || right.ts || "");
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
      return Number(right.seconds_left ?? 0) - Number(left.seconds_left ?? 0);
    });
  });
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

function formatMicroTimestamp(value) {
  const micro = metricNumber(value);
  if (micro === null) return "--";
  const date = new Date(Math.floor(micro / 1000));
  const clock = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const fractional = String(Math.trunc(Math.abs(micro) % 1_000_000)).padStart(6, "0");
  return `${clock}.${fractional} us`;
}

function liveFeedLabel(row) {
  if (row?.decision === "live_tick") return "Binance WS trade";
  if (row?.decision === "live_price") return "HTTP spot fallback";
  return row?.btc_price_venue || row?.reason || "--";
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
    passes_test_fill_roi_and_walkforward_gates: "Passes held-out and walk-forward maker checks",
    walkforward_route_not_ready: "Fails rolling walk-forward maker checks",
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
    external_book_missing: "BTC book missing",
    external_book_support_too_low: "BTC book support too weak",
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

function paperGraphKey(row) {
  return String(row?.market_key || row?.condition_id || row?.slug || row?.question || "");
}

function paperGraphs() {
  return state.workflow?.paper_trade?.graphs || {};
}

function paperGraphLimits() {
  return state.workflow?.paper_trade?.graph_limits || {};
}

function paperGraphMarkets() {
  return state.workflow?.paper_trade?._graphMarkets || (Array.isArray(paperGraphs()) ? paperGraphs() : paperGraphs().markets || []);
}

function latestPaperPointFor(market) {
  const points = paperPointsFor(market);
  return points[points.length - 1] || null;
}

function paperMarketLastUpdatedAt(market) {
  const latestPoint = latestPaperPointFor(market);
  const candidates = [
    latestPoint?.generated_at,
    latestPoint?.ts,
    market?.latest_generated_at,
    market?.last_seen_at,
    market?.generated_at,
  ];
  const parsed = candidates
    .map((value) => Date.parse(value || ""))
    .find((value) => Number.isFinite(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function ageText(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "not updated";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function marketClockState(market) {
  const start = metricNumber(market?.window_start_unix);
  const end = metricNumber(market?.window_end_unix);
  if (start === null || end === null) return null;
  const now = Date.now() / 1000;
  if (now < start) return "future";
  if (now >= end) return "closed";
  return "open";
}

function marketSecondsLeftNow(market) {
  const end = metricNumber(market?.window_end_unix);
  if (end === null) return null;
  return Math.max(0, Math.round(end - Date.now() / 1000));
}

function currentFiveMinuteWindow(nowMs = Date.now()) {
  const start = Math.floor(nowMs / 1000 / 300) * 300;
  return { start, end: start + 300 };
}

function syntheticPaperMarket() {
  const { start, end } = currentFiveMinuteWindow();
  const key = `browser-live-btc-5m-${start}`;
  if (!state.liveSyntheticMarket || state.liveSyntheticMarket.market_key !== key) {
    state.liveSyntheticMarket = {
      market_key: key,
      condition_id: key,
      slug: `browser-live-btc-5m-${start}`,
      question: "Browser live BTC 5-minute window",
      window_start_unix: start,
      window_end_unix: end,
      window_start: new Date(start * 1000).toISOString(),
      window_end: new Date(end * 1000).toISOString(),
      start_price: null,
      latest_btc_price: null,
      latest_generated_at: null,
      is_current: true,
      is_open: true,
      is_synthetic_live: true,
      status: "browser_live",
      points: [],
      markers: [],
    };
  }
  return state.liveSyntheticMarket;
}

function isCurrentPaperMarket(market) {
  const clockState = marketClockState(market);
  if (clockState !== null) return clockState === "open";
  const limits = paperGraphLimits();
  const key = paperGraphKey(market);
  if (limits.current_condition_id && market?.condition_id === limits.current_condition_id) return true;
  if (limits.current_slug && market?.slug === limits.current_slug) return true;
  if (limits.current_market_key && key === limits.current_market_key) return true;
  if (market?.is_current === true || market?.current === true) return true;
  const status = String(market?.status || market?.state || "").toLowerCase();
  if (["current", "live", "open"].includes(status)) return true;
  if (market?.is_open === true && market?.latest_observed_open !== false) {
    const windowEnd = Date.parse(market?.window_end || "");
    if (!Number.isFinite(windowEnd) || Date.now() <= windowEnd + 30000) return true;
  }
  const lastSeconds = metricNumber(market?.last_seconds_left);
  const settled = Boolean(market?.settled || market?.has_settlement);
  if (settled || lastSeconds === null || lastSeconds <= 0) return false;
  const updatedAt = paperMarketLastUpdatedAt(market);
  return !updatedAt || Date.now() - updatedAt.getTime() < 90000;
}

function currentPaperMarket() {
  const markets = paperGraphMarkets();
  return markets.find(isCurrentPaperMarket) || null;
}

function currentDisplayPaperMarket() {
  return currentPaperMarket() || syntheticPaperMarket();
}

function liveTickPointsForMarket(market) {
  const key = paperGraphKey(market);
  if (!key || !market || !isCurrentPaperMarket(market)) return [];
  return state.liveBtcTicksByMarket.get(key) || [];
}

function latestLiveTickForMarket(market) {
  const points = liveTickPointsForMarket(market);
  return points[points.length - 1] || null;
}

function historicalPaperMarkets() {
  const current = currentPaperMarket();
  const currentKey = current ? paperGraphKey(current) : "";
  return paperGraphMarkets()
    .filter((market) => !currentKey || paperGraphKey(market) !== currentKey)
    .sort((left, right) => {
      const leftTime = Date.parse(left.window_start || left.latest_generated_at || "");
      const rightTime = Date.parse(right.window_start || right.latest_generated_at || "");
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
      return paperGraphKey(left).localeCompare(paperGraphKey(right));
    });
}

function paperPointsFor(market) {
  const key = paperGraphKey(market);
  return state.workflow?._paperPointsByMarket?.get(key) || market?.points || [];
}

function pointTimeUnix(row) {
  const explicit = metricNumber(row?.time_unix);
  if (explicit !== null) return explicit;
  const parsed = Date.parse(row?.generated_at || row?.ts || "");
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

function livePointForMarket(market) {
  if (market?.is_synthetic_live) return null;
  const live = state.liveBtcPoint;
  if (!live || !market || live.market_key !== paperGraphKey(market)) return null;
  if (!isCurrentPaperMarket(market)) return null;
  const latest = latestPaperPointFor(market);
  const latestTime = pointTimeUnix(latest);
  const liveTime = pointTimeUnix(live);
  if (latestTime !== null && liveTime !== null && liveTime <= latestTime) return null;
  return live;
}

function paperChartPointsFor(market) {
  const points = paperPointsFor(market);
  const ticks = liveTickPointsForMarket(market);
  const live = livePointForMarket(market);
  const merged = ticks.length ? [...points, ...ticks] : points;
  return live ? [...merged, live] : merged;
}

function paperDisplayUpdatedAt(market) {
  const latestTick = latestLiveTickForMarket(market);
  if (latestTick?.generated_at) return new Date(latestTick.generated_at);
  const live = livePointForMarket(market);
  if (live?.generated_at) return new Date(live.generated_at);
  return paperMarketLastUpdatedAt(market);
}

function paperMarkersFor(market) {
  const key = paperGraphKey(market);
  return state.workflow?._paperMarkersByMarket?.get(key) || market?.markers || [];
}

function selectedPaperMarket() {
  const markets = paperGraphMarkets();
  if (!state.paperGraph || state.paperGraph === PAPER_CURRENT_VALUE) return currentDisplayPaperMarket();
  if (!markets.length) return null;
  return markets.find((market) => paperGraphKey(market) === state.paperGraph) || null;
}

function paperDistanceBps(row) {
  const distance = metricNumber(row?.distance_bps);
  if (distance !== null) return distance;
  const btc = metricNumber(row?.btc_price);
  const start = metricNumber(row?.start_price);
  if (btc === null || start === null || start <= 0) return null;
  return Math.log(btc / start) * 10000;
}

function paperPointSecondsLeft(row, fallbackIndex = 0, total = 1) {
  const seconds = metricNumber(row?.seconds_left);
  if (seconds !== null) return seconds;
  const elapsed = metricNumber(row?.elapsed_seconds);
  if (elapsed !== null) return Math.max(0, 300 - elapsed);
  if (total <= 1) return 300;
  return 300 - (fallbackIndex / (total - 1)) * 300;
}

function paperMarketTimeLabel(market) {
  const value = market?.window_start || market?.generated_at || market?.first_seen_at;
  if (value) {
    return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (market?.window_start_unix) {
    return new Date(Number(market.window_start_unix) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  return "Unknown time";
}

function paperMarketLabel(market) {
  const status = isCurrentPaperMarket(market) ? "Live" : "Past";
  const points = paperPointsFor(market);
  const markers = paperMarkersFor(market);
  const signals = Number(market.paper_signals ?? market.signals ?? points.filter((row) => row.decision === "paper_signal").length);
  const quotes = Number(market.maker_quotes ?? market.quotes ?? markers.filter((row) => paperMarkerType(row) === "quote").length);
  const fills = Number(market.maker_fills ?? market.fills ?? markers.filter((row) => paperMarkerType(row) === "fill").length);
  const action = signals || quotes || fills
    ? `signals ${fmt.format(signals)} | quotes ${fmt.format(quotes)} | fills ${fmt.format(fills)}`
    : "no paper buy";
  const result = market.pnl_dollars !== undefined || market.maker_pnl_dollars !== undefined
    ? ` | PnL ${formatSignedMoney(market.pnl_dollars ?? market.maker_pnl_dollars)}`
    : "";
  return `${status} | ${paperMarketTimeLabel(market)} | ${action}${result}`;
}

function paperMarkerType(row) {
  const value = String(row?.event_type || row?.type || row?.decision || "");
  if (value.includes("settlement")) return "settlement";
  if (value.includes("fill")) return "fill";
  if (value.includes("cancel")) return "cancel";
  if (value.includes("quote")) return "quote";
  if (value.includes("no_signal")) return "fail";
  if (value.includes("signal")) return "signal";
  return "latest";
}

function paperMarkerLabel(row) {
  const labels = {
    signal: "signal",
    quote: "quote",
    fill: "fill",
    cancel: "cancel",
    settlement: "settle",
    fail: "no",
    latest: "now",
  };
  return labels[paperMarkerType(row)] || "event";
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
    ["bought", `Ask-sim buys (${fmt.format(boughtCount)})`],
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
      ? `Ask-sim buy ${signal.intended_outcome} ${moneyCents.format(signal.pnl_after_slippage_haircut || 0)}`
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

function ruleSummaryText() {
  const rule = activeRule();
  return [
    `Buy Up if BTC is above start, Down if below start; only ${rangeText(rule.min_seconds_left, rule.max_seconds_left, "s")} before close`,
    `BTC move ${rangeText(rule.min_abs_distance_bps, rule.max_abs_distance_bps, " bps")}`,
    `ask ${rangeText(rule.min_ask, rule.max_ask)}`,
    `top-5 depth >= ${money.format(rule.min_top5_capacity_dollars || 0)}`,
    `fair edge >= ${formatCents(rule.min_fair_edge_vs_bid)}`,
    `book lean >= ${percentText(rule.min_signal_depth_imbalance)}`,
    `both asks <= ${formatPrice(rule.max_complement_ask_sum)}`,
  ].join(" | ");
}

function strategyCell(title, body) {
  return `
    <div class="strategy-cell">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(body)}</strong>
    </div>`;
}

function renderStrategyPanels() {
  const paperSummary = state.workflow.paper_trade.summary || {};
  const policy = state.workflow.live_trade.execution_policy || {};
  const routeLabel = paperSummary.maker_route_label || policy.selected_route_label || "Maker 2c below ask for 60s";
  const bookChecks = Number(paperSummary.external_book_checks || 0);
  const depthSupportText = bookChecks > 0
    ? "Live Binance BTC depth support is checked before a shadow quote is allowed."
    : "BTC depth support is configured, but the current paper sample has not exercised that filter yet.";
  const liveStatus = policy.maker_route_ready
    ? "Disabled until live paper fills prove post-fill edge and a human enables live orders."
    : "Disabled. The maker route failed the rolling walk-forward gate, so it is not live-ready.";
  byId("backtestStrategy").innerHTML = [
    strategyCell("Backtest strategy", ruleSummaryText()),
    strategyCell("Backtest signals", "Historical BTC price plus Polymarket books: fair value, bid/ask, top-5 depth, side book lean, and both-asks sanity."),
    strategyCell("Backtest fill model", "$25 buy at the ask, hold to settlement, subtract 2c safety cost. This tests table quality; maker fills are checked separately."),
  ].join("");
  byId("paperStrategy").innerHTML = [
    strategyCell("Paper strategy", `Same table rule in live markets. ${depthSupportText}`),
    strategyCell("Maker route", `${routeLabel}: post-only configured maker quote, never cross the spread, cancel when edge decays or data is stale.`),
    strategyCell("Paper goal", "Prove post-fill edge and toxic-fill rate. A winning settlement can still be a bad maker fill."),
  ].join("");
  byId("liveStrategy").innerHTML = [
    strategyCell("Live status", liveStatus),
    strategyCell("Order policy", "Post-only maker limits only; no taker entries, no market orders, cancel stale or negative-edge quotes."),
    strategyCell("Promotion gate", "Needs positive post-fill edge, low toxic fills, clean start prices, healthy latency, and manual enable."),
  ].join("");
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
    ? `Simulated ask buy ${outcome} at ${formatPrice(selectedAsk)} with ${row.seconds_left}s left`
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
    `Signal ${signalNumber(row)}: simulated ask buy ${row.intended_outcome} at ${entry.toFixed(2)} with ${row.seconds_left}s left`,
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
  const walkforwardDays = metricNumber(policy.walkforward_test_days);
  const walkforwardRoi = metricNumber(policy.walkforward_roi_on_planned_cost);
  const walkforwardPositiveDayRate = metricNumber(policy.walkforward_positive_day_rate);
  const walkforwardLift = metricNumber(policy.walkforward_roi_lift_vs_always_taker);
  const makerRouteDetail = `${policy.selected_route_label || "No route selected"} | ${humanReason(policy.maker_route_ready_reason || policy.selection_reason)}`;
  return [
    gateRow(
      "maker_route",
      "Maker route",
      Boolean(policy.maker_route_ready),
      true,
      Boolean(policy.maker_route_ready),
      makerRouteDetail,
      makerRouteDetail
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
    gateRow(
      "maker_walkforward_days",
      "Walk-forward days",
      walkforwardDays,
      metricNumber(policy.min_walkforward_test_days) || 5,
      walkforwardDays !== null && walkforwardDays >= (metricNumber(policy.min_walkforward_test_days) || 5),
      `${fmt.format(policy.walkforward_test_days || 0)} rolling days`,
      "Each day selects the maker route from prior days only, then scores the next day."
    ),
    gateRow(
      "maker_walkforward_profit",
      "Walk-forward profit",
      walkforwardRoi,
      metricNumber(policy.min_walkforward_roi_on_planned_cost) || 0.03,
      walkforwardRoi !== null && walkforwardRoi >= (metricNumber(policy.min_walkforward_roi_on_planned_cost) || 0.03),
      `${moneyCents.format(policy.walkforward_pnl_dollars || 0)} | ${formatPercent(walkforwardRoi)}`,
      `Rolling maker route PnL on planned quote cost. Fill-level ROI: ${formatPercent(policy.walkforward_roi_on_filled_cost)}.`
    ),
    gateRow(
      "maker_walkforward_days_green",
      "Winning days",
      walkforwardPositiveDayRate,
      metricNumber(policy.min_walkforward_positive_day_rate) || 0.55,
      walkforwardPositiveDayRate !== null && walkforwardPositiveDayRate >= (metricNumber(policy.min_walkforward_positive_day_rate) || 0.55),
      `${formatPercent(walkforwardPositiveDayRate)} positive days`,
      `${fmt.format(policy.walkforward_positive_days || 0)} of ${fmt.format(policy.walkforward_test_days || 0)} rolling test days were profitable.`
    ),
    gateRow(
      "maker_walkforward_lift",
      "WF vs taking",
      walkforwardLift,
      0.01,
      walkforwardLift !== null && walkforwardLift >= 0.01,
      `${formatSignedPercent(walkforwardLift)} vs taker`,
      `Rolling taker ROI: ${formatPercent(policy.walkforward_always_taker_roi_on_planned_cost)}. Rolling maker ROI: ${formatPercent(policy.walkforward_roi_on_planned_cost)}.`
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
    maker_walkforward_days: "Walk-forward days",
    maker_walkforward_profit: "Walk-forward profit",
    maker_walkforward_days_green: "Winning days",
    maker_walkforward_lift: "WF vs taking",
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
  const rows = [];
  if (summary.paper_route_matches_active === false) {
    rows.push({
      label: "Active route paper",
      value: 0,
      detail: "not collected",
      tone: "fail",
      title: summary.paper_route_note || "Paper evidence has not been collected for the active maker route.",
    });
  }
  return rows.concat([
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
      label: "BTC book checks",
      value: Number(summary.external_book_checks || 0),
      detail: fmt.format(summary.external_book_checks || 0),
      tone: Number(summary.external_book_checks || 0) > 0 ? "pass" : "fail",
      title: "Times the paper bot fetched Binance BTC depth after the Polymarket and fair-value gates passed.",
    },
    {
      label: "BTC book support",
      value: Math.max(0, Number(summary.external_book_support_rate || 0) * 100),
      detail: formatPercent(summary.external_book_support_rate),
      title: "Share of BTC depth checks where bid/ask imbalance supported the selected side.",
    },
    {
      label: "Avg BTC support",
      value: Math.abs(Number(summary.external_book_avg_support || 0) * 100),
      detail: percentText(summary.external_book_avg_support),
      title: "Average side-adjusted BTC order-book imbalance. Positive supports the quote; negative is adverse.",
    },
    {
      label: "BTC book errors",
      value: Object.values(summary.external_book_errors || {}).reduce((sum, count) => sum + Number(count || 0), 0),
      detail: fmt.format(Object.values(summary.external_book_errors || {}).reduce((sum, count) => sum + Number(count || 0), 0)),
      title: "External depth fetch failures. The paper bot should not quote when this feed is missing.",
    },
    {
      label: "Maker quotes",
      value: Number(summary.maker_quotes || 0),
      detail: fmt.format(summary.maker_quotes || 0),
      title: "Post-only shadow quotes opened by the selected maker route.",
    },
    {
      label: "Quote marks",
      value: Number(summary.maker_marks || 0),
      detail: fmt.format(summary.maker_marks || 0),
      title: "Per-poll checks of open maker quotes: fair value, live edge, and current book.",
    },
    {
      label: "Edge cancels",
      value: Number(summary.maker_edge_cancels || 0),
      detail: fmt.format(summary.maker_edge_cancels || 0),
      title: "Open maker quotes canceled because live fair edge fell below the configured threshold before fill inference.",
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
      tone: Number(summary.maker_toxic_fills || 0) > 0 ? "fail" : "pass",
      title: `A fill is toxic when fair value after fill is below our quote. Toxic rate: ${formatPercent(summary.maker_toxic_fill_rate)}.`,
    },
    {
      label: "Post-fill edge",
      value: Math.abs(Number(summary.maker_avg_post_fill_edge || 0) * 100),
      detail: formatCents(summary.maker_avg_post_fill_edge),
      tone: Number(summary.maker_avg_post_fill_edge || 0) < 0 ? "fail" : "pass",
      title: "Average fair-after-fill minus quote price. Positive is the core maker-quality metric.",
    },
    {
      label: "Worst live edge",
      value: Math.abs(Number(summary.maker_min_live_edge || 0) * 100),
      detail: formatCents(summary.maker_min_live_edge),
      tone: Number(summary.maker_min_live_edge || 0) < 0 ? "fail" : "pass",
      title: "Worst marked live fair edge while a maker quote was open. This should stay above the cancel threshold.",
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
      tone: Number(summary.maker_pnl_dollars || 0) < 0 ? "fail" : "pass",
      title: "Maker paper PnL from filled shadow quotes.",
    },
  ]);
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
      <rect class="bar ${row.tone || "pass"}" x="${view.left}" y="${y}" width="${width}" height="${barHeight}" rx="4">
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

function renderPaperSelects() {
  const select = byId("paperGraphSelect");
  const meta = byId("paperGraphMeta");
  if (!select) return;
  const markets = paperGraphMarkets();
  const realCurrent = currentPaperMarket();
  const current = realCurrent || syntheticPaperMarket();
  select.disabled = false;
  const historical = historicalPaperMarkets();
  const currentLabel = current
    ? `${current.is_synthetic_live ? "Current live BTC window" : "Current live market"} | ${paperMarketTimeLabel(current)} | ${fmt.format(paperChartPointsFor(current).length)} points`
    : `Current live market | waiting for workflow.json`;
  const marketOptions = historical.map((market) => {
    const key = paperGraphKey(market);
    return `<option value="${escapeHtml(key)}">${escapeHtml(paperMarketLabel(market))}</option>`;
  }).join("");
  const currentGroup = `
    <optgroup label="Current / live">
      <option value="${PAPER_CURRENT_VALUE}">${escapeHtml(currentLabel)}</option>
    </optgroup>`;
  const historicalGroup = marketOptions
    ? `<optgroup label="Historical paper markets">${marketOptions}</optgroup>`
    : `<optgroup label="Historical paper markets"><option value="" disabled>No past paper graphs yet</option></optgroup>`;
  select.innerHTML = `${currentGroup}${historicalGroup}`;
  if (state.paperGraph !== PAPER_CURRENT_VALUE && !markets.some((market) => paperGraphKey(market) === state.paperGraph)) {
    state.paperGraph = PAPER_CURRENT_VALUE;
  }
  select.value = state.paperGraph || PAPER_CURRENT_VALUE;

  if (meta) {
    const market = selectedPaperMarket();
    const selectedCurrent = (state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE;
    const points = market ? paperChartPointsFor(market) : [];
    if (selectedCurrent && market?.is_synthetic_live && !points.length) {
      meta.innerHTML = `<span class="live-chip is-waiting">Waiting</span> Connecting to Binance microsecond trade ticks. HTTP spot fallback checks every ${Math.round(PAPER_REFRESH_MS / 1000)}s.`;
      return;
    }
    const updatedAt = market ? paperDisplayUpdatedAt(market) : null;
    const statusClass = selectedCurrent && market && isCurrentPaperMarket(market) ? "is-live" : "is-past";
    const statusText = selectedCurrent ? "Live" : "Past";
    const tickCount = market ? liveTickPointsForMarket(market).length : 0;
    const tickStatus = state.liveTickStatus.state === "open"
      ? `${fmt.format(tickCount)} Binance WS microsecond ticks`
      : `Binance WS ${state.liveTickStatus.state}`;
    const refreshText = selectedCurrent
      ? `${tickStatus}; HTTP fallback every ${Math.round(PAPER_REFRESH_MS / 1000)}s`
      : "Historical snapshot";
    meta.innerHTML = `<span class="live-chip ${statusClass}">${escapeHtml(statusText)}</span> ${fmt.format(points.length)} price points | updated ${escapeHtml(ageText(updatedAt))} | ${escapeHtml(refreshText)}`;
  }
}

function paperDecisionText(row) {
  if (!row) return "--";
  const side = row.side || row.intended_outcome || row.outcome || "";
  if (row.decision === "live_tick") return "Live BTC tick";
  if (row.decision === "live_price") return "Live BTC update";
  if (row.decision === "paper_signal") return `Signal ${side || "matched"}`;
  if (row.event_type === "maker_paper_quote") return `Quote ${side || ""}`.trim();
  if (row.event_type === "maker_paper_fill") return `Fill ${side || ""}`.trim();
  if (row.event_type === "maker_paper_cancel") return `Cancel: ${rejectReasonLabel(row.reason)}`;
  return `No quote: ${rejectReasonLabel(row.reason)}`;
}

function paperQuoteText(row) {
  if (!row) return "--";
  const side = row.side || row.intended_outcome || row.outcome || "";
  const quotePrice = metricNumber(row.maker_quote_price ?? row.quote_price ?? row.bid_price ?? row.price);
  const size = metricNumber(row.size ?? row.shares ?? row.quantity);
  const priceText = quotePrice === null ? "--" : formatPrice(quotePrice);
  const sizeText = size === null ? "" : ` x ${size.toFixed(2)}`;
  return `${side || "quote"} ${priceText}${sizeText}`;
}

function paperMarkerTitle(row) {
  const pieces = [
    paperMarkerLabel(row),
    paperDecisionText(row),
    `${Math.round(paperPointSecondsLeft(row))}s left`,
  ];
  const btc = metricNumber(row.btc_price);
  if (btc !== null) pieces.push(`BTC ${formatPrice(btc)}`);
  const distance = paperDistanceBps(row);
  if (distance !== null) pieces.push(formatBps(distance));
  const support = metricNumber(row.external_book_support);
  if (support !== null) pieces.push(`BTC book ${percentText(support)}`);
  const quotePrice = metricNumber(row.maker_quote_price ?? row.quote_price ?? row.bid_price ?? row.price);
  if (quotePrice !== null) pieces.push(`quote ${formatPrice(quotePrice)}`);
  const pnl = metricNumber(row.pnl_dollars);
  if (pnl !== null) pieces.push(`PnL ${formatSignedMoney(pnl)}`);
  return pieces.filter(Boolean).join(" | ");
}

function renderPaperDecisionGraph() {
  const market = selectedPaperMarket();
  const rawPoints = market ? paperChartPointsFor(market) : [];
  const chart = byId("paperChart");
  if (!market || !rawPoints.length) {
    if ((state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE) {
      chart.innerHTML = svgEmpty(`Waiting for the first live BTC tick. This tab checks spot price every ${Math.round(PAPER_REFRESH_MS / 1000)}s while it is open.`);
      return;
    }
    chart.innerHTML = svgEmpty("No paper price path for this historical market yet.");
    return;
  }

  const samples = rawPoints
    .map((row, index) => ({
      row,
      index,
      secondsLeft: paperPointSecondsLeft(row, index, rawPoints.length),
      distanceBps: paperDistanceBps(row),
      btcPrice: metricNumber(row.btc_price),
    }))
    .filter((point) => Number.isFinite(point.secondsLeft) && Number.isFinite(point.distanceBps));

  if (!samples.length) {
    chart.innerHTML = svgEmpty("This paper market has price points, but no usable BTC move values yet.");
    return;
  }

  const view = { width: 980, height: 720 };
  const plot = { left: 76, right: 306, top: 42, height: 362 };
  const plotWidth = view.width - plot.left - plot.right;
  const plotBottom = plot.top + plot.height;
  const xForSeconds = (secondsLeft) => {
    const clamped = Math.max(0, Math.min(300, Number(secondsLeft)));
    return plot.left + ((300 - clamped) / 300) * plotWidth;
  };
  const maxAbsDistance = Math.max(8, ...samples.map((point) => Math.abs(point.distanceBps))) * 1.18;
  const tickAbs = Math.max(10, Math.ceil(maxAbsDistance / 10) * 10);
  const yForDistance = (value) => plot.top + ((tickAbs - Number(value)) / (tickAbs * 2)) * plot.height;
  const linePoints = samples.map((point) => ({
    x: xForSeconds(point.secondsLeft),
    y: yForDistance(point.distanceBps),
  }));
  const latest = samples[samples.length - 1];
  const rule = activeRule();
  const windowStartX = xForSeconds(rule.max_seconds_left ?? 120);
  const windowEndX = xForSeconds(rule.min_seconds_left ?? 61);
  const closeStartX = xForSeconds(20);
  const xTicks = [300, 240, 180, 120, 60, 0].map((tick) => {
    const x = xForSeconds(tick);
    return `<line class="grid" x1="${x}" y1="${plot.top}" x2="${x}" y2="${plotBottom}"></line><text class="tick" x="${x}" y="${plotBottom + 24}" text-anchor="middle">${tick}s</text>`;
  }).join("");
  const yTicks = [-tickAbs, 0, tickAbs].map((tick) => {
    const y = yForDistance(tick);
    return `<line class="${tick === 0 ? "axis-zero" : "grid"}" x1="${plot.left}" y1="${y}" x2="${plot.left + plotWidth}" y2="${y}"></line><text class="tick" x="${plot.left - 10}" y="${y + 4}" text-anchor="end">${formatBps(tick)}</text>`;
  }).join("");

  const nearestSample = (row) => {
    const markerSeconds = paperPointSecondsLeft(row);
    let best = samples[0];
    let bestDelta = Math.abs(samples[0].secondsLeft - markerSeconds);
    samples.forEach((sample) => {
      const delta = Math.abs(sample.secondsLeft - markerSeconds);
      if (delta < bestDelta) {
        best = sample;
        bestDelta = delta;
      }
    });
    return best;
  };
  const seenMarkers = new Set();
  const pointSignals = rawPoints.filter((row) => row.decision === "paper_signal");
  const markerRows = [...paperMarkersFor(market), ...pointSignals]
    .filter((row) => paperMarkerType(row) !== "fail")
    .filter((row) => {
      const key = `${paperMarkerType(row)}:${row.generated_at || row.ts || ""}:${row.seconds_left ?? ""}:${row.quote_id || ""}`;
      if (seenMarkers.has(key)) return false;
      seenMarkers.add(key);
      return true;
    })
    .slice(-90);
  const eventDots = markerRows.map((row) => {
    const markerSample = paperDistanceBps(row) === null ? nearestSample(row) : null;
    const secondsLeft = paperPointSecondsLeft(row, markerSample?.index || 0, samples.length);
    const distance = paperDistanceBps(row) ?? markerSample?.distanceBps;
    if (!Number.isFinite(secondsLeft) || !Number.isFinite(distance)) return "";
    const x = xForSeconds(secondsLeft);
    const y = yForDistance(distance);
    const type = paperMarkerType(row);
    return `
      <circle class="dot ${type}" cx="${x}" cy="${y}" r="6">
        <title>${escapeHtml(paperMarkerTitle(row))}</title>
      </circle>
      <text class="paper-marker-label" x="${x + 8}" y="${y - 8}">${escapeHtml(paperMarkerLabel(row))}</text>`;
  }).join("");

  const latestRaw = latest.row;
  const latestQuote = [...paperMarkersFor(market)].reverse().find((row) => ["quote", "fill"].includes(paperMarkerType(row)));
  const latestSupport = metricNumber(latestRaw.external_book_support ?? latestQuote?.external_book_support);
  const settlement = [...paperMarkersFor(market)].reverse().find((row) => paperMarkerType(row) === "settlement");
  const pnl = metricNumber(settlement?.pnl_dollars ?? market.pnl_dollars ?? market.maker_pnl_dollars);
  const selectedCurrent = (state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE && isCurrentPaperMarket(market);
  const modeText = selectedCurrent
    ? `live, updated ${ageText(paperDisplayUpdatedAt(market))}`
    : `past, updated ${ageText(paperDisplayUpdatedAt(market))}`;
  const resultText = settlement
    ? `${paperDecisionText(settlement)} | ${pnl === null ? "--" : formatSignedMoney(pnl)}`
    : (market.winner ? `${market.winner} won | ${pnl === null ? "--" : formatSignedMoney(pnl)}` : "--");
  const latestTradeTime = latestRaw.trade_time_micro
    ? formatMicroTimestamp(latestRaw.trade_time_micro)
    : (latestRaw.time_unix ? formatMicroTimestamp(Number(latestRaw.time_unix) * 1_000_000) : "--");
  const latency = metricNumber(latestRaw.ws_latency_ms);
  const latencyText = latency === null ? "--" : `${latency.toFixed(1)} ms`;
  const fairProbability = metricNumber(latestRaw.fair_probability);
  const fairEdge = metricNumber(latestRaw.fair_edge);
  const depthImbalance = metricNumber(latestRaw.side_depth_imbalance);
  const flowEdge = metricNumber(latestRaw.trade_flow_edge_15s);
  const complementAskSum = metricNumber(latestRaw.complement_ask_sum);
  const externalImbalance = metricNumber(latestRaw.external_book_imbalance);
  const externalSpread = metricNumber(latestRaw.external_book_spread_bps);
  const externalMicro = metricNumber(latestRaw.external_book_microprice_edge_bps);
  const infoRows = [
    ["Market", compactNote(market.slug || market.question || paperGraphKey(market), 30)],
    ["Mode", compactNote(modeText, 30)],
    ["Window", paperMarketTimeLabel(market)],
    ["Latest BTC", `${formatPrice(latest.btcPrice)} | ${formatBps(latest.distanceBps)}`],
    ["Tick time", compactNote(latestTradeTime, 30)],
    ["Feed", compactNote(`${liveFeedLabel(latestRaw)} | ${latencyText}`, 30)],
    ["Seconds left", `${Math.round(latest.secondsLeft)}s`],
    ["Decision", compactNote(paperDecisionText(latestRaw), 30)],
    ["Paper quote", compactNote(paperQuoteText(latestQuote), 30)],
    ["Fair / edge", `${formatPercent(fairProbability)} | ${formatCents(fairEdge)}`],
    ["PM depth / flow", `${depthImbalance === null ? "--" : percentText(depthImbalance)} | ${flowEdge === null ? "--" : moneyCents.format(flowEdge)}`],
    ["Pair ask sum", complementAskSum === null ? "--" : complementAskSum.toFixed(2)],
    ["BTC book", latestSupport === null ? "--" : percentText(latestSupport)],
    ["BTC imbalance", externalImbalance === null ? "--" : percentText(externalImbalance)],
    ["BTC spread", externalSpread === null ? "--" : formatBps(externalSpread)],
    ["BTC micro", externalMicro === null ? "--" : formatBps(externalMicro)],
    ["Result", compactNote(resultText, 30)],
  ].map(([label, value], index) => {
    const y = 90 + index * 33;
    return `
      <text class="bar-label" x="718" y="${y}">${escapeHtml(label)}</text>
      <text class="bar-value" x="718" y="${y + 17}">${escapeHtml(String(value))}</text>`;
  }).join("");
  const latestTitle = [
    `latest ${Math.round(latest.secondsLeft)}s left`,
    `BTC ${formatPrice(latest.btcPrice)}`,
    formatBps(latest.distanceBps),
    latestTradeTime,
    paperDecisionText(latestRaw),
  ].join(" | ");

  chart.innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Paper trade BTC path and events">
      <title>${escapeHtml(`${paperMarketLabel(market)} | ${latestTitle}`)}</title>
      <rect class="plot" x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plot.height}"></rect>
      <rect class="decision-band" x="${Math.min(windowStartX, windowEndX)}" y="${plot.top}" width="${Math.abs(windowEndX - windowStartX)}" height="${plot.height}"></rect>
      <rect class="paper-close-band" x="${closeStartX}" y="${plot.top}" width="${plot.left + plotWidth - closeStartX}" height="${plot.height}"></rect>
      ${xTicks}
      ${yTicks}
      <path class="line line-distance" d="${pathFrom(linePoints)}"></path>
      ${eventDots}
      <line class="paper-latest-line" x1="${xForSeconds(latest.secondsLeft)}" y1="${plot.top}" x2="${xForSeconds(latest.secondsLeft)}" y2="${plotBottom}"></line>
      <circle class="dot latest ${selectedCurrent ? "live-now" : ""}" cx="${xForSeconds(latest.secondsLeft)}" cy="${yForDistance(latest.distanceBps)}" r="6">
        <title>${escapeHtml(latestTitle)}</title>
      </circle>
      <text class="axis" x="${plot.left + plotWidth / 2}" y="${plot.top - 16}" text-anchor="middle">BTC move from this market start</text>
      <text class="axis" x="${plot.left + plotWidth / 2}" y="${plotBottom + 54}" text-anchor="middle">Seconds left in the market</text>
      <text class="axis" x="22" y="${plot.top + plot.height / 2}" text-anchor="middle" transform="rotate(-90 22 ${plot.top + plot.height / 2})">Move from start</text>
      <rect class="note-box" x="696" y="42" width="266" height="554" rx="6"></rect>
      <text class="axis" x="718" y="68">Paper Trade</text>
      ${infoRows}
      <text class="legend bid" x="718" y="626">BTC move</text>
      <text class="legend ask" x="718" y="652">signal/fill</text>
      <text class="legend other" x="794" y="652">quote/cancel</text>
      <text class="tick" x="718" y="680">${escapeHtml(`${fmt.format(markerRows.length)} paper events shown | ${fmt.format(rawPoints.length)} collected points`)}</text>
    </svg>`;
}

function renderPaperChart() {
  renderPaperSelects();
  if (paperGraphMarkets().length || selectedPaperMarket()) {
    renderPaperDecisionGraph();
    return;
  }
  renderValueBarChart(byId("paperChart"), paperStatusRows(), "No paper evidence yet.", "Live paper evidence so far");
}

function renderStatus() {
  const q = state.workflow.data_quality || {};
  const b = state.workflow.backtest.summary || {};
  const active = activeCandidateStrategy();
  const activeSummary = active?.summary || state.workflow.active_backtest?.summary || {};
  const activeBuys = Number(activeSummary.traded_markets || activeSummary.quoted_markets || b.signals || 0);
  const activeRoi = metricNumber(activeSummary.roi_on_filled_cost ?? b.roi_after_slippage_haircut);
  const policy = state.workflow.live_trade.execution_policy || {};
  const makerRoi = metricNumber(policy.walkforward_roi_on_planned_cost ?? activeSummary.maker_walkforward_roi_on_planned_cost);
  const makerTarget = metricNumber(policy.min_walkforward_roi_on_planned_cost) || 0.03;
  const makerReady = Boolean(policy.maker_route_ready);
  const makerText = makerRoi === null
    ? ""
    : ` | maker route ${makerReady ? "paper-ready" : "not ready"} | WF ROI ${formatPercent(makerRoi)} ${makerRoi >= makerTarget ? ">=" : "<"} ${formatPercent(makerTarget)}`;
  const generated = state.workflow.generated_at
    ? new Date(state.workflow.generated_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "unknown build";
  byId("statusText").textContent = `Loaded ${generated} | active backtest: ${fmt.format(activeBuys)} ask-sim buys | ask-entry ROI ${formatPercent(activeRoi)}${makerText} | ${fmt.format(q.clean_markets || 0)} clean windows`;
}

function currentPaperViewSelected() {
  return (state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE;
}

function liveMarketForTicks() {
  if (state.activeTab !== "paper" || !currentPaperViewSelected()) return null;
  return currentPaperMarket() || syntheticPaperMarket();
}

function appendLiveBtcPoint(market, point) {
  const key = paperGraphKey(market);
  if (!key) return;
  const points = state.liveBtcTicksByMarket.get(key) || [];
  const last = points[points.length - 1];
  const lastTradeId = last?.trade_id;
  const tradeId = point.trade_id;
  const lastTime = metricNumber(last?.trade_time_micro ?? last?.time_unix);
  const pointTime = metricNumber(point.trade_time_micro ?? point.time_unix);
  if (tradeId !== undefined && lastTradeId !== undefined && String(tradeId) === String(lastTradeId)) return;
  if (lastTime !== null && pointTime !== null && pointTime < lastTime) return;
  points.push(point);
  if (points.length > LIVE_TICK_MAX_POINTS) {
    points.splice(0, points.length - LIVE_TICK_MAX_POINTS);
  }
  state.liveBtcTicksByMarket.set(key, points);
}

function liveStartPriceForMarket(market, btcPrice) {
  let startPrice = metricNumber(market?.start_price ?? latestPaperPointFor(market)?.start_price);
  if ((startPrice === null || startPrice <= 0) && market) {
    startPrice = btcPrice;
    market.start_price = btcPrice;
  }
  return startPrice;
}

function normalizeBinanceMicroTime(value) {
  const number = metricNumber(value);
  if (number === null) return null;
  return number > 10_000_000_000_000 ? number : number * 1000;
}

function pointFromBinanceTrade(raw) {
  const data = raw?.data || raw;
  const market = liveMarketForTicks();
  if (!market || !data) return null;
  const price = metricNumber(data.p);
  if (price === null || price <= 0) return null;
  const tradeTimeMicro = normalizeBinanceMicroTime(data.T ?? data.E);
  const eventTimeMicro = normalizeBinanceMicroTime(data.E ?? data.T);
  const timeMicro = tradeTimeMicro || eventTimeMicro || Date.now() * 1000;
  const secondsLeft = marketSecondsLeftNow(market);
  if (secondsLeft === null || secondsLeft <= 0 || secondsLeft > 300) return null;
  const startPrice = liveStartPriceForMarket(market, price);
  if (startPrice === null || startPrice <= 0) return null;
  const distanceBps = Math.log(price / startPrice) * 10000;
  market.latest_btc_price = price;
  market.latest_generated_at = new Date(Math.floor(timeMicro / 1000)).toISOString();
  return {
    market_key: paperGraphKey(market),
    condition_id: market.condition_id,
    slug: market.slug,
    question: market.question,
    generated_at: market.latest_generated_at,
    time_unix: timeMicro / 1_000_000,
    event_time_micro: eventTimeMicro,
    trade_time_micro: tradeTimeMicro,
    seconds_left: secondsLeft,
    btc_price: price,
    start_price: startPrice,
    distance_bps: distanceBps,
    decision: "live_tick",
    reason: "binance_ws_trade_microsecond",
    side: distanceBps > 0 ? "Up" : (distanceBps < 0 ? "Down" : null),
    btc_price_venue: "binance_ws",
    trade_id: data.t,
    trade_quantity: metricNumber(data.q),
    trade_notional: metricNumber(data.q) === null ? null : metricNumber(data.q) * price,
    trade_aggressor_side: data.m === true ? "sell" : "buy",
    ws_latency_ms: eventTimeMicro ? Math.max(0, Date.now() - eventTimeMicro / 1000) : null,
  };
}

function scheduleLiveTickRender() {
  if (state.activeTab !== "paper" || !currentPaperViewSelected()) return;
  if (liveTickRenderTimer) return;
  liveTickRenderTimer = window.setTimeout(() => {
    liveTickRenderTimer = null;
    if (state.activeTab === "paper" && currentPaperViewSelected()) renderPaperChart();
  }, LIVE_TICK_RENDER_THROTTLE_MS);
}

function clearLiveTickReconnect() {
  if (liveTickReconnectTimer) {
    window.clearTimeout(liveTickReconnectTimer);
    liveTickReconnectTimer = null;
  }
}

function closeLiveTickStream() {
  clearLiveTickReconnect();
  if (liveTickSocket) {
    liveTickSocket.onopen = null;
    liveTickSocket.onmessage = null;
    liveTickSocket.onerror = null;
    liveTickSocket.onclose = null;
    liveTickSocket.close();
    liveTickSocket = null;
  }
  state.liveTickStatus.state = "idle";
}

function ensureLiveTickStream() {
  if (!liveMarketForTicks()) {
    closeLiveTickStream();
    return;
  }
  if (liveTickSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(liveTickSocket.readyState)) return;
  if (liveTickReconnectTimer) return;
  const url = BINANCE_TRADE_STREAMS[liveTickSourceIndex % BINANCE_TRADE_STREAMS.length];
  state.liveTickStatus = {
    ...state.liveTickStatus,
    state: "connecting",
    url,
  };
  const socket = new WebSocket(url);
  liveTickSocket = socket;
  socket.onopen = () => {
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "open",
      url,
      lastError: null,
    };
  };
  socket.onmessage = (message) => {
    try {
      const payload = JSON.parse(message.data);
      const point = pointFromBinanceTrade(payload);
      if (!point) return;
      appendLiveBtcPoint(liveMarketForTicks(), point);
      state.liveTickStatus = {
        ...state.liveTickStatus,
        state: "open",
        lastTickAt: new Date(Math.floor((point.event_time_micro || point.trade_time_micro || Date.now() * 1000) / 1000)),
        lastError: null,
      };
      scheduleLiveTickRender();
    } catch (error) {
      console.warn("live BTC tick parse failed", error);
    }
  };
  socket.onerror = () => {
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "error",
      lastError: "websocket_error",
    };
  };
  socket.onclose = () => {
    if (liveTickSocket === socket) liveTickSocket = null;
    if (state.activeTab !== "paper" || !currentPaperViewSelected()) return;
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "reconnecting",
      lastError: state.liveTickStatus.lastError || "websocket_closed",
    };
    liveTickSourceIndex += 1;
    clearLiveTickReconnect();
    liveTickReconnectTimer = window.setTimeout(() => {
      liveTickReconnectTimer = null;
      ensureLiveTickStream();
    }, LIVE_TICK_RECONNECT_MS);
  };
}

async function fetchLiveBtcPrice() {
  for (const source of LIVE_BTC_SOURCES) {
    try {
      const response = await fetch(`${source.url}${source.url.includes("?") ? "&" : "?"}_=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const price = source.parse(payload);
      if (Number.isFinite(price) && price > 0) {
        return { price, venue: source.venue };
      }
    } catch (error) {
      console.warn("live BTC price fetch failed", source.venue, error);
    }
  }
  return null;
}

async function refreshLivePaperPrice() {
  if (state.activeTab !== "paper" || liveBtcRefreshInFlight) return;
  ensureLiveTickStream();
  const lastTickAt = state.liveTickStatus.lastTickAt instanceof Date ? state.liveTickStatus.lastTickAt.getTime() : null;
  if (lastTickAt !== null && Date.now() - lastTickAt < LIVE_TICK_STALE_MS) return;
  const market = currentPaperMarket() || syntheticPaperMarket();
  const secondsLeft = marketSecondsLeftNow(market);
  if (secondsLeft === null || secondsLeft <= 0 || secondsLeft > 300) {
    state.liveBtcPoint = null;
    return;
  }

  liveBtcRefreshInFlight = true;
  try {
    const live = await fetchLiveBtcPrice();
    if (!live) return;
    const startPrice = liveStartPriceForMarket(market, live.price);
    if (startPrice === null || startPrice <= 0) return;
    const now = new Date();
    const distanceBps = Math.log(live.price / startPrice) * 10000;
    const point = {
      market_key: paperGraphKey(market),
      condition_id: market.condition_id,
      slug: market.slug,
      question: market.question,
      generated_at: now.toISOString(),
      time_unix: now.getTime() / 1000,
      seconds_left: secondsLeft,
      btc_price: live.price,
      start_price: startPrice,
      distance_bps: distanceBps,
      decision: "live_price",
      reason: `browser_${live.venue}_price`,
      side: distanceBps > 0 ? "Up" : (distanceBps < 0 ? "Down" : null),
      btc_price_venue: live.venue,
    };
    market.latest_btc_price = live.price;
    market.latest_generated_at = point.generated_at;
    appendLiveBtcPoint(market, point);
    state.liveBtcPoint = null;
    if ((state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE) renderPaperChart();
  } finally {
    liveBtcRefreshInFlight = false;
  }
}

async function refreshWorkflow() {
  if (workflowRefreshInFlight) return;
  workflowRefreshInFlight = true;
  try {
    state.workflow = normalizeWorkflow(await loadJson("data/workflow.json"));
    renderStatus();
    renderStrategyPanels();
    renderBacktestSelects();
    renderActiveTab();
  } catch (error) {
    console.warn("workflow refresh failed", error);
  } finally {
    workflowRefreshInFlight = false;
  }
}

function renderActiveTab() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === state.activeTab);
  });
  if (state.activeTab === "backtest") renderBacktestChart();
  if (state.activeTab === "paper") {
    renderPaperChart();
    if (currentPaperViewSelected()) ensureLiveTickStream();
  } else {
    closeLiveTickStream();
  }
  if (state.activeTab === "live") renderGateChart("live");
}

async function main() {
  state.workflow = normalizeWorkflow(await loadJson("data/workflow.json"));
  renderStatus();
  renderStrategyPanels();
  renderBacktestSelects();
  renderBacktestChart();
  renderPaperChart();
  renderGateChart("live");

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderActiveTab();
      if (state.activeTab === "paper") {
        refreshWorkflow();
        refreshLivePaperPrice();
      }
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
  byId("paperGraphSelect").addEventListener("change", (event) => {
    state.paperGraph = event.target.value;
    renderPaperChart();
    if (state.paperGraph === PAPER_CURRENT_VALUE) {
      ensureLiveTickStream();
      refreshWorkflow();
      refreshLivePaperPrice();
    } else {
      closeLiveTickStream();
    }
  });
  window.setInterval(() => {
    if (state.activeTab === "paper") {
      refreshWorkflow();
      refreshLivePaperPrice();
    }
  }, PAPER_REFRESH_MS);
}

main().catch((error) => {
  byId("statusText").textContent = `Load failed: ${error.message}`;
});
