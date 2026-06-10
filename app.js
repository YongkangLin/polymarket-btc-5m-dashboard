const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = { data: null, role: "both" };

function byId(id) {
  return document.getElementById(id);
}

function shortDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function renderMetrics(data) {
  const markets = data.markets || {};
  const prices = data.prices || {};
  const book = data.book || {};
  const trades = data.trades || {};
  const fills = data.fills || {};
  const features = data.features || {};

  byId("generatedAt").textContent = `Generated ${shortDate(data.generated_at)}`;
  byId("availabilityNote").textContent = data.availability_note || "";
  byId("completeMarkets").textContent = fmt.format(markets.total || 0);
  byId("marketRange").textContent = markets.total
    ? `${shortDate(markets.first_window)} to ${shortDate(markets.last_window)}`
    : "No complete markets yet";
  byId("priceRows").textContent = fmt.format(prices.rows || 0);
  byId("priceRange").textContent = prices.rows
    ? `${shortDate(prices.first_tick)} to ${shortDate(prices.last_tick)}`
    : "0 ticks inside complete markets";
  byId("bookRows").textContent = fmt.format(book.rows || 0);
  byId("bookStats").textContent = `${fmt.format(book.markets || 0)} markets, ${fmt.format(book.outcomes || 0)} outcomes`;
  byId("tradeRows").textContent = fmt.format(trades.rows || 0);
  byId("tradeStats").textContent = `${fmt.format(trades.markets || 0)} markets, ${money.format(trades.notional || 0)} notional`;
  byId("entryRows").textContent = fmt.format(fills.entry_rows || 0);
  byId("fillStats").textContent = `${money.format(fills.entry_notional || 0)} notional, ${fmt.format(fills.large_wallets || 0)} large wallets`;
  byId("featureRows").textContent = fmt.format(features.rows || 0);
  byId("featureStats").textContent = `${fmt.format(features.markets || 0)} markets`;
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
    el.innerHTML = `<div class="empty">No complete-market entry heat-map data yet.</div>`;
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
    body.innerHTML = `<tr><td colspan="5">No complete-market wallet entries yet.</td></tr>`;
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
