const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ACTIVE_BACKTEST_KEY = "strict_directional_maker";
const ACTIVE_BACKTEST_VALUE = `candidate:${ACTIVE_BACKTEST_KEY}`;
const ACTIVE_PAPER_EDGE_ID = "consistency_queue100_h5_native";
const PAPER_CURRENT_VALUE = "__current__";
const PAPER_REFRESH_MS = 30000;
const LIVE_TICK_RENDER_THROTTLE_MS = 16;
const LIVE_CHART_CLOCK_MS = 250;
const LIVE_TICK_STALE_MS = 10000;
const LIVE_TICK_RECONNECT_MS = 2000;
const LIVE_SOCKET_CONNECT_TIMEOUT_MS = 3500;
const LOCAL_BACKEND_BASE_KEY = "POLYMARKET_LOCAL_BACKEND_BASE";
const LOCAL_PAPER_EDGE_KEY = "POLYMARKET_PAPER_EDGE_ID";
const DEFAULT_BACKEND_BASE = "http://127.0.0.1:8788";
const LIVE_TICK_RENDER_MAX_POINTS = 2400;
const LIVE_AUX_RENDER_THROTTLE_MS = 500;
const LIVE_TICK_PERSIST_MS = 7500;
const LIVE_TICK_STORE_MAX_POINTS_PER_MARKET = 4500;
const LIVE_TICK_STORE_MAX_BOOK_POINTS_PER_MARKET = 120;
const LIVE_TICK_PERSIST_POINTS_PER_MARKET = 3500;
const LIVE_TICK_STORE_KEY = "polymarketPaperLiveTicks.v18";
const LEGACY_LIVE_TICK_STORE_KEYS = [
  "polymarketPaperLiveTicks.v2",
  "polymarketPaperLiveTicks.v3",
  "polymarketPaperLiveTicks.v4",
  "polymarketPaperLiveTicks.v5",
  "polymarketPaperLiveTicks.v6",
  "polymarketPaperLiveTicks.v7",
  "polymarketPaperLiveTicks.v8",
  "polymarketPaperLiveTicks.v9",
  "polymarketPaperLiveTicks.v10",
  "polymarketPaperLiveTicks.v11",
  "polymarketPaperLiveTicks.v12",
  "polymarketPaperLiveTicks.v13",
  "polymarketPaperLiveTicks.v14",
  "polymarketPaperLiveTicks.v15",
  "polymarketPaperLiveTicks.v16",
  "polymarketPaperLiveTicks.v17",
];
const LIVE_PAPER_X_WINDOW_SECONDS = 15;
const LIVE_PAPER_X_LEAD_SECONDS = 2;
const LIVE_PAPER_Y_MIN_RADIUS = 8;
const LIVE_PAPER_Y_EXPANSION_PAD = 1.24;
const LIVE_PAPER_Y_BUCKET = 4;
const LIVE_PAPER_RENDER_BUCKET_SECONDS = 0.075;
const LIVE_CHAINLINK_RENDER_BUCKET_SECONDS = null;
const LIVE_BINANCE_RENDER_BUCKET_SECONDS = null;
const LIVE_STEP_EPS_SECONDS = 0.0005;
const LIVE_CHAINLINK_MAX_LINE_GAP_SECONDS = 10;
const LIVE_BINANCE_MAX_LINE_GAP_SECONDS = 5;
const LIVE_PAPER_RENDER_TAIL_SECONDS = 15;
const LIVE_RENDER_MAX_SOURCE_ROWS_PER_LINE = 20000;
const LIVE_RENDER_MIN_POINTS_PER_LINE = 900;
const LIVE_RENDER_MAX_POINTS_PER_LINE = 4000;
const LIVE_RENDER_POINTS_PER_PIXEL = 5;
const LIVE_AUX_VERSION_THROTTLE_MS = 100;
const LIVE_CHART_SCHEMA_VERSION = "paper-live-v15-short-feed-labels";
const DISPLAY_CERTAIN_OPPOSITE_PRICE = 0.011;
const POLYMARKET_TRUTH_CURRENT_STALE_MS = 12000;
const POLYMARKET_TRUTH_EVENT_STALE_MS = 18000;
const BINANCE_DEPTH_TABLE_STALE_MS = 15000;
const LOCAL_BACKEND_BASE = configuredBackendBase();
const LOCAL_BACKEND_WS = window.POLYMARKET_BACKEND_WS || "";
const BACKEND_WS_CHAINLINK_SNAPSHOT_LIMIT = 300;
const BACKEND_WS_BINANCE_SNAPSHOT_LIMIT = 1200;
const BACKEND_WS_SNAPSHOT_SECONDS = 15;
const POLYMARKET_TRUTH_SOURCE = "chainlink_data_streams";
const DEFAULT_PAPER_SESSION = Object.freeze({
  mode: "paper",
  starting_capital: 100,
  current_capital: 100,
  total_pnl_dollars: 0,
  realized_pnl_dollars: 0,
  available_capital: 100,
  committed_capital: 0,
  market_count: 0,
  market_limit: 36,
  positions: [],
  pnl_history: [],
});
const DEFAULT_LIVE_SESSION = Object.freeze({
  mode: "live",
  enabled: false,
  starting_capital: null,
  current_capital: null,
  total_pnl_dollars: null,
  realized_pnl_dollars: null,
  available_capital: null,
  committed_capital: null,
  market_count: 0,
  market_limit: 36,
  positions: [],
  pnl_history: [],
});

