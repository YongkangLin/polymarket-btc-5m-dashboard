const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = { data: null, role: "both", market: "all" };

function byId(id) {
  return document.getElementById(id);
}

function shortDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatClock(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function signedBps(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${fmt.format(number)} bps`;
}

function marketLabel(row) {
  const when = row.window_start
    ? new Date(row.window_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Unknown";
  const suffix = String(row.slug || row.condition_id || "").replace("btc-updown-5m-", "");
  return `${when} • ${suffix}`;
}

function renderMetrics(data) {
  const markets = data.markets || {};
  const prices = data.prices || {};
  const book = data.book || {};
  const trades = data.trades || {};
  const fills = data.fills || {};

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
}

function renderMarketSelect(data) {
  const select = byId("marketSelect");
  const markets = data.entry_markets || [];
  select.innerHTML = [
    `<option value="all">All complete markets</option>`,
    ...markets.map((row) => {
      const label = marketLabel(row);
      const entries = Number(row.entries || 0);
      const detail = entries ? ` (${money.format(row.notional || 0)})` : " (no large-wallet entries)";
      return `<option value="${row.condition_id}">${label}${detail}</option>`;
    }),
  ].join("");
  select.value = state.market;
}

function entryRows(data) {
  const grouped = new Map();
  for (const row of data.entry_map || []) {
    if (state.role !== "both" && row.role !== state.role) continue;
    if (state.market !== "all" && row.condition_id !== state.market) continue;
    const key = `${row.role}:${row.seconds_left_bucket}:${row.distance_bps_bucket}`;
    const current = grouped.get(key) || {
      role: row.role,
      seconds_left_bucket: Number(row.seconds_left_bucket || 0),
      distance_bps_bucket: Number(row.distance_bps_bucket || 0),
      entries: 0,
      notional: 0,
    };
    current.entries += Number(row.entries || 0);
    current.notional += Number(row.notional || 0);
    grouped.set(key, current);
  }
  return Array.from(grouped.values());
}

function renderEntryMap(data) {
  const rows = entryRows(data);
  const el = byId("entryMap");
  if (!rows.length) {
    const label = state.market === "all" ? "the selected filters" : "this market";
    el.innerHTML = `<div class="empty">No complete-market entry data for ${label}.</div>`;
    byId("entryZoneRows").innerHTML = "";
    return;
  }

  const maxDistance = Math.max(50, Math.ceil(Math.max(...rows.map((row) => Math.abs(Number(row.distance_bps_bucket || 0)))) / 25) * 25);
  const maxNotional = Math.max(...rows.map((row) => Number(row.notional || 0)), 1);
  const view = { width: 920, height: 430, left: 68, right: 26, top: 28, bottom: 56 };
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;
  const xFor = (secondsLeft) => view.left + ((300 - Number(secondsLeft || 0)) / 300) * plotWidth;
  const yFor = (distance) => view.top + ((maxDistance - Number(distance || 0)) / (maxDistance * 2)) * plotHeight;
  const radiusFor = (notional) => 4 + Math.sqrt(Number(notional || 0) / maxNotional) * 22;

  const xTicks = [300, 240, 180, 120, 60, 0];
  const yTicks = [-maxDistance, -maxDistance / 2, 0, maxDistance / 2, maxDistance];
  const grid = [
    ...xTicks.map((tick) => {
      const x = xFor(tick);
      return `<line class="axis-grid" x1="${x}" y1="${view.top}" x2="${x}" y2="${view.top + plotHeight}"></line><text class="axis-label" x="${x}" y="${view.top + plotHeight + 26}" text-anchor="middle">${formatClock(tick)}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = yFor(tick);
      return `<line class="${tick === 0 ? "axis-zero" : "axis-grid"}" x1="${view.left}" y1="${y}" x2="${view.left + plotWidth}" y2="${y}"></line><text class="axis-label" x="${view.left - 10}" y="${y + 4}" text-anchor="end">${signedBps(tick)}</text>`;
    }),
  ].join("");

  const bubbles = rows
    .slice()
    .sort((a, b) => Number(a.notional || 0) - Number(b.notional || 0))
    .map((row) => {
      const role = row.role === "taker" ? "taker" : "maker";
      const seconds = Number(row.seconds_left_bucket || 0);
      const distance = Number(row.distance_bps_bucket || 0);
      const notional = Number(row.notional || 0);
      const entries = Number(row.entries || 0);
      return `
        <circle class="entry-bubble ${role}" cx="${xFor(seconds)}" cy="${yFor(distance)}" r="${radiusFor(notional)}">
          <title>${role} • ${formatClock(seconds)} left • ${signedBps(distance)} • ${money.format(notional)} • ${fmt.format(entries)} entries</title>
        </circle>`;
    })
    .join("");

  el.innerHTML = `
    <svg class="entry-svg" viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Large wallet entries by time left and BTC distance">
      <rect class="plot-bg" x="${view.left}" y="${view.top}" width="${plotWidth}" height="${plotHeight}"></rect>
      ${grid}
      ${bubbles}
      <text class="axis-title" x="${view.left + plotWidth / 2}" y="${view.height - 14}" text-anchor="middle">Time left in 5m window</text>
      <text class="axis-title" x="18" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 18 ${view.top + plotHeight / 2})">BTC move from open</text>
    </svg>`;
  renderEntryZones(rows);
}

function renderEntryZones(rows) {
  const el = byId("entryZoneRows");
  const topRows = rows
    .slice()
    .sort((a, b) => Number(b.notional || 0) - Number(a.notional || 0))
    .slice(0, 8);

  if (!topRows.length) {
    el.innerHTML = `<div class="empty compact-empty">No zones yet.</div>`;
    return;
  }

  el.innerHTML = topRows.map((row) => {
    const role = row.role === "taker" ? "taker" : "maker";
    return `
      <div class="zone-row">
        <span class="role-dot ${role}"></span>
        <strong>${role}</strong>
        <span>${formatClock(Number(row.seconds_left_bucket || 0))}</span>
        <span>${signedBps(row.distance_bps_bucket)}</span>
        <span>${money.format(row.notional || 0)}</span>
      </div>`;
  }).join("");
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
  renderMarketSelect(state.data);
  renderEntryMap(state.data);
  renderWallets(state.data);

  byId("marketSelect").addEventListener("change", (event) => {
    state.market = event.target.value;
    renderEntryMap(state.data);
  });

  byId("roleSelect").addEventListener("change", (event) => {
    state.role = event.target.value;
    renderEntryMap(state.data);
  });
}

main().catch((error) => {
  byId("availabilityNote").textContent = `Dashboard failed to load: ${error.message}`;
});
