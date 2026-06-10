const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });

const state = { data: null, role: "both" };

function byId(id) {
  return document.getElementById(id);
}

function shortDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function num(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function renderMetrics(data) {
  const markets = data.markets || {};
  const prices = data.prices || {};
  const returns = data.returns || {};
  const quality = data.quality || {};
  const book = data.book || {};
  const trades = data.trades || {};
  const fills = data.fills || {};

  byId("generatedAt").textContent = `Generated ${shortDate(data.generated_at)}`;
  byId("availabilityNote").textContent = data.availability_note || "";
  byId("totalMarkets").textContent = fmt.format(markets.total || 0);
  byId("marketRange").textContent = `${shortDate(markets.first_window)} to ${shortDate(markets.last_window)}`;
  byId("priceRows").textContent = fmt.format(prices.rows || 0);
  byId("priceRange").textContent = `${shortDate(prices.first_tick)} to ${shortDate(prices.last_tick)}`;
  byId("pricedMarkets").textContent = fmt.format(returns.priced_markets || 0);
  byId("moveStats").textContent = `${num(returns.median_move_bps, 2)} bps median, ${pct.format(returns.pct_abs_move_over_1pct || 0)} >= 1%`;
  byId("completeMarkets").textContent = fmt.format(quality.complete_markets || 0);
  byId("qualityStats").textContent = `${fmt.format(quality.book_sampled_markets || 0)} sampled, ${fmt.format(quality.audited_markets || 0)} audited`;
  byId("bookRows").textContent = fmt.format(book.rows || 0);
  byId("bookStats").textContent = `${fmt.format(book.files || 0)} files, ${fmt.format(book.markets || 0)} markets`;
  byId("tradeRows").textContent = fmt.format(trades.rows || 0);
  byId("tradeStats").textContent = `${fmt.format(trades.files || 0)} files, ${money.format(trades.notional || 0)} notional`;
  byId("entryRows").textContent = fmt.format(fills.entry_rows || 0);
  byId("fillStats").textContent = `${fmt.format(fills.files || 0)} files, ${money.format(fills.entry_notional || 0)} notional, ${fmt.format(fills.large_wallets || 0)} large wallets`;
}

function renderQuality(data) {
  const reasons = data.quality_reasons || [];
  const reasonEl = byId("qualityReasons");
  if (!reasons.length) {
    reasonEl.innerHTML = `<div class="empty compact-empty">No exclusion reasons yet. Build the quality audit.</div>`;
  } else {
    reasonEl.innerHTML = reasons.map((row) => `
      <div class="reason-item">
        <span>${row.reason}</span>
        <strong>${fmt.format(row.markets || 0)}</strong>
      </div>
    `).join("");
  }

  const rows = data.sampled_markets || [];
  const body = byId("sampledRows");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6">No sampled order-book markets yet.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td><code title="${row.slug}">${row.slug}</code></td>
      <td><span class="badge ${row.is_complete ? "ok" : "bad"}">${row.is_complete ? "Kept" : "Dropped"}</span></td>
      <td>${num(row.max_price_age_seconds)}s</td>
      <td>${num(row.max_book_age_seconds)}s</td>
      <td>${fmt.format(row.null_bbo_seconds || 0)}</td>
      <td>${fmt.format(row.invalid_bbo_seconds || 0)}</td>
    </tr>
  `).join("");
}

function renderLayers(data) {
  const prices = data.prices || {};
  const book = data.book || {};
  const trades = data.trades || {};
  const fills = data.fills || {};
  const features = data.features || {};
  const qualityUniverse = data.quality_universe || {};
  const layers = [
    ["BTC settlement prices", prices.files || 0, `${fmt.format(prices.rows || 0)} ticks`],
    ["Top-5 order book", book.files || 0, `${fmt.format(book.rows || 0)} events`],
    ["Trades", trades.files || 0, `${fmt.format(trades.rows || 0)} rows`],
    ["On-chain fills", fills.files || 0, `${fmt.format(fills.entry_rows || 0)} modeled entries`],
    ["Complete universe", qualityUniverse.markets || 0, "strict markets"],
    ["1s feature table", features.files || 0, `${fmt.format(features.rows || 0)} rows`],
  ];

  byId("layerGrid").innerHTML = layers.map(([label, count, detail]) => `
    <div class="layer-item">
      <span>${label}</span>
      <strong>${fmt.format(count || 0)}</strong>
      <small>${detail}</small>
    </div>
  `).join("");
}

function heatColor(value, max) {
  if (!value || !max) return "#edf1ee";
  const x = Math.min(1, Math.log1p(value) / Math.log1p(max));
  const hue = 210 - x * 165;
  const light = 92 - x * 46;
  return `hsl(${hue} 60% ${light}%)`;
}

function renderHeatmap(data) {
  const rows = (data.heatmap || []).filter((d) => state.role === "both" || d.role === state.role);
  const el = byId("heatmap");
  if (!rows.length) {
    el.innerHTML = `<div class="empty">No heat-map data yet. Download Telonex onchain_fills and rebuild dashboard data.</div>`;
    return;
  }

  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.distance_bps_bucket}:${row.seconds_left_bucket}`;
    byKey.set(key, (byKey.get(key) || 0) + Number(row.notional || 0));
  }

  const seconds = Array.from({ length: 31 }, (_, i) => i * 10);
  const distances = Array.from(new Set(rows.map((row) => Number(row.distance_bps_bucket)))).sort((a, b) => b - a);
  const max = Math.max(...byKey.values());
  const cells = [];
  cells.push(`<div class="heat-label"></div>`);
  for (const sec of seconds) cells.push(`<div class="heat-label">${sec}s</div>`);
  for (const dist of distances) {
    cells.push(`<div class="heat-label">${dist}</div>`);
    for (const sec of seconds) {
      const value = byKey.get(`${dist}:${sec}`) || 0;
      cells.push(`<div class="heat-cell" title="${dist} bps, ${sec}s: ${money.format(value)}" style="background:${heatColor(value, max)}">${value}</div>`);
    }
  }
  el.innerHTML = `<div class="heat-grid">${cells.join("")}</div>`;
}

function renderWallets(data) {
  const rows = data.top_wallets || [];
  const body = byId("walletRows");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5">No wallet data yet.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td><code title="${row.wallet}">${row.wallet}</code></td>
      <td>${money.format(row.notional || 0)}</td>
      <td>${fmt.format(row.entries || 0)}</td>
      <td>${money.format(row.maker_notional || 0)}</td>
      <td>${money.format(row.taker_notional || 0)}</td>
    </tr>
  `).join("");
}

async function main() {
  const response = await fetch("data/summary.json", { cache: "no-store" });
  state.data = await response.json();
  renderMetrics(state.data);
  renderQuality(state.data);
  renderLayers(state.data);
  renderHeatmap(state.data);
  renderWallets(state.data);

  byId("roleSelect").addEventListener("change", (event) => {
    state.role = event.target.value;
    renderHeatmap(state.data);
  });
}

main().catch((error) => {
  byId("availabilityNote").textContent = `Dashboard failed to load: ${error.message}`;
});