function configuredInitialTab() {
  const params = new URLSearchParams(window.location.search || "");
  const requested = (params.get("tab") || window.location.hash.replace(/^#/, "") || "").toLowerCase();
  return ["backtest", "paper", "live"].includes(requested) ? requested : "backtest";
}

const state = {
  workflow: null,
  paperSqlSession: null,
  activeTab: configuredInitialTab(),
  marketFilter: "all",
  backtestMarket: "",
  paperGraph: PAPER_CURRENT_VALUE,
  liveBtcTicksByMarket: new Map(),
  liveBtcTickKeysByMarket: new Map(),
  paperLiveChartScales: new Map(),
  livePersistedMarkets: new Map(),
  paperObservedMarkets: new Map(),
  paperObservedPointsByMarket: new Map(),
  paperObservedMarkersByMarket: new Map(),
  latestOutcomeOddsByWindow: new Map(),
  lastDisplayedOutcomeOddsByWindow: new Map(),
  liveTickStatus: {
    state: "idle",
    venue: "local_backend_ws",
    lastTickAt: null,
    lastError: null,
    url: null,
  },
  paperStorageStatus: {
    state: "disabled",
    lastError: null,
    restoredMarkets: 0,
    savedAt: null,
  },
  backendStatus: {
    state: "idle",
    lastError: null,
    lastStreamAt: null,
    pointsLoaded: 0,
    url: null,
  },
  paperSelectSignature: "",
  paperAuxRenderCache: new Map(),
  paperCollapsedPanels: new Set(),
  paperAuxVersion: 0,
  paperAuxVersionBumpedAt: 0,
  paperAuxBookKey: "",
  paperUPlotCharts: new Map(),
  liveGate: "paper_to_live",
};

let workflowRefreshInFlight = false;
let liveTickSocket = null;
let liveTickReconnectTimer = null;
let liveTickRenderFrame = null;
let liveTickLastRenderAt = 0;
let liveTickPersistTimer = null;
let liveChartClockTimer = null;

function byId(id) {
  return document.getElementById(id);
}

function bumpPaperAuxVersion(force = false) {
  const now = Date.now();
  if (!force && now - state.paperAuxVersionBumpedAt < LIVE_AUX_VERSION_THROTTLE_MS) return false;
  state.paperAuxVersion += 1;
  state.paperAuxVersionBumpedAt = now;
  return true;
}

function isCompactPaperChart() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function configuredBackendBase() {
  const params = new URLSearchParams(window.location.search || "");
  const host = window.location.hostname;
  if (window.POLYMARKET_BACKEND_BASE) return String(window.POLYMARKET_BACKEND_BASE).replace(/\/+$/, "");
  const explicit = params.get("backend");
  if (explicit) return String(explicit).replace(/\/+$/, "");
  const saved = window.localStorage?.getItem(LOCAL_BACKEND_BASE_KEY);
  if (saved) return String(saved).replace(/\/+$/, "");
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  if (host && !["127.0.0.1", "localhost", "yongkanglin.github.io"].includes(host)) {
    return `${protocol}//${host}:8788`;
  }
  return DEFAULT_BACKEND_BASE;
}

function configuredPaperEdgeId() {
  const params = new URLSearchParams(window.location.search || "");
  const explicit = params.get("paper_edge_id") || params.get("edge_id");
  if (explicit) return String(explicit);
  if (window.POLYMARKET_PAPER_EDGE_ID) return String(window.POLYMARKET_PAPER_EDGE_ID);
  const saved = window.localStorage?.getItem(LOCAL_PAPER_EDGE_KEY);
  if (saved) return String(saved);
  return "";
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
  const marketByIndex = backtest.markets || [];
  backtest.series = inflateRows(backtest.series_columns, backtest.series).map((row) => {
    if (row.condition_id === undefined && row.market_index !== undefined) {
      const market = marketByIndex[Number(row.market_index)];
      if (market) row.condition_id = market.condition_id;
      delete row.market_index;
    }
    return row;
  });
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
        window_start_unix: row.window_start_unix ?? graph.window_start_unix,
        window_end_unix: row.window_end_unix ?? graph.window_end_unix,
      }));
      graph.markers = inflateRows(graphColumns.markers || graph.marker_columns, graph.markers).map((row) => ({
        ...row,
        market_key: key,
        condition_id: row.condition_id || graph.condition_id,
        slug: row.slug || graph.slug,
        question: row.question || graph.question,
        window_start_unix: row.window_start_unix ?? graph.window_start_unix,
        window_end_unix: row.window_end_unix ?? graph.window_end_unix,
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
  paperTrade._paperPointsByMarket = workflow._paperPointsByMarket;
  paperTrade._paperMarkersByMarket = workflow._paperMarkersByMarket;
  rememberWorkflowPaperRows(paperTrade);
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
  if (row?.decision === "live_book_tick" && ["depth", "book"].includes(row?.backend_event_kind)) return "Binance";
  if (String(row?.btc_price_venue || "").startsWith("local_backend_binance_ws")) return "Binance";
  if (String(row?.btc_price_venue || row?.btc_price_source || "").includes("chainlink_data_streams")) return "Chainlink";
  if (row?.decision === "live_tick" || row?.decision === "live_book_tick") return "Binance";
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
    no_quotes_to_fill: "No quotes placed",
    fills_observed: "Fills observed",
    quoted_but_no_matching_polymarket_sells: "No matching Polymarket sells hit our bids",
    matching_sells_did_not_reach_bid_price: "Sells happened, but above our bid",
    sell_flow_crossed_bid_but_queue_did_not_clear: "Sells crossed us, but queue did not clear",
    raw_sell_flow_reached_bid_without_recorded_fill: "Sell flow reached our bid; check matching",
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
    external_microprice_support_too_low: "BTC microprice against buy",
    external_trade_flow_missing: "BTC trade flow missing",
    external_trade_flow_support_too_low: "BTC trade flow against buy",
    missing_best_ask: "missing best ask",
    outside_time_window: "outside decision window",
    public_trade_sell_flow_or_visible_book_queue: "legacy book-or-trade fill proxy",
    no_quote: "no buy in this market",
    same_outcome_public_sell_flow_only: "same-outcome sellers reached our bid",
    quote_horizon_expired: "quote time limit expired",
    selected_table_match: "buy rule matched",
    visible_book_queue_depleted: "visible queue was depleted",
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

function sourceLineGapSeconds(source) {
  return source === "binance" ? LIVE_BINANCE_MAX_LINE_GAP_SECONDS : LIVE_CHAINLINK_MAX_LINE_GAP_SECONDS;
}

function pointsAreSeparated(left, right, maxGapSeconds = null) {
  if (!left || !right || !Number.isFinite(maxGapSeconds)) return false;
  const leftElapsed = Number(left.elapsedSeconds ?? left.sample?.elapsedSeconds);
  const rightElapsed = Number(right.elapsedSeconds ?? right.sample?.elapsedSeconds);
  return Number.isFinite(leftElapsed)
    && Number.isFinite(rightElapsed)
    && rightElapsed - leftElapsed > maxGapSeconds;
}

function pathFrom(points, maxGapSeconds = null) {
  if (!Array.isArray(points) || !points.length) return "";
  return points.map((point, index) => {
    const command = index === 0 || pointsAreSeparated(points[index - 1], point, maxGapSeconds) ? "M" : "L";
    return `${command}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}

function stepPathFrom(points, maxGapSeconds = null) {
  if (!Array.isArray(points) || !points.length) return "";
  const output = [`M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (pointsAreSeparated(previous, point, maxGapSeconds)) {
      output.push(`M${point.x.toFixed(2)},${point.y.toFixed(2)}`);
      continue;
    }
    output.push(`L${point.x.toFixed(2)},${previous.y.toFixed(2)}`);
    output.push(`L${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  }
  return output.join("");
}

function compressLinePoints(points, minPixelGap = 0.75) {
  const output = [];
  points.forEach((point) => {
    const last = output[output.length - 1];
    if (last && Math.abs(point.x - last.x) < minPixelGap) {
      output[output.length - 1] = point;
    } else {
      output.push(point);
    }
  });
  return output;
}

function downsamplePoints(points, maxPoints) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  if (maxPoints <= 2) return points.slice(-Math.max(1, maxPoints));
  const output = [points[0]];
  const step = (points.length - 2) / (maxPoints - 2);
  for (let index = 1; index < maxPoints - 1; index += 1) {
    output.push(points[Math.round(index * step)]);
  }
  output.push(points[points.length - 1]);
  return output;
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

function formatBpsDeep(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const abs = Math.abs(number);
  if (abs < 0.00005) return "0 bps";
  const decimals = abs < 0.01 ? 4 : (abs < 0.1 ? 3 : (abs < 1 ? 2 : 1));
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(decimals)} bps`;
}

function formatNeutralMove(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const abs = Math.abs(number);
  if (abs < 0.00005) return "0 bps";
  const decimals = abs >= 10 ? 0 : (abs >= 1 ? 1 : (abs >= 0.1 ? 2 : 3));
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(decimals)} bps`;
}

function formatDollarMove(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const abs = Math.abs(number);
  if (abs < 0.005) return "$0.00";
  const decimals = abs >= 100 ? 0 : (abs >= 10 ? 1 : 2);
  const amount = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = number > 0 ? "+" : "-";
  return `${sign}$${amount}`;
}

function moveToneClass(value) {
  const number = metricNumber(value);
  if (number === null || Math.abs(number) < 0.005) return "move-flat";
  return number > 0 ? "move-up" : "move-down";
}

function paperDistanceDomain(samples) {
  const values = samples
    .map((point) => point.distanceBps)
    .filter((value) => Number.isFinite(value));
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  const minSpan = 0.08;
  if (max - min < minSpan) {
    const center = (min + max) / 2;
    min = center - minSpan / 2;
    max = center + minSpan / 2;
    if (min > 0) min = 0;
    if (max < 0) max = 0;
  }
  const span = Math.max(max - min, minSpan);
  const pad = Math.max(span * 0.12, 0.008);
  return { min: min - pad, max: max + pad };
}

function paperDollarMove(row) {
  const btc = metricNumber(row?.btc_price);
  const start = metricNumber(row?.start_price);
  if (btc === null) return null;
  if (start === null) {
    const distanceBps = metricNumber(row?.distance_bps);
    if (distanceBps === null) return null;
    const impliedStart = btc / Math.exp(distanceBps / 10000);
    return Number.isFinite(impliedStart) ? btc - impliedStart : null;
  }
  return btc - start;
}

function paperDollarMoveFromStart(row, startPrice) {
  const btc = metricNumber(row?.btc_price);
  const start = metricNumber(startPrice);
  if (btc === null || start === null) return paperDollarMove(row);
  return btc - start;
}

function paperDollarDomain(samples, minSpan = 1) {
  const values = samples
    .map((point) => point.dollarMove)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return { min: -minSpan, max: minSpan };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < minSpan) {
    const center = (min + max) / 2;
    min = center - minSpan / 2;
    max = center + minSpan / 2;
  }
  const span = Math.max(max - min, minSpan);
  const pad = Math.max(span * 0.16, 0.25);
  return { min: min - pad, max: max + pad };
}

function paperLiveScaleKey(market) {
  const key = paperGraphKey(market) || "current";
  const windowStart = market?.window_start_unix ?? "";
  return `${key}:${windowStart}`;
}

function liveMarketElapsedSeconds(market) {
  const start = marketWindowStartUnix(market);
  if (start === null) return null;
  const elapsed = Date.now() / 1000 - start;
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(300, elapsed)) : null;
}

function livePaperXDomain(market, latestElapsed) {
  const clockElapsed = liveMarketElapsedSeconds(market);
  const latest = Math.max(0, Math.min(300, Math.max(
    Number(latestElapsed) || 0,
    clockElapsed ?? 0,
  )));
  const windowSeconds = LIVE_PAPER_X_WINDOW_SECONDS;
  const leadSeconds = LIVE_PAPER_X_LEAD_SECONDS;
  const scrollAfter = windowSeconds - leadSeconds;
  let min = latest <= scrollAfter ? 0 : latest - scrollAfter;
  min = Math.max(0, Math.min(300 - windowSeconds, min));
  const key = paperLiveScaleKey(market);
  const cached = state.paperLiveChartScales.get(key) || {};
  min = Math.max(cached.xMin || 0, min);
  state.paperLiveChartScales.set(key, { ...cached, xMin: min, xMax: min + windowSeconds });
  return { min, max: min + windowSeconds };
}

function livePaperDollarDomain(market, samples) {
  const key = paperLiveScaleKey(market);
  const values = (samples || [])
    .map((point) => point.dollarMove)
    .filter((value) => Number.isFinite(value));
  const neededRadius = Math.max(LIVE_PAPER_Y_MIN_RADIUS, ...values.map((value) => Math.abs(value)));
  const expandedRadius = Math.ceil((neededRadius * LIVE_PAPER_Y_EXPANSION_PAD) / LIVE_PAPER_Y_BUCKET) * LIVE_PAPER_Y_BUCKET;
  const cached = state.paperLiveChartScales.get(key) || {};
  const radius = Math.max(cached.yRadius || 0, expandedRadius);
  state.paperLiveChartScales.set(key, { ...cached, yRadius: radius });
  return { min: -radius, max: radius };
}

function liveRenderPointLimit(plotWidth, denseRenderer = false) {
  if (denseRenderer) return LIVE_RENDER_MAX_POINTS_PER_LINE;
  const width = Number(plotWidth);
  const target = Number.isFinite(width) ? Math.round(width * LIVE_RENDER_POINTS_PER_PIXEL) : LIVE_TICK_RENDER_MAX_POINTS;
  return Math.max(LIVE_RENDER_MIN_POINTS_PER_LINE, Math.min(LIVE_RENDER_MAX_POINTS_PER_LINE, target));
}

function orderedUniqueSamples(samples) {
  const seen = new Set();
  return (samples || [])
    .filter((sample) => (
      sample
      && Number.isFinite(sample.elapsedSeconds)
      && Number.isFinite(sample.dollarMove)
    ))
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds)
    .filter((sample) => {
      const key = [
        sample.row?.point_id,
        sample.row?.event_id,
        sample.row?.receive_time_micro,
        sample.row?.event_time_micro,
        sample.elapsedSeconds,
        sample.dollarMove,
      ].filter((value) => value !== undefined && value !== null).join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function stableLiveLineSamples(samples, bucketSeconds = null, maxPoints = LIVE_TICK_RENDER_MAX_POINTS, xDomain = null) {
  const ordered = orderedUniqueSamples(samples);
  if (!ordered.length) return [];
  if (ordered.length <= maxPoints && bucketSeconds === null) return ordered;
  const span = xDomain
    ? Math.max(1, Number(xDomain.max) - Number(xDomain.min))
    : Math.max(1, ordered[ordered.length - 1].elapsedSeconds - ordered[0].elapsedSeconds);
  const bucketTarget = Math.max(2, Math.floor(maxPoints / 4));
  const bucketSize = Math.max(bucketSeconds ?? LIVE_PAPER_RENDER_BUCKET_SECONDS, span / bucketTarget);
  const buckets = new Map();
  ordered.forEach((sample) => {
    const bucket = Math.floor(sample.elapsedSeconds / bucketSize);
    let entry = buckets.get(bucket);
    if (!entry) {
      entry = { first: sample, last: sample, min: sample, max: sample };
      buckets.set(bucket, entry);
      return;
    }
    if (sample.elapsedSeconds < entry.first.elapsedSeconds) entry.first = sample;
    if (sample.elapsedSeconds >= entry.last.elapsedSeconds) entry.last = sample;
    if (sample.dollarMove < entry.min.dollarMove) entry.min = sample;
    if (sample.dollarMove > entry.max.dollarMove) entry.max = sample;
  });
  const output = [];
  [...buckets.values()]
    .sort((left, right) => left.first.elapsedSeconds - right.first.elapsedSeconds)
    .forEach((entry) => {
      [entry.first, entry.min, entry.max, entry.last]
        .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds)
        .forEach((sample) => {
          if (output[output.length - 1] !== sample) output.push(sample);
        });
    });
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first && output[0] !== first) output.unshift(first);
  if (last && output[output.length - 1] !== last) output.push(last);
  return output.length <= maxPoints ? output : downsamplePoints(output, maxPoints);
}

function visibleSamplesWithCarry(samples, xDomain) {
  const rows = (samples || [])
    .filter((sample) => sample && Number.isFinite(sample.elapsedSeconds) && Number.isFinite(sample.dollarMove))
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  const visible = rows.filter((point) => point.elapsedSeconds >= xDomain.min && point.elapsedSeconds <= xDomain.max);
  const prior = [...rows].reverse().find((point) => point.elapsedSeconds < xDomain.min);
  return prior && visible[0] !== prior ? [prior, ...visible] : visible;
}

function newestElapsedSeconds(...sampleGroups) {
  let latest = null;
  sampleGroups.forEach((samples) => {
    (samples || []).forEach((sample) => {
      const elapsed = Number(sample?.elapsedSeconds);
      if (Number.isFinite(elapsed) && (latest === null || elapsed > latest)) latest = elapsed;
    });
  });
  return latest;
}

function limitLiveSamplesForRender(samples, latestElapsed, tailSeconds = LIVE_PAPER_RENDER_TAIL_SECONDS) {
  if (!Array.isArray(samples) || !samples.length) return [];
  if (!Number.isFinite(latestElapsed) || latestElapsed <= tailSeconds) return samples;
  const cutoff = Math.max(0, latestElapsed - tailSeconds);
  const firstVisibleIndex = samples.findIndex((sample) => Number(sample?.elapsedSeconds) >= cutoff);
  if (firstVisibleIndex <= 0) return samples;
  return [samples[firstVisibleIndex - 1], ...samples.slice(firstVisibleIndex)];
}

function rowFreshnessKey(row) {
  if (!row) return "";
  return [
    row.point_id,
    row.event_id,
    row.quote_id,
    row.event_type,
    row.backend_event_kind,
    row.receive_time_micro,
    row.event_time_micro,
    row.generated_at,
  ].filter(Boolean).join("|");
}

function latestPolymarketDepthTimeMicro(snapshot) {
  const row = snapshot?.row || {};
  return Math.max(
    metricNumber(row.up_book_snapshot_time_micro) ?? 0,
    metricNumber(row.down_book_snapshot_time_micro) ?? 0,
    metricNumber(row.polymarket_book_snapshot_time_micro) ?? 0,
  );
}

function paperSessionHistorySignature(session) {
  const history = Array.isArray(session?.pnl_history) ? session.pnl_history : [];
  const latestHistory = history[history.length - 1] || {};
  return [
    session?.session_id || session?.paper_session_id,
    session?.market_count,
    session?.market_limit,
    session?.current_capital,
    session?.total_pnl_dollars,
    session?.realized_pnl_dollars,
    session?.updated_at,
    history.length,
    latestHistory.market_key || latestHistory.slug,
    latestHistory.pnl_dollars,
    latestHistory.capital_after,
  ].filter((value) => value !== undefined && value !== null).join("|");
}

function paperAuxCacheKey(chartId, market, isLiveView, session) {
  const latestMarker = [...paperMarkersFor(market)].pop();
  return [
    chartId || "paperChart",
    isLiveView ? "live" : "paper",
    paperMarketWindowKey(market),
    paperGraphKey(market) || "current",
    state.paperAuxVersion,
    rowFreshnessKey(latestMarker),
    isLiveView ? "" : paperSessionHistorySignature(session),
  ].join(":");
}

function renderPaperAuxHtml({ chartId, selectedCurrent, market, rawPoints, latestRaw, latestBookRaw, latestQuote, session, isLiveView }) {
  const resolvedSession = session || paperSession();
  const cacheable = Boolean(selectedCurrent && market);
  const cacheKey = cacheable ? paperAuxCacheKey(chartId, market, isLiveView, resolvedSession) : "";
  const now = Date.now();
  const cached = cacheable ? state.paperAuxRenderCache.get(cacheKey) : null;
  if (cached && now - cached.renderedAt < LIVE_AUX_RENDER_THROTTLE_MS) return cached.html;
  const html = [
    renderPaperActionLog(market, rawPoints),
    renderPolymarketBookTable(market, rawPoints),
    renderOrderBookTable(market, rawPoints, latestBookRaw || latestRaw || null, latestQuote || null),
  ].join("");
  if (cacheable) state.paperAuxRenderCache.set(cacheKey, { renderedAt: now, html });
  return html;
}

function renderPaperEmptyAuxHtml({ chartId, selectedCurrent, market, isLiveView }) {
  return renderPaperAuxHtml({
    chartId,
    selectedCurrent,
    market,
    rawPoints: [],
    latestRaw: null,
    latestBookRaw: null,
    latestQuote: null,
    session: tradeViewSession(isLiveView),
    isLiveView,
  });
}

function isLockedPaperPanelId(panelId) {
  return false;
}

function renderCollapsiblePanel(panelId, className, title, meta, bodyHtml, open = true) {
  const lockedOpen = isLockedPaperPanelId(panelId);
  const isOpen = lockedOpen || (open && !state.paperCollapsedPanels.has(panelId));
  return `
    <section class="${escapeHtml(className)} paper-collapsible" data-paper-panel="${escapeHtml(panelId)}" ${lockedOpen ? 'data-paper-locked-open="true"' : ""}>
      <button class="paper-book-heading paper-collapse-button" type="button" data-paper-toggle="${escapeHtml(panelId)}" ${lockedOpen ? 'data-paper-locked-open="true" aria-disabled="true"' : ""} aria-expanded="${isOpen ? "true" : "false"}">
        <span>${escapeHtml(title)}</span>
        <span class="paper-heading-meta">
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
          ${lockedOpen ? "" : `<span class="paper-collapse-state" aria-hidden="true">
            <span class="is-open">Hide</span>
            <span class="is-closed">Show</span>
          </span>`}
        </span>
      </button>
      <div class="paper-collapsible-body" ${isOpen ? "" : "hidden"}>
        ${bodyHtml}
      </div>
    </section>`;
}

function syncPaperPanelCollapseState(section) {
  const panelId = section?.dataset?.paperPanel;
  if (!panelId) return;
  const lockedOpen = section.dataset.paperLockedOpen === "true";
  if (lockedOpen) state.paperCollapsedPanels.delete(panelId);
  const isOpen = lockedOpen || !state.paperCollapsedPanels.has(panelId);
  const button = section.querySelector("[data-paper-toggle]");
  const body = section.querySelector(".paper-collapsible-body");
  if (button) button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (body) body.hidden = !isOpen;
}

function syncPaperCollapseStates(root = document) {
  root.querySelectorAll?.(".paper-collapsible[data-paper-panel]").forEach(syncPaperPanelCollapseState);
}

function isTradeSessionAux(aux) {
  return aux?.id === "paperChartAux" || aux?.id === "liveChartAux";
}

function tradeSessionPanelHtmlForAux(aux) {
  return renderPaperSessionHistory(tradeViewSession(aux?.id === "liveChartAux"));
}

function chartForTradeSessionAux(aux) {
  if (aux?.id === "paperChartAux") return byId("paperChart");
  if (aux?.id === "liveChartAux") return byId("liveChart");
  return null;
}

function tradeSessionSlotForChart(chart) {
  if (chart?.id === "paperChart") return byId("paperSessionPnlSlot");
  if (chart?.id === "liveChart") return byId("liveSessionPnlSlot");
  return null;
}

function tradeSessionSlotForAux(aux) {
  return tradeSessionSlotForChart(chartForTradeSessionAux(aux));
}

function ensureTradeSessionAuxKeepsPanel(aux, auxHtml = "") {
  const html = String(auxHtml || "");
  if (!isTradeSessionAux(aux) || html.includes('data-paper-panel="session_pnl"')) return html;
  if (tradeSessionSlotForAux(aux)) return html;
  return `${tradeSessionPanelHtmlForAux(aux)}${html}`;
}

function patchPaperAuxContent(aux, auxHtml) {
  const template = document.createElement("div");
  const safeAuxHtml = ensureTradeSessionAuxKeepsPanel(aux, auxHtml);
  template.innerHTML = safeAuxHtml;
  const nextSections = [...template.children].filter((child) => child.matches?.(".paper-collapsible[data-paper-panel]"));
  aux.querySelectorAll(".paper-live-chart-head, .paper-odds-strip").forEach((node) => node.remove());
  if (!nextSections.length) {
    aux.innerHTML = safeAuxHtml;
    syncPaperCollapseStates(aux);
    ensureTradeSessionPanelMounted(chartForTradeSessionAux(aux), aux);
    return;
  }
  const existingByPanel = new Map(
    [...aux.querySelectorAll(".paper-collapsible[data-paper-panel]")]
      .map((section) => [section.dataset.paperPanel, section]),
  );
  const seen = new Set();
  nextSections.forEach((nextSection) => {
    const panelId = nextSection.dataset.paperPanel;
    if (!panelId) return;
    seen.add(panelId);
    const existing = existingByPanel.get(panelId);
    if (!existing) {
      aux.appendChild(nextSection);
      syncPaperPanelCollapseState(nextSection);
      return;
    }
    existing.className = nextSection.className;
    const existingButton = existing.querySelector("[data-paper-toggle]");
    const nextButton = nextSection.querySelector("[data-paper-toggle]");
    if (existingButton && nextButton) {
      const existingTitle = existingButton.children[0];
      const nextTitle = nextButton.children[0];
      if (existingTitle && nextTitle && existingTitle.textContent !== nextTitle.textContent) {
        existingTitle.textContent = nextTitle.textContent;
      }
      const existingMeta = existingButton.querySelector(".paper-heading-meta > span:first-child");
      const nextMeta = nextButton.querySelector(".paper-heading-meta > span:first-child");
      if (existingMeta && nextMeta && existingMeta.textContent !== nextMeta.textContent) {
        existingMeta.textContent = nextMeta.textContent;
      }
    }
    const existingBody = existing.querySelector(".paper-collapsible-body");
    const nextBody = nextSection.querySelector(".paper-collapsible-body");
    if (existingBody && nextBody && existingBody._paperBodyHtml !== nextBody.innerHTML) {
      existingBody.innerHTML = nextBody.innerHTML;
      existingBody._paperBodyHtml = nextBody.innerHTML;
    }
    syncPaperPanelCollapseState(existing);
  });
  [...aux.querySelectorAll(".paper-collapsible[data-paper-panel]")].forEach((section) => {
    if (!seen.has(section.dataset.paperPanel) && !isLockedPaperPanelId(section.dataset.paperPanel)) section.remove();
  });
  if (isTradeSessionAux(aux) && !aux.querySelector('[data-paper-panel="session_pnl"]')) {
    aux.insertAdjacentHTML("afterbegin", tradeSessionPanelHtmlForAux(aux));
  }
  nextSections.forEach((nextSection) => {
    const panelId = nextSection.dataset.paperPanel;
    const section = [...aux.querySelectorAll(".paper-collapsible[data-paper-panel]")]
      .find((candidate) => candidate.dataset.paperPanel === panelId);
    if (section) aux.appendChild(section);
  });
}

function ensureTradeSessionAuxHtml(chart, auxHtml = "") {
  const html = String(auxHtml || "");
  if (!chart || (chart.id !== "paperChart" && chart.id !== "liveChart")) return html;
  if (html.includes('data-paper-panel="session_pnl"')) return html;
  if (tradeSessionSlotForChart(chart)) return html;
  return `${renderPaperSessionHistory(tradeViewSession(chart.id === "liveChart"))}${html}`;
}

function ensureTradeSessionPanelMounted(chart, aux) {
  if (!chart || (chart.id !== "paperChart" && chart.id !== "liveChart")) return;
  const sessionHtml = isTradeSessionAux(aux)
    ? tradeSessionPanelHtmlForAux(aux)
    : renderPaperSessionHistory(tradeViewSession(chart.id === "liveChart"));
  const slot = tradeSessionSlotForChart(chart);
  if (!slot && !aux) return;
  const target = slot || aux;
  if (slot && aux) aux.querySelector('[data-paper-panel="session_pnl"]')?.remove();
  const existing = target.querySelector('[data-paper-panel="session_pnl"]');
  if (existing) {
    const template = document.createElement("div");
    template.innerHTML = sessionHtml;
    const next = template.firstElementChild;
    if (next && existing.outerHTML !== next.outerHTML) {
      existing.replaceWith(next);
    }
    syncPaperCollapseStates(target);
    return;
  }
  if (slot) {
    slot.innerHTML = sessionHtml;
  } else {
    aux.insertAdjacentHTML("afterbegin", sessionHtml);
  }
  syncPaperCollapseStates(target);
}

function ensureTradeSessionPanelsMounted() {
  ensureTradeSessionPanelMounted(byId("paperChart"), byId("paperChartAux"));
  ensureTradeSessionPanelMounted(byId("liveChart"), byId("liveChartAux"));
}

function tradeChartExternalAux(chart) {
  if (!chart || (chart.id !== "paperChart" && chart.id !== "liveChart")) return null;
  return byId(`${chart.id}Aux`);
}

function setPaperChartContent(chart, visualHtml, auxHtml = "") {
  if (!chart) return;
  const normalizedAuxHtml = ensureTradeSessionAuxHtml(chart, auxHtml);
  const externalAux = tradeChartExternalAux(chart);
  if (!chart._paperSplitContent) {
    chart.innerHTML = externalAux
      ? '<div class="paper-chart-visual"></div>'
      : '<div class="paper-chart-visual"></div><div class="paper-chart-aux"></div>';
    chart._paperSplitContent = true;
    chart._paperVisualHtml = "";
    chart._paperAuxHtml = "";
  }
  const visual = chart.querySelector(".paper-chart-visual");
  const aux = externalAux || chart.querySelector(".paper-chart-aux");
  if (visual && chart._paperVisualHtml !== visualHtml) {
    visual.innerHTML = visualHtml;
    chart._paperVisualHtml = visualHtml;
  }
  if (aux && chart._paperAuxHtml !== normalizedAuxHtml) {
    patchPaperAuxContent(aux, normalizedAuxHtml);
    chart._paperAuxHtml = normalizedAuxHtml;
  }
  ensureTradeSessionPanelMounted(chart, aux);
  refreshPaperCountdownLabels();
}

function canUseUPlot() {
  return typeof window !== "undefined" && typeof window.uPlot === "function";
}

function steppedPlotEvents(samples, source) {
  const rows = orderedUniqueSamples(samples);
  const events = [];
  let previous = null;
  const maxGapSeconds = sourceLineGapSeconds(source);
  rows.forEach((sample) => {
    if (!Number.isFinite(sample?.elapsedSeconds) || !Number.isFinite(sample?.dollarMove)) return;
    const elapsedSeconds = previous
      ? Math.max(sample.elapsedSeconds, previous.elapsedSeconds + LIVE_STEP_EPS_SECONDS)
      : sample.elapsedSeconds;
    const gap = previous ? elapsedSeconds - previous.elapsedSeconds : 0;
    if (previous && gap > LIVE_STEP_EPS_SECONDS * 2 && gap <= maxGapSeconds) {
      events.push({
        elapsedSeconds: elapsedSeconds - LIVE_STEP_EPS_SECONDS,
        dollarMove: previous.dollarMove,
        source,
      });
    } else if (previous && gap > maxGapSeconds) {
      events.push({
        elapsedSeconds: previous.elapsedSeconds + LIVE_STEP_EPS_SECONDS,
        dollarMove: null,
        source,
      });
      if (elapsedSeconds - previous.elapsedSeconds > LIVE_STEP_EPS_SECONDS * 3) {
        events.push({
          elapsedSeconds: elapsedSeconds - LIVE_STEP_EPS_SECONDS,
          dollarMove: null,
          source,
        });
      }
    }
    const point = {
      elapsedSeconds,
      dollarMove: sample.dollarMove,
      source,
    };
    events.push(point);
    previous = point;
  });
  return events;
}

function uPlotDataFromSamples(truthSamples, externalSamples) {
  const events = [];
  const addEvents = (samples, source) => {
    events.push(...steppedPlotEvents(samples, source));
  };
  addEvents(truthSamples, "chainlink");
  addEvents(externalSamples, "binance");
  events.sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  const x = [];
  const chainlinkValues = [];
  const binanceValues = [];
  const current = { chainlink: null, binance: null };
  let index = 0;
  while (index < events.length) {
    const elapsedSeconds = events[index].elapsedSeconds;
    while (index < events.length && Math.abs(events[index].elapsedSeconds - elapsedSeconds) < 0.000001) {
      if (events[index].source === "chainlink") current.chainlink = events[index].dollarMove;
      if (events[index].source === "binance") current.binance = events[index].dollarMove;
      index += 1;
    }
    x.push(elapsedSeconds);
    chainlinkValues.push(current.chainlink);
    binanceValues.push(current.binance);
  }
  return [x, chainlinkValues, binanceValues];
}

function liveSampleSignature(sample) {
  if (!sample) return "";
  return [
    sample.row?.point_id,
    sample.row?.event_id,
    sample.row?.receive_time_micro,
    sample.row?.event_time_micro,
    sample.elapsedSeconds,
    sample.dollarMove,
    sample.btcPrice,
  ].filter((value) => value !== undefined && value !== null).join(":");
}

function liveSeriesSignature(samples) {
  const rows = samples || [];
  return [
    rows.length,
    liveSampleSignature(rows[0]),
    liveSampleSignature(rows[Math.max(0, rows.length - 2)]),
    liveSampleSignature(rows[rows.length - 1]),
  ].join("|");
}

function liveChartDataSignature(truthSamples, externalSamples) {
  return `${liveSeriesSignature(truthSamples)}::${liveSeriesSignature(externalSamples)}`;
}

function renderPaperChartHeader(market) {
  const windowStart = marketWindowStartUnix(market);
  const windowEnd = marketWindowEndUnix(market);
  const initialCountdown = countdownTextFromWindow(windowStart, windowEnd);
  const lineKey = (label, className) => `
    <span class="paper-line-key">
      <span class="paper-line-swatch ${escapeHtml(className)}"></span>
      <span class="paper-line-label">${escapeHtml(label)}</span>
    </span>`;
  return `
    <div class="paper-live-chart-head">
      <div class="paper-line-legend-html" aria-label="Chart lines">
        ${lineKey("Chainlink", "is-chainlink")}
        ${lineKey("Binance", "is-binance")}
      </div>
      <div class="paper-market-countdown" aria-label="Time left" data-paper-countdown-start="${escapeHtml(windowStart ?? "")}" data-paper-countdown-end="${escapeHtml(windowEnd ?? "")}">
        <span>Time left</span>
        <strong data-paper-countdown-value>${escapeHtml(initialCountdown)}</strong>
      </div>
    </div>`;
}

function renderPaperLiveSideHtml(marketMetrics, accountMetrics, positionRows) {
  const metricRows = (rows) => rows.map((row) => `
    <div class="paper-live-side-row">
      <span>${escapeHtml(row.label)}</span>
      <strong class="${escapeHtml(row.tone || "")}">${escapeHtml(String(row.value))}</strong>
    </div>`).join("");
  const positionHtml = (positionRows || []).map((row) => `
    <div class="paper-live-position-row">
      <strong class="${escapeHtml(row.tone || "")}">${escapeHtml(row.label)}</strong>
      <span>${escapeHtml(row.value)}${row.detail ? ` | ${escapeHtml(row.detail)}` : ""}</span>
    </div>`).join("");
  return `
    <aside class="paper-live-side-html" aria-label="Current paper trade state">
      <section class="paper-live-side-section">
        <h3>Market</h3>
        ${metricRows(marketMetrics)}
      </section>
      <section class="paper-live-side-section">
        <h3>Account</h3>
        ${metricRows(accountMetrics)}
      </section>
      <section class="paper-live-side-section">
        <h3>Positions</h3>
        ${positionHtml || '<div class="paper-live-position-row"><strong>No position</strong><span>waiting for a fill</span></div>'}
      </section>
    </aside>`;
}

function updatePaperUPlot(chart, options) {
  try {
    if (!canUseUPlot() || !chart) return false;
    const target = chart.querySelector(".paper-live-uplot");
    if (!target) return false;
    const width = Math.max(320, Math.floor(target.clientWidth || chart.clientWidth || 680));
    const height = Math.max(260, Math.floor(target.clientHeight || (isCompactPaperChart() ? 300 : 392)));
    const key = `${chart.id || "paperChart"}:${options.compact ? "compact" : "wide"}:${LIVE_CHART_SCHEMA_VERSION}`;
    const dataSignature = liveChartDataSignature(options.truthSamples, options.externalSamples);
    const makeOptions = () => ({
      width,
      height,
      legend: { show: false },
      cursor: { show: false },
      spanGaps: false,
      pxAlign: false,
      padding: [8, 10, 0, 0],
      scales: {
        x: { time: false, min: options.xDomain.min, max: options.xDomain.max },
        y: { min: options.dollarDomain.min, max: options.dollarDomain.max },
      },
      axes: [
        {
          size: 34,
          stroke: "#687682",
          grid: { stroke: "#e5e9ed", width: 1 },
          values: (_, values) => values.map((value) => `${Math.round(value)}s`),
        },
        {
          size: 64,
          stroke: "#687682",
          grid: { stroke: "#e5e9ed", width: 1 },
          values: (_, values) => values.map((value) => formatDollarMove(value)),
        },
      ],
      series: [
        {},
        { label: "Chainlink", stroke: "#148256", width: 2, spanGaps: false, points: { show: false } },
        { label: "Binance", stroke: "#005bff", width: 2, spanGaps: false, points: { show: false } },
      ],
    });
    const existing = state.paperUPlotCharts.get(chart.id || "paperChart");
    const targetHasPlot = Boolean(target.querySelector(".uplot"));
    if (!existing || existing.key !== key || !targetHasPlot) {
      if (existing?.plot) existing.plot.destroy();
      target.innerHTML = "";
      const data = uPlotDataFromSamples(options.truthSamples, options.externalSamples);
      const plot = new window.uPlot(makeOptions(), data, target);
      state.paperUPlotCharts.set(chart.id || "paperChart", { key, plot, dataSignature, width, height });
      return true;
    }
    if (existing.width !== width || existing.height !== height) {
      existing.plot.setSize({ width, height });
      existing.width = width;
      existing.height = height;
    }
    if (existing.dataSignature !== dataSignature) {
      const data = uPlotDataFromSamples(options.truthSamples, options.externalSamples);
      existing.plot.setData(data, false);
      existing.dataSignature = dataSignature;
    }
    existing.plot.setScale("x", { min: options.xDomain.min, max: options.xDomain.max });
    existing.plot.setScale("y", { min: options.dollarDomain.min, max: options.dollarDomain.max });
    return true;
  } catch (error) {
    console.warn("uPlot live chart update failed", error);
    return false;
  }
}

function latestRenderedLinePoint(...linePointGroups) {
  return linePointGroups
    .flat()
    .filter((point) => (
      point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && point.sample
      && Number.isFinite(point.sample.elapsedSeconds)
    ))
    .sort((left, right) => {
      if (left.sample.elapsedSeconds !== right.sample.elapsedSeconds) {
        return left.sample.elapsedSeconds - right.sample.elapsedSeconds;
      }
      if (left.x !== right.x) return left.x - right.x;
      return (left.sample.row?.receive_time_micro || 0) - (right.sample.row?.receive_time_micro || 0);
    })
    .at(-1) || null;
}

function sideKey(outcome) {
  return String(outcome || "").toLowerCase() === "up" ? "up" : "down";
}

function oppositeSideKey(outcome) {
  return sideKey(outcome) === "up" ? "down" : "up";
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
  return String(row?.market_key || row?.slug || row?.condition_id || row?.question || "");
}

function isBackendLiveMarket(market) {
  const key = paperGraphKey(market);
  return key.startsWith("backend-live-") || String(market?.status || "").includes("backend_live");
}

function isBrowserLiveMarket(market) {
  const key = paperGraphKey(market);
  return key.startsWith("browser-live-") || market?.is_browser_live === true;
}

function isRealPaperMarket(market) {
  const conditionId = String(market?.condition_id || "");
  return Boolean(conditionId) && !isBackendLiveMarket(market) && !isBrowserLiveMarket(market);
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

function marketWindowStartUnix(market) {
  const explicit = metricNumber(market?.window_start_unix);
  if (explicit !== null) return Math.floor(explicit);
  const parsed = Date.parse(market?.window_start || "");
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  const text = String(market?.slug || market?.market_key || market?.condition_id || market?.question || "");
  const match = text.match(/(?:btc-updown-5m-|backend-live-btc-5m-)(\d{10})/);
  return match ? Number(match[1]) : null;
}

function marketWindowEndUnix(market) {
  const explicit = metricNumber(market?.window_end_unix);
  if (explicit !== null) return Math.floor(explicit);
  const parsed = Date.parse(market?.window_end || "");
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  const start = marketWindowStartUnix(market);
  return start === null ? null : start + 300;
}

function browserWindowKeyForMarket(market) {
  const start = marketWindowStartUnix(market);
  return start === null ? "" : `backend-live-btc-5m-${start}`;
}

function polymarketWindowKeyForMarket(market) {
  const start = marketWindowStartUnix(market);
  return start === null ? "" : `btc-updown-5m-${start}`;
}

function paperStorageKeysForMarket(market) {
  return [...new Set([
    paperGraphKey(market),
    browserWindowKeyForMarket(market),
    polymarketWindowKeyForMarket(market),
  ].filter(Boolean))];
}

function liveTickStorageKeysForMarket(market) {
  const windowKey = polymarketWindowKeyForMarket(market) || browserWindowKeyForMarket(market);
  return [...new Set([windowKey, paperGraphKey(market)].filter(Boolean))].slice(0, 1);
}

function samePaperWindow(left, right) {
  const leftStart = marketWindowStartUnix(left);
  const rightStart = marketWindowStartUnix(right);
  if (leftStart === null || rightStart === null || leftStart !== rightStart) return false;
  const leftEnd = marketWindowEndUnix(left);
  const rightEnd = marketWindowEndUnix(right);
  return leftEnd === null || rightEnd === null || leftEnd === rightEnd;
}

function browserLiveMarkets() {
  return [...state.livePersistedMarkets.values()].sort((left, right) => {
    const leftStart = metricNumber(left.window_start_unix) || 0;
    const rightStart = metricNumber(right.window_start_unix) || 0;
    return rightStart - leftStart;
  });
}

function observedPaperMarkets() {
  return [...state.paperObservedMarkets.values()];
}

function currentWindowStartUnixNow() {
  return Math.floor(Date.now() / 1000 / 300) * 300;
}

function currentBackendLiveMarketShell() {
  const start = currentWindowStartUnixNow();
  const shell = {
    market_key: `btc-updown-5m-${start}`,
    condition_id: `btc-updown-5m-${start}`,
    slug: `btc-updown-5m-${start}`,
    question: "BTC Up/Down 5m",
    symbol: "BTCUSDT",
    window_start_unix: start,
    window_end_unix: start + 300,
    status: "backend_live",
    is_current: true,
    is_open: true,
    points: [],
    markers: [],
  };
  applyOutcomeOddsFromCandidates(shell, [...sameWindowOutcomeOddsRows(shell), cachedOutcomeOddsForMarket(shell)]);
  return shell;
}

function isCurrentBtcWindowMarket(market) {
  return marketWindowStartUnix(market) === currentWindowStartUnixNow();
}

function pruneNonCurrentPaperState() {
  const currentStart = currentWindowStartUnixNow();
  const keepMarket = (market) => marketWindowStartUnix(market) === currentStart;
  [
    state.livePersistedMarkets,
    state.paperObservedMarkets,
  ].forEach((map) => {
    [...map.entries()].forEach(([key, market]) => {
      if (!keepMarket(market)) map.delete(key);
    });
  });
  [
    state.paperObservedPointsByMarket,
    state.paperObservedMarkersByMarket,
    state.liveBtcTicksByMarket,
    state.liveBtcTickKeysByMarket,
  ].forEach((map) => {
    [...map.entries()].forEach(([key, rows]) => {
      const firstRow = Array.isArray(rows) ? rows.find((row) => marketWindowStartUnix(row) !== null) : null;
      const rowStart = marketWindowStartUnix(firstRow || { market_key: key, slug: key, condition_id: key });
      if (rowStart !== currentStart) map.delete(key);
    });
  });
  [...state.paperLiveChartScales.keys()].forEach((key) => {
    if (!key.includes(String(currentStart))) state.paperLiveChartScales.delete(key);
  });
  state.paperAuxRenderCache.clear();
}

function paperMarketWindowKey(market) {
  const start = marketWindowStartUnix(market);
  return start === null ? `key:${paperGraphKey(market)}` : `window:${start}`;
}

function definedFields(source) {
  const output = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    if (["points", "markers"].includes(key)) return;
    if (value !== null && value !== undefined) output[key] = value;
  });
  return output;
}

const TRUTH_PRICE_FIELDS = [
  "btc_price",
  "latest_btc_price",
  "btc_price_source",
  "btc_price_venue",
  "price_role",
  "btc_price_is_truth",
  "truth_current_price_missing",
  "latest_chainlink_time_micro",
  "latest_chainlink_receive_time_micro",
];

const OUTCOME_ODDS_FIELDS = [
  "paper_up_probability",
  "paper_down_probability",
  "up_probability",
  "down_probability",
  "market_up_probability",
  "market_down_probability",
  "latest_up_probability",
  "latest_down_probability",
  "up_bid",
  "up_ask",
  "down_bid",
  "down_ask",
  "up_bid_size",
  "up_ask_size",
  "down_bid_size",
  "down_ask_size",
  "probability_source",
  "market_probability_source",
  "market_odds_fetched_at",
  "market_odds_stale",
  "market_odds_error",
];

const POLYMARKET_BOOK_FIELDS = [
  "books",
  "book_token_ids",
  "polymarket_book_source",
  "polymarket_book_max_age_ms",
  "polymarket_book_stale",
  "pm_book_condition_id",
  "up_token_id",
  "up_bid",
  "up_ask",
  "up_bid_size",
  "up_ask_size",
  "up_bid_depth_5",
  "up_ask_depth_5",
  "up_depth_imbalance",
  "up_book_snapshot_time_micro",
  "up_book_age_ms",
  "down_token_id",
  "down_bid",
  "down_ask",
  "down_bid_size",
  "down_ask_size",
  "down_bid_depth_5",
  "down_ask_depth_5",
  "down_depth_imbalance",
  "down_book_snapshot_time_micro",
  "down_book_age_ms",
  "pm_up_bids",
  "pm_up_asks",
  "pm_down_bids",
  "pm_down_asks",
];

const PERSISTED_ROW_FIELDS = new Set([
  "market_key",
  "condition_id",
  "slug",
  "question",
  "symbol",
  "window_start",
  "window_end",
  "window_start_unix",
  "window_end_unix",
  "generated_at",
  "time_unix",
  "event_time_micro",
  "receive_time_micro",
  "trade_time_micro",
  "latest_event_time_micro",
  "latest_chainlink_time_micro",
  "latest_chainlink_receive_time_micro",
  "start_event_time_micro",
  "start_price",
  "start_price_source",
  "start_price_status",
  "btc_price",
  "latest_btc_price",
  "btc_price_source",
  "btc_price_venue",
  "btc_price_is_truth",
  "truth_current_price_missing",
  "truth_source",
  "price_role",
  "external_btc_price",
  "external_btc_source",
  "external_btc_venue",
  "backend_event_kind",
  "decision",
  "reason",
  "side",
  "distance_bps",
  "point_id",
  "event_id",
  "event_type",
  "quote_id",
  "signal_id",
  "maker_route_id",
  "edge_id",
  "outcome",
  "intended_outcome",
  "price",
  "entry_price",
  "quote_price",
  "maker_quote_price",
  "bid_price",
  "shares",
  "quantity",
  "size",
  "order_notional",
  "filled_cost",
  "cumulative_filled_cost",
  "pnl_dollars",
  "outcome_win",
  "paper_session_current_capital",
  "paper_session_total_pnl",
  "paper_session_total_pnl_dollars",
  "paper_session_available_capital",
  "paper_session_committed_capital",
  "book_update_id",
  "book_bid",
  "book_ask",
  "book_bid_qty",
  "book_ask_qty",
  "book_mid",
  "book_microprice",
  "book_spread_bps",
  "book_depth_source_point_id",
  "external_book_support",
  "external_book_imbalance",
  "external_book_spread_bps",
  "external_book_microprice_edge_bps",
  "external_book_microprice_support_bps",
  "external_trade_flow_support",
  "last_no_fill_reason",
  "last_matching_sell_notional",
  "last_queue_remaining_notional",
  "last_min_fill_notional",
  "bankroll_max_order",
  "bankroll_fractional_kelly_fraction",
  "fair_edge",
  "fair_edge_vs_signal_bid",
  "fair_probability",
  "probability_source",
  "market_probability_source",
  "market_odds_fetched_at",
  "market_odds_stale",
  "market_odds_error",
  ...OUTCOME_ODDS_FIELDS,
  ...POLYMARKET_BOOK_FIELDS,
]);

function copyOutcomeOddsFields(target, source) {
  if (!rowHasDisplayPolymarketBook(source)) return target;
  OUTCOME_ODDS_FIELDS.forEach((field) => {
    if (source && Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      target[field] = source[field];
    }
  });
  return target;
}

function copyLocalOutcomeBookFields(target, source) {
  if (!rowHasDisplayPolymarketBook(source)) return target;
  [...OUTCOME_ODDS_FIELDS, ...POLYMARKET_BOOK_FIELDS].forEach((field) => {
    if (source && Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      target[field] = source[field];
    }
  });
  return target;
}

function truthPriceValue(market) {
  return metricNumber(market?.btc_price ?? market?.latest_btc_price);
}

function marketHasCurrentTruthPrice(market) {
  return marketUsesPolymarketTruthPrice(market) && truthPriceValue(market) !== null;
}

function truthPriceEventMicro(market) {
  return normalizedTruthRowEventTimeMicro(market) ?? pointTimestampMicro(market);
}

function truthPriceReceiveMicro(market) {
  return normalizedTruthRowReceiveTimeMicro(market) ?? truthPriceEventMicro(market);
}

function shouldKeepExistingTruthPrice(existing, incoming) {
  if (!marketHasCurrentTruthPrice(existing)) return false;
  if (!marketHasCurrentTruthPrice(incoming)) return true;
  const existingEvent = truthPriceEventMicro(existing);
  const incomingEvent = truthPriceEventMicro(incoming);
  if (existingEvent !== null && incomingEvent === null) return true;
  if (existingEvent !== null && incomingEvent !== null && incomingEvent < existingEvent) return true;
  if (existingEvent !== null && incomingEvent !== null && incomingEvent > existingEvent) return false;
  const existingReceive = truthPriceReceiveMicro(existing);
  const incomingReceive = truthPriceReceiveMicro(incoming);
  return existingReceive !== null && incomingReceive !== null && incomingReceive < existingReceive;
}

function preserveExistingTruthPrice(target, existing) {
  TRUTH_PRICE_FIELDS.forEach((field) => {
    if (existing?.[field] !== undefined && existing?.[field] !== null) target[field] = existing[field];
  });
  const price = truthPriceValue(existing);
  if (price !== null) {
    target.btc_price = price;
    target.latest_btc_price = price;
    target.btc_price_is_truth = true;
    target.truth_current_price_missing = false;
  }
  return target;
}

function paperMarketQualityScore(market) {
  const startMeta = startMetadataFromSource(market);
  const hasCurrentPrice = metricNumber(market?.btc_price ?? market?.latest_btc_price) !== null;
  const updatedAt = paperMarketLastUpdatedAt(market)?.getTime() || Date.parse(market?.window_start || "") || 0;
  return (
    (startMeta ? 2000 : 0) +
    (marketUsesPolymarketTruthPrice(market) ? 1000 : 0) +
    (hasCurrentPrice ? 250 : 0) +
    (isBackendLiveMarket(market) ? 100 : 0) +
    (isRealPaperMarket(market) ? 25 : 0) +
    updatedAt / 1_000_000_000_000
  );
}

function bestByPaperQuality(markets, predicate) {
  return (markets || [])
    .filter((market) => !predicate || predicate(market))
    .sort((left, right) => paperMarketQualityScore(right) - paperMarketQualityScore(left))[0] || null;
}

function bestByTruthPriceTime(markets) {
  return (markets || [])
    .filter((market) => (
      marketUsesPolymarketTruthPrice(market) &&
      metricNumber(market?.btc_price ?? market?.latest_btc_price) !== null
    ))
    .sort((left, right) => {
      const leftEvent = truthPriceEventMicro(left) ?? 0;
      const rightEvent = truthPriceEventMicro(right) ?? 0;
      if (rightEvent !== leftEvent) return rightEvent - leftEvent;
      const leftReceive = truthPriceReceiveMicro(left) ?? 0;
      const rightReceive = truthPriceReceiveMicro(right) ?? 0;
      if (rightReceive !== leftReceive) return rightReceive - leftReceive;
      return paperMarketQualityScore(right) - paperMarketQualityScore(left);
    })[0] || null;
}

function mergePaperMarket(left, right) {
  if (!left) {
    const start = marketWindowStartUnix(right);
    const end = marketWindowEndUnix(right);
    const merged = {
      ...definedFields(right),
      ...(start === null ? {} : { window_start_unix: start, window_end_unix: end ?? start + 300 }),
      points: [],
      markers: right?.markers || [],
    };
    applyOutcomeOddsFromCandidates(merged, [right]);
    return merged;
  }
  const candidates = [left, right].filter(Boolean);
  const primary = bestByPaperQuality(candidates) || right || left;
  const secondary = primary === left ? right : left;
  const merged = {
    ...definedFields(secondary),
    ...definedFields(primary),
    points: [],
    markers: primary?.markers || secondary?.markers || [],
  };
  const startWinner = bestByPaperQuality(candidates, startMetadataFromSource);
  const startMeta = startMetadataFromSource(startWinner);
  if (startMeta) {
    merged.start_price = startMeta.price;
    merged.start_price_source = startMeta.source;
    merged.start_event_time_micro = startMeta.eventTimeMicro;
    merged.start_price_status = "verified";
  }
  const priceWinner = bestByTruthPriceTime(candidates);
  if (priceWinner) {
    const price = metricNumber(priceWinner.btc_price ?? priceWinner.latest_btc_price);
    merged.btc_price = price;
    merged.latest_btc_price = price;
    merged.btc_price_source = priceWinner.btc_price_source || priceWinner.price_source || merged.btc_price_source;
    merged.btc_price_venue = priceWinner.btc_price_venue || merged.btc_price_venue;
    merged.price_role = "polymarket_truth";
    merged.btc_price_is_truth = true;
    merged.truth_current_price_missing = false;
  }
  applyOutcomeOddsFromCandidates(merged, candidates);
  const start = marketWindowStartUnix(merged) ?? marketWindowStartUnix(primary) ?? marketWindowStartUnix(secondary);
  if (start !== null) {
    merged.window_start_unix = start;
    merged.window_end_unix = marketWindowEndUnix(merged) ?? start + 300;
    merged.slug = merged.slug || polymarketWindowKeyForMarket(merged) || `btc-updown-5m-${start}`;
  }
  return merged;
}

function allPaperMarkets() {
  pruneNonCurrentPaperState();
  const grouped = new Map();
  [currentBackendLiveMarketShell(), ...paperGraphMarkets(), ...browserLiveMarkets(), ...observedPaperMarkets()]
    .filter((market) => market && !isBrowserLiveMarket(market))
    .filter(isCurrentBtcWindowMarket)
    .forEach((market) => {
      const key = paperMarketWindowKey(market);
      if (!key || key === "key:") return;
      grouped.set(key, mergePaperMarket(grouped.get(key), market));
    });
  return [...grouped.values()].sort((left, right) => {
    const leftStart = marketWindowStartUnix(left) || 0;
    const rightStart = marketWindowStartUnix(right) || 0;
    if (leftStart !== rightStart) return rightStart - leftStart;
    return paperMarketQualityScore(right) - paperMarketQualityScore(left);
  });
}

function latestPaperPointFor(market) {
  const points = paperPointsFor(market);
  return points[points.length - 1] || null;
}

function paperMarketLastUpdatedAt(market) {
  const latestPoint = latestPaperPointFor(market);
  const latestPointMicro = pointTimestampMicro(latestPoint);
  if (latestPointMicro !== null) return new Date(Math.floor(latestPointMicro / 1000));
  const marketMicro = pointTimestampMicro(market);
  if (marketMicro !== null) return new Date(Math.floor(marketMicro / 1000));
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

function countdownTextFromWindow(start, end) {
  const windowStart = metricNumber(start);
  const windowEnd = metricNumber(end);
  if (windowStart === null || windowEnd === null) return "--";
  const now = Date.now() / 1000;
  if (now < windowStart) return "Waiting";
  if (now >= windowEnd) return "0:00";
  return formatCountdownSeconds(windowEnd - now);
}

function formatCountdownSeconds(value) {
  const seconds = metricNumber(value);
  if (seconds === null) return "--";
  const clamped = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(clamped / 60);
  const remaining = String(clamped % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function paperCountdownText(market) {
  return countdownTextFromWindow(marketWindowStartUnix(market), marketWindowEndUnix(market));
}

function refreshPaperCountdownLabels() {
  document.querySelectorAll("[data-paper-countdown-end]").forEach((node) => {
    const textNode = node.querySelector("[data-paper-countdown-value]");
    if (!textNode) return;
    const nextText = countdownTextFromWindow(
      node.getAttribute("data-paper-countdown-start"),
      node.getAttribute("data-paper-countdown-end"),
    );
    if (textNode.textContent !== nextText) textNode.textContent = nextText;
  });
}

function preserveExistingOutcomeOdds(target, existing, incoming) {
  const cached = cachedOutcomeOddsForMarket(target)
    || cachedOutcomeOddsForMarket(incoming)
    || cachedOutcomeOddsForMarket(existing);
  removeOutcomeAndBookFields(target);
  copyOutcomeOddsFields(target, cached);
  copyOutcomeOddsFields(target, existing);
  copyOutcomeOddsFields(target, incoming);
  applyOutcomeOddsFromCandidates(target, [incoming, existing, cached]);
}

function rememberLiveMarket(market, options = {}) {
  const key = paperGraphKey(market);
  if (!key) return market;
  const hadKey = state.livePersistedMarkets.has(key);
  const existing = state.livePersistedMarkets.get(key) || {};
  const windowKey = browserWindowKeyForMarket(market);
  const stored = {
    ...existing,
    ...market,
    market_key: key,
    points: [],
    markers: market.markers || existing.markers || [],
  };
  if (options.preserveOutcomeOdds === false) {
    copyOutcomeOddsFields(stored, existing);
  } else {
    preserveExistingOutcomeOdds(stored, existing, market);
  }
  if (shouldKeepExistingTruthPrice(existing, market)) preserveExistingTruthPrice(stored, existing);
  delete stored[["is", "synthetic", "live"].join("_")];
  state.livePersistedMarkets.set(key, stored);
  if (windowKey && windowKey !== key) {
    if (!state.livePersistedMarkets.has(windowKey)) state.paperSelectSignature = "";
    state.livePersistedMarkets.set(windowKey, {
      ...(state.livePersistedMarkets.get(windowKey) || {}),
      ...stored,
      market_key: windowKey,
      condition_id: windowKey,
      slug: stored.slug || windowKey,
      points: [],
      markers: stored.markers || [],
    });
  }
  if (!hadKey) state.paperSelectSignature = "";
  schedulePaperTickPersist();
  return stored;
}

function rememberObservedPaperMarket(market, points = [], markers = [], options = {}) {
  const keys = paperStorageKeysForMarket(market);
  if (!keys.length) return;
  keys.forEach((key) => {
    const existingMarket = state.paperObservedMarkets.get(key) || {};
    const storedMarket = {
      ...existingMarket,
      ...market,
      market_key: key,
      points: [],
      markers: [],
    };
    if (options.preserveOutcomeOdds === false) {
      copyOutcomeOddsFields(storedMarket, existingMarket);
    } else {
      preserveExistingOutcomeOdds(storedMarket, existingMarket, market);
      applyOutcomeOddsFromCandidates(storedMarket, [market, existingMarket, ...points, ...markers]);
    }
    if (shouldKeepExistingTruthPrice(existingMarket, market)) preserveExistingTruthPrice(storedMarket, existingMarket);
    state.paperObservedMarkets.set(key, storedMarket);
    if (Array.isArray(points) && points.length) {
      const existingPoints = state.paperObservedPointsByMarket.get(key) || [];
      state.paperObservedPointsByMarket.set(
        key,
        mergePaperChartRows(existingPoints, points).slice(-LIVE_TICK_STORE_MAX_POINTS_PER_MARKET),
      );
    }
    if (Array.isArray(markers) && markers.length) {
      const existingMarkers = state.paperObservedMarkersByMarket.get(key) || [];
      state.paperObservedMarkersByMarket.set(
        key,
        mergePaperChartRows(existingMarkers, markers).slice(-2000),
      );
      bumpPaperAuxVersion(true);
    }
  });
  state.paperSelectSignature = "";
  schedulePaperTickPersist();
}

function rememberWorkflowPaperRows(paperTrade) {
  const graphs = Array.isArray(paperTrade?.graphs)
    ? paperTrade.graphs
    : (paperTrade?.graphs?.markets || paperTrade?._graphMarkets || []);
  graphs
    .filter((market) => market && isCurrentBtcWindowMarket(market))
    .forEach((market) => rememberObservedPaperMarket(
      market,
      Array.isArray(market.points) ? market.points : [],
      Array.isArray(market.markers) ? market.markers : [],
    ));
}

function compactPersistedRow(row, keepBook = false) {
  const output = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    if (value === undefined || typeof value === "function") return;
    if (key === "raw") return;
    if (!keepBook && (key === "book_bids" || key === "book_asks")) return;
    if (!PERSISTED_ROW_FIELDS.has(key) && key !== "book_bids" && key !== "book_asks") return;
    output[key] = value;
  });
  return output;
}

function currentWindowRow(row, fallbackKey = "") {
  const start = marketWindowStartUnix({
    market_key: fallbackKey,
    slug: fallbackKey,
    condition_id: fallbackKey,
    ...(row || {}),
  });
  return start !== null && start === currentWindowStartUnixNow();
}

function balancedLiveTickRows(rows, maxRows) {
  const currentRows = (rows || []).filter((row) => currentWindowRow(row));
  if (currentRows.length <= maxRows) return currentRows;
  const first = currentRows[0];
  const chainlinkRows = currentRows.filter(isChainlinkPriceRow);
  const binanceRows = currentRows.filter(isBinanceLivePoint);
  const otherRows = currentRows.filter((row) => !isChainlinkPriceRow(row) && !isBinanceLivePoint(row));
  if (!chainlinkRows.length || !binanceRows.length) {
    return [first, ...currentRows.slice(-(maxRows - 1))];
  }
  const binanceLimit = Math.max(1, Math.floor(maxRows * 0.55));
  const chainlinkLimit = Math.max(1, Math.floor(maxRows * 0.35));
  const otherLimit = Math.max(0, maxRows - binanceLimit - chainlinkLimit - 1);
  const seen = new Set();
  const selected = [];
  [first, ...chainlinkRows.slice(-chainlinkLimit), ...binanceRows.slice(-binanceLimit), ...otherRows.slice(-otherLimit)]
    .filter(Boolean)
    .sort((left, right) => paperRowTimeMicro(left) - paperRowTimeMicro(right))
    .forEach((row) => {
      const key = liveBtcPointKey(row);
      if (seen.has(key)) return;
      seen.add(key);
      selected.push(row);
    });
  while (selected.length > maxRows) selected.splice(1, 1);
  return selected;
}

function rowBelongsToMarketWindow(row, market) {
  const marketStart = marketWindowStartUnix(market);
  const rowStart = marketWindowStartUnix(row);
  return marketStart !== null && rowStart !== null && marketStart === rowStart;
}

function liveTickPointsForCurrentWindow(market, predicate = null) {
  const start = marketWindowStartUnix(market);
  if (start === null) return [];
  const windowMarket = { window_start_unix: start, window_end_unix: start + 300 };
  const rows = [];
  state.liveBtcTicksByMarket.forEach((points) => {
    (points || []).forEach((row) => {
      if (!rowBelongsToMarketWindow(row, windowMarket)) return;
      if (predicate && !predicate(row)) return;
      rows.push(row);
    });
  });
  return mergePaperChartRows(rows, []);
}

function compactPersistedRows(rows, maxRows) {
  const keepRows = balancedLiveTickRows(rows, maxRows);
  let keepBookIndex = -1;
  keepRows.forEach((row, index) => {
    if (externalDepthSnapshotFromRow(row)) keepBookIndex = index;
  });
  return keepRows.map((row, index) => compactPersistedRow(row, index === keepBookIndex));
}

function currentMarketEntries(map) {
  return [...map.entries()]
    .filter(([key, market]) => currentWindowRow(market, key))
    .map(([key, market]) => [key, compactPersistedRow(market)]);
}

function currentRowsEntries(map, maxRows) {
  return [...map.entries()]
    .map(([key, rows]) => [key, compactPersistedRows(rows, maxRows)])
    .filter(([, rows]) => rows.length);
}

function currentOutcomeOddsEntries() {
  return [...state.latestOutcomeOddsByWindow.entries()]
    .filter(([key, odds]) => Number(key) === currentWindowStartUnixNow() && currentWindowRow(odds, key) && rowHasDisplayPolymarketBook(odds))
    .map(([key, odds]) => [key, compactPersistedRow(odds)]);
}

function loadPersistedPaperTicks() {
  try {
    LEGACY_LIVE_TICK_STORE_KEYS.forEach((key) => window.localStorage?.removeItem(key));
    const raw = window.localStorage?.getItem(LIVE_TICK_STORE_KEY);
    if (!raw) {
      state.paperStorageStatus = { state: "empty", lastError: null, restoredMarkets: 0, savedAt: null };
      return;
    }
    const payload = JSON.parse(raw);
    if (Number(payload?.window_start_unix) !== currentWindowStartUnixNow()) {
      state.paperStorageStatus = { state: "stale", lastError: null, restoredMarkets: 0, savedAt: payload?.saved_at || null };
      return;
    }
    state.livePersistedMarkets = new Map(payload.live_markets || []);
    state.paperObservedMarkets = new Map(payload.observed_markets || []);
    state.paperObservedPointsByMarket = new Map(payload.observed_points || []);
    state.paperObservedMarkersByMarket = new Map(payload.observed_markers || []);
    state.latestOutcomeOddsByWindow = new Map(
      (payload.outcome_odds || []).filter((entry) => Array.isArray(entry) && rowHasDisplayPolymarketBook(entry[1])),
    );
    state.liveBtcTicksByMarket = new Map(payload.live_ticks || []);
    state.liveBtcTickKeysByMarket = new Map(
      [...state.liveBtcTicksByMarket.entries()].map(([key, rows]) => [key, new Set((rows || []).map(liveBtcPointKey))]),
    );
    const restoredMarkets = new Set([
      ...state.livePersistedMarkets.keys(),
      ...state.paperObservedMarkets.keys(),
      ...state.liveBtcTicksByMarket.keys(),
    ]).size;
    state.paperStorageStatus = { state: "restored", lastError: null, restoredMarkets, savedAt: payload.saved_at || null };
  } catch (error) {
    console.warn("paper tick restore failed", error);
    state.paperStorageStatus = { state: "error", lastError: error.message, restoredMarkets: 0, savedAt: null };
  }
}

function persistPaperTicksNow() {
  const payload = {
    version: 10,
    saved_at: new Date().toISOString(),
    window_start_unix: currentWindowStartUnixNow(),
    live_markets: currentMarketEntries(state.livePersistedMarkets),
    observed_markets: currentMarketEntries(state.paperObservedMarkets),
    observed_points: currentRowsEntries(state.paperObservedPointsByMarket, 600),
    observed_markers: currentRowsEntries(state.paperObservedMarkersByMarket, 400),
    outcome_odds: currentOutcomeOddsEntries(),
    live_ticks: currentRowsEntries(
      state.liveBtcTicksByMarket,
      LIVE_TICK_PERSIST_POINTS_PER_MARKET,
    ),
  };
  try {
    window.localStorage?.setItem(LIVE_TICK_STORE_KEY, JSON.stringify(payload));
    state.paperStorageStatus = {
      state: "saved",
      lastError: null,
      restoredMarkets: state.paperStorageStatus.restoredMarkets || 0,
      savedAt: payload.saved_at,
    };
  } catch (error) {
    try {
      payload.live_ticks = currentRowsEntries(state.liveBtcTicksByMarket, 1200);
      payload.observed_points = currentRowsEntries(state.paperObservedPointsByMarket, 1200);
      window.localStorage?.setItem(LIVE_TICK_STORE_KEY, JSON.stringify(payload));
      state.paperStorageStatus = {
        state: "saved_compact",
        lastError: null,
        restoredMarkets: state.paperStorageStatus.restoredMarkets || 0,
        savedAt: payload.saved_at,
      };
    } catch (secondError) {
      console.warn("paper tick persist failed", secondError);
      state.paperStorageStatus = {
        state: "error",
        lastError: secondError.message,
        restoredMarkets: state.paperStorageStatus.restoredMarkets || 0,
        savedAt: null,
      };
    }
  }
}

function schedulePaperTickPersist() {
  if (liveTickPersistTimer) return;
  liveTickPersistTimer = window.setTimeout(() => {
    liveTickPersistTimer = null;
    persistPaperTicksNow();
  }, LIVE_TICK_PERSIST_MS);
}

function flushPaperTickPersist() {
  if (liveTickPersistTimer) {
    window.clearTimeout(liveTickPersistTimer);
    liveTickPersistTimer = null;
  }
  persistPaperTicksNow();
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
  const markets = allPaperMarkets().filter(isCurrentPaperMarket);
  if (!markets.length) return null;
  return markets.sort((left, right) => paperMarketQualityScore(right) - paperMarketQualityScore(left))[0];
}

function currentDisplayPaperMarket() {
  return currentPaperMarket();
}

function isBinanceLivePoint(point) {
  const venue = String(point?.btc_price_venue || "");
  return (
    ["live_tick", "live_book_tick"].includes(point?.decision) &&
    venue.startsWith("local_backend_binance_ws")
  );
}

function isBackendLivePoint(point) {
  const venue = String(point?.btc_price_venue || "");
  return venue.startsWith("local_backend_binance_ws");
}

function isPaperEventPoint(point) {
  const eventType = String(point?.event_type || "");
  const pointId = String(point?.point_id || "");
  return point?.backend_event_kind === "paper"
    || pointId.startsWith("backend:paper:")
    || eventType.startsWith("paper_")
    || eventType.startsWith("maker_paper_")
    || point?.decision === "paper_signal";
}

function shouldPersistLivePoint(point) {
  return isBinanceLivePoint(point) || isChainlinkPriceRow(point);
}

function liveTickPointsForMarket(market) {
  if (!market) return [];
  const keys = new Set(liveTickStorageKeysForMarket(market));
  if (!keys.size) return [];
  [...paperGraphMarkets(), ...state.livePersistedMarkets.values()].forEach((candidate) => {
    const candidateKey = paperGraphKey(candidate);
    if (!samePaperWindow(market, candidate)) return;
    liveTickStorageKeysForMarket(candidate).forEach((key) => keys.add(key));
  });
  const seen = new Set();
  const rows = [];
  keys.forEach((tickKey) => {
    (state.liveBtcTicksByMarket.get(tickKey) || []).forEach((point) => {
      if (!isBinanceLivePoint(point) && !isChainlinkPriceRow(point)) return;
      const pointKey = point.point_id || `${point.decision}:${pointTimestampMicro(point)}:${point.btc_price}`;
      if (seen.has(pointKey)) return;
      seen.add(pointKey);
      rows.push(point);
    });
  });
  return sortRowsIfNeeded(rows, pointTimestampMicro);
}

function latestLiveTickForMarket(market) {
  const points = liveTickPointsForMarket(market);
  return points[points.length - 1] || null;
}

function sortRowsIfNeeded(rows, timestampFn) {
  const output = rows || [];
  let previous = -Infinity;
  for (const row of output) {
    const current = timestampFn(row) ?? 0;
    if (current < previous) {
      return [...output].sort((left, right) => (timestampFn(left) ?? 0) - (timestampFn(right) ?? 0));
    }
    previous = current;
  }
  return output;
}

function liveRenderRowElapsedSeconds(row, source) {
  const start = metricNumber(row?.window_start_unix);
  const timestampMicro = pointPlotTimestampMicro(row, source);
  if (start === null || timestampMicro === null) return null;
  const elapsed = timestampMicro / 1_000_000 - start;
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(300, elapsed)) : null;
}

function limitLiveRowsToRenderWindow(rows, source, market) {
  const ordered = sortRowsIfNeeded(
    (rows || []).filter((row) => metricNumber(row?.btc_price) !== null),
    (row) => pointPlotTimestampMicro(row, source),
  );
  if (!ordered.length || !isCurrentPaperMarket(market)) return ordered;
  const latestElapsed = liveRenderRowElapsedSeconds(ordered[ordered.length - 1], source);
  if (!Number.isFinite(latestElapsed)) return downsamplePoints(ordered, LIVE_RENDER_MAX_SOURCE_ROWS_PER_LINE);
  const cutoff = Math.max(0, latestElapsed - LIVE_PAPER_RENDER_TAIL_SECONDS);
  const visible = [];
  let carry = null;
  ordered.forEach((row) => {
    const elapsed = liveRenderRowElapsedSeconds(row, source);
    if (!Number.isFinite(elapsed)) return;
    if (elapsed < cutoff) {
      carry = row;
      return;
    }
    visible.push(row);
  });
  const limited = carry ? [carry, ...visible] : visible;
  return downsamplePoints(limited, LIVE_RENDER_MAX_SOURCE_ROWS_PER_LINE);
}

function liveChartTickPointsForMarket(market) {
  const points = liveTickPointsForMarket(market);
  const chainlinkRows = limitLiveRowsToRenderWindow(points.filter(isChainlinkPriceRow), "chainlink", market);
  const externalRows = limitLiveRowsToRenderWindow(externalLineRows(points.filter(isExternalGraphPricePoint)), "binance", market);
  if (externalRows.length) return mergePaperChartRows(chainlinkRows, externalRows);
  return chainlinkRows;
}

function liveTradePointsForMarket(market) {
  return liveTickPointsForMarket(market).filter((point) => (
    point.decision === "live_tick" &&
    point.backend_event_kind !== "book" &&
    point.backend_event_kind !== "depth"
  ));
}

function marketUsesPolymarketTruthPrice(market) {
  return hasStrictPolymarketTruthPrice(market);
}

function rowPriceSourceText(row) {
  return [
    row?.btc_price_source,
    row?.btc_price_venue,
    row?.external_btc_source,
    row?.external_btc_venue,
    row?.price_source,
    row?.price_role,
    row?.decision,
    row?.backend_event_kind,
  ].filter(Boolean).join(" ").toLowerCase();
}

function rowUsesExternalBinancePrice(row) {
  if (hasChainlinkDataStreamsPrice(row)) return false;
  const text = rowPriceSourceText(row);
  return text.includes("local_backend_binance_ws")
    || text.includes("binance")
    || text.includes("external_live_estimate")
    || ["live_tick", "live_book_tick"].includes(row?.decision)
    || ["trade", "depth", "book"].includes(row?.backend_event_kind);
}

function hasStrictPolymarketTruthPrice(row) {
  if (isPaperEventPoint(row)) return false;
  if (!hasChainlinkDataStreamsPrice(row)) return false;
  if (rowUsesExternalBinancePrice(row)) return false;
  return row?.btc_price_is_truth === true && row?.truth_current_price_missing === false;
}

function isPolymarketTruthPoint(row) {
  return hasStrictPolymarketTruthPrice(row);
}

function isChainlinkDataStreamsSource(source) {
  return String(source || "").toLowerCase().includes("chainlink_data_streams");
}

function hasChainlinkDataStreamsPrice(row) {
  const source = rowPriceSourceText(row);
  return isChainlinkDataStreamsSource(source)
    || row?.backend_event_kind === "chainlink"
    || row?.decision === "chainlink_tick";
}

function chainlinkVenueFromSource(source) {
  if (isChainlinkDataStreamsSource(source)) return "chainlink_data_streams";
  return "unknown_chainlink_source";
}

function isChainlinkPriceRow(row) {
  if (isPaperEventPoint(row)) return false;
  return hasChainlinkDataStreamsPrice(row) && !rowUsesExternalBinancePrice(row);
}

function chainlinkLineLabel(rows) {
  return "Chainlink";
}

function truthRowReceiveTimeMicro(row) {
  return metricNumber(row?.latest_chainlink_receive_time_micro ?? row?.receive_time_micro ?? row?.event_time_micro ?? row?.time_unix);
}

function truthRowEventTimeMicro(row) {
  const explicit = metricNumber(row?.latest_chainlink_time_micro ?? row?.event_time_micro);
  if (explicit !== null) return explicit;
  const seconds = metricNumber(row?.time_unix);
  return seconds === null ? null : seconds * 1_000_000;
}

function normalizedTruthMicro(value) {
  if (value === null) return null;
  return value < 10_000_000_000 ? value * 1_000_000 : value;
}

function normalizedTruthRowReceiveTimeMicro(row) {
  return normalizedTruthMicro(truthRowReceiveTimeMicro(row));
}

function normalizedTruthRowEventTimeMicro(row) {
  return normalizedTruthMicro(truthRowEventTimeMicro(row));
}

function truthRowFreshnessMs(row) {
  const eventMicro = normalizedTruthRowEventTimeMicro(row);
  const receiveMicro = normalizedTruthRowReceiveTimeMicro(row);
  const eventAge = eventMicro === null ? null : Math.max(0, Date.now() - eventMicro / 1000);
  const receiveAge = receiveMicro === null ? null : Math.max(0, Date.now() - receiveMicro / 1000);
  return eventAge ?? receiveAge;
}

function isFreshTruthRow(row) {
  const receiveMicro = normalizedTruthRowReceiveTimeMicro(row);
  const receiveAge = receiveMicro === null ? null : Math.max(0, Date.now() - receiveMicro / 1000);
  if (receiveAge !== null) return receiveAge <= POLYMARKET_TRUTH_CURRENT_STALE_MS;
  const eventMicro = normalizedTruthRowEventTimeMicro(row);
  const eventAge = eventMicro === null ? null : Math.max(0, Date.now() - eventMicro / 1000);
  return eventAge === null || eventAge <= POLYMARKET_TRUTH_EVENT_STALE_MS;
}

function truthSampleWindowStart(sample) {
  return sample?.row ? marketWindowStartUnix(sample.row) : null;
}

function truthSampleMatchesMarket(sample, market) {
  const marketStart = marketWindowStartUnix(market);
  const sampleStart = truthSampleWindowStart(sample);
  return marketStart === null || sampleStart === null || marketStart === sampleStart;
}

function truthDisplayCandidateFromRow(market, row) {
  if (!row) return null;
  if (!hasStrictPolymarketTruthPrice(row)) return null;
  const startMeta = preferredPaperStartMetadata(market) || startMetadataFromSource(row);
  if (!startMeta) return null;
  return {
    row,
    btcPrice: metricNumber(row.btc_price ?? row.latest_btc_price),
    elapsedSeconds: paperPointElapsedSeconds(row),
    secondsLeft: paperPointSecondsLeft(row),
    dollarMove: paperDollarMoveFromStart(row, startMeta.price),
    source: "chainlink",
  };
}

function liveTruthSnapshotCandidates(market) {
  const marketStart = marketWindowStartUnix(market);
  if (marketStart === null) return [];
  const snapshots = [
    market,
    ...state.livePersistedMarkets.values(),
    ...state.paperObservedMarkets.values(),
  ];
  const seen = new Set();
  return snapshots
    .filter((row) => row && marketWindowStartUnix(row) === marketStart)
    .map((row) => truthDisplayCandidateFromRow(market, row))
    .filter((sample) => {
      if (!sample || sample.btcPrice === null) return false;
      const eventTime = normalizedTruthRowEventTimeMicro(sample.row) ?? "";
      const receiveTime = normalizedTruthRowReceiveTimeMicro(sample.row) ?? "";
      const key = `${eventTime}:${receiveTime}:${sample.btcPrice}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sortTruthDisplayCandidates(candidates) {
  return candidates.sort((left, right) => {
    const leftEventTime = normalizedTruthRowEventTimeMicro(left.row) ?? 0;
    const rightEventTime = normalizedTruthRowEventTimeMicro(right.row) ?? 0;
    if (rightEventTime !== leftEventTime) return rightEventTime - leftEventTime;
    const leftReceiveTime = normalizedTruthRowReceiveTimeMicro(left.row) ?? 0;
    const rightReceiveTime = normalizedTruthRowReceiveTimeMicro(right.row) ?? 0;
    if (rightReceiveTime !== leftReceiveTime) return rightReceiveTime - leftReceiveTime;
    return (right.btcPrice ?? 0) - (left.btcPrice ?? 0);
  });
}

function freshestTruthDisplaySample(market, truthSamples, marketTruthPoint) {
  const candidates = latestTruthDisplayCandidates(market, truthSamples, marketTruthPoint)
    .filter((sample) => isFreshTruthRow(sample.row));
  if (candidates.length) return sortTruthDisplayCandidates(candidates)[0];
  return latestTruthDisplaySample(market, truthSamples, marketTruthPoint);
}

function latestAuthoritativeTruthSample(market, truthSamples, marketTruthPoint) {
  const tickCandidates = liveTickPointsForMarket(market)
    .filter(isPolymarketTruthPoint)
    .map((row) => truthDisplayCandidateFromRow(market, row));
  const candidates = [
    ...liveTruthSnapshotCandidates(market),
    ...tickCandidates,
    truthDisplayCandidateFromRow(market, marketTruthPoint),
    ...(Array.isArray(truthSamples) ? truthSamples : [truthSamples]),
  ].filter((sample) => (
    sample
    && sample.btcPrice !== null
    && truthSampleMatchesMarket(sample, market)
    && isFreshTruthRow(sample.row)
  ));
  if (candidates.length) return sortTruthDisplayCandidates(candidates)[0];
  return freshestTruthDisplaySample(market, truthSamples, marketTruthPoint);
}

function latestTruthDisplayCandidates(market, truthSamples, marketTruthPoint) {
  return [
    ...liveTruthSnapshotCandidates(market),
    ...(Array.isArray(truthSamples) ? truthSamples : [truthSamples]),
    truthDisplayCandidateFromRow(market, marketTruthPoint),
  ].filter((sample) => (
    sample
    && sample.btcPrice !== null
    && truthSampleMatchesMarket(sample, market)
  ));
}

function latestTruthDisplaySample(market, truthSamples, marketTruthPoint) {
  const candidates = latestTruthDisplayCandidates(market, truthSamples, marketTruthPoint);
  if (!candidates.length) return null;
  return sortTruthDisplayCandidates(candidates)[0];
}

function chainlinkDisplayAgeMs(sample) {
  if (!sample?.row) return null;
  const receiveMicro = normalizedTruthRowReceiveTimeMicro(sample.row);
  if (receiveMicro !== null) return Math.max(0, Date.now() - receiveMicro / 1000);
  const eventMicro = normalizedTruthRowEventTimeMicro(sample.row);
  return eventMicro === null ? null : Math.max(0, Date.now() - eventMicro / 1000);
}

function chainlinkDisplayStatusText(sample) {
  const ageMs = chainlinkDisplayAgeMs(sample);
  if (ageMs === null) return "waiting";
  if (ageMs < 1000) return "live";
  if (ageMs < POLYMARKET_TRUTH_CURRENT_STALE_MS) return `${(ageMs / 1000).toFixed(1)}s old`;
  return `stale ${Math.round(ageMs / 1000)}s`;
}

function outcomeBookOddsFromCandidates(candidates) {
  const rows = outcomeRowsNewestFirst(candidates);
  let up = rows.map((row) => outcomeDisplayBookProbability(row, "up")).find((value) => value !== null) ?? null;
  let down = rows.map((row) => outcomeDisplayBookProbability(row, "down")).find((value) => value !== null) ?? null;
  if (up === null && down !== null) up = complementDisplayProbability(down);
  if (down === null && up !== null) down = complementDisplayProbability(up);
  return { up, down };
}

function outcomeSideBookSeen(row, side) {
  return sideField(row, side, "bid") !== null || sideField(row, side, "ask") !== null;
}

function rowHasOutcomeBookQuote(row) {
  return outcomeSideBookSeen(row, "up") || outcomeSideBookSeen(row, "down");
}

function isLivePriceTransportRow(row) {
  return ["chainlink", "trade", "depth", "book"].includes(row?.backend_event_kind)
    || ["chainlink_tick", "live_tick", "live_book_tick"].includes(row?.decision)
    || isBinanceLivePoint(row);
}

function rowHasDisplayPolymarketBook(row) {
  if (!row || isActionOnlyPaperOddsRow(row) || !rowHasOutcomeBookQuote(row)) return false;
  if (isLivePriceTransportRow(row)) return false;
  const source = [
    row.polymarket_book_source,
    row.books?.Up?.source,
    row.books?.Down?.source,
  ].filter(Boolean).join(" ").toLowerCase();
  return source.includes("local_postgres_polymarket_order_books");
}

function displayBookTimestampMicro(row) {
  return metricNumber(row?.up_book_snapshot_time_micro)
    ?? metricNumber(row?.down_book_snapshot_time_micro)
    ?? outcomeOddsTimestampMicro(row)
    ?? 0;
}

function displayPolymarketBookRows(candidates) {
  return (candidates || [])
    .filter(rowHasDisplayPolymarketBook)
    .sort((left, right) => displayBookTimestampMicro(right) - displayBookTimestampMicro(left));
}

function clampOutcomeProbability(value) {
  const number = metricNumber(value);
  return number === null ? null : Math.max(0, Math.min(1, number));
}

function complementDisplayProbability(value) {
  const number = clampOutcomeProbability(value);
  if (number === null) return null;
  if (number <= DISPLAY_CERTAIN_OPPOSITE_PRICE) return 1;
  return clampOutcomeProbability(1 - number);
}

function isResolvedBookPrice(value) {
  const number = metricNumber(value);
  return number !== null && (number <= 0.02 || number >= 0.98);
}

function outcomeDisplayBookOddsFromCandidates(candidates) {
  const rows = displayPolymarketBookRows(candidates);
  const row = rows[0] || null;
  let up = row ? outcomeDisplayBookProbability(row, "up") : null;
  let down = row ? outcomeDisplayBookProbability(row, "down") : null;
  if (up === null && down !== null) up = complementDisplayProbability(down);
  if (down === null && up !== null) down = complementDisplayProbability(up);
  const upBookSeen = row ? outcomeSideBookSeen(row, "up") : false;
  const downBookSeen = row ? outcomeSideBookSeen(row, "down") : false;
  return {
    up,
    down,
    upNoSellers: up === null && upBookSeen,
    downNoSellers: down === null && downBookSeen,
    askBookObserved: up !== null || down !== null || upBookSeen || downBookSeen,
  };
}

function preferBookOdds(bookOdds, fallbackOdds) {
  if (bookOdds.up !== null || bookOdds.down !== null) {
    return {
      up: bookOdds.up ?? fallbackOdds.up,
      down: bookOdds.down ?? fallbackOdds.down,
    };
  }
  return fallbackOdds;
}

function completeOutcomeOdds(primaryOdds, cachedOdds = null) {
  const output = {
    up: metricNumber(primaryOdds?.up),
    down: metricNumber(primaryOdds?.down),
  };
  const cached = {
    up: metricNumber(cachedOdds?.up),
    down: metricNumber(cachedOdds?.down),
  };
  if (output.up === null && output.down !== null) output.up = Math.max(0, Math.min(1, 1 - output.down));
  if (output.down === null && output.up !== null) output.down = Math.max(0, Math.min(1, 1 - output.up));
  if (output.up === null && cached.up !== null) output.up = cached.up;
  if (output.down === null && cached.down !== null) output.down = cached.down;
  if (output.up === null && output.down !== null) output.up = Math.max(0, Math.min(1, 1 - output.down));
  if (output.down === null && output.up !== null) output.down = Math.max(0, Math.min(1, 1 - output.up));
  return output;
}

function isExternalPricePoint(row) {
  return isBinanceLivePoint(row)
    || isBackendLivePoint(row)
    || row?.price_role === "external_live_estimate"
    || String(row?.external_btc_source || "").toLowerCase().includes("binance");
}

function isExternalBookPricePoint(row) {
  return isExternalPricePoint(row) && row?.decision === "live_book_tick";
}

function isExternalTradePricePoint(row) {
  return isExternalPricePoint(row) && row?.decision === "live_tick";
}

function isExternalBookTickerPricePoint(row) {
  return isExternalBookPricePoint(row) && row?.backend_event_kind === "book";
}

function isExternalDepthPricePoint(row) {
  return isExternalBookPricePoint(row) && row?.backend_event_kind === "depth";
}

function isExternalGraphPricePoint(row) {
  return isExternalBookTickerPricePoint(row)
    || isExternalDepthPricePoint(row)
    || isExternalTradePricePoint(row);
}

function priceChangingRows(rows, minDollarChange = 0.01) {
  const ordered = (rows || [])
    .filter((row) => metricNumber(row?.btc_price) !== null)
    .sort((left, right) => (pointTimestampMicro(left) || 0) - (pointTimestampMicro(right) || 0));
  if (ordered.length <= 2) return ordered;
  const output = [ordered[0]];
  let lastKeptPrice = metricNumber(ordered[0]?.btc_price);
  for (let index = 1; index < ordered.length - 1; index += 1) {
    const price = metricNumber(ordered[index]?.btc_price);
    if (price === null || lastKeptPrice === null) continue;
    if (Math.abs(price - lastKeptPrice) >= minDollarChange) {
      output.push(ordered[index]);
      lastKeptPrice = price;
    }
  }
  const last = ordered[ordered.length - 1];
  if (output[output.length - 1] !== last) output.push(last);
  return output;
}

function externalLineRows(rows) {
  const ordered = sortRowsIfNeeded((rows || []).filter(isExternalGraphPricePoint), pointTimestampMicro);
  const bookTicks = ordered.filter(isExternalBookTickerPricePoint);
  const trades = ordered.filter(isExternalTradePricePoint);
  const depthTicks = ordered.filter(isExternalDepthPricePoint);
  const preferred = [bookTicks, trades, depthTicks].find((candidate) => candidate.length >= 3)
    || [bookTicks, trades, depthTicks].find((candidate) => candidate.length);
  return preferred || ordered;
}

function externalLineLabel(rows) {
  return "Binance";
}

function backendBaseUrl() {
  return String(LOCAL_BACKEND_BASE || "").replace(/\/+$/, "");
}

function activePaperEdgeId() {
  return configuredPaperEdgeId()
    || state.workflow?.paper_trade?.edge_id
    || state.workflow?.active_backtest_key
    || state.workflow?.paper_trade?.recommended_dashboard_edge_id
    || state.workflow?.paper_trade?.paper_health?.recommended_dashboard_edge_id
    || ACTIVE_PAPER_EDGE_ID
    || ACTIVE_BACKTEST_KEY;
}

function backendJsonUrl(path, params = {}) {
  const base = backendBaseUrl();
  if (!base) return "";
  const url = new URL(base);
  url.pathname = path;
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function backendWebSocketUrl() {
  if (LOCAL_BACKEND_WS) return LOCAL_BACKEND_WS;
  const base = backendBaseUrl();
  if (!base) return "";
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/binance/ticks";
  url.search = new URLSearchParams({
    symbol: "BTCUSDT",
    chainlink_snapshot_limit: String(BACKEND_WS_CHAINLINK_SNAPSHOT_LIMIT),
    binance_snapshot_limit: String(BACKEND_WS_BINANCE_SNAPSHOT_LIMIT),
    snapshot_seconds: String(BACKEND_WS_SNAPSHOT_SECONDS),
    paper_edge_id: activePaperEdgeId(),
    paper_history_limit: "36",
    paper_snapshot_seconds: "5",
  }).toString();
  return url.toString();
}

function refreshBackendPaperFeeds(options = {}) {
  ensureLiveTickStream();
  if (options.render && state.activeTab === "paper") renderPaperChart();
  return currentPaperMarket();
}

function rememberPaperSqlActivity(payload) {
  const markers = Array.isArray(payload?.markers)
    ? payload.markers
    : Array.isArray(payload?.session?.markers)
      ? payload.session.markers
      : [];
  if (!markers.length) return;
  const grouped = new Map();
  markers.forEach((marker) => {
    const key = paperGraphKey(marker) || marker.condition_id || marker.market_key || "paper-sql";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(marker);
  });
  grouped.forEach((rows, key) => {
    const latest = rows[rows.length - 1] || {};
    rememberObservedPaperMarket({
      ...latest,
      market_key: latest.market_key || key,
      condition_id: latest.condition_id || key,
      slug: latest.slug || latest.market_key || key,
      points: [],
      markers: [],
    }, [], rows);
  });
}

function historicalPaperMarkets() {
  return [];
}

function paperPointsFor(market) {
  const rows = [];
  paperStorageKeysForMarket(market).forEach((key) => {
    rows.push(...(state.workflow?._paperPointsByMarket?.get(key) || []));
    rows.push(...(state.paperObservedPointsByMarket.get(key) || []));
  });
  if (!rows.length && Array.isArray(market?.points)) rows.push(...market.points);
  return mergePaperChartRows(rows, []);
}

function paperRowTimeMicro(row, fallbackIndex = 0) {
  const explicit = pointTimestampMicro(row);
  if (explicit !== null) return explicit;
  const parsed = Date.parse(row?.generated_at || row?.ts || "");
  if (Number.isFinite(parsed)) return parsed * 1000;
  const start = metricNumber(row?.window_start_unix);
  const elapsed = metricNumber(row?.elapsed_seconds);
  if (start !== null && elapsed !== null) return (start + elapsed) * 1_000_000;
  const secondsLeft = metricNumber(row?.seconds_left);
  if (start !== null && secondsLeft !== null) return (start + Math.max(0, 300 - secondsLeft)) * 1_000_000;
  return fallbackIndex;
}

function mergePaperChartRows(baseRows, liveRows) {
  const seen = new Set();
  return [...(baseRows || []), ...(liveRows || [])]
    .filter((row, index) => {
      const key = row.point_id || row.event_id || row.quote_id || `${row.decision || row.event_type || "row"}:${paperRowTimeMicro(row, index)}:${row.btc_price ?? ""}:${row.distance_bps ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => paperRowTimeMicro(left) - paperRowTimeMicro(right));
}

function paperChartPointsFor(market) {
  const points = paperPointsFor(market);
  const liveTicks = liveChartTickPointsForMarket(market);
  if (isCurrentPaperMarket(market)) {
    const recentPaperPoints = points.filter((row) => isPaperEventPoint(row)).slice(-300);
    return liveTicks.length ? mergePaperChartRows(recentPaperPoints, liveTicks) : recentPaperPoints;
  }
  const ticks = downsamplePoints(liveTicks, LIVE_TICK_RENDER_MAX_POINTS);
  const merged = ticks.length ? mergePaperChartRows(points, ticks) : points;
  return merged;
}

function paperDisplayUpdatedAt(market) {
  const latestTick = latestLiveTickForMarket(market);
  const latestTickMicro = pointTimestampMicro(latestTick);
  if (latestTickMicro !== null) return new Date(Math.floor(latestTickMicro / 1000));
  if (latestTick?.generated_at) return new Date(latestTick.generated_at);
  return paperMarketLastUpdatedAt(market);
}

function paperMarkersFor(market) {
  const rows = [];
  paperStorageKeysForMarket(market).forEach((key) => {
    rows.push(...(state.workflow?._paperMarkersByMarket?.get(key) || []));
    rows.push(...(state.paperObservedMarkersByMarket.get(key) || []));
  });
  if (!rows.length && Array.isArray(market?.markers)) rows.push(...market.markers);
  return mergePaperChartRows(rows, []);
}

function selectedPaperMarket() {
  state.paperGraph = PAPER_CURRENT_VALUE;
  return currentDisplayPaperMarket();
}

function paperDistanceBps(row) {
  const distance = metricNumber(row?.distance_bps);
  if (distance !== null) return distance;
  const btc = metricNumber(row?.btc_price);
  const start = metricNumber(row?.start_price);
  if (btc === null || start === null || start <= 0) return null;
  return Math.log(btc / start) * 10000;
}

function pointPlotTimestampMicro(row, source) {
  const receiveMicro = metricNumber(row?.receive_time_micro);
  const priceSource = row?.btc_price_source || row?.btc_price_venue || row?.price_source;
  if (source === "chainlink" && isChainlinkPriceRow(row) && isChainlinkDataStreamsSource(priceSource) && receiveMicro !== null) {
    return receiveMicro;
  }
  if (source === "binance" && isExternalPricePoint(row) && receiveMicro !== null) {
    return receiveMicro;
  }
  return pointTimestampMicro(row);
}

function paperGraphElapsedSeconds(row, index, total, source) {
  const start = metricNumber(row?.window_start_unix);
  const timestampMicro = pointPlotTimestampMicro(row, source);
  if (start !== null && timestampMicro !== null) {
    return Math.max(0, Math.min(300, timestampMicro / 1_000_000 - start));
  }
  return paperPointElapsedSeconds(row, index, total);
}

function paperGraphSample(row, index, total, startPrice, source) {
  const elapsedSeconds = paperGraphElapsedSeconds(row, index, total, source);
  const dollarMove = paperDollarMoveFromStart(row, startPrice);
  const btcPrice = metricNumber(row?.btc_price);
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(dollarMove)) return null;
  return {
    row,
    index,
    source,
    elapsedSeconds,
    secondsLeft: Math.max(0, 300 - elapsedSeconds),
    dollarMove,
    btcPrice,
  };
}

function graphBaselineItem(rows, source, maxElapsedSeconds = 5, allowFirstFallback = false) {
  const ordered = (rows || [])
    .map((row, index) => ({
      row,
      index,
      elapsedSeconds: paperGraphElapsedSeconds(row, index, rows.length, source),
      price: metricNumber(row?.btc_price),
    }))
    .filter((item) => item.price !== null && item.price > 0 && Number.isFinite(item.elapsedSeconds))
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds || left.index - right.index);
  if (!ordered.length) return null;
  const nearOpen = ordered.find((item) => item.elapsedSeconds <= maxElapsedSeconds);
  return nearOpen || (allowFirstFallback ? ordered[0] : null);
}

function graphBaselinePrice(rows, source, fallbackPrice = null, allowFirstFallback = false) {
  return graphBaselineItem(rows, source, 5, allowFirstFallback)?.price ?? metricNumber(fallbackPrice);
}

function paperGraphSamples(rows, startPrice, source) {
  return (rows || [])
    .map((row, index) => paperGraphSample(row, index, rows.length, startPrice, source))
    .filter(Boolean);
}

function chainlinkStartAnchorSample(market, startMeta) {
  const windowStart = metricNumber(market?.window_start_unix);
  const price = metricNumber(startMeta?.price);
  if (windowStart === null || price === null || price <= 0) return null;
  return {
    row: {
      point_id: `chainlink-start:${windowStart}`,
      event_time_micro: windowStart * 1_000_000,
      receive_time_micro: windowStart * 1_000_000,
      btc_price: price,
      btc_price_source: POLYMARKET_TRUTH_SOURCE,
      backend_event_kind: "chainlink_start",
      window_start_unix: windowStart,
    },
    index: -1,
    source: "chainlink",
    elapsedSeconds: 0,
    secondsLeft: 300,
    dollarMove: 0,
    btcPrice: price,
  };
}

function sourceStartAnchorSample(rows, source, startPrice, allowFirstFallback = false) {
  const item = graphBaselineItem(rows, source, 5, allowFirstFallback);
  const price = metricNumber(startPrice);
  if (!item || price === null || price <= 0) return null;
  return {
    row: item.row,
    index: -1,
    source,
    elapsedSeconds: 0,
    secondsLeft: 300,
    dollarMove: 0,
    btcPrice: price,
  };
}

function paperPointSecondsLeft(row, fallbackIndex = 0, total = 1) {
  const seconds = metricNumber(row?.seconds_left);
  if (seconds !== null) return seconds;
  const elapsed = metricNumber(row?.elapsed_seconds);
  if (elapsed !== null) return Math.max(0, 300 - elapsed);
  if (total <= 1) return 300;
  return 300 - (fallbackIndex / (total - 1)) * 300;
}

function paperPointElapsedSeconds(row, fallbackIndex = 0, total = 1) {
  const start = metricNumber(row?.window_start_unix);
  const timestampMicro = pointTimestampMicro(row);
  if (start !== null && timestampMicro !== null) {
    return Math.max(0, Math.min(300, timestampMicro / 1_000_000 - start));
  }
  const elapsed = metricNumber(row?.elapsed_seconds);
  if (elapsed !== null) return Math.max(0, Math.min(300, elapsed));
  const secondsLeft = metricNumber(row?.seconds_left);
  if (secondsLeft !== null) return Math.max(0, Math.min(300, 300 - secondsLeft));
  if (total <= 1) return 0;
  return (fallbackIndex / (total - 1)) * 300;
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
  const action = fills ? "filled buy" : quotes ? "open bid" : signals ? "setup" : "no action";
  const result = market.maker_pnl_dollars !== undefined
    ? ` | Maker P&L ${formatSignedMoney(market.maker_pnl_dollars)}`
    : "";
  return `${status} | ${paperMarketTimeLabel(market)} | ${action}${result}`;
}

function paperStoredPointCount(market) {
  if (!market) return 0;
  return mergePaperChartRows(paperPointsFor(market), liveTickPointsForMarket(market)).length;
}

function paperStorageWarningText() {
  return "";
}

function paperMarkerType(row) {
  if (row?.decision === "no_signal") return "fail";
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
  const buy = paperBuyDecision(row);
  if (buy === "yes" || buy === "no") return buy;
  if (paperMarkerType(row) === "settlement") return "settle";
  return "";
}

function paperBuyDecision(row) {
  const type = paperMarkerType(row);
  if (type === "fill") return "yes";
  if (["signal", "quote", "cancel", "fail"].includes(type) || row?.decision === "paper_signal" || row?.decision === "no_signal") return "no";
  return "--";
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

function backtestBtcPrice(row, defaultStartPrice = null) {
  const directPrice = metricNumber(row?.btc_price);
  if (directPrice !== null) return directPrice;
  const startPrice = metricNumber(row?.start_price ?? defaultStartPrice);
  const distanceBps = metricNumber(row?.distance_bps);
  if (startPrice === null || distanceBps === null) return null;
  const impliedPrice = startPrice * (1 + distanceBps / 10000);
  return Number.isFinite(impliedPrice) ? impliedPrice : null;
}

function bpsRangePercentText(min, max) {
  const asPct = (value) => `${(Number(value) / 100).toFixed(2)}%`;
  if (min !== null && min !== undefined && max !== null && max !== undefined) return `${asPct(min)}-${asPct(max)}`;
  if (min !== null && min !== undefined) return `at least ${asPct(min)}`;
  if (max !== null && max !== undefined) return `up to ${asPct(max)}`;
  return "any move";
}

function backtestMoveText(row, market = {}) {
  const start = metricNumber(row?.start_price ?? market?.start_price);
  const current = backtestBtcPrice(row, start);
  if (start !== null && current !== null) {
    const diff = current - start;
    const pct = start ? diff / start : null;
    return `${formatDollarMove(diff)} (${formatPercent(pct)})`;
  }
  return formatBps(row?.distance_bps);
}

function priceDomain(values, startPrice = null) {
  const cleanValues = values.filter(Number.isFinite);
  if (!cleanValues.length) return null;
  let min = Math.min(...cleanValues);
  let max = Math.max(...cleanValues);
  const anchor = metricNumber(startPrice);
  const minSpan = Math.max(anchor ? anchor * 0.0002 : 1, 1);
  if (max - min < minSpan) {
    const center = (min + max) / 2;
    min = center - minSpan / 2;
    max = center + minSpan / 2;
  }
  const pad = Math.max((max - min) * 0.16, minSpan * 0.2);
  return { min: min - pad, max: max + pad };
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
    ["no_action", `No buy (${fmt.format(noActionCount)})`],
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
      ? `BUY ${signal.intended_outcome} | ${signal.winner === signal.intended_outcome ? "won" : "lost"} | ${formatSignedMoney(signal.pnl_after_slippage_haircut)}`
      : `NO BUY | ${rejectReasonLabel(noActionDecisionRow(market)?.reason)}`;
    return `<option value="${escapeHtml(market.condition_id)}">${escapeHtml(`${when} | ${status}`)}</option>`;
  }).join("");
  byId("backtestMarket").value = state.backtestMarket;
}

function ruleLine() {
  const rule = activeRule();
  const edgeThreshold = rule.min_fair_edge_vs_bid ?? rule.min_fair_edge_vs_quote;
  const pieces = [
    `${rangeText(rule.min_seconds_left, rule.max_seconds_left, "s")} left`,
    `market price ${formatOutcomePercent(rule.min_ask)}-${formatOutcomePercent(rule.max_ask)}`,
    `BTC move ${bpsRangePercentText(rule.min_abs_distance_bps, rule.max_abs_distance_bps)}`,
    `visible size at least ${money.format(rule.min_top5_capacity_dollars || 0)}`,
  ];
  if (edgeThreshold !== null && edgeThreshold !== undefined) {
    pieces.push(`fair edge >= ${formatCents(edgeThreshold)}`);
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
    `Buy the side BTC is already leaning toward`,
    `${rangeText(rule.min_seconds_left, rule.max_seconds_left, "s")} left`,
    `BTC move ${bpsRangePercentText(rule.min_abs_distance_bps, rule.max_abs_distance_bps)}`,
    `market price ${formatOutcomePercent(rule.min_ask)}-${formatOutcomePercent(rule.max_ask)}`,
    `visible size ${money.format(rule.min_top5_capacity_dollars || 0)}+`,
  ].join(" | ");
}

function strategyCell(title, body) {
  return `
    <div class="strategy-cell">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(body)}</strong>
    </div>`;
}

function routePromotionDecisionText(value) {
  if (value === "stand_down") return "Stand down";
  if (value === "keep_active") return "Keep active";
  if (value === "shadow_challenger") return "Shadow challenger";
  if (value === "promote_challenger_to_paper") return "Promote to paper";
  return value ? humanReason(value) : "Collecting evidence";
}

function paperRouteGateCells() {
  const routePromotion = state.workflow.paper_trade?.route_promotion || {};
  const decision = routePromotion.decision || {};
  const paperHealth = state.workflow.paper_trade?.paper_health || {};
  const recommendedEdge = state.workflow.paper_trade?.recommended_dashboard_edge_id
    || paperHealth.recommended_dashboard_edge_id
    || activePaperEdgeId();
  const healthEdge = (paperHealth.edges || []).find((edge) => edge.edge_id === recommendedEdge) || {};
  const healthCells = recommendedEdge ? [
    strategyCell("Paper Edge", recommendedEdge),
    strategyCell(
      "Paper Result",
      `${fmt.format(healthEdge.maker_fills || 0)} fills / ${fmt.format(healthEdge.maker_settlements || 0)} settled | ${formatSignedMoney(healthEdge.realized_pnl)} | ROI ${formatPercent(healthEdge.roi_on_filled_cost)}`,
    ),
  ] : [];
  const typedDecisions = healthEdge.typed_decisions || {};
  const placeRate = metricNumber(typedDecisions.place_market_rate);
  if (recommendedEdge && typedDecisions.decisions !== undefined) {
    healthCells.push(strategyCell(
      "Paper Quotes",
      `${fmt.format(typedDecisions.place_markets || 0)}/${fmt.format(typedDecisions.markets || 0)} markets | ${formatPercent(placeRate)}`,
    ));
  }
  const fillability = healthEdge.fillability || {};
  if (recommendedEdge && fillability.orders) {
    healthCells.push(strategyCell(
      "Fillability",
      `${humanReason(fillability.status)} | ${fmt.format(fillability.orders_with_crossing_sells || 0)}/${fmt.format(fillability.orders || 0)} crossed`,
    ));
  }
  const blockers = (healthEdge.top_reasons || [])
    .slice(0, 2)
    .map((row) => `${humanReason(row.reason)} (${fmt.format(row.markets || 0)} markets)`);
  if (recommendedEdge && blockers.length) {
    healthCells.push(strategyCell("Main Blockers", blockers.join(" | ")));
  }
  if (!decision.decision && !routePromotion.typed_paper) return healthCells;
  const activeSummary = routePromotion.typed_paper?.active?.summary || {};
  const thresholds = routePromotion.thresholds || {};
  const fills = metricNumber(activeSummary.fills) ?? 0;
  const settlements = metricNumber(activeSummary.settlements) ?? 0;
  const pnl = metricNumber(activeSummary.realized_pnl);
  const roi = metricNumber(activeSummary.roi_on_filled_cost);
  const minFills = metricNumber(thresholds.min_typed_paper_fills) ?? 30;
  const minSettlements = metricNumber(thresholds.min_typed_paper_settlements) ?? minFills;
  const minRoi = metricNumber(thresholds.min_typed_paper_roi_on_filled_cost) ?? 0.03;
  return [
    ...healthCells,
    strategyCell("Route Gate", routePromotionDecisionText(decision.decision)),
    strategyCell(
      "Typed Paper",
      `${fmt.format(fills)} fills / ${fmt.format(settlements)} settled | ${pnl === null ? "$0.00" : formatSignedMoney(pnl)} | ROI ${formatPercent(roi)}`,
    ),
    strategyCell(
      "Needed",
      `${fmt.format(minFills)} fills, ${fmt.format(minSettlements)} settled, ROI >= ${formatPercent(minRoi)}`,
    ),
  ];
}

function renderStrategyPanels() {
  const activeSummary = state.workflow.active_backtest?.summary || {};
  const policy = state.workflow.live_trade.execution_policy || {};
  const liveStatus = policy.maker_route_ready
    ? "Disabled until manual enable"
    : "Disabled";
  byId("backtestStrategy").innerHTML = [
    strategyCell("Goal", "Would this simple rule have made money?"),
    strategyCell("Buy Rule", ruleSummaryText()),
    strategyCell(
      "Result",
      `${fmt.format(activeSummary.quote_markets || signalRows().length)} historical quotes | ${formatSignedMoney(activeSummary.pnl_dollars)} P&L | ${formatPercent(activeSummary.roi_on_planned_cost)} return`,
    ),
  ].join("");
  const paperStrategy = byId("paperStrategy");
  if (paperStrategy) {
    const cells = paperRouteGateCells();
    paperStrategy.innerHTML = cells.join("");
    paperStrategy.hidden = !cells.length;
  }
  byId("liveStrategy").innerHTML = [
    strategyCell("Mode", liveStatus),
    strategyCell("Same View", "Paper layout, real balance/orders when enabled"),
    strategyCell("Orders", "Post-only only"),
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
  const quotePrice = metricNumber(row.quote_price ?? row.maker_quote_price);
  const filledCost = metricNumber(row.filled_cost);
  const wasFilled = Boolean(row.traded || (filledCost !== null && filledCost > 0));
  const headline = isSignal
    ? `BUY ${outcome} at ${formatPrice(quotePrice ?? selectedBid)}`
    : "NO BUY";
  const result = isSignal
    ? `${wasFilled ? `Filled ${moneyCents.format(filledCost || 0)}` : "Not filled"} | ${row.winner} won | ${formatSignedMoney(pnl)}`
    : `Reason: ${rejectReasonLabel(row.reason)} | ${market.winner || row.winner || "--"} won`;
  const reason = isSignal
    ? `${outcome} matched because BTC was ${outcome === "Up" ? "above" : "below"} the start, the market price was inside our buy range, and enough visible size was available.`
    : `The closest checked moment failed the rule: ${rejectReasonLabel(row.reason)}.`;
  return {
    headline,
    result,
    reason,
    signals: [
      ["Start BTC", metricNumber(row.start_price ?? market.start_price) === null ? "--" : moneyCents.format(metricNumber(row.start_price ?? market.start_price))],
      ["Decision BTC", backtestBtcPrice(row, market.start_price) === null ? "--" : moneyCents.format(backtestBtcPrice(row, market.start_price))],
      ["BTC move", backtestMoveText(row, market)],
      ["Bot bid", formatPrice(quotePrice ?? selectedBid)],
      ["Market ask", formatPrice(selectedAsk)],
      ["Visible size", money.format(selectedDepth || 0)],
      ["Book lean", percentText(row.signal_depth_imbalance ?? row[`${selectedSide}_depth_imbalance`])],
      ["Result", isSignal ? `${row.winner} won, ${formatSignedMoney(pnl)}` : rejectReasonLabel(row.reason)],
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
  const entry = Number(row.quote_price ?? row.maker_quote_price ?? row.signal_bid ?? row.signal_ask);
  const exit = Number(row.settlement_exit_price);
  const pnl = Number(row.pnl_after_slippage_haircut);
  const rawPnl = Number(row.pnl_dollars);
  const oppositeAsk = row.intended_outcome === "Up" ? row.down_ask : row.up_ask;
  return [
    `Buy ${row.intended_outcome} at ${entry.toFixed(2)} with ${row.seconds_left}s left`,
    `Held to close: ${row.winner} won`,
    `P&L: ${moneyCents.format(pnl)} (${moneyCents.format(rawPnl)} raw)`,
    `Why: BTC moved ${bpsRangePercentText(rule.min_abs_distance_bps, rule.max_abs_distance_bps)}, price was ${formatOutcomePercent(rule.min_ask)}-${formatOutcomePercent(rule.max_ask)}, visible size was enough`,
    `Book then: ${row.intended_outcome} bid/ask ${formatPrice(row.signal_bid)}/${formatPrice(entry)}; other side ask ${formatPrice(oppositeAsk)}`,
  ].join(" | ");
}

function noActionTitle(row, market) {
  return [
    `${market.slug}: no buy with ${row.seconds_left}s left`,
    `Reason: ${rejectReasonLabel(row.reason)}`,
    `Candidate: ${decisionOutcome(row)}`,
    `BTC move: ${backtestMoveText(row, market)}`,
  ].join(" | ");
}

function decisionGateRows(row, isSignal) {
  const rule = activeRule();
  const absDistance = Math.abs(Number(row.abs_distance_bps || 0));
  const edgeThreshold = rule.min_fair_edge_vs_bid ?? rule.min_fair_edge_vs_quote;
  const fairEdgeGateEnabled = edgeThreshold !== null && edgeThreshold !== undefined;
  const bookLeanGateEnabled = rule.min_signal_depth_imbalance !== null && rule.min_signal_depth_imbalance !== undefined;
  const pairGateEnabled = rule.max_complement_ask_sum !== null && rule.max_complement_ask_sum !== undefined;
  const rows = [
    ["Time left", `${row.seconds_left}s`, inRange(row.seconds_left, rule.min_seconds_left, rule.max_seconds_left)],
    ["BTC move", backtestMoveText(row), inRange(absDistance, rule.min_abs_distance_bps, rule.max_abs_distance_bps)],
    ["Buy price", formatOutcomePercent(row.signal_ask), inRange(row.signal_ask, rule.min_ask, rule.max_ask)],
    ["Visible size", money.format(row.top5_capacity_dollars || 0), Number(row.top5_capacity_dollars || 0) >= Number(rule.min_top5_capacity_dollars || 0)],
  ];
  if (fairEdgeGateEnabled) {
    rows.push(["Estimated edge", formatCents(row.fair_edge_vs_signal_bid), Number(row.fair_edge_vs_signal_bid || 0) >= Number(edgeThreshold)]);
  }
  if (bookLeanGateEnabled) {
    rows.push(["Book pressure", `${((Number(row.signal_depth_imbalance || 0)) * 100).toFixed(0)}%`, Number(row.signal_depth_imbalance || 0) >= Number(rule.min_signal_depth_imbalance)]);
  }
  if (pairGateEnabled) {
    rows.push(["Both sides", formatPrice(row.complement_ask_sum), Number(row.complement_ask_sum || 99) <= Number(rule.max_complement_ask_sum)]);
  }
  rows.push(
    isSignal
      ? ["Result", `${row.traded ? "Filled" : "No fill"}, ${moneyCents.format(row.pnl_after_slippage_haircut || 0)}`, Number(row.pnl_after_slippage_haircut || 0) > 0]
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
  const defaultStartPrice = metricNumber(signal.start_price)
    ?? metricNumber(market.start_price)
    ?? rows.map((row) => metricNumber(row.start_price)).find((value) => value !== null)
    ?? null;
  const priceValues = rows
    .map((row) => backtestBtcPrice(row, defaultStartPrice))
    .filter(Number.isFinite);
  const priceRange = priceDomain(
    [
      ...priceValues,
      defaultStartPrice,
      backtestBtcPrice(signal, defaultStartPrice),
    ].filter(Number.isFinite),
    defaultStartPrice
  );
  const hasBtcPrices = Boolean(priceRange && priceValues.length >= 2);
  const distanceValues = rows.map((row) => Number(row.distance_bps)).filter(Number.isFinite);
  const maxAbsDistance = Math.max(30, ...distanceValues.map((value) => Math.abs(value))) * 1.15;
  const yDistance = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? plot.top + ((maxAbsDistance - number) / (maxAbsDistance * 2)) * plot.height : Number.NaN;
  };
  const yBtc = (value) => {
    const number = Number(value);
    if (!priceRange || !Number.isFinite(number)) return Number.NaN;
    return plot.top + ((priceRange.max - number) / Math.max(priceRange.max - priceRange.min, 1)) * plot.height;
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
    [`Buy ${selectedOutcome}`, `${formatPrice(selectedBid)} / ${formatPrice(selectedAsk)}`],
    ["Other side", formatPrice(oppositeAsk)],
    ["Bot value", formatPrice(signal.fair_probability)],
    ["Bot edge", formatCents(signal.fair_edge_vs_signal_bid)],
    ["Visible size", money.format(selectedDepth || 0)],
    ["PM pressure", selectedImbalance === null ? "--" : `${(selectedImbalance * 100).toFixed(0)}%`],
    ["PM recent flow", `${money.format(selectedFlow || 0)} vs ${money.format(oppositeFlow || 0)}`],
    ["Both prices", formatPrice(signal.complement_ask_sum)],
  ];
  const xTicks = [maxSec, Math.round((maxSec + minSec) / 2), minSec].map((tick) => {
    const x = plot.left + ((maxSec - tick) / spanSec) * plotWidth;
    return `<line class="grid" x1="${x}" y1="${plot.top}" x2="${x}" y2="${book.top + book.height}"></line><text class="tick" x="${x}" y="${book.top + book.height + 24}" text-anchor="middle">${tick}s</text>`;
  }).join("");
  const topTicks = hasBtcPrices
    ? [priceRange.max, (priceRange.max + priceRange.min) / 2, priceRange.min].map((tick) => {
        const y = yBtc(tick);
        return `<line class="grid" x1="${plot.left}" y1="${y}" x2="${plot.left + plotWidth}" y2="${y}"></line><text class="tick" x="${plot.left - 10}" y="${y + 4}" text-anchor="end">${moneyCents.format(tick)}</text>`;
      }).join("")
    : [-30, 0, 30].map((tick) => {
        const y = yDistance(tick);
        return `<line class="${tick === 0 ? "axis-zero" : "grid"}" x1="${plot.left}" y1="${y}" x2="${plot.left + plotWidth}" y2="${y}"></line><text class="tick" x="${plot.left - 10}" y="${y + 4}" text-anchor="end">${formatBps(tick)}</text>`;
      }).join("");
  const startPriceLine = hasBtcPrices && defaultStartPrice !== null
    ? `<line class="axis-zero" x1="${plot.left}" y1="${yBtc(defaultStartPrice)}" x2="${plot.left + plotWidth}" y2="${yBtc(defaultStartPrice)}"></line>
      <text class="tick" x="${plot.left + plotWidth - 8}" y="${yBtc(defaultStartPrice) - 6}" text-anchor="end">start ${moneyCents.format(defaultStartPrice)}</text>`
    : "";
  const priceTicks = [0, 0.5, 1].map((tick) => {
    const y = yPrice(tick);
    return `<line class="grid" x1="${book.left}" y1="${y}" x2="${book.left + plotWidth}" y2="${y}"></line><text class="tick" x="${book.left - 10}" y="${y + 4}" text-anchor="end">${tick.toFixed(2)}</text>`;
  }).join("");
  const topPath = hasBtcPrices
    ? linePathFor(rows, (row) => backtestBtcPrice(row, defaultStartPrice), xFor, yBtc)
    : linePathFor(rows, (row) => Number(row.distance_bps), xFor, yDistance);
  const markerTopValue = hasBtcPrices
    ? backtestBtcPrice(signal, defaultStartPrice)
    : Number(signal.distance_bps || 0);
  const markerTopY = hasBtcPrices ? yBtc(markerTopValue) : yDistance(markerTopValue);
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
  const noteTitle = isSignal ? "Why buy?" : "Why no buy?";

  byId("backtestChart").innerHTML = `
    <svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Selected backtest decision context">
      <title>${escapeHtml(title)}</title>
      <rect class="plot" x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plot.height}"></rect>
      <rect class="plot" x="${book.left}" y="${book.top}" width="${plotWidth}" height="${book.height}"></rect>
      ${xTicks}
      ${topTicks}
      ${priceTicks}
      ${startPriceLine}
      <path class="line ${hasBtcPrices ? "line-chainlink" : "line-distance"}" d="${topPath}"></path>
      <line class="signal-marker" x1="${markerX}" y1="${plot.top}" x2="${markerX}" y2="${book.top + book.height}"></line>
      <circle class="dot ${markerClass}" cx="${markerX}" cy="${markerTopY}" r="6"></circle>
      <path class="line line-ask" d="${selectedAskPath}"></path>
      <path class="line line-bid" d="${selectedBidPath}"></path>
      <path class="line line-other" d="${oppositeAskPath}"></path>
      <circle class="dot ${markerClass}" cx="${markerX}" cy="${yPrice(Number(signal.signal_ask || selectedAsk || 0))}" r="6"></circle>
      <text class="axis" x="${plot.left + plotWidth / 2}" y="${plot.top - 12}" text-anchor="middle">${hasBtcPrices ? "BTC price during this 5-minute market" : "BTC move from start"}</text>
      <text class="axis" x="${book.left + plotWidth / 2}" y="${book.top - 12}" text-anchor="middle">${selectedOutcome} contract price</text>
      <text class="legend ask" x="${book.left + 8}" y="${book.top + 20}">ask</text>
      <text class="legend bid" x="${book.left + 52}" y="${book.top + 20}">bid</text>
      <text class="legend other" x="${book.left + 92}" y="${book.top + 20}">other ask</text>
      <text class="axis" x="${book.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">Seconds left</text>
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
      <text class="axis" x="${view.left + plotWidth / 2}" y="${view.height - 18}" text-anchor="middle">${signals.length} maker quotes: bar = each market, line = total profit</text>
      <text class="axis" x="20" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 20 ${view.top + plotHeight / 2})">Profit after settlement</text>
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
    backtest_signals: "Historical quotes",
    backtest_days: "Days with quotes",
    backtest_win_rate: "Historical wins",
    backtest_roi_after_haircut: "Profit rate",
    capacity_rate: "Enough size",
    live_signals: "Paper setups found",
    signal_days: "Paper setup days",
    win_rate: "Paper wins",
    roi_after_haircut: "Paper profit rate",
    worst_day_after_haircut: "Worst day",
    start_price_source_verified: "Start price verified",
    no_missed_start_captures: "No missed starts",
    maker_fills: "Live maker fills",
    maker_fill_days: "Live maker fill days",
    maker_fill_rate: "Paper fill rate",
    maker_win_rate: "Maker wins",
    maker_roi_on_filled_cost: "Maker profit rate",
    maker_worst_day: "Worst maker day",
    paper_signals: "Paper setups found",
    paper_days: "Paper setup days",
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
      title: "Live moments that matched the selected table. These are setups, not filled buys.",
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
  state.paperGraph = PAPER_CURRENT_VALUE;
  renderPaperMeta();
}

function renderPaperMeta() {
  const meta = byId("paperGraphMeta");
  if (!meta) return;
  const market = selectedPaperMarket();
  const selectedCurrent = (state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE;
  if (selectedCurrent && market) {
    refreshBackendPaperFeeds();
    ensureLiveTickStream();
  }
  const points = market ? paperChartPointsFor(market) : [];
  if (selectedCurrent && market && !points.length && !verifiedPaperStartPrice(market)) {
    const startStatus = market.start_price_status || liveStartMetadata(market).start_price_status || "loading";
    const startError = market.start_price_error || liveStartMetadata(market).start_price_error || "";
    const message = startStatus === "error"
      ? `Start error${startError ? `: ${startError}` : ""}`
      : "Loading start";
    meta.innerHTML = `<span class="live-chip is-waiting">${escapeHtml(startStatus === "error" ? "Blocked" : "Loading")}</span> ${escapeHtml(message + paperStorageWarningText())}`;
    return;
  }
  if (selectedCurrent && market && !points.length) {
    meta.innerHTML = `<span class="live-chip is-waiting">Loading</span>${escapeHtml(paperStorageWarningText())}`;
    return;
  }
  const updatedAt = market ? paperDisplayUpdatedAt(market) : null;
  const statusClass = selectedCurrent && market && isCurrentPaperMarket(market) ? "is-live" : "is-past";
  const statusText = selectedCurrent && market && isCurrentPaperMarket(market) ? "Live" : (selectedCurrent ? "Latest" : "Past");
  const backendError = state.backendStatus.lastError || state.liveTickStatus.lastError;
  const detail = backendError ? ` | ${compactNote(backendError, 42)}` : "";
  meta.innerHTML = `<span class="live-chip ${statusClass}">${escapeHtml(statusText)}</span> ${escapeHtml(ageText(updatedAt) + detail + paperStorageWarningText())}`;
}

function paperDecisionText(row) {
  if (!row) return "--";
  const side = row.side || row.intended_outcome || row.outcome || "";
  if (row.decision === "live_tick") return "Live BTC tick";
  if (row.decision === "live_book_tick") return "Live BTC book tick";
  if (row.decision === "paper_signal") return `Setup ${side || "matched"}`;
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

function hasAnyField(row, fields) {
  return fields.some((field) => row?.[field] !== null && row?.[field] !== undefined);
}

function latestBookRowForMarket(market, rawPoints) {
  const candidates = [
    ...(rawPoints || []),
    ...paperMarkersFor(market),
    ...paperPointsFor(market),
    ...liveTickPointsForMarket(market),
  ];
  const fields = [
    "book_bid",
    "book_ask",
    "up_bid",
    "up_ask",
    "down_bid",
    "down_ask",
    "up_bid_size",
    "up_ask_size",
    "up_bid_depth_5",
    "up_ask_depth_5",
    "down_bid_size",
    "down_ask_size",
    "down_bid_depth_5",
    "down_ask_depth_5",
    "up_depth_imbalance",
    "down_depth_imbalance",
    "signal_bid",
    "signal_ask",
    "side_depth_imbalance",
    "signal_depth_imbalance",
    "book_bid",
    "book_ask",
    "book_bids",
    "book_asks",
    "pm_up_bids",
    "pm_up_asks",
    "pm_down_bids",
    "pm_down_asks",
    "external_book_imbalance",
    "external_book_microprice_support_bps",
    "external_trade_flow_support",
  ];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const row = candidates[index];
    if (hasAnyField(row, fields)) return row;
  }
  return rawPoints?.[rawPoints.length - 1] || null;
}

function externalDepthSnapshotFromRow(row) {
  const bids = normalizeBookLevels(row?.book_bids);
  const asks = normalizeBookLevels(row?.book_asks);
  if (row?.backend_event_kind !== "depth" || !isExternalBookPricePoint(row) || !bids.length || !asks.length) return null;
  return { row, bids, asks, source: "Binance depth WS", sourceKind: "binance_depth_ws" };
}

function externalDepthSnapshotTimeMicro(snapshot) {
  return metricNumber(snapshot?.row?.receive_time_micro)
    ?? metricNumber(snapshot?.row?.event_time_micro)
    ?? pointTimestampMicro(snapshot?.row)
    ?? 0;
}

function labelExternalDepthSnapshot(snapshot) {
  if (!snapshot) return null;
  const eventMicro = externalDepthSnapshotTimeMicro(snapshot);
  const ageMs = eventMicro === null ? null : Math.max(0, Date.now() - eventMicro / 1000);
  return {
    ...snapshot,
    stale: ageMs !== null && ageMs > BINANCE_DEPTH_TABLE_STALE_MS,
    ageMs,
    source: "Binance depth WS",
    sourceKind: "binance_depth_ws",
  };
}

function latestExternalDepthSnapshotForMarket(market, rawPoints) {
  const snapshots = liveTickPointsForCurrentWindow(market, (row) => row?.backend_event_kind === "depth")
    .map(externalDepthSnapshotFromRow)
    .filter(Boolean)
    .sort((left, right) => externalDepthSnapshotTimeMicro(right) - externalDepthSnapshotTimeMicro(left));
  return snapshots.length ? labelExternalDepthSnapshot(snapshots[0]) : null;
}

function formatBookMoney(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  const decimals = Math.abs(number) >= 100 ? 2 : 4;
  return `$${number.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatBookQty(value) {
  const number = metricNumber(value);
  if (number === null) return "--";
  if (Math.abs(number) >= 1000) return fmt.format(Math.round(number));
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(4);
}

function formatOutcomePercent(value, emptyText = "Waiting") {
  const number = metricNumber(value);
  if (number === null) return emptyText;
  return `${Math.round(number * 100)}%`;
}

function firstMetricNumber(...values) {
  for (const value of values) {
    const number = metricNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function rowHasOutcomeOdds(row) {
  return OUTCOME_ODDS_FIELDS.some((field) => row?.[field] !== null && row?.[field] !== undefined);
}

function rowHasUsableOutcomeOdds(row) {
  if (!row) return false;
  return outcomeDirectProbability(row, "up") !== null
    || outcomeDirectProbability(row, "down") !== null
    || outcomeBookProbability(row, "up") !== null
    || outcomeBookProbability(row, "down") !== null;
}

function isActionOnlyPaperOddsRow(row) {
  const eventType = String(row?.event_type || "").toLowerCase();
  if (eventType === "paper_evaluation" || eventType === "paper_settlement") return true;
  if (eventType.startsWith("maker_paper_")) return true;
  return String(row?.decision || "").toLowerCase() === "paper" && Boolean(eventType);
}

function currentMarketOddsRows(rows) {
  return (rows || []).filter((row) => row && !isActionOnlyPaperOddsRow(row) && rowHasUsableOutcomeOdds(row));
}

function outcomeDirectProbability(row, key) {
  return firstMetricNumber(
    row?.[`paper_${key}_probability`],
    row?.[`market_${key}_probability`],
    row?.[`${key}_probability`],
    row?.[`latest_${key}_probability`],
  );
}

function outcomeExplicitProbabilityFromRow(row, key) {
  const direct = outcomeDirectProbability(row, key);
  if (direct !== null) return direct;
  const opposite = key === "up" ? "down" : "up";
  const oppositeDirect = outcomeDirectProbability(row, opposite);
  return oppositeDirect === null ? null : Math.max(0, Math.min(1, 1 - oppositeDirect));
}

function outcomeProbabilityFromRow(row, key) {
  const direct = outcomeExplicitProbabilityFromRow(row, key);
  if (direct !== null) return direct;
  const bookMid = outcomeBookProbability(row, key);
  if (bookMid !== null) return bookMid;
  const opposite = key === "up" ? "down" : "up";
  const oppositeBookMid = outcomeBookProbability(row, opposite);
  if (oppositeBookMid !== null) return Math.max(0, Math.min(1, 1 - oppositeBookMid));
  return null;
}

function outcomeOddsWindowKey(row) {
  const start = marketWindowStartUnix(row);
  return start === null ? "" : String(start);
}

function outcomeOddsCacheKeys(row) {
  const keys = [];
  const start = marketWindowStartUnix(row);
  if (start !== null) {
    keys.push(String(start), `btc-updown-5m-${start}`, `backend-live-btc-5m-${start}`);
  }
  const key = paperGraphKey(row);
  if (key) keys.push(key);
  return [...new Set(keys)];
}

function outcomeOddsTimestampMicro(row) {
  return metricNumber(row?._odds_updated_micro)
    ?? pointTimestampMicro(row)
    ?? (Number.isFinite(Date.parse(row?.generated_at || "")) ? Date.parse(row.generated_at) * 1000 : null)
    ?? (Number.isFinite(Date.parse(row?.market_odds_fetched_at || "")) ? Date.parse(row.market_odds_fetched_at) * 1000 : null);
}

function outcomeRowsNewestFirst(candidates) {
  return currentMarketOddsRows(candidates)
    .sort((left, right) => {
      const leftTime = outcomeOddsTimestampMicro(left) ?? 0;
      const rightTime = outcomeOddsTimestampMicro(right) ?? 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return (rowHasOutcomeOdds(right) ? 1 : 0) - (rowHasOutcomeOdds(left) ? 1 : 0);
    });
}

function cachedOutcomeOddsForMarket(market) {
  const keys = outcomeOddsCacheKeys(market);
  for (const key of keys) {
    const odds = state.latestOutcomeOddsByWindow.get(key);
    if (odds && rowHasDisplayPolymarketBook(odds)) return odds;
    if (odds) state.latestOutcomeOddsByWindow.delete(key);
  }
  return null;
}

function rememberOutcomeOddsForWindow(anchor, candidates = []) {
  const rows = [anchor, ...(candidates || [])].filter(Boolean);
  const oddsRows = displayPolymarketBookRows(rows);
  const keys = [...new Set(rows.flatMap(outcomeOddsCacheKeys))];
  const key = rows.map(outcomeOddsWindowKey).find(Boolean) || keys[0];
  if (!key || !keys.length) return null;
  const { up, down } = outcomeDisplayBookOddsFromCandidates(oddsRows);
  if (up === null && down === null) return cachedOutcomeOddsForMarket(anchor) || null;
  const timestamps = oddsRows.map(outcomeOddsTimestampMicro).filter((value) => value !== null);
  const incomingTime = timestamps.length ? Math.max(...timestamps) : 0;
  const existing = keys.map((cacheKey) => state.latestOutcomeOddsByWindow.get(cacheKey)).find(rowHasDisplayPolymarketBook) || {};
  const existingTime = metricNumber(existing._odds_updated_micro) || 0;
  if (existingTime && incomingTime && incomingTime < existingTime) return existing;
  const source = oddsRows[0] ? { ...oddsRows[0] } : null;
  const odds = {
    ...existing,
    window_start_unix: Number(key),
    window_end_unix: Number(key) + 300,
    slug: `btc-updown-5m-${key}`,
    market_key: `btc-updown-5m-${key}`,
    _odds_updated_micro: incomingTime || existingTime || Date.now() * 1000,
  };
  copyLocalOutcomeBookFields(odds, source);
  if (up !== null) {
    odds.paper_up_probability = up;
    odds.market_up_probability = up;
    odds.up_probability = up;
  }
  if (down !== null) {
    odds.paper_down_probability = down;
    odds.market_down_probability = down;
    odds.down_probability = down;
  }
  if (source) {
    odds.probability_source = source.probability_source || source.market_probability_source || odds.probability_source;
    odds.market_probability_source = source.market_probability_source || source.probability_source || odds.market_probability_source;
    odds.market_odds_fetched_at = source.market_odds_fetched_at || odds.market_odds_fetched_at;
    odds.market_odds_stale = source.market_odds_stale ?? odds.market_odds_stale;
    odds.market_odds_error = source.market_odds_error ?? odds.market_odds_error;
  }
  keys.forEach((cacheKey) => state.latestOutcomeOddsByWindow.set(cacheKey, odds));
  return odds;
}

function sameWindowOutcomeOddsRows(market) {
  const start = marketWindowStartUnix(market);
  const pools = [
    ...paperGraphMarkets(),
    ...state.livePersistedMarkets.values(),
    ...state.paperObservedMarkets.values(),
  ];
  return pools.filter((row) => row && start !== null && marketWindowStartUnix(row) === start && rowHasUsableOutcomeOdds(row));
}

function paperOutcomeCandidates(market, latestRaw, latestBookRaw) {
  const rows = [
    market,
    cachedOutcomeOddsForMarket(market),
    ...sameWindowOutcomeOddsRows(market),
    ...paperStorageKeysForMarket(market).flatMap((storageKey) => [
      state.livePersistedMarkets.get(storageKey),
      state.paperObservedMarkets.get(storageKey),
    ]),
    latestBookRaw,
    latestRaw,
    ...paperPointsFor(market).slice(-120).reverse(),
    ...paperMarkersFor(market).slice(-80).reverse(),
    ...liveTickPointsForMarket(market).slice(-120).reverse(),
  ].filter(Boolean);
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      paperGraphKey(row),
      row.point_id,
      row.event_id,
      row.quote_id,
      row.generated_at,
      row.event_time_micro,
      row.receive_time_micro,
      row.time_unix,
    ].filter(Boolean).join(":");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameWindowPaperGraphMarkets(market) {
  const start = marketWindowStartUnix(market);
  if (start === null) return [];
  return paperGraphMarkets().filter((row) => row && marketWindowStartUnix(row) === start && rowHasUsableOutcomeOdds(row));
}

function paperPanelOutcomeCandidates(market, latestRaw, latestBookRaw) {
  const rows = [
    market,
    cachedOutcomeOddsForMarket(market),
    latestBookRaw,
    latestRaw,
    ...sameWindowPaperGraphMarkets(market),
    ...sameWindowOutcomeOddsRows(market),
    ...paperPointsFor(market).slice(-240).reverse(),
    ...paperMarkersFor(market).slice(-120).reverse(),
    ...liveTickPointsForMarket(market).slice(-240).reverse(),
  ].filter(Boolean);
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      paperGraphKey(row),
      row.point_id,
      row.event_id,
      row.quote_id,
      row.market_odds_fetched_at,
      row.generated_at,
      row.event_time_micro,
      row.receive_time_micro,
      row.time_unix,
    ].filter(Boolean).join(":");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function paperPanelOutcomeProbabilities(market, latestRaw, latestBookRaw) {
  if (!market) return { up: null, down: null };
  const candidates = paperPanelOutcomeCandidates(market, latestRaw, latestBookRaw);
  const oddsRows = currentMarketOddsRows(candidates);
  const cached = cachedOutcomeOddsForMarket(market);
  const odds = completeOutcomeOdds(
    preferBookOdds(outcomeBookOddsFromCandidates(oddsRows), outcomeOddsFromCandidates(oddsRows)),
    cached ? outcomeOddsFromCandidates([cached]) : null,
  );
  if (odds.up !== null || odds.down !== null) applyOutcomeOddsFromCandidates(market, candidates);
  return odds;
}

function paperPanelDisplayOutcomeProbabilities(market, latestRaw, latestBookRaw) {
  if (!market) return { up: null, down: null, upNoSellers: false, downNoSellers: false, askBookObserved: false };
  const candidates = [
    latestBookRaw,
    latestRaw,
    market,
    ...paperPointsFor(market).slice(-80).reverse(),
    ...liveTickPointsForMarket(market).slice(-80).reverse(),
  ].filter(Boolean);
  const bookOdds = outcomeDisplayBookOddsFromCandidates(candidates);
  if (bookOdds.askBookObserved) return bookOdds;
  return { up: null, down: null, upNoSellers: false, downNoSellers: false, askBookObserved: false };
}

function bestOutcomeProbability(side, candidates) {
  const key = sideKey(side);
  if (!key) return null;
  return candidates
    .map((row) => outcomeProbabilityFromRow(row, key))
    .find((value) => value !== null) ?? null;
}

function bestExplicitOutcomeProbability(side, candidates) {
  const key = sideKey(side);
  if (!key) return null;
  return (candidates || [])
    .map((row) => outcomeExplicitProbabilityFromRow(row, key))
    .find((value) => value !== null) ?? null;
}

function outcomeOddsFromCandidates(candidates) {
  const rows = outcomeRowsNewestFirst(candidates);
  let up = bestExplicitOutcomeProbability("up", rows);
  let down = bestExplicitOutcomeProbability("down", rows);
  if (up === null && down !== null) up = complementDisplayProbability(down);
  if (down === null && up !== null) down = complementDisplayProbability(up);
  return { up, down };
}

function applyOutcomeOddsFromCandidates(target, candidates) {
  const rows = displayPolymarketBookRows([...(candidates || []), cachedOutcomeOddsForMarket(target)].filter(Boolean));
  const { up, down } = outcomeDisplayBookOddsFromCandidates(rows);
  const source = rows[0] ? { ...rows[0] } : null;
  removeOutcomeAndBookFields(target);
  if (!source || (up === null && down === null)) return target;
  copyLocalOutcomeBookFields(target, source);
  if (up !== null) {
    target.paper_up_probability = up;
    target.market_up_probability = up;
    target.up_probability = up;
  }
  if (down !== null) {
    target.paper_down_probability = down;
    target.market_down_probability = down;
    target.down_probability = down;
  }
  if (source) {
    target.probability_source = source.probability_source || target.probability_source;
    target.market_probability_source = source.market_probability_source || source.probability_source || target.market_probability_source;
  }
  rememberOutcomeOddsForWindow(target, rows);
  return target;
}

function paperOutcomeProbability(side, market, latestRaw, latestBookRaw) {
  const key = sideKey(side);
  if (!key) return null;
  const explicit = outcomeExplicitProbabilityFromRow(market, key);
  if (explicit !== null) return explicit;
  const odds = paperOutcomeProbabilities(market, latestRaw, latestBookRaw);
  return key === "up" ? odds.up : odds.down;
}

function paperOutcomeProbabilities(market, latestRaw, latestBookRaw) {
  const candidates = paperOutcomeCandidates(market, latestRaw, latestBookRaw);
  const liveAnchor = isCurrentBtcWindowMarket(market) ? currentBackendLiveMarketShell() : null;
  const remembered = rememberOutcomeOddsForWindow(market, [liveAnchor, ...candidates]);
  const rows = currentMarketOddsRows([market, remembered, liveAnchor, ...candidates].filter(Boolean));
  const cached = cachedOutcomeOddsForMarket(market);
  const odds = completeOutcomeOdds(
    preferBookOdds(outcomeBookOddsFromCandidates(rows), outcomeOddsFromCandidates(rows)),
    cached ? outcomeOddsFromCandidates([cached]) : null,
  );
  if (odds.up !== null || odds.down !== null) applyOutcomeOddsFromCandidates(market, rows);
  return odds;
}

function renderPaperOddsStrip(market, latestRaw, latestBookRaw, odds = null) {
  if (!market) return "";
  const displayOdds = odds || paperPanelDisplayOutcomeProbabilities(market, latestRaw, latestBookRaw);
  const resolved = displayOdds;
  return `
    <div class="paper-odds-strip" role="status" aria-label="Current Polymarket odds">
      <div>
        <span>UP</span>
        <strong class="move-up">${escapeHtml(formatOutcomePercent(resolved.up, resolved.upNoSellers ? "No sellers" : "Waiting"))}</strong>
      </div>
      <div>
        <span>DOWN</span>
        <strong class="move-down">${escapeHtml(formatOutcomePercent(resolved.down, resolved.downNoSellers ? "No sellers" : "Waiting"))}</strong>
      </div>
    </div>`;
}

function stickyOutcomeOddsForMarket(market, odds) {
  const keys = outcomeOddsCacheKeys(market);
  const previouslyDisplayed = keys
    .map((key) => state.lastDisplayedOutcomeOddsByWindow.get(key))
    .find(Boolean);
  const cached = cachedOutcomeOddsForMarket(market);
  const resolved = completeOutcomeOdds(
    odds,
    previouslyDisplayed || (cached ? outcomeOddsFromCandidates([cached]) : null),
  );
  if (resolved.up !== null || resolved.down !== null) {
    const stored = {
      up: resolved.up,
      down: resolved.down,
      _odds_updated_micro: Date.now() * 1000,
    };
    keys.forEach((key) => state.lastDisplayedOutcomeOddsByWindow.set(key, stored));
  }
  return resolved;
}

function normalizeTradeSession(session, defaults) {
  const source = session && typeof session === "object" ? session : {};
  const positions = Array.isArray(source.positions)
    ? source.positions
    : Object.values(source.positions || {});
  return {
    ...defaults,
    ...source,
    starting_capital: metricNumber(source.starting_capital ?? source.paper_session_starting_capital) ?? defaults.starting_capital,
    current_capital: metricNumber(source.current_capital ?? source.paper_session_current_capital) ?? defaults.current_capital,
    total_pnl_dollars: metricNumber(
      source.total_pnl_dollars
        ?? source.realized_pnl_dollars
        ?? source.paper_session_total_pnl_dollars
        ?? source.paper_session_total_pnl,
    ) ?? defaults.total_pnl_dollars,
    realized_pnl_dollars: metricNumber(
      source.realized_pnl_dollars
        ?? source.total_pnl_dollars
        ?? source.paper_session_total_pnl_dollars
        ?? source.paper_session_total_pnl,
    ) ?? defaults.realized_pnl_dollars,
    available_capital: metricNumber(source.available_capital ?? source.paper_session_available_capital) ?? defaults.available_capital,
    committed_capital: metricNumber(source.committed_capital ?? source.paper_session_committed_capital) ?? defaults.committed_capital,
    market_count: metricNumber(source.market_count ?? source.paper_session_market_count) ?? defaults.market_count,
    market_limit: metricNumber(source.market_limit ?? source.paper_session_market_limit) ?? defaults.market_limit,
    positions,
    pnl_history: Array.isArray(source.pnl_history) ? source.pnl_history : [],
  };
}

function paperSession() {
  return normalizeTradeSession(state.paperSqlSession || state.workflow?.paper_trade?.session, DEFAULT_PAPER_SESSION);
}

function liveSession() {
  return normalizeTradeSession(state.workflow?.live_trade?.session, DEFAULT_LIVE_SESSION);
}

function tradeViewSession(isLiveView) {
  return isLiveView ? liveSession() : paperSession();
}

function paperSessionHistoryRows(session) {
  const history = Array.isArray(session?.pnl_history) ? session.pnl_history : [];
  const limit = Math.max(1, Math.min(metricNumber(session?.market_limit) ?? 36, 200));
  return history.slice(-limit);
}

function paperSessionRealizedPnl(session) {
  const history = paperSessionHistoryRows(session);
  if (history.length) {
    return history.reduce((total, row) => total + (metricNumber(row.pnl_dollars) ?? 0), 0);
  }
  return metricNumber(session?.total_pnl_dollars ?? session?.realized_pnl_dollars ?? session?.paper_session_total_pnl);
}

function paperSessionCommittedCapital(session) {
  const explicit = metricNumber(session?.committed_capital ?? session?.paper_session_committed_capital);
  if (explicit !== null) return explicit;
  const positions = Array.isArray(session?.positions) ? session.positions : [];
  return positions.reduce((total, position) => {
    if (String(position?.status || "") === "settled") return total;
    const filled = metricNumber(position?.filled_cost) ?? 0;
    const reserved = metricNumber(position?.reserved_notional ?? position?.order_notional) ?? 0;
    if (String(position?.status || "") === "canceled" && filled <= 0) return total;
    return total + (String(position?.status || "") === "canceled" ? filled : Math.max(filled, reserved));
  }, 0);
}

function paperSessionCapital(session) {
  const startingCapital = metricNumber(session?.starting_capital ?? session?.paper_session_starting_capital) ?? 100;
  const realizedPnl = paperSessionRealizedPnl(session);
  if (realizedPnl !== null) return startingCapital + realizedPnl;
  return metricNumber(session?.current_capital ?? session?.paper_session_current_capital);
}

function paperSessionPositionsForMarket(market) {
  return paperPositionsForMarket(market, []);
}

function paperPositionLabel(position) {
  const shares = metricNumber(position?.shares);
  const side = position?.side || "--";
  const price = metricNumber(position?.entry_price ?? position?.quote_price ?? position?.price);
  const status = String(position?.status || "");
  if (shares === null || price === null) return compactNote(position?.label || "position", 26);
  const suffix = status === "settled" ? " closed" : "";
  return `${shares.toFixed(shares >= 100 ? 0 : 2)} ${side} @ ${formatPrice(price)}${suffix}`;
}

function paperOpenQuoteLabel(position) {
  const side = position?.side || "--";
  const price = metricNumber(position?.quote_price ?? position?.entry_price ?? position?.price);
  if (price === null) return `Quote ${side}`;
  return `Quote ${side} @ ${formatPrice(price)}`;
}

function marketIdentityParts(market) {
  const start = marketWindowStartUnix(market);
  return new Set([
    paperGraphKey(market),
    market?.slug,
    market?.condition_id,
    market?.market_key,
    start === null ? null : `btc-updown-5m-${start}`,
    start === null ? null : `backend-live-btc-5m-${start}`,
    start === null ? null : String(start),
  ].filter(Boolean).map(String));
}

function rowMatchesPaperMarket(row, market) {
  if (!row || !market) return false;
  if (samePaperWindow(row, market)) return true;
  const parts = marketIdentityParts(market);
  const rowText = [
    row.slug,
    row.condition_id,
    row.market_key,
    row.signal_id,
    row.quote_id,
  ].filter(Boolean).map(String).join(" ");
  return [...parts].some((part) => rowText.includes(part));
}

function mergePositionRow(base, update) {
  const merged = { ...(base || {}), ...(update || {}) };
  const price = metricNumber(merged.entry_price ?? merged.quote_price ?? merged.price);
  const filledCost = metricNumber(merged.filled_cost);
  if ((metricNumber(merged.shares) === null || Number(merged.shares) <= 0) && price !== null && price > 0 && filledCost !== null) {
    merged.shares = filledCost / price;
  }
  return merged;
}

function paperEventPositionsForMarket(market, rawPoints = []) {
  const rows = [
    ...(rawPoints || []),
    ...paperMarkersFor(market),
  ].filter((row) => rowMatchesPaperMarket(row, market));
  const positions = new Map();
  rows.forEach((row) => {
    const eventType = String(row?.event_type || "");
    if (!eventType.startsWith("maker_paper_")) return;
    const quoteId = String(row.quote_id || `${row.slug || paperGraphKey(market)}:${row.side || ""}:event`);
    const existing = positions.get(quoteId) || { quote_id: quoteId };
    const update = {
      quote_id: quoteId,
      signal_id: row.signal_id || existing.signal_id,
      slug: row.slug || existing.slug,
      side: row.side || existing.side,
      generated_at: row.generated_at || existing.generated_at,
      time_unix: row.time_unix ?? existing.time_unix,
      entry_price: row.entry_price ?? row.quote_price ?? row.price ?? existing.entry_price,
      quote_price: row.quote_price ?? row.entry_price ?? row.price ?? existing.quote_price,
      price: row.price ?? existing.price,
      order_notional: row.order_notional ?? row.paper_session_order_notional ?? existing.order_notional,
      filled_cost: existing.filled_cost ?? 0,
      shares: existing.shares ?? 0,
      status: existing.status || "open_quote",
    };
    if (eventType === "maker_paper_quote") {
      update.status = "open_quote";
      update.reserved_notional = row.order_notional ?? row.paper_session_order_notional ?? existing.reserved_notional;
    } else if (eventType === "maker_paper_fill") {
      update.status = "filled";
      update.filled_cost = Math.max(
        metricNumber(existing.filled_cost) ?? 0,
        metricNumber(row.filled_cost ?? row.cumulative_filled_cost ?? row.order_notional) ?? 0,
      );
      update.shares = metricNumber(row.shares) ?? existing.shares;
    } else if (eventType === "maker_paper_cancel") {
      update.status = (metricNumber(existing.filled_cost) ?? 0) > 0 ? "filled" : "canceled";
      update.cancel_reason = row.reason;
      update.reserved_notional = metricNumber(existing.filled_cost) ?? 0;
    } else if (eventType === "maker_paper_settlement") {
      update.status = "settled";
      update.filled_cost = row.filled_cost ?? existing.filled_cost;
      update.pnl_dollars = row.pnl_dollars;
      update.winner = row.winner;
      update.outcome_win = row.outcome_win;
      update.reserved_notional = 0;
    }
    positions.set(quoteId, mergePositionRow(existing, update));
  });
  return [...positions.values()];
}

function paperPositionsForMarket(market, rawPoints = []) {
  if (!market) return [];
  const session = paperSession();
  const sessionPositions = Array.isArray(session.positions)
    ? session.positions
    : Object.values(session.positions || {});
  const merged = new Map();
  sessionPositions
    .filter((position) => rowMatchesPaperMarket(position, market))
    .forEach((position) => merged.set(String(position.quote_id || position.signal_id || position.label || merged.size), position));
  paperEventPositionsForMarket(market, rawPoints)
    .forEach((position) => merged.set(String(position.quote_id || position.signal_id || position.label || merged.size), mergePositionRow(merged.get(String(position.quote_id || position.signal_id || position.label || merged.size)), position)));
  return [...merged.values()].sort((left, right) => String(left.side || "").localeCompare(String(right.side || "")));
}

function paperPositionSummaryText(positions) {
  const held = (positions || []).filter((position) => (
    (metricNumber(position.filled_cost) ?? 0) > 0
    && !["canceled", "settled"].includes(String(position.status || ""))
  ));
  if (held.length) return held.map(paperPositionLabel).join(" | ");
  const openQuotes = (positions || []).filter((position) => String(position.status || "") === "open_quote");
  if (openQuotes.length) return openQuotes.map(paperOpenQuoteLabel).join(" | ");
  return "No position";
}

function paperPositionPanelRows(positions) {
  const rows = (positions || [])
    .map((position) => {
      const status = String(position.status || "");
      const filledCost = metricNumber(position.filled_cost) ?? 0;
      const orderNotional = metricNumber(position.order_notional ?? position.reserved_notional);
      const price = metricNumber(position.entry_price ?? position.quote_price ?? position.price);
      const shares = metricNumber(position.shares);
      const pnl = metricNumber(position.pnl_dollars);
      const side = position.side || "--";
      let label = "Position";
      let tone = "";
      if (status === "open_quote") label = "Open quote";
      if (status === "filled" || filledCost > 0) label = "Holding";
      if (status === "canceled") label = "Canceled";
      if (status === "settled") label = "Closed";
      if (status === "settled" && pnl !== null) tone = pnl < 0 ? "move-down" : "move-up";
      const value = shares !== null && shares > 0 && price !== null
        ? `${shares.toFixed(shares >= 100 ? 0 : 2)} ${side} @ ${formatPrice(price)}`
        : `${side}${price === null ? "" : ` @ ${formatPrice(price)}`}`;
      const detailParts = [];
      if (orderNotional !== null && orderNotional > 0) detailParts.push(`size ${moneyCents.format(orderNotional)}`);
      if (status === "canceled") detailParts.push(position.cancel_reason || "canceled");
      if (status === "settled" && pnl !== null) detailParts.push(formatSignedMoney(pnl));
      return {
        label,
        value,
        detail: detailParts.join(" | "),
        status,
        tone,
        time: metricNumber(position.time_unix) ?? (Date.parse(position.generated_at || "") / 1000 || 0),
        priority: status === "filled" ? 0 : status === "open_quote" ? 1 : status === "settled" ? 2 : 3,
      };
    })
    .sort((left, right) => left.priority - right.priority || right.time - left.time);
  const active = rows.filter((row) => ["Holding", "Open quote"].includes(row.label));
  if (active.length) return active.slice(0, 2);
  const closed = rows.filter((row) => row.label === "Closed");
  if (closed.length) return closed.slice(0, 2);
  return [{ label: "No position", value: "None", detail: "waiting for a fill", tone: "move-flat" }];
}

function latestSessionMetric(market, rawPoints, session, keys) {
  for (const key of keys) {
    const value = metricNumber(session?.[key]);
    if (value !== null) return value;
  }
  const rows = [
    ...(rawPoints || []),
    ...paperMarkersFor(market),
  ].filter((row) => rowMatchesPaperMarket(row, market));
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    for (const key of keys) {
      if (!key.startsWith("paper_session_")) continue;
      const value = metricNumber(rows[index]?.[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function renderPaperSessionHistory(session) {
  const history = paperSessionHistoryRows(session);
  const startingCapital = metricNumber(session?.starting_capital ?? session?.paper_session_starting_capital) ?? 100;
  const marketsSeen = metricNumber(session?.market_count) ?? 0;
  const marketLimit = metricNumber(session?.market_limit) ?? 36;
  let runningCapital = startingCapital;
  const chronologicalRows = history.map((row) => {
    const pnl = metricNumber(row.pnl_dollars);
    runningCapital += pnl ?? 0;
    return { ...row, _displayCapitalAfter: runningCapital };
  });
  const rows = chronologicalRows.length ? chronologicalRows.reverse().map((row) => {
    const pnl = metricNumber(row.pnl_dollars);
    const tone = pnl === null ? "" : pnl < 0 ? "is-loss" : "is-win";
    const slug = String(row.slug || "--").replace(/^btc-updown-5m-/, "");
    const position = row.position_label || paperPositionLabel({
      side: row.position_side || row.side,
      shares: row.position_shares,
      entry_price: row.position_entry_price,
    });
    return `
      <tr class="paper-session-row ${tone}">
        <td>${escapeHtml(slug)}</td>
        <td>${escapeHtml(position)}</td>
        <td>${escapeHtml(row.winner || "--")}</td>
        <td>${escapeHtml(formatSignedMoney(pnl))}</td>
        <td>${escapeHtml(moneyCents.format(metricNumber(row._displayCapitalAfter) ?? metricNumber(row.capital_after) ?? 0))}</td>
      </tr>`;
  }).join("") : `
      <tr class="paper-session-row is-empty">
        <td colspan="5">No closed buys yet. This section stays visible and fills in after the bot buys, holds, and the market closes.</td>
      </tr>`;
  return renderCollapsiblePanel(
    "session_pnl",
    "paper-session-history",
    "Historical Session P&L",
    `${chronologicalRows.length} closed | ${marketsSeen}/${marketLimit} markets`,
    `
      <table>
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col">Held Position</th>
            <th scope="col">Winner</th>
            <th scope="col">P&L</th>
            <th scope="col">Capital</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `,
    true,
  );
}

function outcomeBookProbability(row, side) {
  const bid = sideField(row, side, "bid");
  const ask = sideField(row, side, "ask");
  if (bid !== null && ask !== null) return (bid + ask) / 2;
  if (ask !== null) return ask;
  if (bid !== null) return bid;
  return null;
}

function outcomeDisplayBookProbability(row, side) {
  const ask = sideField(row, side, "ask");
  if (ask !== null) return clampOutcomeProbability(ask);
  const bid = sideField(row, side, "bid");
  const opposite = oppositeSideKey(side);
  const oppositeAsk = sideField(row, opposite, "ask");
  const oppositeBid = sideField(row, opposite, "bid");
  if (oppositeAsk !== null) return complementDisplayProbability(oppositeAsk);
  if (bid !== null && isResolvedBookPrice(bid)) return clampOutcomeProbability(bid);
  if (oppositeBid !== null && isResolvedBookPrice(oppositeBid)) return complementDisplayProbability(oppositeBid);
  return null;
}

function startMetadataFromSource(source, fallbackSource = "paper_market_start") {
  const startPrice = metricNumber(source?.start_price);
  const rawSource = source?.start_price_source
    || source?.btc_price_source
    || fallbackSource;
  if (!isPolymarketTruthSource(rawSource)) return null;
  const price = startPrice;
  if (price === null || price <= 0) return null;
  return {
    price,
    source: rawSource,
    eventTimeMicro: source?.start_event_time_micro || null,
    capturedAt: source?.generated_at || source?.ts || source?.btc_price_fetched_at || null,
  };
}

function isPolymarketTruthSource(source) {
  return isChainlinkDataStreamsSource(source);
}

function startSourceLabel(source) {
  const text = String(source || "");
  if (!text) return "source unknown";
  if (isChainlinkDataStreamsSource(text)) return "Chainlink";
  if (text === "binance_ws_trade_at_window_start") return "Binance WS start tick";
  if (text === "polymarket_paper_event") return "paper capture";
  if (text.includes("binance.com")) return "Binance REST capture";
  if (text === "binance") return "Binance capture";
  return compactNote(text.replace(/^https?:\/\//, ""), 34);
}

function preferredPaperStartMetadata(market) {
  const keys = paperStorageKeysForMarket(market);
  const candidates = [
    market,
    ...keys.flatMap((key) => state.workflow?._paperPointsByMarket?.get(key) || []),
    ...keys.flatMap((key) => state.workflow?._paperMarkersByMarket?.get(key) || []),
    ...keys.flatMap((key) => state.paperObservedPointsByMarket.get(key) || []),
    ...keys.flatMap((key) => state.paperObservedMarkersByMarket.get(key) || []),
  ].filter(Boolean);
  const starts = candidates
    .map((source) => startMetadataFromSource(source))
    .filter(Boolean);
  return starts.find((meta) => isPolymarketTruthSource(meta.source)) || null;
}

function bookSpreadText(bid, ask, formatter) {
  const bidNumber = metricNumber(bid);
  const askNumber = metricNumber(ask);
  if (bidNumber === null || askNumber === null) return "--";
  return formatter(askNumber - bidNumber);
}

function ageMsText(value) {
  const number = metricNumber(value);
  if (number === null) return null;
  if (number < 1000) return `${Math.round(number)}ms old`;
  return `${(number / 1000).toFixed(number < 10000 ? 1 : 0)}s old`;
}

function normalizeBookLevels(value) {
  const levels = Array.isArray(value) ? value : [];
  return levels
    .map((row) => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const price = metricNumber(row[0]);
      const size = metricNumber(row[1]);
      return price === null || size === null ? null : [price, size];
    })
    .filter(Boolean);
}

function polymarketBookDepthFromOutcomeBook(book) {
  if (!book || typeof book !== "object") return null;
  const bids = normalizeBookLevels(book.bids);
  const asks = normalizeBookLevels(book.asks);
  if (!bids.length && !asks.length) return null;
  return {
    bids,
    asks,
    ageMs: metricNumber(book.snapshot_age_ms),
    stale: Boolean(book.error) || Boolean(book.stale),
    source: book.source || "local_postgres_polymarket_order_books",
  };
}

function polymarketDepthSnapshotFromRow(row) {
  if (!row) return null;
  const books = row.books && typeof row.books === "object" ? row.books : null;
  const upFromBook = polymarketBookDepthFromOutcomeBook(books?.Up);
  const downFromBook = polymarketBookDepthFromOutcomeBook(books?.Down);
  const upBids = upFromBook?.bids || normalizeBookLevels(row.pm_up_bids);
  const upAsks = upFromBook?.asks || normalizeBookLevels(row.pm_up_asks);
  const downBids = downFromBook?.bids || normalizeBookLevels(row.pm_down_bids);
  const downAsks = downFromBook?.asks || normalizeBookLevels(row.pm_down_asks);
  if (!upBids.length && !upAsks.length && !downBids.length && !downAsks.length) return null;
  const sourceText = [
    row.polymarket_book_source,
    upFromBook?.source,
    downFromBook?.source,
  ].filter(Boolean).join(" ").toLowerCase();
  if (sourceText && !sourceText.includes("local_postgres_polymarket_order_books")) return null;
  const ages = [
    metricNumber(row.polymarket_book_max_age_ms),
    metricNumber(row.up_book_age_ms),
    metricNumber(row.down_book_age_ms),
    upFromBook?.ageMs,
    downFromBook?.ageMs,
  ].filter((value) => value !== null);
  return {
    row,
    upBids,
    upAsks,
    downBids,
    downAsks,
    source: "Rust Polymarket book recorder",
    sourceKind: "local_postgres_polymarket_order_books",
    ageMs: ages.length ? Math.max(...ages) : null,
    stale: Boolean(row.polymarket_book_stale) || Boolean(upFromBook?.stale) || Boolean(downFromBook?.stale),
  };
}

function latestPolymarketDepthSnapshotForMarket(market, rawPoints) {
  const candidates = [
    market,
    ...paperStorageKeysForMarket(market).flatMap((storageKey) => [
      state.livePersistedMarkets.get(storageKey),
      state.paperObservedMarkets.get(storageKey),
    ]),
    ...(rawPoints || []),
    ...paperMarkersFor(market),
    ...paperPointsFor(market),
  ].filter((row) => row && rowBelongsToMarketWindow(row, market));
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const snapshot = polymarketDepthSnapshotFromRow(candidates[index]);
    if (snapshot) return snapshot;
  }
  return null;
}

function selectedOrderBookSnapshot(market, rawPoints, latestRaw) {
  const depthSnapshot = latestExternalDepthSnapshotForMarket(market, rawPoints);
  if (depthSnapshot) return depthSnapshot;
  return {
    row: {},
    bids: [],
    asks: [],
    source: "Waiting for Binance depth WS",
    waiting: true,
  };
}

function polymarketBookTableRows(snapshot = null) {
  if (!snapshot) return [];
  const sideRows = (outcome, bookSide, levels) => {
    const isBuy = bookSide === "Bid";
    return levels.slice(0, 5).map(([price, shares], index) => ({
      outcome,
      side: `${isBuy ? "Buy" : "Sell"} ${index + 1}`,
      sideClass: isBuy ? "buy" : "sell",
      limit: formatPrice(price),
      shares: formatBookQty(shares),
      notional: formatBookMoney(price * shares),
    }));
  };
  return [
    ...sideRows("Up", "Ask", snapshot.upAsks || []),
    ...sideRows("Up", "Bid", snapshot.upBids || []),
    ...sideRows("Down", "Ask", snapshot.downAsks || []),
    ...sideRows("Down", "Bid", snapshot.downBids || []),
  ];
}

function renderPolymarketBookTable(market, rawPoints) {
  const snapshot = latestPolymarketDepthSnapshotForMarket(market, rawPoints);
  const rows = polymarketBookTableRows(snapshot);
  const ageText = ageMsText(snapshot?.ageMs);
  const sourceLabel = !snapshot
    ? "waiting for Rust Polymarket book recorder"
    : (snapshot.stale ? `Rust Polymarket book stale${ageText ? ` | ${ageText}` : ""}` : `Rust Polymarket book${ageText ? ` | ${ageText}` : ""}`);
  const body = rows.length ? rows.map((row) => `
    <tr class="paper-book-row is-${escapeHtml(row.sideClass || "neutral")}">
      <th scope="row">${escapeHtml(row.outcome)}</th>
      <td>${escapeHtml(row.side)}</td>
      <td>${escapeHtml(row.limit)}</td>
      <td>${escapeHtml(row.shares)}</td>
      <td>${escapeHtml(row.notional)}</td>
    </tr>`).join("") : `
    <tr class="paper-book-row is-neutral">
      <td colspan="5">Waiting for Rust Polymarket book recorder.</td>
    </tr>`;
  return renderCollapsiblePanel(
    "polymarket_depth",
    "paper-book-table",
    "Polymarket Up/Down Depth",
    sourceLabel,
    `
      <table>
        <thead>
          <tr>
            <th scope="col">Outcome</th>
            <th scope="col">Side</th>
            <th scope="col">Limit</th>
            <th scope="col">Shares</th>
            <th scope="col">Notional</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `,
    true,
  );
}

function orderBookTableRows(market, rawPoints, latestRaw, latestQuote, snapshot = null) {
  const bookSnapshot = snapshot || selectedOrderBookSnapshot(market, rawPoints, latestRaw);
  const { bids, asks } = bookSnapshot;
  if (!bids.length && !asks.length) return [];
  const sideRows = (bookSide, levels) => {
    const isBuy = bookSide === "Bid";
    return levels.slice(0, 8).map(([price, size], index) => ({
      side: `${isBuy ? "Buy" : "Sell"} ${index + 1}`,
      sideClass: isBuy ? "buy" : "sell",
      bookSide,
      limit: formatBookMoney(price),
      size: formatBookQty(size),
      notional: formatBookMoney(price * size),
    }));
  };
  return [
    ...sideRows("Ask", asks),
    ...sideRows("Bid", bids),
  ];
}

function renderOrderBookTable(market, rawPoints, latestRaw, latestQuote) {
  const snapshot = selectedOrderBookSnapshot(market, rawPoints, latestRaw);
  const rows = orderBookTableRows(market, rawPoints, latestRaw, latestQuote, snapshot);
  const ageText = ageMsText(snapshot.ageMs);
  const depthLabel = snapshot.waiting
    ? "waiting for Binance depth WS"
    : (snapshot.stale ? `Binance depth WS stale${ageText ? ` | ${ageText}` : ""}` : `Binance depth WS${ageText ? ` | ${ageText}` : ""}`);
  const body = rows.length ? rows.map((row) => `
    <tr class="paper-book-row is-${escapeHtml(row.sideClass || "neutral")}">
      <th scope="row">${escapeHtml(row.side)}</th>
      <td>${escapeHtml(row.limit)}</td>
      <td>${escapeHtml(row.size)}</td>
      <td>${escapeHtml(row.notional)}</td>
    </tr>`).join("") : `
    <tr class="paper-book-row is-neutral">
      <td colspan="4">Waiting for Binance depth WS.</td>
    </tr>`;
  return renderCollapsiblePanel(
    "binance_depth",
    "paper-book-table",
    "BTC Binance Depth",
    depthLabel,
    `
      <table>
        <thead>
          <tr>
            <th scope="col">Side</th>
            <th scope="col">Limit</th>
            <th scope="col">BTC Size</th>
            <th scope="col">Notional</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `,
    true,
  );
}

function paperMarkerTitle(row) {
  const pieces = [
    paperMarkerLabel(row),
    paperDecisionText(row),
    `${Math.round(paperPointSecondsLeft(row))}s left`,
  ];
  const btc = metricNumber(row.btc_price);
  if (btc !== null) pieces.push(`BTC ${formatPrice(btc)}`);
  const move = paperDollarMove(row);
  if (move !== null) pieces.push(formatDollarMove(move));
  const support = metricNumber(row.external_book_support);
  if (support !== null) pieces.push(`BTC book ${percentText(support)}`);
  const quotePrice = metricNumber(row.maker_quote_price ?? row.quote_price ?? row.bid_price ?? row.price);
  if (quotePrice !== null) pieces.push(`quote ${formatPrice(quotePrice)}`);
  const pnl = metricNumber(row.pnl_dollars);
  if (pnl !== null) pieces.push(`PnL ${formatSignedMoney(pnl)}`);
  return pieces.filter(Boolean).join(" | ");
}

function paperActionName(row) {
  const side = row?.side || row?.intended_outcome || row?.outcome || "";
  if (row?.decision === "paper_signal") return side === "Pair" ? "Setup matched on both sides" : `Setup matched for ${side || "this side"}`;
  if (row?.event_type === "maker_paper_quote") return `Opened a post-only bid for ${side || "this side"}`;
  if (row?.event_type === "maker_paper_fill") return `Bid filled for ${side || "this side"}`;
  if (row?.event_type === "maker_paper_cancel") return `Canceled ${side || "the"} bid`;
  if (String(row?.event_type || "").includes("settlement")) return "Closed position at market result";
  return paperDecisionText(row);
}

function paperBookPressureText(value) {
  if (value === null) return null;
  const abs = Math.abs(value);
  const strength = abs >= 0.25 ? "strongly" : abs >= 0.1 ? "clearly" : abs >= 0.02 ? "slightly" : "barely";
  if (value > 0.005) return `Binance book ${strength} supports this side (${percentText(value)}).`;
  if (value < -0.005) return `Binance book leans against this side (${percentText(value)}).`;
  return `Binance book is roughly neutral (${percentText(value)}).`;
}

function paperMicropriceText(value) {
  if (value === null || Math.abs(value) < 0.01) return null;
  if (value > 0) return `Binance microprice also supports this side.`;
  return `Binance microprice leans against this side.`;
}

function paperNoFillText(row) {
  const reason = String(row?.last_no_fill_reason || "");
  const matching = metricNumber(row?.last_matching_sell_notional);
  const queue = metricNumber(row?.last_queue_remaining_notional);
  const minFill = metricNumber(row?.last_min_fill_notional);
  if (reason === "no_matching_sell_flow_at_or_below_quote") {
    return "No seller traded this side at or below our bid while the quote was live.";
  }
  if (reason === "queue_ahead_not_cleared") {
    return queue !== null
      ? `Sellers traded near our bid, but about ${moneyCents.format(queue)} of visible queue was still ahead of us.`
      : "Sellers traded near our bid, but the visible queue ahead of us did not clear.";
  }
  if (reason === "visible_book_cross_did_not_clear_queue") {
    return queue !== null
      ? `The book crossed our bid, but about ${moneyCents.format(queue)} of visible queue was still ahead of us.`
      : "The book crossed our bid, but the visible size did not clear the queue ahead of us.";
  }
  if (reason === "matching_sell_flow_below_min_fill") {
    return minFill !== null
      ? `Seller flow after queue was too small to count as a fill; minimum fill is ${moneyCents.format(minFill)}.`
      : "Seller flow after queue was too small to count as a fill.";
  }
  if (reason === "trade_api_http_error" || reason === "trade_api_url_error") {
    return "The paper engine could not verify public trade flow, so it refused to assume a fill.";
  }
  if (reason === "order_already_filled") return "The quote was already fully filled.";
  if (reason === "no_fill_after_trade_scan") {
    return matching !== null
      ? `Verified ${moneyCents.format(matching)} of matching seller flow, but none was executable for this quote.`
      : "The paper engine checked public trades and found no executable fill.";
  }
  return null;
}

function paperFriendlyReason(row) {
  const reason = String(row?.reason || row?.fill_reason || "");
  const pairQuoteSum = metricNumber(row?.pair_quote_sum);
  const pairEdge = metricNumber(row?.pair_edge);
  const quotePrice = metricNumber(row?.maker_quote_price ?? row?.quote_price ?? row?.bid_price ?? row?.price ?? row?.entry_price);
  const side = row?.side || row?.intended_outcome || row?.outcome || "";
  if (reason === "base_pair_quote") {
    if (pairQuoteSum !== null && pairEdge !== null) {
      return `Buying both sides would cost ${moneyCents.format(pairQuoteSum)} per $1 payout, leaving about ${formatCents(pairEdge)} of room.`;
    }
    return "Both sides were cheap enough to quote below the $1 payout.";
  }
  if (reason === "already_signaled_market_side") {
    return "The bot already opened this setup for the current market, so it is not doubling up.";
  }
  if (reason === "pair_quote_too_expensive") {
    return pairQuoteSum !== null
      ? `The two sides cost ${formatPrice(pairQuoteSum)} together, which is too close to or above the $1 payout.`
      : "The two sides were not cheap enough to leave a clean edge.";
  }
  if (reason === "quote_non_positive") return "The available quote would be zero or invalid, so the bot stood down.";
  if (reason === "quote_horizon_expired") {
    const noFill = paperNoFillText(row);
    return noFill ? `The bid timed out. ${noFill}` : "The bid sat for its allowed time without a fill, so the bot canceled it.";
  }
  if (reason === "live_edge_below_threshold") {
    const noFill = paperNoFillText(row);
    return noFill ? `The bid was canceled because the edge moved against us. ${noFill}` : "The bid was canceled because the edge moved against us.";
  }
  const noFill = paperNoFillText(row);
  if (noFill) return noFill;
  if (reason === "bid_traded_through_quote" || reason === "same_outcome_sell_flow_crossed_quote") {
    return quotePrice !== null
      ? `A seller hit through our ${formatPrice(quotePrice)} bid, so the paper engine counted it as a fill.`
      : "A seller traded through our bid, so the paper engine counted it as a fill.";
  }
  if (reason === "visible_book_crossed_resting_bid") {
    return quotePrice !== null
      ? `The visible book crossed our ${formatPrice(quotePrice)} bid after clearing the queue ahead, so the paper engine counted it as a fill.`
      : "The visible book crossed our bid after clearing the queue ahead, so the paper engine counted it as a fill.";
  }
  if (reason === "visible_bid_queue_consumed") return "Enough visible sell flow passed our queue estimate, so the paper engine counted a fill.";
  if (reason === "final_no_trade_window") return "The market was too close to the end, so the bot avoided opening new risk.";
  if (reason === "missing_order_book" || reason === "missing_ask") return "The Polymarket book was incomplete, so the bot could not quote safely.";
  if (reason === "chainlink_data_streams_truth_missing") return "Chainlink truth was missing, so the bot refused to use a backup price.";
  if (reason === "external_book_missing") return "The Binance external order book was missing, so the pressure signal was unavailable.";
  if (reason === "external_trade_flow_missing") return "The Binance trade-flow signal was missing, so the pressure signal was unavailable.";
  if (reason === "market_not_accepting_orders") return "Polymarket was not accepting orders for this market.";
  if (row?.decision === "paper_signal" && side) return `The rule allowed a maker bid for ${side}.`;
  return rejectReasonLabel(reason) || "--";
}

function paperActionWhy(row) {
  const type = paperMarkerType(row);
  const pieces = [];
  if (row?.decision === "paper_signal") {
    pieces.push(paperFriendlyReason(row));
  } else if (type === "quote") {
    pieces.push("Posted a maker bid; this is paper-only and waits for someone else to sell into it.");
  } else if (type === "fill") {
    pieces.push(paperFriendlyReason(row));
  } else if (type === "cancel") {
    pieces.push(paperFriendlyReason(row));
  } else if (type === "settlement") {
    pieces.push(row?.outcome_win === true ? "The held side won and paid out." : row?.outcome_win === false ? "The held side lost and settled at zero." : "The market settled.");
  }
  const quotePrice = metricNumber(row?.maker_quote_price ?? row?.quote_price ?? row?.bid_price ?? row?.price);
  if (quotePrice !== null && ["quote", "fill", "cancel", "signal"].includes(type)) {
    pieces.push(`Bid ${formatPrice(quotePrice)}`);
  }
  const notional = metricNumber(row?.filled_cost ?? row?.order_notional ?? row?.paper_session_order_notional);
  if (notional !== null && ["quote", "fill", "cancel", "signal"].includes(type)) {
    pieces.push(`${type === "fill" ? "Filled" : "Target size"} ${moneyCents.format(notional)}`);
  }
  const bankrollMax = metricNumber(row?.bankroll_max_order);
  if (bankrollMax !== null && ["quote", "signal"].includes(type)) {
    pieces.push(`Bankroll cap ${moneyCents.format(bankrollMax)}`);
  }
  const kelly = metricNumber(row?.bankroll_fractional_kelly_fraction);
  if (kelly !== null && ["quote", "signal"].includes(type)) {
    pieces.push(`Kelly size ${(kelly * 100).toFixed(1)}%`);
  }
  const fairEdge = metricNumber(row?.fair_edge ?? row?.fair_edge_vs_signal_bid);
  if (fairEdge !== null) pieces.push(`Estimated room ${formatCents(fairEdge)}`);
  const support = metricNumber(row?.external_book_support);
  const bookPressure = paperBookPressureText(support);
  if (bookPressure) pieces.push(bookPressure);
  const microSupport = metricNumber(row?.external_book_microprice_support_bps);
  const microprice = paperMicropriceText(microSupport);
  if (microprice) pieces.push(microprice);
  const pnl = metricNumber(row?.pnl_dollars);
  if (pnl !== null) pieces.push(`Result ${formatSignedMoney(pnl)}`);
  return pieces.filter(Boolean).join(" ") || "--";
}

function paperActionTimeText(row) {
  const elapsed = paperPointElapsedSeconds(row);
  if (Number.isFinite(elapsed)) return `${Math.round(elapsed)}s`;
  const parsed = Date.parse(row?.generated_at || row?.ts || "");
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "--";
}

function isPaperActionLogRow(row) {
  if (!row) return false;
  const eventType = String(row.event_type || "");
  return eventType === "maker_paper_quote"
    || eventType === "maker_paper_fill"
    || eventType === "maker_paper_cancel"
    || eventType === "maker_paper_settlement";
}

function paperActionBuyText(row) {
  const type = paperMarkerType(row);
  if (type === "quote" || type === "fill") return "yes";
  if (type === "cancel") return "cancel";
  if (type === "settlement") return "close";
  return "action";
}

function paperActionLogRows(market, rawPoints) {
  const rows = [
    ...(rawPoints || []),
    ...paperMarkersFor(market),
  ].filter(isPaperActionLogRow);
  const seen = new Set();
  const sorted = rows
    .filter((row, index) => {
      const key = row.point_id
        || row.event_id
        || `${row.event_type || row.decision}:${row.quote_id || ""}:${row.signal_id || ""}:${paperRowTimeMicro(row, index)}:${row.reason || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => paperRowTimeMicro(left) - paperRowTimeMicro(right));
  return sorted.slice(-14).reverse();
}

function renderPaperActionLog(market, rawPoints) {
  const rows = paperActionLogRows(market, rawPoints);
  const body = rows.length
    ? rows.map((row) => {
      const buy = paperActionBuyText(row);
      const tone = buy === "yes" ? "yes" : "neutral";
      return `
        <tr class="paper-action-row is-${escapeHtml(tone)}">
          <td>${escapeHtml(paperActionTimeText(row))}</td>
          <td><span class="paper-action-pill is-${escapeHtml(tone)}">${escapeHtml(buy)}</span></td>
          <td>${escapeHtml(paperActionName(row))}</td>
          <td>${escapeHtml(paperActionWhy(row))}</td>
        </tr>`;
    }).join("")
    : `<tr><td colspan="4">No performed actions yet.</td></tr>`;
  return renderCollapsiblePanel(
    "action_log",
    "paper-action-log",
    "Algorithm Action Log",
    "latest first",
    `
      <table>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Result</th>
            <th scope="col">Action</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `,
    true,
  );
}

function renderPaperDecisionGraph(options = {}) {
  const isLiveView = options.mode === "live";
  const market = selectedPaperMarket();
  const rawPoints = market ? paperChartPointsFor(market) : [];
  const chart = byId(options.chartId || "paperChart");
  const selectedCurrent = (state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE && isCurrentPaperMarket(market);
  const emptyAuxHtml = renderPaperEmptyAuxHtml({
    chartId: chart?.id || options.chartId || "paperChart",
    selectedCurrent,
    market,
    isLiveView,
  });
  if (!market || !rawPoints.length) {
    if ((state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE) {
      const loadingExtras = [
        renderPaperOddsStrip(market, null, null),
        emptyAuxHtml,
      ].join("");
      if (market && !verifiedPaperStartPrice(market)) {
        const startStatus = market.start_price_status || liveStartMetadata(market).start_price_status || "loading";
        const startError = market.start_price_error || liveStartMetadata(market).start_price_error || "";
        setPaperChartContent(chart, svgEmpty(startStatus === "error"
          ? `Start error${startError ? `: ${startError}` : ""}.`
          : "Loading start."), loadingExtras);
        return;
      }
      setPaperChartContent(chart, svgEmpty("Loading ticks."), loadingExtras);
      return;
    }
    setPaperChartContent(chart, svgEmpty("No path."), emptyAuxHtml);
    return;
  }

  const startMeta = preferredPaperStartMetadata(market);
  const priceRows = rawPoints;
  let truthRows = priceRows.filter(isPolymarketTruthPoint);
  const marketTruthPoint = chainlinkPointFromMarket(market);
  if (marketTruthPoint && !truthRows.some((row) => row.point_id === marketTruthPoint.point_id || row.event_time_micro === marketTruthPoint.event_time_micro)) {
    truthRows = [...truthRows, marketTruthPoint];
  }
  const fullWindowTruthRows = liveTickPointsForMarket(market)
    .filter((row) => rowBelongsToMarketWindow(row, market))
    .filter(isPolymarketTruthPoint);
  const truthSampleRows = fullWindowTruthRows.length
    ? mergePaperChartRows(truthRows, fullWindowTruthRows)
    : truthRows;
  const directExternalCandidates = liveTickPointsForCurrentWindow(
    market,
    (row) => isExternalPricePoint(row) && !isPolymarketTruthPoint(row),
  );
  const externalCandidates = mergePaperChartRows(
    priceRows.filter((row) => isExternalPricePoint(row) && !isPolymarketTruthPoint(row)),
    directExternalCandidates,
  );
  const externalRows = externalLineRows(externalCandidates);
  const fullWindowExternalRows = externalLineRows(
    liveTickPointsForMarket(market)
      .filter((row) => rowBelongsToMarketWindow(row, market))
      .filter((row) => isExternalPricePoint(row) && !isPolymarketTruthPoint(row)),
  );
  const externalBaselineRows = fullWindowExternalRows.length ? fullWindowExternalRows : externalRows;
  const externalStartPrice = graphBaselinePrice(externalBaselineRows, "binance", startMeta?.price, true);
  const externalStartAnchor = sourceStartAnchorSample(externalBaselineRows, "binance", externalStartPrice, true);
  const externalSampleRows = fullWindowExternalRows.length ? fullWindowExternalRows : externalRows;
  const rawExternalSamples = externalStartPrice === null ? [] : [
    ...(externalStartAnchor ? [externalStartAnchor] : []),
    ...paperGraphSamples(externalSampleRows, externalStartPrice, "binance"),
  ].sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  const startAnchorSample = chainlinkStartAnchorSample(market, startMeta);
  const rawTruthSamples = (startMeta ? [
    ...(startAnchorSample ? [startAnchorSample] : []),
    ...paperGraphSamples(truthSampleRows, startMeta.price, "chainlink"),
  ] : [])
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  const latestElapsedSeed = newestElapsedSeconds(rawTruthSamples, rawExternalSamples);
  const truthSamples = selectedCurrent ? limitLiveSamplesForRender(rawTruthSamples, latestElapsedSeed) : rawTruthSamples;
  const externalSamples = selectedCurrent ? limitLiveSamplesForRender(rawExternalSamples, latestElapsedSeed) : rawExternalSamples;
  const allSamples = [...truthSamples, ...externalSamples]
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);

  if (!allSamples.length) {
    const hasPrices = priceRows.some((row) => metricNumber(row?.btc_price) !== null);
    const waitingExtras = [
      renderPaperOddsStrip(market, null, null),
      emptyAuxHtml,
    ].join("");
    setPaperChartContent(chart, svgEmpty(hasPrices && !startMeta ? "Waiting for Polymarket start." : "No usable points."), waitingExtras);
    return;
  }

  const compact = isCompactPaperChart();
  const view = compact ? { width: 390, height: 430 } : { width: 980, height: 540 };
  const plot = compact
    ? { left: 58, right: 16, top: 36, height: 280 }
    : { left: 76, right: 306, top: 42, height: 360 };
  const plotWidth = view.width - plot.left - plot.right;
  const plotBottom = plot.top + plot.height;
  const realTruthSamples = truthSamples;
  const latestTruth = realTruthSamples[realTruthSamples.length - 1] || null;
  const latestExternal = externalSamples[externalSamples.length - 1] || null;
  const truthDisplaySample = freshestTruthDisplaySample(market, realTruthSamples, marketTruthPoint);
  const displayedTruthSample = latestAuthoritativeTruthSample(market, realTruthSamples, marketTruthPoint) || truthDisplaySample;
  const latest = displayedTruthSample || latestTruth || truthSamples[truthSamples.length - 1] || latestExternal || allSamples[allSamples.length - 1];
  const latestDomainSample = allSamples[allSamples.length - 1] || truthSamples[truthSamples.length - 1];
  const latestElapsed = Number.isFinite(latestElapsedSeed)
    ? latestElapsedSeed
    : (Number.isFinite(latestDomainSample.elapsedSeconds)
      ? latestDomainSample.elapsedSeconds
      : Math.max(0, 300 - latestDomainSample.secondsLeft));
  const xDomain = selectedCurrent ? livePaperXDomain(market, latestElapsed) : { min: 0, max: 300 };
  if (xDomain.max - xDomain.min < 1) xDomain.max = xDomain.min + 1;
  const samples = allSamples.filter((point) => point.elapsedSeconds >= xDomain.min && point.elapsedSeconds <= xDomain.max);
  const visibleSamples = samples.length ? samples : allSamples.slice(-1);
  const visibleTruthSamples = visibleSamplesWithCarry(truthSamples, xDomain);
  const visibleExternalSamples = visibleSamplesWithCarry(externalSamples, xDomain);
  const useUPlot = canUseUPlot();
  const maxLinePoints = selectedCurrent ? liveRenderPointLimit(plotWidth, useUPlot) : LIVE_TICK_RENDER_MAX_POINTS;
  const truthLineSamples = selectedCurrent
    ? stableLiveLineSamples(visibleTruthSamples, LIVE_CHAINLINK_RENDER_BUCKET_SECONDS, maxLinePoints, xDomain)
    : visibleTruthSamples;
  const externalLineSamples = selectedCurrent
    ? stableLiveLineSamples(visibleExternalSamples, LIVE_BINANCE_RENDER_BUCKET_SECONDS, maxLinePoints, xDomain)
    : visibleExternalSamples;
  const xForElapsed = (elapsedSeconds) => {
    const clamped = Math.max(xDomain.min, Math.min(xDomain.max, Number(elapsedSeconds)));
    return plot.left + ((clamped - xDomain.min) / (xDomain.max - xDomain.min)) * plotWidth;
  };
  const dollarDomain = selectedCurrent ? livePaperDollarDomain(market, visibleSamples) : paperDollarDomain(visibleSamples, 2);
  const yForDollarMove = (value) => plot.top + ((dollarDomain.max - Number(value)) / (dollarDomain.max - dollarDomain.min)) * plot.height;
  const truthLinePoints = compressLinePoints(truthLineSamples.map((point) => ({
    x: xForElapsed(point.elapsedSeconds),
    y: yForDollarMove(point.dollarMove),
    sample: point,
    elapsedSeconds: point.elapsedSeconds,
  })), selectedCurrent ? 0 : 0.75);
  const externalLinePoints = compressLinePoints(externalLineSamples.map((point) => ({
    x: xForElapsed(point.elapsedSeconds),
    y: yForDollarMove(point.dollarMove),
    sample: point,
    elapsedSeconds: point.elapsedSeconds,
  })), selectedCurrent ? 0 : 0.75);
  const headCandidates = [...truthLineSamples, ...externalLineSamples]
    .filter((point) => point && Number.isFinite(point.elapsedSeconds) && Number.isFinite(point.dollarMove))
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  const renderedTruthHeadPoint = latestRenderedLinePoint(truthLinePoints);
  const renderedHeadPoint = renderedTruthHeadPoint;
  const headSample = selectedCurrent
    ? (renderedHeadPoint?.sample || displayedTruthSample || latestTruth)
    : latest;
  const hasTruthHead = Boolean(headSample);
  const headX = hasTruthHead ? (renderedHeadPoint?.x ?? xForElapsed(headSample.elapsedSeconds)) : null;
  const headY = hasTruthHead ? (renderedHeadPoint?.y ?? yForDollarMove(headSample.dollarMove)) : null;
  const rule = activeRule();
  const bandRect = (startElapsed, endElapsed, className) => {
    const left = Math.max(xDomain.min, Math.min(startElapsed, endElapsed));
    const right = Math.min(xDomain.max, Math.max(startElapsed, endElapsed));
    if (right <= left) return "";
    const x = xForElapsed(left);
    const width = xForElapsed(right) - x;
    return `<rect class="${className}" x="${x}" y="${plot.top}" width="${width}" height="${plot.height}"></rect>`;
  };
  const decisionBand = bandRect(300 - (rule.max_seconds_left ?? 120), 300 - (rule.min_seconds_left ?? 61), "decision-band");
  const closeBand = bandRect(280, 300, "paper-close-band");
  const xMinorStart = Math.ceil(xDomain.min);
  const xMinorEnd = Math.floor(xDomain.max);
  const xMinorTicks = Array.from({ length: Math.max(0, xMinorEnd - xMinorStart + 1) }, (_, index) => xMinorStart + index)
    .map((tick) => {
      const x = xForElapsed(tick);
      return `<line class="grid grid-minor" x1="${x}" y1="${plot.top}" x2="${x}" y2="${plotBottom}"></line>`;
    }).join("");
  const xMajorStep = selectedCurrent ? 5 : 60;
  const xMajorStart = Math.ceil(xDomain.min / xMajorStep) * xMajorStep;
  const xMajorTicks = [];
  for (let tick = xMajorStart; tick <= xDomain.max + 0.001; tick += xMajorStep) {
    xMajorTicks.push(tick);
  }
  if (!xMajorTicks.some((tick) => Math.abs(tick - xDomain.min) < 0.001)) xMajorTicks.unshift(xDomain.min);
  if (!xMajorTicks.some((tick) => Math.abs(tick - xDomain.max) < 0.001)) xMajorTicks.push(xDomain.max);
  const xTicks = xMajorTicks.map((tick) => {
    const x = xForElapsed(tick);
    return `<line class="grid grid-major" x1="${x}" y1="${plot.top}" x2="${x}" y2="${plotBottom}"></line><text class="tick" x="${x}" y="${plotBottom + 24}" text-anchor="middle">${Math.round(tick)}s</text>`;
  }).join("");
  const yTickValues = [dollarDomain.min, (dollarDomain.min + dollarDomain.max) / 2, dollarDomain.max];
  if (dollarDomain.min < 0 && dollarDomain.max > 0) yTickValues.push(0);
  yTickValues.sort((left, right) => left - right);
  const yTicks = yTickValues.map((tick) => {
    const y = yForDollarMove(tick);
    return `<line class="${Math.abs(tick) < 0.005 ? "axis-zero" : "grid"}" x1="${plot.left}" y1="${y}" x2="${plot.left + plotWidth}" y2="${y}"></line><text class="tick" x="${plot.left - 10}" y="${y + 4}" text-anchor="end">${formatDollarMove(tick)}</text>`;
  }).join("");

  const nearestTruthSample = (row) => {
    const markerElapsed = paperPointElapsedSeconds(row);
    const candidates = truthSamples
      .filter((sample) => sample.row)
      .filter((sample) => Number.isFinite(sample.elapsedSeconds) && Number.isFinite(sample.dollarMove));
    if (!candidates.length || !Number.isFinite(markerElapsed)) return null;
    let best = candidates[0];
    let bestDelta = Math.abs(candidates[0].elapsedSeconds - markerElapsed);
    candidates.forEach((sample) => {
      const delta = Math.abs(sample.elapsedSeconds - markerElapsed);
      if (delta < bestDelta) {
        best = sample;
        bestDelta = delta;
      }
    });
    return bestDelta <= 5 ? best : null;
  };
  const seenMarkers = new Set();
  const markerRows = [...paperMarkersFor(market)]
    .filter((row) => paperMarkerType(row) !== "fail")
    .filter((row) => {
      const key = `${paperMarkerType(row)}:${row.generated_at || row.ts || ""}:${row.seconds_left ?? ""}:${row.quote_id || ""}`;
      if (seenMarkers.has(key)) return false;
      seenMarkers.add(key);
      return true;
    })
    .slice(-90);
  const eventDots = markerRows.map((row) => {
    const markerSample = nearestTruthSample(row);
    if (!markerSample) return "";
    const elapsedSeconds = markerSample.elapsedSeconds;
    const secondsLeft = Math.max(0, 300 - elapsedSeconds);
    const dollarMove = markerSample.dollarMove;
    if (!Number.isFinite(secondsLeft) || !Number.isFinite(dollarMove)) return "";
    if (elapsedSeconds < xDomain.min || elapsedSeconds > xDomain.max) return "";
    const x = xForElapsed(elapsedSeconds);
    const y = yForDollarMove(dollarMove);
    const type = paperMarkerType(row);
    return `
      <circle class="dot ${type}" cx="${x}" cy="${y}" r="6">
        <title>${escapeHtml(paperMarkerTitle(row))}</title>
      </circle>
	      <text class="paper-marker-label" x="${x + 8}" y="${y - 8}">${escapeHtml(paperMarkerLabel(row))}</text>`;
  }).join("");
  const truthPath = truthLinePoints.length
    ? `<path class="line line-chainlink" d="${selectedCurrent ? stepPathFrom(truthLinePoints, LIVE_CHAINLINK_MAX_LINE_GAP_SECONDS) : pathFrom(truthLinePoints, LIVE_CHAINLINK_MAX_LINE_GAP_SECONDS)}"></path>`
    : "";
  const externalPath = externalLinePoints.length
    ? `<path class="line line-external" d="${selectedCurrent ? stepPathFrom(externalLinePoints, LIVE_BINANCE_MAX_LINE_GAP_SECONDS) : pathFrom(externalLinePoints, LIVE_BINANCE_MAX_LINE_GAP_SECONDS)}"></path>`
    : "";
  const truthLabel = chainlinkLineLabel(truthSampleRows);
  const externalLabel = externalLineLabel(externalRows);
  const chartHeaderHtml = renderPaperChartHeader(market);
  const anchorDot = (points, className, label) => {
    const point = points[0];
    if (!point) return "";
    return `<circle class="dot ${className}" cx="${point.x}" cy="${point.y}" r="4.8"><title>${escapeHtml(label)}</title></circle>`;
  };
  const chainlinkStartDot = anchorDot(truthLinePoints, "chainlink-anchor", `${truthLabel} open anchor`);
  const externalStartDot = anchorDot(externalLinePoints, "external-anchor", `${externalLabel} open anchor`);

  const latestRaw = headSample?.row || marketTruthPoint || market || {};
  const latestBookRaw = latestBookRowForMarket(market, rawPoints) || latestRaw;
  const latestQuote = [...paperMarkersFor(market)].reverse().find((row) => ["quote", "fill"].includes(paperMarkerType(row)));
  const settlement = [...paperMarkersFor(market)].reverse().find((row) => paperMarkerType(row) === "settlement");
  const pnl = metricNumber(settlement?.pnl_dollars ?? market.pnl_dollars ?? market.maker_pnl_dollars);
  const modeText = selectedCurrent
    ? `live, updated ${ageText(paperDisplayUpdatedAt(market))}`
    : `past, updated ${ageText(paperDisplayUpdatedAt(market))}`;
  const resultText = settlement
    ? `${paperDecisionText(settlement)} | ${pnl === null ? "--" : formatSignedMoney(pnl)}`
    : (market.winner ? `${market.winner} won | ${pnl === null ? "--" : formatSignedMoney(pnl)}` : "--");
  const latestTradeTime = latestRaw?.trade_time_micro
    ? formatMicroTimestamp(latestRaw.trade_time_micro)
    : (latestRaw.time_unix ? formatMicroTimestamp(Number(latestRaw.time_unix) * 1_000_000) : "--");
  const fairProbability = metricNumber(latestRaw.fair_probability);
  const fairEdge = metricNumber(latestRaw.fair_edge);
  const startPrice = metricNumber(startMeta?.price);
  const currentDisplaySample = displayedTruthSample;
  const currentPrice = metricNumber(currentDisplaySample?.btcPrice);
  const priceDifference = currentPrice !== null && startPrice !== null ? currentPrice - startPrice : null;
  const moveClass = moveToneClass(priceDifference);
  const outcomeOdds = paperPanelDisplayOutcomeProbabilities(market, latestRaw, latestBookRaw);
  const upProbability = outcomeOdds.up;
  const downProbability = outcomeOdds.down;
  const session = tradeViewSession(isLiveView);
  const currentPositions = isLiveView ? [] : paperPositionsForMarket(market, rawPoints);
  const positionRows = isLiveView
    ? [{ label: "No live positions", value: "Live disabled", detail: "Manual enable required", tone: "move-flat" }]
    : paperPositionPanelRows(currentPositions);
  const sessionCapital = isLiveView
    ? null
    : paperSessionCapital(session)
      ?? latestSessionMetric(market, rawPoints, session, ["paper_session_current_capital", "current_capital"]);
  const sessionPnl = isLiveView
    ? null
    : paperSessionRealizedPnl(session)
      ?? latestSessionMetric(market, rawPoints, session, ["paper_session_total_pnl", "paper_session_total_pnl_dollars", "total_pnl_dollars", "realized_pnl_dollars"]);
  const marketMetrics = [
    { label: "Start price", value: startPrice === null ? "Waiting" : formatBookMoney(startPrice) },
    { label: "Current price", value: currentPrice === null ? "Waiting" : formatBookMoney(currentPrice) },
    { label: "Difference", value: priceDifference === null ? "Waiting" : formatDollarMove(priceDifference), tone: moveClass },
  ];
  const accountMetrics = isLiveView
    ? [
        { label: "Real balance", value: "Disabled" },
        { label: "Live P&L", value: "--" },
      ]
    : [
        { label: "Capital", value: sessionCapital === null ? "--" : moneyCents.format(sessionCapital) },
        { label: "Session P&L", value: formatSignedMoney(sessionPnl), tone: sessionPnl === null ? "" : sessionPnl < 0 ? "move-down" : "move-up" },
      ];
  const renderPanelMetric = (row, x, y, options = {}) => {
    const valueClass = options.valueClass || "";
    if (options.inline) {
      return `
      <text class="paper-side-label" x="${x}" y="${y}">${escapeHtml(row.label)}</text>
      <text class="paper-side-value is-inline ${row.tone || ""} ${valueClass}" x="${x + 226}" y="${y}" text-anchor="end">${escapeHtml(String(row.value))}</text>`;
    }
    return `
      <text class="paper-side-label" x="${x}" y="${y}">${escapeHtml(row.label)}</text>
      <text class="paper-side-value ${row.tone || ""} ${valueClass}" x="${x}" y="${y + 27}">${escapeHtml(String(row.value))}</text>`;
  };
  const renderPanelSection = (title, top, height, rows, options = {}) => {
    const x = 716;
    const rowGap = options.rowGap || 48;
    return `
      <rect class="paper-side-section" x="708" y="${top}" width="242" height="${height}" rx="6"></rect>
      <text class="paper-side-section-title" x="${x}" y="${top + 22}">${escapeHtml(title)}</text>
      ${rows.map((row, index) => renderPanelMetric(row, x, top + 46 + index * rowGap, options)).join("")}`;
  };
  const renderPositionPanel = () => {
    const x = 716;
    return `
      <rect class="paper-side-section is-positions" x="708" y="288" width="242" height="144" rx="6"></rect>
      <text class="paper-side-section-title" x="${x}" y="314">POSITIONS</text>
      ${positionRows.map((row, index) => {
        const y = 341 + index * 50;
        return `
          <text class="paper-position-status ${row.tone || ""}" x="${x}" y="${y}">${escapeHtml(row.label)}</text>
          <text class="paper-position-value ${row.tone || ""}" x="${x}" y="${y + 17}">${escapeHtml(compactNote(row.value, 18))}</text>
          ${row.detail ? `<text class="paper-position-detail" x="${x}" y="${y + 32}">${escapeHtml(compactNote(row.detail, 20))}</text>` : ""}`;
      }).join("")}`;
  };
  const infoRows = compact ? "" : `
    <rect class="note-box" x="696" y="42" width="266" height="444" rx="6"></rect>
    ${renderPanelSection("MARKET", 56, 124, marketMetrics, { rowGap: 33, inline: true })}
    ${renderPanelSection("ACCOUNT", 192, 84, accountMetrics, { rowGap: 33, inline: true })}
    ${renderPositionPanel()}`;
  const mobileMetrics = [
    ...marketMetrics,
    ...accountMetrics,
    { label: "Positions", value: positionRows.map((row) => `${row.label}: ${row.value}`).join(" | "), compact: true },
  ];
  const compactInfoRows = compact
    ? `<div class="paper-mobile-stats">${mobileMetrics.map((row) => `
        <div class="paper-mobile-stat">
          <span>${escapeHtml(row.label)}</span>
          <strong class="${escapeHtml(row.tone || "")}">${escapeHtml(String(row.value))}</strong>
        </div>`).join("")}</div>`
    : "";
  const latestTitle = [
    hasTruthHead ? `latest ${Math.round(headSample.elapsedSeconds)}s in` : "waiting for Chainlink",
    hasTruthHead ? truthLabel : "Chainlink",
    hasTruthHead ? `BTC ${formatBookMoney(headSample.btcPrice)}` : "BTC waiting",
    hasTruthHead ? formatDollarMove(headSample.dollarMove) : "move waiting",
    hasTruthHead && headSample.source === "chainlink" && latestRaw.receive_time_micro
      ? `event ${latestTradeTime}, received ${formatMicroTimestamp(latestRaw.receive_time_micro)}`
      : latestTradeTime,
    paperDecisionText(latestRaw),
  ].join(" | ");

  const liveNotice = isLiveView
    ? `<div class="live-mode-strip">Live trading is disabled. This is the same current-market view; real balance, orders, fills, and positions plug in here only after manual live approval.</div>`
    : "";
  const oddsStrip = renderPaperOddsStrip(market, latestRaw, latestBookRaw, outcomeOdds);
  const auxHtml = renderPaperAuxHtml({
    chartId: chart.id || options.chartId || "paperChart",
    selectedCurrent,
    market,
    rawPoints,
    latestRaw,
    latestBookRaw,
    latestQuote,
    session,
    isLiveView,
  });

  const chartAriaLabel = isLiveView ? "Live trade BTC path and events" : "Paper trade BTC path and events";
  const sideHtml = compact ? "" : renderPaperLiveSideHtml(marketMetrics, accountMetrics, positionRows);
  let visualHtml = "";
  if (useUPlot) {
    visualHtml = `${liveNotice}
      ${chartHeaderHtml}
      <div class="paper-live-fast" role="img" aria-label="${escapeHtml(chartAriaLabel)}">
        <div class="paper-live-plot-wrap">
          <div class="paper-live-uplot"></div>
        </div>
        <div class="paper-live-side-slot"></div>
      </div>
      <div class="paper-live-status-slot"></div>`;
  } else {
    visualHtml = `${liveNotice}
      ${chartHeaderHtml}
      <svg class="paper-live-svg" viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="${chartAriaLabel}">
        <title>${escapeHtml(`${paperMarketLabel(market)} | ${latestTitle}`)}</title>
        <rect class="plot" x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plot.height}"></rect>
        ${decisionBand}
        ${closeBand}
        ${xMinorTicks}
        ${xTicks}
        ${yTicks}
        ${truthPath}
        ${externalPath}
        ${chainlinkStartDot}
        ${externalStartDot}
        ${eventDots}
        ${hasTruthHead ? `<line class="paper-latest-line" x1="${headX}" y1="${plot.top}" x2="${headX}" y2="${plotBottom}"></line>` : ""}
        ${hasTruthHead ? `<circle class="dot latest ${selectedCurrent ? "live-now" : ""}" cx="${headX}" cy="${headY}" r="6">
          <title>${escapeHtml(latestTitle)}</title>
        </circle>` : ""}
        ${infoRows}
      </svg>
      ${oddsStrip}
      ${compactInfoRows}`;
  }
  const auxContent = auxHtml;
  setPaperChartContent(chart, visualHtml, auxContent);
  if (useUPlot) {
    const fastChart = chart.querySelector(".paper-live-fast");
    if (fastChart) fastChart.setAttribute("title", `${paperMarketLabel(market)} | ${latestTitle}`);
    const sideSlot = chart.querySelector(".paper-live-side-slot");
    if (sideSlot && sideSlot._paperSideHtml !== sideHtml) {
      sideSlot.innerHTML = sideHtml;
      sideSlot._paperSideHtml = sideHtml;
    }
    const statusSlot = chart.querySelector(".paper-live-status-slot");
    const statusHtml = `${oddsStrip}${compactInfoRows}`;
    if (statusSlot && statusSlot._paperStatusHtml !== statusHtml) {
      statusSlot.innerHTML = statusHtml;
      statusSlot._paperStatusHtml = statusHtml;
    }
    updatePaperUPlot(chart, {
      truthSamples: truthLineSamples,
      externalSamples: externalLineSamples,
      xDomain,
      dollarDomain,
      compact,
    });
  }
}

function renderPaperChart(options = {}) {
  if (options.selects === false) {
    renderPaperMeta();
  } else {
    renderPaperSelects();
  }
  if (allPaperMarkets().length || selectedPaperMarket()) {
    renderPaperDecisionGraph();
    return;
  }
  rememberLiveMarket(currentBackendLiveMarketShell());
  ensureLiveTickStream();
  renderPaperDecisionGraph();
}

function renderLiveMeta() {
  const meta = byId("liveGraphMeta");
  if (!meta) return;
  const market = selectedPaperMarket();
  const updatedAt = market ? paperDisplayUpdatedAt(market) : null;
  const backendError = state.backendStatus.lastError || state.liveTickStatus.lastError;
  const detail = backendError ? ` | ${compactNote(backendError, 42)}` : "";
  meta.innerHTML = `<span class="live-chip is-waiting">Live disabled</span> ${escapeHtml(`same market view, ${ageText(updatedAt)}${detail}`)}`;
}

function renderLiveChart() {
  renderLiveMeta();
  if (allPaperMarkets().length || selectedPaperMarket()) {
    renderPaperDecisionGraph({ chartId: "liveChart", mode: "live" });
    return;
  }
  rememberLiveMarket(currentBackendLiveMarketShell());
  ensureLiveTickStream();
  renderPaperDecisionGraph({ chartId: "liveChart", mode: "live" });
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
    : ` | ${makerReady ? "paper-ready" : "not ready"} | WF ${formatPercent(makerRoi)}/${formatPercent(makerTarget)}`;
  byId("statusText").textContent = `${fmt.format(q.clean_markets || 0)} windows | ${fmt.format(activeBuys)} buys | ROI ${formatPercent(activeRoi)}${makerText}`;
}

function currentPaperViewSelected() {
  state.paperGraph = PAPER_CURRENT_VALUE;
  return true;
}

function liveMarketForTicks() {
  if (!currentPaperViewSelected()) return null;
  return currentPaperMarket();
}

function pointTimestampMicro(point) {
  const explicit = metricNumber(point?.trade_time_micro ?? point?.event_time_micro ?? point?.receive_time_micro);
  if (explicit !== null) return explicit;
  const seconds = metricNumber(point?.time_unix);
  return seconds === null ? null : seconds * 1_000_000;
}

function liveBtcPointKey(point) {
  return String(point?.point_id || `${point?.decision || "tick"}:${pointTimestampMicro(point) || ""}:${point?.btc_price ?? ""}`);
}

function enrichPointWithMarketOutcomeOdds(point, market) {
  if (!point || !market) return point;
  if (isPolymarketTruthPoint(point) || isBinanceLivePoint(point)) return point;
  copyOutcomeOddsFields(point, market);
  applyOutcomeOddsFromCandidates(point, [market, point]);
  return point;
}

function removeOutcomeAndBookFields(target) {
  [...OUTCOME_ODDS_FIELDS, ...POLYMARKET_BOOK_FIELDS].forEach((field) => {
    delete target[field];
  });
  return target;
}

function liveTickKeySetForMarket(key, points) {
  let keySet = state.liveBtcTickKeysByMarket.get(key);
  if (!keySet) {
    keySet = new Set((points || []).map(liveBtcPointKey));
    state.liveBtcTickKeysByMarket.set(key, keySet);
  }
  return keySet;
}

function trimLiveBtcPointsForKey(key, points) {
  if (!Array.isArray(points) || !points.length) return [];
  const maxRows = LIVE_TICK_STORE_MAX_POINTS_PER_MARKET + LIVE_TICK_STORE_MAX_BOOK_POINTS_PER_MARKET;
  let latestMicro = null;
  points.forEach((point) => {
    const timestamp = pointTimestampMicro(point);
    if (timestamp !== null && (latestMicro === null || timestamp > latestMicro)) latestMicro = timestamp;
  });
  let recentPoints = points;
  if (latestMicro !== null) {
    const cutoffMicro = latestMicro - (LIVE_PAPER_RENDER_TAIL_SECONDS * 1_000_000);
    const visible = [];
    let carry = null;
    points.forEach((point) => {
      const timestamp = pointTimestampMicro(point);
      if (timestamp === null || timestamp >= cutoffMicro) {
        visible.push(point);
      } else {
        carry = point;
      }
    });
    recentPoints = carry ? [carry, ...visible] : visible;
  }
  const trimmed = recentPoints.length > maxRows ? balancedLiveTickRows(recentPoints, maxRows) : recentPoints;
  state.liveBtcTickKeysByMarket.set(key, new Set(trimmed.map(liveBtcPointKey)));
  return trimmed;
}

function appendLiveBtcPoints(market, incomingPoints) {
  const keys = liveTickStorageKeysForMarket(market);
  const pointsToAppend = (incomingPoints || []).filter((point) => isBinanceLivePoint(point) || isChainlinkPriceRow(point));
  if (!keys.length || !pointsToAppend.length) return;
  const startMeta = preferredPaperStartMetadata(market);
  const startPrice = startMeta?.price ?? null;
  const startSource = startMeta?.source ?? null;
  rememberLiveMarket(market);
  let auxChanged = false;
  pointsToAppend.forEach((point) => {
    const price = metricNumber(point.btc_price);
    if (price !== null && startPrice !== null && startPrice > 0) {
      const distanceBps = Math.log(price / startPrice) * 10000;
      point.start_price = startPrice;
      point.start_price_source = startSource;
      point.distance_bps = distanceBps;
      point.side = distanceBps > 0 ? "Up" : (distanceBps < 0 ? "Down" : null);
    }
    if (point?.backend_event_kind === "depth" || point?.books || point?.pm_up_bids || point?.pm_down_bids) auxChanged = true;
  });
  keys.forEach((key) => {
    let points = state.liveBtcTicksByMarket.get(key) || [];
    const keySet = liveTickKeySetForMarket(key, points);
    pointsToAppend.forEach((point) => {
      const pointKey = liveBtcPointKey(point);
      if (keySet.has(pointKey)) return;
      keySet.add(pointKey);
      points.push(point);
    });
    points = trimLiveBtcPointsForKey(key, points);
    state.liveBtcTicksByMarket.set(key, points);
  });
  if (auxChanged) {
    bumpPaperAuxVersion();
  }
  if (pointsToAppend.some(shouldPersistLivePoint)) schedulePaperTickPersist();
}

function appendLiveBtcPoint(market, point) {
  appendLiveBtcPoints(market, [point]);
}

function verifiedPaperStartPrice(market) {
  return metricNumber(preferredPaperStartMetadata(market)?.price);
}

function liveStartMetadata(market) {
  const startMeta = preferredPaperStartMetadata(market);
  return {
    ...(market || {}),
    start_price: startMeta?.price,
    start_price_source: startMeta?.source,
    start_event_time_micro: startMeta?.eventTimeMicro,
    start_price_status: startMeta ? "verified" : "loading",
  };
}

function applyLiveStartMetadata(target, anchor) {
  if (!target || !anchor || !isPolymarketTruthSource(anchor.source)) return;
  target.start_price = anchor.price;
  target.start_price_source = anchor.source;
  target.start_trade_time_ms = anchor.tradeTimeMs;
  target.start_trade_delay_ms = anchor.delayMs;
  target.start_price_status = "verified";
  target.start_price_error = "";
}

function rememberLiveStartAnchor(market, anchor) {
  applyLiveStartMetadata(market, anchor);
  paperStorageKeysForMarket(market).forEach((key) => {
    const existing = state.livePersistedMarkets.get(key) || {};
    const stored = {
      ...existing,
      ...market,
      market_key: key,
      points: [],
      markers: market.markers || [],
    };
    preserveExistingOutcomeOdds(stored, existing, market);
    applyLiveStartMetadata(stored, anchor);
    state.livePersistedMarkets.set(key, stored);
  });
}

function recomputeLiveTickDistances(market) {
  const startPrice = verifiedPaperStartPrice(market);
  if (startPrice === null) return;
  const startMeta = liveStartMetadata(market);
  liveTickStorageKeysForMarket(market).forEach((key) => {
    const points = state.liveBtcTicksByMarket.get(key) || [];
    points.forEach((point) => {
      const price = metricNumber(point.btc_price);
      if (price === null || price <= 0) return;
      const distanceBps = Math.log(price / startPrice) * 10000;
      point.start_price = startPrice;
      point.start_price_source = startMeta.start_price_source;
      point.start_trade_time_ms = startMeta.start_trade_time_ms;
      point.start_trade_delay_ms = startMeta.start_trade_delay_ms;
      point.distance_bps = distanceBps;
      point.side = distanceBps > 0 ? "Up" : (distanceBps < 0 ? "Down" : null);
    });
  });
}

function scheduleLiveTickRender() {
  if (!["paper", "live"].includes(state.activeTab) || !currentPaperViewSelected()) return;
  if (liveTickRenderFrame) return;
  liveTickRenderFrame = window.requestAnimationFrame((timestamp) => {
    liveTickRenderFrame = null;
    if (timestamp - liveTickLastRenderAt < LIVE_TICK_RENDER_THROTTLE_MS) {
      scheduleLiveTickRender();
      return;
    }
    liveTickLastRenderAt = timestamp;
    if (state.activeTab === "paper" && currentPaperViewSelected()) renderPaperChart({ selects: false });
    if (state.activeTab === "live" && currentPaperViewSelected()) renderLiveChart();
  });
}

function liveChartClockShouldRun() {
  return ["paper", "live"].includes(state.activeTab)
    && currentPaperViewSelected()
    && document.visibilityState !== "hidden";
}

function clearLiveChartClock() {
  if (!liveChartClockTimer) return;
  window.clearInterval(liveChartClockTimer);
  liveChartClockTimer = null;
}

function ensureLiveChartClock() {
  if (liveChartClockTimer || !liveChartClockShouldRun()) return;
  liveChartClockTimer = window.setInterval(() => {
    if (!liveChartClockShouldRun()) {
      clearLiveChartClock();
      return;
    }
    refreshPaperCountdownLabels();
  }, LIVE_CHART_CLOCK_MS);
}

function clearLiveTickReconnect() {
  if (liveTickReconnectTimer) {
    window.clearTimeout(liveTickReconnectTimer);
    liveTickReconnectTimer = null;
  }
}

function closeLiveTickStream() {
  clearLiveTickReconnect();
  clearLiveChartClock();
  if (liveTickSocket) {
    if (liveTickSocket._connectTimer) window.clearTimeout(liveTickSocket._connectTimer);
    liveTickSocket.onopen = null;
    liveTickSocket.onmessage = null;
    liveTickSocket.onerror = null;
    liveTickSocket.onclose = null;
    liveTickSocket.close();
    liveTickSocket = null;
  }
  if (liveTickRenderFrame) {
    window.cancelAnimationFrame(liveTickRenderFrame);
    liveTickRenderFrame = null;
  }
  state.liveTickStatus.state = "idle";
}

function rememberBackendStreamMarket(market, options = {}) {
  if (!market) return null;
  const addTruthPoint = options.addTruthPoint !== false;
  const stored = rememberLiveMarket({
    ...market,
    is_current: market.is_current !== false,
    is_open: market.is_open !== false,
    status: "backend_live",
  }, { preserveOutcomeOdds: options.preserveOutcomeOdds });
  const bookKey = [
    market.condition_id,
    market.up_book_snapshot_time_micro,
    market.down_book_snapshot_time_micro,
    market.polymarket_book_source,
  ].filter(Boolean).join(":");
  if (bookKey && bookKey !== state.paperAuxBookKey) {
    state.paperAuxBookKey = bookKey;
    bumpPaperAuxVersion();
  }
  if (options.recomputeDistances === true) recomputeLiveTickDistances(stored);
  if (addTruthPoint) {
    const chainlinkPoint = chainlinkPointFromMarket(stored);
    if (chainlinkPoint) rememberObservedPaperMarket(stored, [chainlinkPoint], []);
  }
  return stored;
}

function chainlinkPointFromMarket(market) {
  if (!market || !isPolymarketTruthPoint(market)) return null;
  const price = metricNumber(market.btc_price ?? market.latest_btc_price);
  const windowStart = marketWindowStartUnix(market);
  const startPrice = metricNumber(market.start_price);
  if (price === null || windowStart === null || startPrice === null) return null;
  const eventMicro = metricNumber(market.latest_chainlink_time_micro)
    ?? metricNumber(market.event_time_micro)
    ?? metricNumber(market.time_unix === undefined ? null : Number(market.time_unix) * 1_000_000)
    ?? Date.now() * 1000;
  const receiveMicro = metricNumber(market.latest_chainlink_receive_time_micro) ?? eventMicro;
  return removeOutcomeAndBookFields({
    ...market,
    decision: "chainlink_tick",
    event_time_micro: eventMicro,
    receive_time_micro: receiveMicro,
    time_unix: eventMicro / 1_000_000,
    generated_at: new Date(Math.floor(eventMicro / 1000)).toISOString(),
    btc_price: price,
    start_price: startPrice,
    btc_price_is_truth: true,
    truth_current_price_missing: false,
    price_role: market.btc_price_venue || market.price_role || chainlinkVenueFromSource(market.btc_price_source || market.start_price_source),
    btc_price_source: market.btc_price_source || market.start_price_source || POLYMARKET_TRUTH_SOURCE,
    btc_price_venue: market.btc_price_venue || market.price_role || chainlinkVenueFromSource(market.btc_price_source || market.start_price_source),
    reason: chainlinkReasonFromMarket(market),
    backend_event_kind: "chainlink",
    point_id: `backend:chainlink-current:${windowStart}:${eventMicro}:${price}`,
  });
}

function chainlinkReasonFromMarket(market) {
  const source = market?.btc_price_source || market?.price_source || market?.start_price_source;
  if (isChainlinkDataStreamsSource(source)) return "chainlink_data_streams";
  return "unknown_chainlink_source";
}

function rememberBackendStreamPoints(market, allPoints) {
  const points = Array.isArray(allPoints)
    ? allPoints.map((point) => {
        if (isPolymarketTruthPoint(point) || isBinanceLivePoint(point)) return point;
        return enrichPointWithMarketOutcomeOdds(point, market);
      })
    : [];
  const truthPoints = points.filter(isPolymarketTruthPoint);
  const externalPoints = points.filter(isBinanceLivePoint);
  if (truthPoints.length) {
    rememberObservedPaperMarket(market || truthPoints[0], truthPoints, []);
    truthPoints.forEach((point) => appendLiveBtcPoint(market || point, point));
  }
  externalPoints.forEach((point) => appendLiveBtcPoint(market || point, point));
  return { truthPoints, externalPoints };
}

function handleBackendTickBatch(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  const binanceMessages = [];
  const otherMessages = [];
  rows.forEach((message) => {
    if (message?.type === "tick" && message?.point && isBinanceLivePoint(message.point)) {
      binanceMessages.push(message);
    } else {
      otherMessages.push(message);
    }
  });
  if (binanceMessages.length) {
    const latestMessage = binanceMessages[binanceMessages.length - 1];
    const market = rememberBackendStreamMarket(latestMessage.market || latestMessage.point, { addTruthPoint: false }) || latestMessage.point;
    const batchPoints = [];
    binanceMessages.forEach((message) => {
      if (Array.isArray(message.points)) {
        batchPoints.push(...message.points.filter(isBinanceLivePoint));
      }
      batchPoints.push(message.point);
    });
    batchPoints.sort((left, right) => (pointTimestampMicro(left) || 0) - (pointTimestampMicro(right) || 0));
    appendLiveBtcPoints(market, batchPoints);
    const latestPoint = batchPoints[batchPoints.length - 1] || latestMessage.point;
    state.backendStatus = {
      ...state.backendStatus,
      state: "open",
      lastError: null,
      lastStreamAt: new Date(),
      pointsLoaded: (state.backendStatus.pointsLoaded || 0) + batchPoints.length,
      url: backendWebSocketUrl(),
    };
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "open",
      lastTickAt: new Date(Math.floor((pointTimestampMicro(latestPoint) || Date.now() * 1000) / 1000)),
      lastError: null,
      url: backendWebSocketUrl(),
    };
  }
  otherMessages.forEach((message) => handleBackendStreamMessage(message));
  scheduleLiveTickRender();
}

function handleBackendStreamMessage(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.type === "tick_batch") {
    handleBackendTickBatch(payload.messages || []);
    return;
  }
  if (payload.type === "paper_sql_snapshot") {
    state.paperSqlSession = payload.session || null;
    rememberPaperSqlActivity(payload);
    bumpPaperAuxVersion();
    state.backendStatus = {
      ...state.backendStatus,
      state: "open",
      lastError: null,
      lastStreamAt: new Date(),
      url: backendWebSocketUrl(),
    };
    scheduleLiveTickRender();
    return;
  }
  if (payload.type === "snapshot") {
    const market = rememberBackendStreamMarket(payload.market, { recomputeDistances: true });
    const { externalPoints } = rememberBackendStreamPoints(market, payload.points);
    state.backendStatus = {
      state: "open",
      lastError: null,
      lastStreamAt: new Date(),
      pointsLoaded: Array.isArray(payload.points) ? payload.points.length : 0,
      url: backendWebSocketUrl(),
    };
    if (externalPoints.length) {
      const latestPoint = externalPoints[externalPoints.length - 1];
      state.liveTickStatus.lastTickAt = new Date(Math.floor((pointTimestampMicro(latestPoint) || Date.now() * 1000) / 1000));
    }
    flushPaperTickPersist();
    scheduleLiveTickRender();
    return;
  }
  if (payload.type === "window" || payload.type === "heartbeat") {
    const market = rememberBackendStreamMarket(payload.market);
    rememberBackendStreamPoints(market, payload.points);
    state.backendStatus = {
      ...state.backendStatus,
      state: "open",
      lastError: null,
      lastStreamAt: new Date(),
      url: backendWebSocketUrl(),
    };
    if (payload.type === "window") {
      rememberOutcomeOddsForWindow(market, [payload.market, ...(payload.points || [])]);
      bumpPaperAuxVersion(true);
      flushPaperTickPersist();
    }
    scheduleLiveTickRender();
    return;
  }
  if (payload.type === "paper_event") {
    const point = payload.point;
    const market = rememberBackendStreamMarket(payload.market || point, {
      addTruthPoint: false,
      preserveOutcomeOdds: false,
    }) || point;
    if (point && isPaperEventPoint(point)) {
      rememberObservedPaperMarket(market, [point], [point], { preserveOutcomeOdds: false });
    }
    state.backendStatus = {
      ...state.backendStatus,
      state: "open",
      lastError: null,
      lastStreamAt: new Date(),
      pointsLoaded: (state.backendStatus.pointsLoaded || 0) + 1,
      url: backendWebSocketUrl(),
    };
    scheduleLiveTickRender();
    return;
  }
  if (payload.type !== "tick") return;
  const point = payload.point;
  if (isPolymarketTruthPoint(point)) {
    const market = rememberBackendStreamMarket(payload.market || point) || point;
    rememberBackendStreamPoints(market, payload.points);
    rememberObservedPaperMarket(market, [point], []);
    state.backendStatus = {
      ...state.backendStatus,
      state: "open",
      lastError: null,
      lastStreamAt: new Date(),
      pointsLoaded: (state.backendStatus.pointsLoaded || 0) + 1,
      url: backendWebSocketUrl(),
    };
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "open",
      lastTickAt: new Date(Math.floor((pointTimestampMicro(point) || Date.now() * 1000) / 1000)),
      lastError: null,
      url: backendWebSocketUrl(),
    };
    scheduleLiveTickRender();
    return;
  }
  if (!isBinanceLivePoint(point)) return;
  const market = rememberBackendStreamMarket(payload.market || point, { addTruthPoint: false }) || point;
  rememberBackendStreamPoints(market, payload.points);
  appendLiveBtcPoint(market, point);
  state.backendStatus = {
    ...state.backendStatus,
    state: "open",
    lastError: null,
    lastStreamAt: new Date(),
    pointsLoaded: (state.backendStatus.pointsLoaded || 0) + 1,
    url: backendWebSocketUrl(),
  };
  state.liveTickStatus = {
    ...state.liveTickStatus,
    state: "open",
    lastTickAt: new Date(Math.floor((pointTimestampMicro(point) || Date.now() * 1000) / 1000)),
    lastError: null,
    url: backendWebSocketUrl(),
  };
  scheduleLiveTickRender();
}

function ensureLiveTickStream() {
  if (!["paper", "live"].includes(state.activeTab)) return;
  ensureLiveChartClock();
  if (liveTickSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(liveTickSocket.readyState)) return;
  if (liveTickReconnectTimer) return;
  const url = backendWebSocketUrl();
  if (!url) return;
  state.liveTickStatus = {
    ...state.liveTickStatus,
    state: "connecting",
    url,
  };
  state.backendStatus = {
    ...state.backendStatus,
    state: "connecting",
    lastError: null,
    url,
  };
  liveTickSocket = new WebSocket(url);
  liveTickSocket._connectTimer = window.setTimeout(() => {
    if (liveTickSocket && liveTickSocket.readyState === WebSocket.CONNECTING) {
      state.liveTickStatus = {
        ...state.liveTickStatus,
        state: "reconnecting",
        lastError: "backend_ws_connect_timeout",
      };
      scheduleLiveTickRender();
      try {
        liveTickSocket.close();
      } catch (error) {
        // ignored
      }
    }
  }, LIVE_SOCKET_CONNECT_TIMEOUT_MS);
  liveTickSocket.onopen = () => {
    if (liveTickSocket?._connectTimer) {
      window.clearTimeout(liveTickSocket._connectTimer);
      liveTickSocket._connectTimer = null;
    }
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "open",
      url,
      lastError: null,
    };
    state.backendStatus = {
      ...state.backendStatus,
      state: "open",
      lastError: null,
      lastStreamAt: new Date(),
      url,
    };
    scheduleLiveTickRender();
  };
  liveTickSocket.onmessage = (message) => {
    try {
      handleBackendStreamMessage(JSON.parse(message.data));
    } catch (error) {
      console.warn("backend BTC stream parse failed", error);
    }
  };
  liveTickSocket.onerror = () => {
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "error",
      lastError: "backend_ws_error",
    };
    state.backendStatus = {
      ...state.backendStatus,
      state: "error",
      lastError: "backend_ws_error",
    };
    scheduleLiveTickRender();
  };
  liveTickSocket.onclose = () => {
    if (liveTickSocket?._connectTimer) window.clearTimeout(liveTickSocket._connectTimer);
    liveTickSocket = null;
    if (!["paper", "live"].includes(state.activeTab) || !currentPaperViewSelected()) return;
    state.liveTickStatus = {
      ...state.liveTickStatus,
      state: "reconnecting",
      lastError: state.liveTickStatus.lastError || "backend_ws_closed",
    };
    state.backendStatus = {
      ...state.backendStatus,
      state: "reconnecting",
      lastError: state.backendStatus.lastError || "backend_ws_closed",
    };
    scheduleLiveTickRender();
    clearLiveTickReconnect();
    liveTickReconnectTimer = window.setTimeout(() => {
      liveTickReconnectTimer = null;
      ensureLiveTickStream();
    }, LIVE_TICK_RECONNECT_MS);
  };
}

function refreshLivePaperFeeds() {
  ensureTradeSessionPanelsMounted();
  ensureLiveTickStream();
  ensureLiveChartClock();
  if (state.activeTab === "paper" && (state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE) renderPaperChart();
  if (state.activeTab === "live" && (state.paperGraph || PAPER_CURRENT_VALUE) === PAPER_CURRENT_VALUE) renderLiveChart();
  ensureTradeSessionPanelsMounted();
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
  ensureTradeSessionPanelsMounted();
  document.querySelectorAll(".tab").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.tab === state.activeTab ? "true" : "false");
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === state.activeTab);
  });
  if (state.activeTab === "backtest") renderBacktestChart();
  if (state.activeTab === "paper") {
    ensureLiveTickStream();
    renderPaperChart();
  } else if (state.activeTab === "live") {
    ensureLiveTickStream();
    renderLiveChart();
  } else {
    closeLiveTickStream();
  }
}

