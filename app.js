const fmt = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = {
  data: null,
  role: "both",
  market: "all",
  signalMarket: "all",
  signalRiskIndex: new Map(),
};

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

function pct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function roiPct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const number = Number(value) * 100;
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}%`;
}

function signedPct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const number = Number(value) * 100;
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)} pp`;
}

function backfillLabel(acceptance) {
  if (!acceptance?.status) return "";
  if (acceptance.status === "waiting_for_backfill") return "backfill waiting";
  if (acceptance.status === "data_rejected") return "backfill data rejected";
  if (acceptance.status === "paper_only_after_backfill") return "backfill still paper-only";
  if (acceptance.status === "small_live_candidate") return "backfill passed";
  return `backfill ${String(acceptance.status_label || acceptance.status).toLowerCase()}`;
}

function marketLabel(row) {
  const when = row.window_start
    ? new Date(row.window_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Unknown";
  const suffix = String(row.slug || row.condition_id || "").replace("btc-updown-5m-", "");
  return `${when} • ${suffix}`;
}

function signalLabel(row) {
  const when = row.signal_ts
    ? new Date(row.signal_ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : marketLabel(row);
  const ask = Number(row.signal_ask || 0).toFixed(2);
  const outcome = row.intended_outcome || "entry";
  return `${when} • ${outcome} @ ${ask}`;
}

function riskForSignal(row) {
  return state.signalRiskIndex.get(row.condition_id) || null;
}

function renderMetrics(data) {
  const markets = data.markets || {};
  const bestDays = data.best_days || [];
  const fullGate = data.full_day_gate || {};
  const prices = data.prices || {};
  const book = data.book || {};
  const trades = data.trades || {};
  const fills = data.fills || {};
  const expectedWindows = Number(fullGate.expected_windows_per_day || 288);
  const bestDayText = bestDays.length
    ? `Best day ${fmt.format(fullGate.best_day_windows || 0)}/${fmt.format(expectedWindows)} clean windows`
    : "No clean windows yet";

  byId("generatedAt").textContent = `Generated ${shortDate(data.generated_at)}`;
  byId("availabilityNote").textContent = data.availability_note || "";
  byId("completeMarkets").textContent = fmt.format(markets.total || 0);
  byId("marketRange").textContent = markets.total
    ? `Window-level complete data; ${bestDayText}`
    : fullGate.days_seen
      ? `No clean markets yet; best day ${fmt.format(fullGate.best_day_windows || 0)}/${fmt.format(expectedWindows)}`
      : "No clean markets yet";
  byId("priceRows").textContent = fmt.format(prices.rows || 0);
  byId("priceRange").textContent = prices.rows
    ? `${shortDate(prices.first_tick)} to ${shortDate(prices.last_tick)}`
    : "0 ticks inside clean markets";
  byId("bookRows").textContent = fmt.format(book.rows || 0);
  byId("bookStats").textContent = `${fmt.format(book.markets || 0)} markets, ${fmt.format(book.outcomes || 0)} outcomes`;
  byId("tradeRows").textContent = fmt.format(trades.rows || 0);
  byId("tradeStats").textContent = `${fmt.format(trades.markets || 0)} markets, ${money.format(trades.notional || 0)} notional`;
  byId("entryRows").textContent = fmt.format(fills.entry_rows || 0);
  byId("fillStats").textContent = `${money.format(fills.entry_notional || 0)} notional, ${fmt.format(fills.large_wallets || 0)} large wallets`;
}

function renderModelGate(model, gate, dataPlan, runbook, acceptance) {
  const panel = byId("modelPanel");
  if (!model) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const risk = gate?.current_best_policy || model.taker_first_entry_policy_risk?.best_policy || {};
  const rawWallet = model.taker_first_entry_policy_ev_overlay_wallet_flow?.best_policy || {};
  const rawSummary = rawWallet.summary || {};
  const liveGate = gate?.gates?.small_live_selected_policy || {};
  const paperGate = gate?.gates?.paper_trade_selected_policy || {};
  const gap = gate?.promotion_gap || {};
  const overlayStatus = gate?.component_statuses?.raw_wallet_ev_overlay || {};
  const plannedDays = Number(dataPlan?.selected_day_count || 0);
  const plannedRows = Number(dataPlan?.download_rows_required || 0);
  const backfillStatus = runbook?.execution_status;
  const acceptanceStatus = backfillLabel(acceptance);

  byId("modelStatus").textContent = gate?.deployment_status_label || "Paper only";
  byId("selectedPolicy").textContent = risk.policy_name || "No selected policy";
  byId("selectedPolicyStats").textContent = risk.signals
    ? `${fmt.format(risk.signals)} signals, ${pct(risk.roi_on_planned_cost)} planned ROI, ${pct(risk.max_drawdown_planned_roi)} max drawdown`
    : "Waiting for selected-policy replay";

  byId("walletOverlay").textContent = rawWallet.policy_name || "No overlay lift";
  const overlayRoi = rawSummary.roi_on_planned_cost ?? overlayStatus.roi_on_planned_cost;
  const overlayLift = overlayStatus.roi_lift_vs_unfiltered
    ?? (rawSummary.roi_on_planned_cost - rawSummary.baseline_roi_on_planned_cost);
  const riskGatedFolds = overlayStatus.risk_gated_folds || rawSummary.test_risk_gate_folds || 0;
  const overlayFolds = overlayStatus.selected_folds || rawSummary.selected_folds || 0;
  byId("walletOverlayStats").textContent = rawSummary.selected_folds || overlayStatus.selected_folds
    ? `${pct(overlayRoi)} ROI, ${signedPct(overlayLift)} vs unfiltered, ${fmt.format(riskGatedFolds)}/${fmt.format(overlayFolds)} risk-gated folds`
    : "No sample-gated overlay fold";

  byId("promotionGap").textContent = liveGate.passed
    ? "Live gate passed"
    : `${fmt.format(gap.estimated_additional_forward_days || gap.missing_forward_days || 0)} forward days short`;
  const planText = plannedDays
    ? `; plan ${fmt.format(plannedDays)} days / ${fmt.format(plannedRows)} rows`
    : "";
  const acceptanceText = acceptanceStatus
    ? `; ${acceptanceStatus}`
    : "";
  const runbookText = backfillStatus && !acceptanceText
    ? `; preflight ${backfillStatus}`
    : "";
  byId("promotionGapStats").textContent = liveGate.total_checks
    ? `${fmt.format(paperGate.passed_checks || 0)}/${fmt.format(paperGate.total_checks || 0)} paper checks, ${fmt.format(liveGate.passed_checks || 0)}/${fmt.format(liveGate.total_checks || 0)} live checks; need ${fmt.format(gap.missing_model_ready_markets || 0)} clean markets${planText}${acceptanceText}${runbookText}`
    : "Waiting for promotion gate data";
}

function renderSignalSelect(universe) {
  const select = byId("signalMarketSelect");
  const signals = universe?.signals || [];
  select.innerHTML = [
    `<option value="all">All rule-signal markets</option>`,
    ...signals.map((row) => {
      const filled = row.is_filled ? "filled" : "not filled";
      const evidence = row.is_selected_reference ? "selected" : "diagnostic";
      return `<option value="${row.condition_id}">${signalLabel(row)} • ${filled} • ${evidence}</option>`;
    }),
  ].join("");
  if (state.signalMarket !== "all" && !signals.some((row) => row.condition_id === state.signalMarket)) {
    state.signalMarket = "all";
  }
  select.value = state.signalMarket;
}

function filteredSignals(universe) {
  const signals = universe?.signals || [];
  if (state.signalMarket === "all") return signals;
  return signals.filter((row) => row.condition_id === state.signalMarket);
}

function renderSignalUniverse(universe) {
  const panel = byId("signalPanel");
  if (!universe?.signals?.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const summary = universe.summary || {};
  const all = summary.all_config_rule_signals || {};
  const selected = summary.selected_reference_signals || {};
  const diagnostic = summary.non_selected_clean_signals || {};
  const riskGate = (state.signalRiskUniverse?.risk_gate_candidates || [])
    .find((row) => row.gate_id === "exclude_high_risk");
  const fixedGate = (state.signalRiskGateWalkforward?.fixed_gate_summaries || [])
    .find((row) => row.gate_id === "exclude_high_risk");
  const walkSummary = state.signalRiskGateWalkforward?.summary || {};
  byId("ruleSignalCount").textContent = fmt.format(all.signals || universe.signals.length || 0);
  byId("ruleFillRate").textContent = pct(all.fill_rate);
  byId("ruleRoi").textContent = roiPct(all.roi_on_planned_cost);
  byId("ruleScope").textContent = `${fmt.format(selected.signals || 0)} selected / ${fmt.format(diagnostic.signals || 0)} diagnostic`;
  const riskTitle = riskGate
    ? `Aggregate telemetry: excluding high-risk rows keeps ${fmt.format(riskGate.signals || 0)} signals and moves diagnostic ROI to ${roiPct(riskGate.roi_on_planned_cost)}.`
    : "";
  const walkTitle = fixedGate
    ? ` Fixed-gate walk-forward: ${fixedGate.gate_id} reaches ${roiPct(fixedGate.roi_on_planned_cost)} versus ${roiPct(fixedGate.baseline_roi_on_planned_cost)} with no gate; adaptive prior-chosen gate lift is ${signedPct(walkSummary.roi_lift_vs_baseline)}.`
    : "";
  byId("ruleScope").title = `${riskTitle}${walkTitle}`.trim();

  renderSignalSelect(universe);
  renderSignalMap(universe);
  renderSignalDetails(filteredSignals(universe));
}

function renderSignalMap(universe) {
  const rows = filteredSignals(universe);
  const el = byId("signalMap");
  if (!rows.length) {
    el.innerHTML = `<div class="empty">No clean rule signals for this market.</div>`;
    return;
  }

  const view = { width: 920, height: 320, left: 64, right: 26, top: 24, bottom: 52 };
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;
  const minSeconds = 240;
  const maxSeconds = 300;
  const minAsk = 0.50;
  const maxAsk = 0.75;
  const xFor = (secondsLeft) => view.left + ((maxSeconds - Number(secondsLeft || maxSeconds)) / (maxSeconds - minSeconds)) * plotWidth;
  const yFor = (ask) => view.top + ((maxAsk - Number(ask || minAsk)) / (maxAsk - minAsk)) * plotHeight;

  const xTicks = [300, 285, 270, 255, 240];
  const yTicks = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75];
  const grid = [
    ...xTicks.map((tick) => {
      const x = xFor(tick);
      return `<line class="axis-grid" x1="${x}" y1="${view.top}" x2="${x}" y2="${view.top + plotHeight}"></line><text class="axis-label" x="${x}" y="${view.top + plotHeight + 24}" text-anchor="middle">${formatClock(tick)}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = yFor(tick);
      return `<line class="axis-grid" x1="${view.left}" y1="${y}" x2="${view.left + plotWidth}" y2="${y}"></line><text class="axis-label" x="${view.left - 10}" y="${y + 4}" text-anchor="end">${tick.toFixed(2)}</text>`;
    }),
  ].join("");

  const points = rows
    .slice()
    .sort((a, b) => Number(a.is_selected_reference || 0) - Number(b.is_selected_reference || 0))
    .map((row) => {
      const evidence = row.is_selected_reference ? "selected" : "diagnostic";
      const filled = row.is_filled ? "filled" : "unfilled";
      const seconds = Number(row.signal_seconds_left || maxSeconds);
      const ask = Number(row.signal_ask || 0);
      const radius = state.signalMarket === "all" ? 5.5 : 9;
      const risk = riskForSignal(row);
      const riskText = risk ? ` • ${risk.pretrade_risk_band} risk, score ${risk.pretrade_risk_score}` : "";
      const title = `${signalLabel(row)} • ${filled}${riskText} • ${roiPct(Number(row.pnl_dollars || 0) / 25, 1)} on $25`;
      return `
        <circle class="signal-point ${evidence} ${filled}" cx="${xFor(seconds)}" cy="${yFor(ask)}" r="${radius}">
          <title>${title}</title>
        </circle>`;
    })
    .join("");

  el.innerHTML = `
    <svg class="signal-svg" viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="Rule signals by entry time and ask price">
      <rect class="plot-bg" x="${view.left}" y="${view.top}" width="${plotWidth}" height="${plotHeight}"></rect>
      ${grid}
      ${points}
      <text class="axis-title" x="${view.left + plotWidth / 2}" y="${view.height - 12}" text-anchor="middle">Time left at signal</text>
      <text class="axis-title" x="18" y="${view.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 18 ${view.top + plotHeight / 2})">Signal ask</text>
    </svg>`;
}

function renderSignalDetails(rows) {
  const el = byId("signalDetailRows");
  const visibleRows = rows.slice(0, state.signalMarket === "all" ? 5 : 1);
  if (!visibleRows.length) {
    el.innerHTML = `<div class="empty compact-empty">No signal selected.</div>`;
    return;
  }

  el.innerHTML = visibleRows.map((row) => {
    const pnl = Number(row.pnl_dollars || 0);
    const evidence = row.is_selected_reference ? "Selected replay" : "Diagnostic clean";
    const futureAsk = row.future_ask === null || row.future_ask === undefined ? "--" : Number(row.future_ask).toFixed(2);
    const fillText = row.is_filled ? `Filled at ${futureAsk}` : `No full fill; future ask ${futureAsk}`;
    const risk = riskForSignal(row);
    const riskText = risk ? `${risk.pretrade_risk_band} risk, score ${risk.pretrade_risk_score}` : "Risk not scored";
    return `
      <div class="signal-row">
        <strong>${signalLabel(row)}</strong>
        <span>${evidence}</span>
        <span>${riskText}</span>
        <span>${fillText}</span>
        <span>${pnl >= 0 ? "+" : ""}${money.format(pnl)}</span>
      </div>`;
  }).join("");
}

function renderMarketSelect(data) {
  const select = byId("marketSelect");
  const markets = data.entry_markets || [];
  select.innerHTML = [
    `<option value="all">All clean markets</option>`,
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
    el.innerHTML = `<div class="empty">No clean entry data for ${label}.</div>`;
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
    body.innerHTML = `<tr><td colspan="5">No clean wallet entries yet.</td></tr>`;
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
  const [
    response,
    modelResponse,
    gateResponse,
    dataPlanResponse,
    runbookResponse,
    acceptanceResponse,
    signalResponse,
    signalRiskResponse,
    signalRiskGateResponse,
  ] = await Promise.all([
    fetch("data/summary.json", { cache: "no-store" }),
    fetch("data/model_diagnostics.json", { cache: "no-store" }).catch(() => null),
    fetch("data/model_promotion_gate.json", { cache: "no-store" }).catch(() => null),
    fetch("data/promotion_data_plan.json", { cache: "no-store" }).catch(() => null),
    fetch("data/promotion_backfill_runbook.json", { cache: "no-store" }).catch(() => null),
    fetch("data/promotion_backfill_acceptance.json", { cache: "no-store" }).catch(() => null),
    fetch("data/config_signal_universe.json", { cache: "no-store" }).catch(() => null),
    fetch("data/config_signal_risk_universe.json", { cache: "no-store" }).catch(() => null),
    fetch("data/config_signal_risk_gate_walkforward.json", { cache: "no-store" }).catch(() => null),
  ]);
  state.data = await response.json();
  state.model = modelResponse?.ok ? await modelResponse.json() : null;
  state.gate = gateResponse?.ok ? await gateResponse.json() : null;
  state.dataPlan = dataPlanResponse?.ok ? await dataPlanResponse.json() : null;
  state.runbook = runbookResponse?.ok ? await runbookResponse.json() : null;
  state.acceptance = acceptanceResponse?.ok ? await acceptanceResponse.json() : null;
  state.signalUniverse = signalResponse?.ok ? await signalResponse.json() : null;
  state.signalRiskUniverse = signalRiskResponse?.ok ? await signalRiskResponse.json() : null;
  state.signalRiskGateWalkforward = signalRiskGateResponse?.ok ? await signalRiskGateResponse.json() : null;
  state.signalRiskIndex = new Map((state.signalRiskUniverse?.signals || []).map((row) => [row.condition_id, row]));
  renderMetrics(state.data);
  renderModelGate(state.model, state.gate, state.dataPlan, state.runbook, state.acceptance);
  renderSignalUniverse(state.signalUniverse);
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

  byId("signalMarketSelect").addEventListener("change", (event) => {
    state.signalMarket = event.target.value;
    renderSignalMap(state.signalUniverse);
    renderSignalDetails(filteredSignals(state.signalUniverse));
  });
}

main().catch((error) => {
  byId("availabilityNote").textContent = `Dashboard failed to load: ${error.message}`;
});