async function main() {
  loadPersistedPaperTicks();
  state.workflow = normalizeWorkflow(await loadJson("data/workflow.json"));
  renderStatus();
  renderStrategyPanels();
  ensureTradeSessionPanelsMounted();
  renderBacktestSelects();
  renderActiveTab();
  refreshBackendPaperFeeds({ render: false });
  refreshLivePaperFeeds();

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      const params = new URLSearchParams(window.location.search || "");
      params.set("tab", state.activeTab);
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`);
      renderActiveTab();
      if (state.activeTab === "paper" || state.activeTab === "live") {
        refreshLivePaperFeeds();
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
  const togglePaperPanel = (button) => {
    const panelId = button?.dataset?.paperToggle;
    if (!panelId) return;
    if (button.dataset.paperLockedOpen === "true") {
      state.paperCollapsedPanels.delete(panelId);
      syncPaperCollapseStates(document);
      return;
    }
    if (state.paperCollapsedPanels.has(panelId)) {
      state.paperCollapsedPanels.delete(panelId);
    } else {
      state.paperCollapsedPanels.add(panelId);
    }
    syncPaperCollapseStates(document);
    bumpPaperAuxVersion(true);
  };
  document.addEventListener("pointerdown", (event) => {
    const button = event.target?.closest?.("[data-paper-toggle]");
    if (!button) return;
    event.preventDefault();
    togglePaperPanel(button);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const button = event.target?.closest?.("[data-paper-toggle]");
    if (!button) return;
    event.preventDefault();
    togglePaperPanel(button);
  }, true);
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-paper-toggle]")) {
      event.preventDefault();
    }
  }, true);
  window.setInterval(() => {
    if (state.activeTab === "paper" || state.activeTab === "live") {
      ensureLiveTickStream();
    } else {
      refreshWorkflow();
    }
  }, PAPER_REFRESH_MS);
  window.addEventListener("pagehide", flushPaperTickPersist);
  window.addEventListener("beforeunload", flushPaperTickPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPaperTickPersist();
      clearLiveChartClock();
    } else if (state.activeTab === "paper" || state.activeTab === "live") {
      ensureLiveTickStream();
      ensureLiveChartClock();
    }
  });
}

main().catch((error) => {
  byId("statusText").textContent = `Load failed: ${error.message}`;
});
