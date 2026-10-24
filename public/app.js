/**
 * FlashArb PRO - Frontend Application Logic
 * Integrates WebSockets, REST APIs, live simulations, and mathematical trade optimizers.
 */

// Global State
const state = {
  ws: null,
  botRunning: false,
  autoScroll: true,
  monitoredPairs: [],
  currentConfig: {}
};

// DOM Ready Initialization
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initWebSocket();
  initAutopilot();
  initDashboard();
  initDiscovery();
  initTriangularArb();
  initConcentratedArb();
  initAuditor();
  initCalculator();
  initConfig();

  // Initial Data Fetches
  fetchStatus();
  fetchPairs();
  fetchConfig();

  // Periodic polling for network height & latency
  setInterval(fetchStatus, 6000);
});

/* ==========================================================================
   Navigation & Tabs
   ========================================================================== */

const TAB_TITLES = {
  "tab-dashboard": { title: "Command Center & Live Scanner", desc: "Real-time DEX arbitrage monitoring with zero-capital flash loans" },
  "tab-discovery": { title: "Automated Pair Discovery Engine", desc: "Scan multi-DEX liquidity pools and discover verified safe opportunities" },
  "tab-auditor": { title: "Token Honeypot & Security Auditor", desc: "Audit smart contracts for malicious mechanics, high taxes, and blacklists" },
  "tab-calculator": { title: "Flash Swap Sizing & Profit Optimizer", desc: "Convex ternary search solver to maximize net arbitrage yield" },
  "tab-settings": { title: "Configuration & Secrets Manager", desc: "Manage RPC endpoints, private keys, and contract deployments locally" }
};

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const tabId = item.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  const discoverNavBtn = document.getElementById("btn-discover-nav");
  if (discoverNavBtn) {
    discoverNavBtn.addEventListener("click", () => switchTab("tab-discovery"));
  }

  // Mobile Drawer Toggle & Overlay
  const mobileMenuBtn = document.getElementById("btn-mobile-menu");
  const mobileOverlay = document.getElementById("mobile-overlay");
  const sidebar = document.querySelector(".sidebar");

  function toggleMobileMenu(open) {
    if (!sidebar || !mobileOverlay) return;
    const isOpen = open !== undefined ? open : !sidebar.classList.contains("mobile-open");
    sidebar.classList.toggle("mobile-open", isOpen);
    mobileOverlay.classList.toggle("active", isOpen);
    document.body.style.overflow = isOpen ? "hidden" : "";
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", () => toggleMobileMenu());
  }
  if (mobileOverlay) {
    mobileOverlay.addEventListener("click", () => toggleMobileMenu(false));
  }
}

function switchTab(tabId) {
  // Close mobile drawer if active
  const sidebar = document.querySelector(".sidebar");
  const mobileOverlay = document.getElementById("mobile-overlay");
  if (sidebar && sidebar.classList.contains("mobile-open")) {
    sidebar.classList.remove("mobile-open");
    if (mobileOverlay) mobileOverlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  // Update sidebar active classes
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.getAttribute("data-tab") === tabId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Switch tab visibility
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.remove("active");
  });
  const targetPane = document.getElementById(tabId);
  if (targetPane) {
    targetPane.classList.add("active");
  }

  // Update Topbar
  if (TAB_TITLES[tabId]) {
    document.getElementById("page-title").textContent = TAB_TITLES[tabId].title;
    document.getElementById("page-desc").textContent = TAB_TITLES[tabId].desc;
  }
}

/* ==========================================================================
   WebSocket Connection & Real-Time Terminal
   ========================================================================== */

function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;

  const wsDot = document.getElementById("ws-status-dot");
  const wsText = document.getElementById("ws-status-text");

  function connect() {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      wsDot.className = "pill-dot connected";
      wsText.textContent = "WS Connected";
    };

    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
      } catch (err) {
        console.error("WS Parse error:", err);
      }
    };

    state.ws.onclose = () => {
      wsDot.className = "pill-dot";
      wsText.textContent = "WS Disconnected";
      setTimeout(connect, 3000); // Reconnect
    };

    state.ws.onerror = () => {
      wsDot.className = "pill-dot";
      wsText.textContent = "WS Error";
    };
  }

  connect();
}

function handleWsMessage(payload) {
  switch (payload.type) {
    case "log":
      appendTerminalLog(payload.level, payload.message, payload.timestamp);
      break;

    case "opportunity":
      renderOpportunityCard(payload.pair, payload.spread, payload.timestamp);
      break;

    case "pair_sync_update":
      updatePairInDiscoveryAndRadar(payload.pair, payload.timestamp);
      break;

    case "autopilot_state":
      updateAutopilotUI(payload.data);
      break;

    case "autopilot_trade":
      handleNewAutopilotTrade(payload.trade, payload.cumulativeProfitUsd, payload.tradesExecuted);
      break;

    case "autopilot_preflight":
      handleNewPreflight(payload.preflight);
      break;

    case "autopilot_preflights_cleared":
      clearPreflightsUI();
      break;

    case "autopilot_runtime":
      document.getElementById("auto-runtime-val").textContent = formatRuntime(payload.seconds);
      break;

    case "simulation_status":
      const runSimBtn = document.getElementById("btn-run-simulation");
      const quickSimBtn = document.getElementById("btn-quick-sim");
      if (payload.status === "running") {
        runSimBtn.disabled = true;
        quickSimBtn.disabled = true;
        document.getElementById("btn-run-sim-text").textContent = "Simulation Running...";
      } else {
        runSimBtn.disabled = false;
        quickSimBtn.disabled = false;
        document.getElementById("btn-run-sim-text").textContent = "Run Hardhat Simulation";
      }
      break;

    case "pairs_updated":
      if (Array.isArray(payload.pairs)) {
        state.monitoredPairs = payload.pairs;
        renderPairsTable(payload.pairs);
        const countEl = document.getElementById("monitored-count-display");
        if (countEl) countEl.textContent = payload.pairs.length;
        const sbEl = document.getElementById("sidebar-pair-count");
        if (sbEl) sbEl.textContent = payload.pairs.length;
        const subEl = document.getElementById("disc-pairs-subtitle");
        if (subEl) subEl.textContent = `${payload.pairs.length} multi-DEX pairs under active radar`;
      }
      break;
  }
}

function appendTerminalLog(level, message, timestamp) {
  const terminal = document.getElementById("terminal-output");
  if (!terminal) return;

  const row = document.createElement("div");
  row.className = `log-entry ${level || "info"}`;

  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  timeSpan.textContent = `[${timestamp || new Date().toLocaleTimeString()}]`;

  const msgSpan = document.createElement("span");
  msgSpan.className = "log-msg";
  msgSpan.textContent = message;

  row.appendChild(timeSpan);
  row.appendChild(msgSpan);
  terminal.appendChild(row);

  if (state.autoScroll) {
    terminal.scrollTop = terminal.scrollHeight;
  }

  // Prevent memory bloat in DOM
  if (terminal.childNodes.length > 300) {
    terminal.removeChild(terminal.firstChild);
  }
}

/* ==========================================================================
   1-Click 100% Autonomous Autopilot Controller
   ========================================================================== */

function initAutopilot() {
  const btnToggle = document.getElementById("btn-autopilot-toggle");
  const btnReset = document.getElementById("btn-reset-stats");

  if (btnToggle) {
    btnToggle.addEventListener("click", async () => {
      if (state.autopilotRunning) {
        await stopAutopilot();
      } else {
        await startAutopilot();
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to reset your cumulative profit statistics to zero?")) return;
      try {
        const res = await fetch("/api/autopilot/reset-stats", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          showToast("Autopilot profit stats reset to $0.00", "info");
        }
      } catch (err) {
        showToast("Error resetting stats: " + err.message, "error");
      }
    });
  }

  // Pre-flight Emulation History Clear Handler
  const btnClearPreflights = document.getElementById("btn-clear-preflight-history");
  if (btnClearPreflights) {
    btnClearPreflights.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to clear all pre-flight emulation records?")) return;
      try {
        const res = await fetch("/api/autopilot/preflights/clear", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          clearPreflightsUI();
          showToast("Pre-flight emulation records cleared", "info");
        } else {
          showToast(data.error || "Failed to clear preflights", "error");
        }
      } catch (err) {
        showToast("Error clearing preflights: " + err.message, "error");
      }
    });
  }

  // Delete Autopilot History Modal & Handler
  const btnClearLogs = document.getElementById("btn-clear-autopilot-logs");
  const modalClearLogs = document.getElementById("modal-clear-logs");
  const btnCloseModal = document.getElementById("btn-close-modal-logs");
  const btnCancelClear = document.getElementById("btn-cancel-clear-log");
  const btnConfirmClear = document.getElementById("btn-confirm-clear-log");
  const btnConfirmClearText = document.getElementById("btn-confirm-clear-log-text");

  function openClearLogsModal() {
    if (modalClearLogs) {
      modalClearLogs.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  }

  function closeClearLogsModal() {
    if (modalClearLogs) {
      modalClearLogs.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  if (btnClearLogs) {
    btnClearLogs.addEventListener("click", openClearLogsModal);
  }
  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", closeClearLogsModal);
  }
  if (btnCancelClear) {
    btnCancelClear.addEventListener("click", closeClearLogsModal);
  }
  if (modalClearLogs) {
    modalClearLogs.addEventListener("click", (e) => {
      if (e.target === modalClearLogs) closeClearLogsModal();
    });
  }

  if (btnConfirmClear) {
    btnConfirmClear.addEventListener("click", async () => {
      try {
        btnConfirmClear.disabled = true;
        if (btnConfirmClearText) btnConfirmClearText.textContent = "Wiping Log File...";
        const res = await fetch("/api/autopilot/logs/clear", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          showToast("Autopilot history log cleared from server (Disk reclaimed)", "success");
        } else {
          showToast(data.error || "Failed to clear log", "error");
        }
      } catch (err) {
        showToast("Error clearing logs: " + err.message, "error");
      } finally {
        btnConfirmClear.disabled = false;
        if (btnConfirmClearText) btnConfirmClearText.textContent = "Confirm & Wipe Server Log";
        closeClearLogsModal();
      }
    });
  }
}

async function startAutopilot() {
  const btn = document.getElementById("btn-autopilot-toggle");
  const btnText = document.getElementById("btn-autopilot-text");
  const btnIcon = document.getElementById("btn-autopilot-icon");

  btn.disabled = true;
  btnText.textContent = "LAUNCHING PIPELINE...";

  try {
    const res = await fetch("/api/autopilot/start", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      state.autopilotRunning = true;
      updateAutopilotUI(data.state);
      showToast("🚀 100% Autopilot Launched! Running continuously...", "success");
    } else {
      showToast("Error starting autopilot: " + (data.error || "Failed"), "error");
    }
  } catch (err) {
    showToast("Network error starting autopilot: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function stopAutopilot() {
  const btn = document.getElementById("btn-autopilot-toggle");
  const btnText = document.getElementById("btn-autopilot-text");

  btn.disabled = true;
  btnText.textContent = "STOPPING...";

  try {
    const res = await fetch("/api/autopilot/stop", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      state.autopilotRunning = false;
      updateAutopilotUI(data.state);
      showToast("⏹ Autopilot Paused by operator.", "warn");
    }
  } catch (err) {
    showToast("Error stopping autopilot: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function updateAutopilotUI(data) {
  if (!data) return;
  state.autopilotRunning = data.running;

  // Update Buttons
  const btn = document.getElementById("btn-autopilot-toggle");
  const btnText = document.getElementById("btn-autopilot-text");
  const btnIcon = document.getElementById("btn-autopilot-icon");

  if (btn && btnText && btnIcon) {
    if (data.running) {
      btn.className = "btn btn-autopilot active-running";
      btnText.textContent = "STOP AUTOPILOT";
      btnIcon.textContent = "⏹";
    } else {
      btn.className = "btn btn-autopilot";
      btnText.textContent = "START 100% AUTOPILOT";
      btnIcon.textContent = "🚀";
    }
  }

  // Update Status Phase
  const phaseEl = document.getElementById("autopilot-phase-text");
  if (phaseEl && data.currentStatus) {
    phaseEl.textContent = data.currentStatus;
  }

  // Update Stats Cards
  const profitEl = document.getElementById("auto-profit-val");
  if (profitEl && data.cumulativeProfitUsd !== undefined) {
    profitEl.textContent = `$${parseFloat(data.cumulativeProfitUsd).toFixed(2)} USD`;
  }

  const runtimeEl = document.getElementById("auto-runtime-val");
  if (runtimeEl && data.activeRuntimeSeconds !== undefined) {
    runtimeEl.textContent = formatRuntime(data.activeRuntimeSeconds);
  }

  const tradesEl = document.getElementById("auto-trades-val");
  if (tradesEl && data.tradesExecuted !== undefined) {
    tradesEl.textContent = `${data.tradesExecuted} Realized`;
  }

  const scamsEl = document.getElementById("auto-scams-val");
  if (scamsEl && data.scamsBlocked !== undefined) {
    scamsEl.textContent = `${data.scamsBlocked} Blocked`;
  }

  const poolsEl = document.getElementById("auto-pools-val");
  if (poolsEl && data.pairsAudited !== undefined) {
    poolsEl.textContent = `${data.pairsAudited} Verified`;
  }

  // Render recent trades table
  if (data.recentTrades) {
    renderAutopilotTrades(data.recentTrades);
  }
  if (data.recentPreflights) {
    renderPreflightRecords(data.recentPreflights);
  }
}

function handleNewAutopilotTrade(trade, cumProfit, totalTrades) {
  // Update profit counter with animated pulse
  const profitEl = document.getElementById("auto-profit-val");
  if (profitEl) {
    profitEl.textContent = `$${parseFloat(cumProfit).toFixed(2)} USD`;
    profitEl.style.transform = "scale(1.15)";
    profitEl.style.transition = "transform 0.3s ease";
    setTimeout(() => { profitEl.style.transform = "scale(1)"; }, 300);
  }

  const tradesEl = document.getElementById("auto-trades-val");
  if (tradesEl) {
    tradesEl.textContent = `${totalTrades} Realized`;
  }

  showToast(`🔥 Trade Realized: ${trade.symbol} (+$${trade.profitUsd} USD)`, "success");

  // Prepend to table
  const tbody = document.getElementById("tbody-autopilot-trades");
  if (!tbody) return;

  // Clear placeholder row if empty
  if (tbody.children.length === 1 && tbody.children[0].innerText.includes("No trades executed yet")) {
    tbody.innerHTML = "";
  }

  const tr = document.createElement("tr");
  tr.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
  tr.innerHTML = `
    <td class="font-mono text-muted">${trade.timestamp}</td>
    <td><strong style="color: #fff;">${trade.symbol}</strong> <span class="text-muted">/${trade.quoteSymbol}</span></td>
    <td><span class="badge-pro" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan);">${trade.route}</span></td>
    <td class="font-mono text-success"><strong>${trade.spread}</strong></td>
    <td class="font-mono">${trade.borrowAmount}</td>
    <td class="font-mono text-success"><strong>+$${trade.profitUsd}</strong></td>
    <td><span class="font-mono" style="font-size: 0.72rem; color: var(--text-muted);">${trade.txHash ? trade.txHash.substring(0, 14) + '...' : 'Simulated'}</span></td>
  `;

  tbody.prepend(tr);

  // Animate fade
  setTimeout(() => {
    tr.style.backgroundColor = "transparent";
    tr.style.transition = "background-color 1s ease";
  }, 1500);
}

function renderAutopilotTrades(trades) {
  const tbody = document.getElementById("tbody-autopilot-trades");
  if (!tbody) return;

  if (!trades || trades.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          No trades executed yet. Click "START 100% AUTOPILOT" above to begin automated trading.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";
  trades.forEach(trade => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono text-muted">${trade.timestamp || trade.date || "--"}</td>
      <td><strong style="color: #fff;">${trade.symbol}</strong> <span class="text-muted">/${trade.quoteSymbol || "USD"}</span></td>
      <td><span class="badge-pro" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan);">${trade.route}</span></td>
      <td class="font-mono text-success"><strong>${trade.spread}</strong></td>
      <td class="font-mono">${trade.borrowAmount}</td>
      <td class="font-mono text-success"><strong>+$${trade.profitUsd}</strong></td>
      <td><span class="font-mono" style="font-size: 0.72rem; color: var(--text-muted);">${trade.txHash ? trade.txHash.substring(0, 14) + '...' : 'Simulated'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Pre-Flight Simulation & Emulation History (Off-Chain Zero Gas Guard)
   Converts timestamps from UTC to Indian Standard Time (IST) for easy analysis.
   ========================================================================== */

function formatTimestampIST(isoOrDateString) {
  if (!isoOrDateString) return "--";
  try {
    const d = new Date(isoOrDateString);
    if (isNaN(d.getTime())) return isoOrDateString;
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }) + " IST";
  } catch (err) {
    return isoOrDateString;
  }
}

function clearPreflightsUI() {
  const tbody = document.getElementById("tbody-preflight-emulation");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          No pre-flight emulation events recorded yet. Candidate spread simulations will appear here in real time.
        </td>
      </tr>
    `;
  }
  const countBadge = document.getElementById("preflight-count-badge");
  if (countBadge) countBadge.textContent = "🔍 0 Emulations";
  const gasBadge = document.getElementById("preflight-saved-gas-badge");
  if (gasBadge) gasBadge.textContent = "🛡️ Gas Saved: $0.00";
}

function updatePreflightBadgeCounters() {
  const tbody = document.getElementById("tbody-preflight-emulation");
  if (!tbody) return;
  const rows = tbody.querySelectorAll("tr");
  let count = 0;
  let blockedCount = 0;
  rows.forEach(r => {
    if (!r.innerText.includes("No pre-flight emulation")) {
      count++;
      if (r.innerText.includes("BLOCKED")) blockedCount++;
    }
  });

  const countBadge = document.getElementById("preflight-count-badge");
  if (countBadge) countBadge.textContent = `🔍 ${count} Emulations`;
  const gasBadge = document.getElementById("preflight-saved-gas-badge");
  if (gasBadge) gasBadge.textContent = `🛡️ Gas Saved: $${(blockedCount * 0.05).toFixed(2)}+`;
}

function handleNewPreflight(preflight) {
  if (!preflight) return;
  const tbody = document.getElementById("tbody-preflight-emulation");
  if (!tbody) return;

  // Clear placeholder row if empty
  if (tbody.children.length === 1 && tbody.children[0].innerText.includes("No pre-flight emulation")) {
    tbody.innerHTML = "";
  }

  const isPassed = preflight.status === "PASSED";
  const isV3 = preflight.method === "executeFlashArbV3";
  const istTime = formatTimestampIST(preflight.timestamp);

  const tr = document.createElement("tr");
  tr.style.backgroundColor = isPassed ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.09)";

  tr.innerHTML = `
    <td class="font-mono text-muted" style="font-size: 0.76rem; white-space: nowrap;">${istTime}</td>
    <td>
      <strong style="color: #fff;">${preflight.symbol}</strong>
      <span class="text-muted">/${preflight.quoteSymbol || "WETH"}</span>
      <div style="font-size: 0.72rem; color: var(--accent-cyan); font-family: var(--font-mono); margin-top: 2px;">${preflight.route || "--"}</div>
    </td>
    <td>
      <span class="badge-pro" style="background: ${isV3 ? "rgba(168, 85, 247, 0.15)" : "rgba(6, 182, 212, 0.15)"}; color: ${isV3 ? "#c084fc" : "#22d3ee"}; font-family: var(--font-mono); font-size: 0.72rem;">
        ${isV3 ? "V3 Concentrated" : "V2 Standard"}
      </span>
    </td>
    <td class="font-mono" style="font-size: 0.78rem; font-weight: 600;">${preflight.borrowAmount || "--"}</td>
    <td>
      <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">Min: ${preflight.minProfit || "--"}</div>
      <div style="font-size: 0.78rem; font-family: var(--font-mono); font-weight: 700; color: ${parseFloat(preflight.projectedNetUsd) > 0 ? "var(--neon-emerald)" : "var(--neon-rose)"};">
        Est: $${preflight.projectedNetUsd || "0.00"}
      </div>
    </td>
    <td>
      <span class="badge-pro" style="background: ${isPassed ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.18)"}; color: ${isPassed ? "#34d399" : "#f87171"}; border: 1px solid ${isPassed ? "#10b981" : "#ef4444"}; font-weight: 700; font-size: 0.72rem;">
        ${isPassed ? "🟢 PASSED" : "🛡️ BLOCKED"}
      </span>
    </td>
    <td>
      <div style="font-size: 0.76rem; font-family: var(--font-mono); color: ${isPassed ? "#34d399" : "#fca5a5"}; line-height: 1.35;">
        ${preflight.reason || "Reverted during staticCall emulation"}
      </div>
      <div style="font-size: 0.70rem; color: #34d399; margin-top: 3px;">
        💰 Saved ~${preflight.gasSaved || "$0.05"} gas fee
      </div>
    </td>
  `;

  tbody.prepend(tr);

  // Animate fade
  setTimeout(() => {
    tr.style.backgroundColor = "transparent";
    tr.style.transition = "background-color 1s ease";
  }, 1500);

  updatePreflightBadgeCounters();
}

function renderPreflightRecords(preflights) {
  const tbody = document.getElementById("tbody-preflight-emulation");
  if (!tbody) return;

  if (!preflights || preflights.length === 0) {
    clearPreflightsUI();
    return;
  }

  tbody.innerHTML = "";
  let blockedCount = 0;

  preflights.forEach(item => {
    const isPassed = item.status === "PASSED";
    if (!isPassed) blockedCount++;
    const isV3 = item.method === "executeFlashArbV3";
    const istTime = formatTimestampIST(item.timestamp);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono text-muted" style="font-size: 0.76rem; white-space: nowrap;">${istTime}</td>
      <td>
        <strong style="color: #fff;">${item.symbol}</strong>
        <span class="text-muted">/${item.quoteSymbol || "WETH"}</span>
        <div style="font-size: 0.72rem; color: var(--accent-cyan); font-family: var(--font-mono); margin-top: 2px;">${item.route || "--"}</div>
      </td>
      <td>
        <span class="badge-pro" style="background: ${isV3 ? "rgba(168, 85, 247, 0.15)" : "rgba(6, 182, 212, 0.15)"}; color: ${isV3 ? "#c084fc" : "#22d3ee"}; font-family: var(--font-mono); font-size: 0.72rem;">
          ${isV3 ? "V3 Concentrated" : "V2 Standard"}
        </span>
      </td>
      <td class="font-mono" style="font-size: 0.78rem; font-weight: 600;">${item.borrowAmount || "--"}</td>
      <td>
        <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">Min: ${item.minProfit || "--"}</div>
        <div style="font-size: 0.78rem; font-family: var(--font-mono); font-weight: 700; color: ${parseFloat(item.projectedNetUsd) > 0 ? "var(--neon-emerald)" : "var(--neon-rose)"};">
          Est: $${item.projectedNetUsd || "0.00"}
        </div>
      </td>
      <td>
        <span class="badge-pro" style="background: ${isPassed ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.18)"}; color: ${isPassed ? "#34d399" : "#f87171"}; border: 1px solid ${isPassed ? "#10b981" : "#ef4444"}; font-weight: 700; font-size: 0.72rem;">
          ${isPassed ? "🟢 PASSED" : "🛡️ BLOCKED"}
        </span>
      </td>
      <td>
        <div style="font-size: 0.76rem; font-family: var(--font-mono); color: ${isPassed ? "#34d399" : "#fca5a5"}; line-height: 1.35;">
          ${item.reason || "Reverted during staticCall emulation"}
        </div>
        <div style="font-size: 0.70rem; color: #34d399; margin-top: 3px;">
          💰 Saved ~${item.gasSaved || "$0.05"} gas fee
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const countBadge = document.getElementById("preflight-count-badge");
  if (countBadge) countBadge.textContent = `🔍 ${preflights.length} Emulations`;
  const gasBadge = document.getElementById("preflight-saved-gas-badge");
  if (gasBadge) gasBadge.textContent = `🛡️ Gas Saved: $${(blockedCount * 0.05).toFixed(2)}+`;
}

function formatRuntime(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

/* ==========================================================================
   Dashboard Command Center
   ========================================================================== */

function initDashboard() {
  const btnToggleBot = document.getElementById("btn-toggle-bot");
  const btnRunSim = document.getElementById("btn-run-simulation");
  const btnQuickSim = document.getElementById("btn-quick-sim");
  const btnClearLogs = document.getElementById("btn-clear-logs");
  const chkAutoScroll = document.getElementById("chk-autoscroll");

  btnToggleBot.addEventListener("click", () => {
    if (state.botRunning) {
      stopBot();
    } else {
      startBot();
    }
  });

  btnRunSim.addEventListener("click", runSimulation);
  btnQuickSim.addEventListener("click", runSimulation);

  btnClearLogs.addEventListener("click", () => {
    const terminal = document.getElementById("terminal-output");
    terminal.innerHTML = "";
    appendTerminalLog("info", "Terminal cleared by operator.");
  });

  chkAutoScroll.addEventListener("change", (e) => {
    state.autoScroll = e.target.checked;
  });
}

async function startBot() {
  try {
    const res = await fetch("/api/bot/start", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      updateBotState(true, data.stats);
      showToast("Auto-Scanner Activated", "success");
    }
  } catch (err) {
    showToast("Failed to start bot: " + err.message, "error");
  }
}

async function stopBot() {
  try {
    const res = await fetch("/api/bot/stop", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      updateBotState(false);
      showToast("Auto-Scanner Stopped", "warn");
    }
  } catch (err) {
    showToast("Failed to stop bot: " + err.message, "error");
  }
}

function updateBotState(running, stats) {
  state.botRunning = running;
  const statusText = document.getElementById("bot-status-text");
  const subtext = document.getElementById("bot-subtext");
  const radar = document.getElementById("bot-radar");
  const btnText = document.getElementById("btn-toggle-bot-text");
  const btn = document.getElementById("btn-toggle-bot");

  if (running) {
    if (statusText) {
      statusText.textContent = "Scanning...";
      statusText.className = "metric-value text-success";
    }
    if (subtext) subtext.textContent = "Autonomous block polling active";
    if (radar) radar.className = "pulse-radar active";
    if (btnText) btnText.textContent = "Stop Auto-Scanner";
    if (btn) btn.className = "btn btn-secondary";
  } else {
    if (statusText) {
      statusText.textContent = "Idle";
      statusText.className = "metric-value";
    }
    if (subtext) subtext.textContent = "Standing by for operator trigger";
    if (radar) radar.className = "pulse-radar";
    if (btnText) btnText.textContent = "Start Auto-Scanner";
    if (btn) btn.className = "btn btn-primary";
  }

  if (stats) {
    const oppEl = document.getElementById("opp-count-display");
    if (oppEl) oppEl.textContent = stats.opportunitiesFound || 0;
    const peakEl = document.getElementById("peak-spread-display");
    if (peakEl && stats.highestSpread) {
      peakEl.textContent = stats.highestSpread + "%";
    }
  }
}

async function runSimulation() {
  try {
    switchTab("tab-dashboard");
    const res = await fetch("/api/simulation/run", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      showToast("Simulation launched. Streaming logs...", "success");
    } else {
      showToast(data.error || "Failed to start simulation", "error");
    }
  } catch (err) {
    showToast("Error running simulation: " + err.message, "error");
  }
}

function formatOppPrice(val) {
  if (!val || val === "N/A") return "Market";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (num < 0.0001) return "$" + num.toExponential(2);
  if (num < 1) return "$" + num.toFixed(6);
  return "$" + num.toFixed(2);
}


function renderOpportunityCard(pair, spread, timestamp) {
  const container = document.getElementById("opp-feed-list");
  if (!container) return;

  // Remove empty state if present
  const empty = container.querySelector(".empty-state");
  if (empty) empty.remove();

  const cardId = `opp-card-${(pair.symbol || "").replace(/[^a-zA-Z0-9]/g, "_")}-${(pair.quoteSymbol || "").replace(/[^a-zA-Z0-9]/g, "_")}`;
  let card = document.getElementById(cardId);
  const isNew = !card;
  if (isNew) {
    card = document.createElement("div");
    card.className = "opp-card-item";
    card.id = cardId;
  }

  const dexA = pair.poolA?.dex || "DEX A";
  const dexB = pair.poolB?.dex || "DEX B";
  const priceA = formatOppPrice(pair.poolA?.priceUsd);
  const priceB = formatOppPrice(pair.poolB?.priceUsd);

  const feeAVal = parseFloat(String(pair.poolA?.feePercent || "0.30").replace("%", ""));
  const feeBVal = parseFloat(String(pair.poolB?.feePercent || "0.30").replace("%", ""));
  const combinedFeeVal = parseFloat(String(pair.combinedFeePercent || (feeAVal + feeBVal).toFixed(2)).replace("%", ""));
  const rawSpreadVal = parseFloat(String(spread || pair.spreadPercent || "0").replace("%", ""));
  const netSpreadVal = parseFloat(String(pair.netSpreadPercent || (rawSpreadVal - combinedFeeVal).toFixed(2)).replace("%", ""));
  const isLoss = netSpreadVal <= 0;

  // Exact math per $1,000 flash loan
  const grossUsd = (1000 * (rawSpreadVal / 100)).toFixed(2);
  const feesUsd = (1000 * (combinedFeeVal / 100)).toFixed(2);
  const netUsd = (1000 * (netSpreadVal / 100)).toFixed(2);

  const statusBadge = isLoss
    ? `<span class="badge-pro" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; font-size: 0.72rem; font-weight: 800;">❌ SUB-FEE LOSS (${netSpreadVal.toFixed(2)}%)</span>`
    : `<span class="badge-pro" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; font-size: 0.72rem; font-weight: 800;">🟢 NET PROFIT (+${netSpreadVal.toFixed(2)}%)</span>`;

  const decisionExplanation = pair.decisionReason || (isLoss
    ? `Gross spread (${rawSpreadVal.toFixed(2)}%) is less than DEX swap fees (${combinedFeeVal.toFixed(2)}%: ${dexA} ${feeAVal.toFixed(2)}% + ${dexB} ${feeBVal.toFixed(2)}%). A $1,000 flash loan loses $${Math.abs(netUsd)} to LP fees. Autopilot strictly blocked execution to protect capital.`
    : `Gross spread (${rawSpreadVal.toFixed(2)}%) exceeds DEX swap fees (${combinedFeeVal.toFixed(2)}%) with positive net margin. Monitored for optimal execution.`);

  card.innerHTML = `
    <div class="opp-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="opp-token-title" style="font-size: 1rem; font-weight: 800; color: #fff;">${pair.symbol} / ${pair.quoteSymbol || "USD"}</span>
        <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${timestamp || new Date().toLocaleTimeString()}</span>
      </div>
      <div>${statusBadge}</div>
    </div>

    <div class="opp-dex-row" style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 8px; color: var(--text-secondary); background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px;">
      <span><strong>Borrow:</strong> <span style="text-transform: capitalize; color: #38bdf8; font-weight: 600;">${dexA}</span> (${priceA}) <span style="font-size: 0.72rem; color: #f87171;">[Fee: ${feeAVal.toFixed(2)}%]</span></span>
      <span><strong>Target:</strong> <span style="text-transform: capitalize; color: #c084fc; font-weight: 600;">${dexB}</span> (${priceB}) <span style="font-size: 0.72rem; color: #f87171;">[Fee: ${feeBVal.toFixed(2)}%]</span></span>
    </div>

    <!-- Live Calculator Breakdown Box -->
    <div class="opp-calc-breakdown" style="padding: 10px 12px; background: rgba(0, 0, 0, 0.45); border-radius: 8px; border: 1px solid ${isLoss ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'};">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">🧮 Flash Loan Math Calculator ($1,000 Loan)</span>
        <span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 800; color: ${isLoss ? '#f87171' : '#34d399'};">
          ${isLoss ? `Net Yield: ${netSpreadVal.toFixed(2)}% (LOSS)` : `Net Yield: +${netSpreadVal.toFixed(2)}% (PROFIT)`}
        </span>
      </div>
      <div style="font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-muted); line-height: 1.6;">
        <div style="display: flex; justify-content: space-between;">
          <span>• Gross Price Spread Gain:</span>
          <span style="color: #38bdf8; font-weight: 600;">+${rawSpreadVal.toFixed(2)}% (+$${grossUsd})</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>• Combined DEX LP Swap Fees:</span>
          <span style="color: #f87171; font-weight: 600;">-${combinedFeeVal.toFixed(2)}% (-$${feesUsd}) <span style="color: var(--text-muted); font-size: 0.7rem;">(${dexA} ${feeAVal.toFixed(2)}% + ${dexB} ${feeBVal.toFixed(2)}%)</span></span>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px dashed rgba(255,255,255,0.1); margin-top: 4px; padding-top: 4px;">
          <span style="font-weight: 700; color: #fff;">• Net Flash Loan Yield:</span>
          <span style="color: ${isLoss ? '#f87171' : '#34d399'}; font-weight: 800;">${isLoss ? '' : '+'}${netSpreadVal.toFixed(2)}% (${isLoss ? '-' : '+'}$${Math.abs(netUsd)} USD)</span>
        </div>
      </div>
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.75rem; color: ${isLoss ? '#fca5a5' : '#86efac'}; line-height: 1.4;">
        <strong style="color: #fff;">${isLoss ? '🛡️ Why Autopilot is Not Taking It:' : '🚀 Autopilot Status:'}</strong>
        ${decisionExplanation}
      </div>
    </div>

    <div class="opp-action-row" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">
      <button class="btn btn-outline btn-sm btn-analyze-opp" style="font-size: 0.76rem; padding: 6px 14px;">
        ⚡ Open in Sizing Calculator
      </button>
    </div>
  `;

  card.querySelector(".btn-analyze-opp").addEventListener("click", () => {
    loadPairIntoCalculator(pair);
  });

  if (isNew) {
    container.prepend(card);
  } else {
    container.prepend(card);
  }

  // Keep top 20
  if (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
}

/* ==========================================================================
   Discovery Engine
   ========================================================================== */

function initDiscovery() {
  const btnRunDisc = document.getElementById("btn-run-discovery");
  const btnRefresh = document.getElementById("btn-refresh-pairs");
  const chkSmallPond = document.getElementById("chk-small-pond");
  const btnPresetSmallPond = document.getElementById("btn-preset-small-pond");
  const btnPresetAllLiq = document.getElementById("btn-preset-all-liq");
  const inputMinLiq = document.getElementById("input-min-liq");
  const inputMaxLiq = document.getElementById("input-max-liq");

  if (chkSmallPond) {
    chkSmallPond.addEventListener("change", () => {
      if (chkSmallPond.checked) {
        inputMaxLiq.value = 80000;
        showToast("Small Pond Mode active ($2k - $80k).", "info");
      } else {
        inputMaxLiq.value = 5000000;
        showToast("Full Market Mode active: Scanning all pools up to $5M liquidity.", "info");
      }
    });
  }

  if (btnPresetSmallPond) {
    btnPresetSmallPond.addEventListener("click", () => {
      if (chkSmallPond) chkSmallPond.checked = true;
      inputMinLiq.value = 2000;
      inputMaxLiq.value = 80000;
      showToast("Applied Small Pond Preset ($2,000 - $80,000)", "info");
    });
  }

  if (btnPresetAllLiq) {
    btnPresetAllLiq.addEventListener("click", () => {
      if (chkSmallPond) chkSmallPond.checked = false;
      inputMinLiq.value = 2000;
      inputMaxLiq.value = 5000000;
      showToast("Applied All Liquidity Preset ($2,000 - $5,000,000)", "success");
    });
  }

  btnRunDisc.addEventListener("click", async () => {
    const chain = document.getElementById("select-disc-chain").value;
    const minLiquidity = inputMinLiq.value || "2000";
    const maxLiquidity = inputMaxLiq.value || "5000000";
    const smallPond = chkSmallPond ? chkSmallPond.checked : false;

    btnRunDisc.disabled = true;
    document.getElementById("btn-run-disc-text").textContent = "Scanning DexScreener...";

    try {
      showToast("Discovery started. Check Live Console for details.", "info");
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain, minLiquidity, maxLiquidity, smallPond })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Discovered ${data.count} safe pairs!`, "success");
        fetchPairs();
      } else {
        showToast("Discovery error: " + data.error, "error");
      }
    } catch (err) {
      showToast("Error during discovery: " + err.message, "error");
    } finally {
      btnRunDisc.disabled = false;
      document.getElementById("btn-run-disc-text").textContent = "Scan DEX Markets";
    }
  });

  btnRefresh.addEventListener("click", fetchPairs);
}

async function fetchPairs() {
  try {
    const res = await fetch("/api/pairs");
    const pairs = await res.json();
    state.monitoredPairs = pairs;
    renderPairsTable(pairs);

    // Update counts
    const countDisplay = document.getElementById("monitored-count-display");
    if (countDisplay) countDisplay.textContent = pairs.length;
    const sideCount = document.getElementById("sidebar-pair-count");
    if (sideCount) sideCount.textContent = pairs.length;
    const subTitle = document.getElementById("disc-pairs-subtitle");
    if (subTitle) subTitle.textContent = `${pairs.length} multi-DEX pools ready for flash swap monitoring`;
  } catch (err) {
    console.error("Failed to fetch pairs:", err);
  }
}

function renderPairsTable(pairs) {
  const tbody = document.getElementById("tbody-discovered-pairs");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!pairs || pairs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">No pairs found yet. Click "Scan DEX Markets" to discover active multi-DEX listings.</td></tr>`;
    return;
  }

  pairs.forEach(p => {
    const tr = document.createElement("tr");
    const rowId = `row-pair-${(p.symbol || "").replace(/[^a-zA-Z0-9]/g, "_")}-${(p.quoteSymbol || "").replace(/[^a-zA-Z0-9]/g, "_")}`;
    tr.id = rowId;

    const feeAVal = parseFloat(String(p.poolA?.feePercent || "0.30").replace("%", ""));
    const feeBVal = parseFloat(String(p.poolB?.feePercent || "0.30").replace("%", ""));
    const combinedFeeVal = parseFloat(String(p.combinedFeePercent || (feeAVal + feeBVal).toFixed(2)).replace("%", ""));
    const rawSpreadVal = parseFloat(String(p.spreadPercent || "0").replace("%", ""));
    const netSpreadVal = parseFloat(String(p.netSpreadPercent || (rawSpreadVal - combinedFeeVal).toFixed(2)).replace("%", ""));
    const isLoss = netSpreadVal <= 0;
    const netUsd = (1000 * (netSpreadVal / 100)).toFixed(2);
    const strategyBadge = p.strategy || (p.isSmallPond ? "Small Pond ($2k-$80k)" : "General Pool");

    const decisionText = p.decisionReason || (isLoss
      ? `Sub-fee loss: DEX fees (${combinedFeeVal.toFixed(2)}%) exceed spread (${rawSpreadVal.toFixed(2)}%). Round-trip loses ${Math.abs(netSpreadVal).toFixed(2)}% (-$${Math.abs(netUsd)} / $1k). Capital protected.`
      : `Spread exceeds fees. Monitoring optimal block inclusion.`);

    tr.innerHTML = `
      <td>
        <strong style="color: #fff;">${p.symbol}</strong> <span style="color: var(--text-muted)">/${p.quoteSymbol}</span>
        <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${(p.tokenAddress || "").substring(0, 8)}...${(p.tokenAddress || "").substring(36)}</div>
      </td>
      <td>
        <span class="badge-pro" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid #a855f7; font-size: 0.68rem;">${strategyBadge}</span>
      </td>
      <td>
        <div><strong style="text-transform: capitalize; color: #fff;">${p.poolA.dex}</strong> <span style="font-size: 0.72rem; color: #f87171;">(${feeAVal.toFixed(2)}% fee)</span></div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">$${p.poolA.priceUsd} (Liq: $${Math.round(p.poolA.liquidityUsd || 0).toLocaleString()})</div>
      </td>
      <td>
        <div><strong style="text-transform: capitalize; color: #fff;">${p.poolB.dex}</strong> <span style="font-size: 0.72rem; color: #f87171;">(${feeBVal.toFixed(2)}% fee)</span></div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">$${p.poolB.priceUsd} (Liq: $${Math.round(p.poolB.liquidityUsd || 0).toLocaleString()})</div>
      </td>
      <td>
        <span class="font-mono" style="font-weight: 700; color: #38bdf8;">${rawSpreadVal.toFixed(2)}%</span>
      </td>
      <td>
        <span class="font-mono text-danger" style="font-weight: 700;">-${combinedFeeVal.toFixed(2)}%</span>
        <div style="font-size: 0.7rem; color: var(--text-muted);">${p.poolA.dex} ${feeAVal.toFixed(2)}% + ${p.poolB.dex} ${feeBVal.toFixed(2)}%</div>
      </td>
      <td>
        ${isLoss
          ? `<span class="badge-pro" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; font-family: var(--font-mono); font-weight: 800;">${netSpreadVal.toFixed(2)}% (LOSS)</span>
             <div style="font-size: 0.7rem; color: #fca5a5; font-family: var(--font-mono); margin-top: 2px;">-$${Math.abs(netUsd)} / $1k</div>`
          : `<span class="badge-pro" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; font-family: var(--font-mono); font-weight: 800;">+${netSpreadVal.toFixed(2)}% (PROFIT)</span>
             <div style="font-size: 0.7rem; color: #86efac; font-family: var(--font-mono); margin-top: 2px;">+$${netUsd} / $1k</div>`}
      </td>
      <td>
        ${isLoss
          ? `<div style="font-size: 0.74rem; line-height: 1.3; max-width: 220px;">
               <span class="badge-pro" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.68rem; display: inline-block; margin-bottom: 2px;">🛡️ REJECTED</span>
               <div style="color: #fca5a5;">${decisionText}</div>
             </div>`
          : `<div style="font-size: 0.74rem; line-height: 1.3; max-width: 220px;">
               <span class="badge-pro" style="background: rgba(16, 185, 129, 0.15); color: #86efac; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.68rem; display: inline-block; margin-bottom: 2px;">🟢 ACTIVE</span>
               <div style="color: #86efac;">Net yield profitable. Evaluating on-chain.</div>
             </div>`}
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm btn-calc-row">⚡ Sizing</button>
          <button class="btn btn-secondary btn-sm btn-audit-row">🛡️ Audit</button>
        </div>
      </td>
    `;

    tr.querySelector(".btn-calc-row").addEventListener("click", () => {
      loadPairIntoCalculator(p);
    });

    tr.querySelector(".btn-audit-row").addEventListener("click", () => {
      switchTab("tab-auditor");
      document.getElementById("input-audit-address").value = p.tokenAddress;
      runAudit(p.tokenAddress);
    });

    tbody.appendChild(tr);
  });
}

function updatePairInDiscoveryAndRadar(pair, timestamp) {
  if (!pair || !pair.symbol) return;

  // 1. Update in local state.monitoredPairs
  if (Array.isArray(state.monitoredPairs)) {
    const idx = state.monitoredPairs.findIndex(
      p => p.symbol.toLowerCase() === pair.symbol.toLowerCase() &&
           (p.quoteSymbol || "").toLowerCase() === (pair.quoteSymbol || "").toLowerCase()
    );
    if (idx !== -1) {
      state.monitoredPairs[idx] = { ...state.monitoredPairs[idx], ...pair };
    }
  }

  // 2. Update Live Discrepancy Radar Feed card
  renderOpportunityCard(pair, pair.spreadPercent, timestamp);

  // 3. Update Pair Discovery Table Row in place
  const rowId = `row-pair-${(pair.symbol || "").replace(/[^a-zA-Z0-9]/g, "_")}-${(pair.quoteSymbol || "").replace(/[^a-zA-Z0-9]/g, "_")}`;
  const row = document.getElementById(rowId);
  if (row) {
    const feeAVal = parseFloat(String(pair.poolA?.feePercent || "0.30").replace("%", ""));
    const feeBVal = parseFloat(String(pair.poolB?.feePercent || "0.30").replace("%", ""));
    const combinedFeeVal = parseFloat(String(pair.combinedFeePercent || (feeAVal + feeBVal).toFixed(2)).replace("%", ""));
    const rawSpreadVal = parseFloat(String(pair.spreadPercent || "0").replace("%", ""));
    const netSpreadVal = parseFloat(String(pair.netSpreadPercent || (rawSpreadVal - combinedFeeVal).toFixed(2)).replace("%", ""));
    const isLoss = netSpreadVal <= 0;
    const netUsd = (1000 * (netSpreadVal / 100)).toFixed(2);

    const decisionText = pair.decisionReason || (isLoss
      ? `Sub-fee loss: DEX fees (${combinedFeeVal.toFixed(2)}%) exceed spread (${rawSpreadVal.toFixed(2)}%). Round-trip loses ${Math.abs(netSpreadVal).toFixed(2)}% (-$${Math.abs(netUsd)} / $1k). Capital protected.`
      : `Spread exceeds fees. Monitoring optimal block inclusion.`);

    if (row.children[2] && pair.poolA) {
      row.children[2].innerHTML = `
        <div><strong style="text-transform: capitalize; color: #fff;">${pair.poolA.dex}</strong> <span style="font-size: 0.72rem; color: #f87171;">(${feeAVal.toFixed(2)}% fee)</span></div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">$${pair.poolA.priceUsd} (Liq: $${Math.round(pair.poolA.liquidityUsd || 0).toLocaleString()})</div>
      `;
    }

    if (row.children[3] && pair.poolB) {
      row.children[3].innerHTML = `
        <div><strong style="text-transform: capitalize; color: #fff;">${pair.poolB.dex}</strong> <span style="font-size: 0.72rem; color: #f87171;">(${feeBVal.toFixed(2)}% fee)</span></div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">$${pair.poolB.priceUsd} (Liq: $${Math.round(pair.poolB.liquidityUsd || 0).toLocaleString()})</div>
      `;
    }

    if (row.children[4]) {
      row.children[4].innerHTML = `
        <span class="font-mono" style="font-weight: 700; color: #38bdf8;">${rawSpreadVal.toFixed(2)}%</span>
      `;
    }

    if (row.children[5]) {
      row.children[5].innerHTML = `
        <span class="font-mono text-danger" style="font-weight: 700;">-${combinedFeeVal.toFixed(2)}%</span>
        <div style="font-size: 0.7rem; color: var(--text-muted);">${pair.poolA?.dex || 'DEX A'} ${feeAVal.toFixed(2)}% + ${pair.poolB?.dex || 'DEX B'} ${feeBVal.toFixed(2)}%</div>
      `;
    }

    if (row.children[6]) {
      row.children[6].innerHTML = isLoss
        ? `<span class="badge-pro" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; font-family: var(--font-mono); font-weight: 800;">${netSpreadVal.toFixed(2)}% (LOSS)</span>
           <div style="font-size: 0.7rem; color: #fca5a5; font-family: var(--font-mono); margin-top: 2px;">-$${Math.abs(netUsd)} / $1k</div>`
        : `<span class="badge-pro" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; font-family: var(--font-mono); font-weight: 800;">+${netSpreadVal.toFixed(2)}% (PROFIT)</span>
           <div style="font-size: 0.7rem; color: #86efac; font-family: var(--font-mono); margin-top: 2px;">+$${netUsd} / $1k</div>`;
    }

    if (row.children[7]) {
      row.children[7].innerHTML = isLoss
        ? `<div style="font-size: 0.74rem; line-height: 1.3; max-width: 220px;">
             <span class="badge-pro" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.68rem; display: inline-block; margin-bottom: 2px;">🛡️ REJECTED</span>
             <div style="color: #fca5a5;">${decisionText}</div>
           </div>`
        : `<div style="font-size: 0.74rem; line-height: 1.3; max-width: 220px;">
             <span class="badge-pro" style="background: rgba(16, 185, 129, 0.15); color: #86efac; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.68rem; display: inline-block; margin-bottom: 2px;">🟢 ACTIVE</span>
             <div style="color: #86efac;">Net yield profitable. Evaluating on-chain.</div>
           </div>`;
    }
  }
}

/* ==========================================================================
   Solution 4: Intra-DEX Triangular Arbitrage Frontend Controller
   ========================================================================== */

function initTriangularArb() {
  const btnScan = document.getElementById("btn-scan-triangular");
  if (!btnScan) return;

  btnScan.addEventListener("click", async () => {
    btnScan.disabled = true;
    btnScan.innerHTML = "<span>⏳ Scanning Closed Loops...</span>";
    showToast("Scanning DEX pools for 3-hop cyclic discrepancies...", "info");

    try {
      const chain = state.currentConfig?.CHAIN || "base";
      const res = await fetch(`/api/triangular/scan?chain=${chain}&dex=aerodrome`);
      const data = await res.json();

      if (data.success) {
        renderTriangularTable(data.opportunities || []);
        showToast(`Discovered ${data.count} triangular loops!`, "success");
      } else {
        showToast("Triangular scan note: " + (data.error || "No loops detected"), "info");
      }
    } catch (err) {
      showToast("Error during triangular scan: " + err.message, "error");
    } finally {
      btnScan.disabled = false;
      btnScan.innerHTML = "<span>⚡ Scan 3-Hop Triangular Loops</span>";
    }
  });
}

function renderTriangularTable(opportunities) {
  const tbody = document.getElementById("tbody-triangular-routes");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (opportunities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No active price discrepancies found in current triangular loops. Reserves are in mathematical equilibrium.</td></tr>`;
    return;
  }

  opportunities.forEach(opp => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <strong style="color: #c084fc; font-family: var(--font-mono);">${opp.route}</strong>
        <div style="font-size: 0.72rem; color: var(--text-muted);">Leg 1 ➔ Leg 2 ➔ Leg 3 (Same DEX Atomic Loop)</div>
      </td>
      <td>
        <strong style="text-transform: capitalize; color: #fff;">${opp.dex}</strong>
      </td>
      <td>
        <span class="text-success font-mono" style="font-weight: 700;">${opp.spreadPercent}</span>
      </td>
      <td>
        <span class="font-mono">${opp.optimalInputBase} ${opp.baseToken}</span>
      </td>
      <td>
        <strong class="text-success font-mono" style="font-size: 0.95rem;">+$${opp.netProfitUsd} USD</strong>
        <div style="font-size: 0.72rem; color: var(--text-muted);">(+${opp.netProfitQuote} ${opp.baseToken})</div>
      </td>
      <td>
        <span class="badge-pro" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-green); border: 1px solid var(--accent-green); font-size: 0.68rem;">$0 GAS PRE-FLIGHT</span>
      </td>
      <td>
        <button class="btn btn-outline btn-sm btn-execute-triangular" style="border-color: #a855f7; color: #c084fc;">
          ⚡ Execute Flash Swap
        </button>
      </td>
    `;

    tr.querySelector(".btn-execute-triangular").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Executing...";

      try {
        showToast(`Simulating ${opp.route} off-chain ($0 gas)...`, "info");
        const res = await fetch("/api/triangular/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pool1: opp.pool1.pairAddress,
            pool2: opp.pool2.pairAddress,
            pool3: opp.pool3.pairAddress,
            optimalInputBase: opp.optimalInputBase,
            route: opp.route,
            dex: opp.dex
          })
        });

        const result = await res.json();
        if (result.success) {
          showToast(`Flash Swap Confirmed! Profit realized.`, "success");
        } else {
          showToast("Execution note: " + result.error, "warn");
        }
      } catch (err) {
        showToast("Execution error: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "⚡ Execute Flash Swap";
      }
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Solution 5: Concentrated Liquidity (V3 & Slipstream) Frontend Controller
   ========================================================================== */

function initConcentratedArb() {
  const btnScan = document.getElementById("btn-scan-v3");
  if (!btnScan) return;

  btnScan.addEventListener("click", async () => {
    btnScan.disabled = true;
    btnScan.innerHTML = "<span>⏳ Scanning CLAMM Pools...</span>";
    showToast("Querying Concentrated Liquidity & Slipstream pools...", "info");

    try {
      const chain = state.currentConfig?.CHAIN || "base";
      const res = await fetch(`/api/v3/scan?chain=${chain}`);
      const data = await res.json();

      if (data.success) {
        renderConcentratedTable(data.opportunities || []);
        showToast(`Discovered ${data.count} Concentrated Liquidity opportunities!`, "success");
      } else {
        showToast("Concentrated scan note: " + (data.error || "No spreads detected"), "info");
      }
    } catch (err) {
      showToast("Error during concentrated scan: " + err.message, "error");
    } finally {
      btnScan.disabled = false;
      btnScan.innerHTML = "<span>🎯 Scan V3 Concentrated Pools</span>";
    }
  });
}

function renderConcentratedTable(opportunities) {
  const tbody = document.getElementById("tbody-v3-routes");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (opportunities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No active price discrepancies found between V2 and concentrated pools. All ticks are within equilibrium limits.</td></tr>`;
    return;
  }

  opportunities.forEach(opp => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <strong style="color: #22d3ee; font-family: var(--font-mono); font-size: 0.95rem;">${opp.symbol}</strong>
        <div style="font-size: 0.72rem; color: var(--text-muted);">Fee Tier: <span style="color: #38bdf8; font-weight: 600;">${opp.feeTierPercent}</span></div>
      </td>
      <td>
        <div style="font-size: 0.8rem; color: #fff;">${opp.v2Dex}</div>
        <div style="font-size: 0.72rem; color: #22d3ee;">➔ ${opp.v3Dex}</div>
      </td>
      <td>
        <div style="font-family: var(--font-mono); font-size: 0.8rem; color: #cbd5e1;">Tick: <strong>${opp.tick}</strong></div>
        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">sqrtP: ${opp.sqrtPriceX96.substring(0, 10)}...</div>
      </td>
      <td>
        <span class="text-success font-mono" style="font-weight: 700; font-size: 0.95rem;">${opp.spreadPercent}</span>
        <div style="font-size: 0.7rem; color: var(--text-muted);">V2: ${opp.v2Price} | V3: ${opp.v3Price}</div>
      </td>
      <td>
        <strong class="font-mono" style="color: #fff;">${opp.optimalBorrow} ${opp.optimalBorrowUnit}</strong>
        <div style="font-size: 0.7rem; color: var(--text-muted);">(Ternary Sized)</div>
      </td>
      <td>
        <strong class="text-success font-mono" style="font-size: 0.95rem;">+$${opp.netProfitUsd} USD</strong>
        <div style="font-size: 0.72rem; color: var(--text-muted);">(+${opp.netProfitQuote} ${opp.quoteSymbol})</div>
      </td>
      <td>
        <span class="badge-pro" style="background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid #06b6d4; font-size: 0.68rem;">$0 GAS PRE-FLIGHT</span>
      </td>
      <td>
        <button class="btn btn-outline btn-sm btn-execute-v3" style="border-color: #06b6d4; color: #22d3ee;">
          ⚡ Execute Flash Swap
        </button>
      </td>
    `;

    tr.querySelector(".btn-execute-v3").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Executing...";

      try {
        showToast(`Simulating V2➔V3 trade for ${opp.symbol} off-chain ($0 gas)...`, "info");
        const res = await fetch("/api/v3/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            poolV2Borrow: opp.poolV2Borrow,
            poolV3Target: opp.poolV3Target,
            optimalBorrow: opp.optimalBorrow,
            borrowToken0: true,
            symbol: opp.symbol,
            feeTierPercent: opp.feeTierPercent
          })
        });

        const result = await res.json();
        if (result.success) {
          showToast(`V2➔V3 Flash Swap Confirmed! Profit captured.`, "success");
        } else {
          showToast("Execution note: " + result.error, "warn");
        }
      } catch (err) {
        showToast("Execution error: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "⚡ Execute Flash Swap";
      }
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Honeypot & Security Auditor
   ========================================================================== */

function initAuditor() {
  const btnAudit = document.getElementById("btn-run-audit");
  const addrInput = document.getElementById("input-audit-address");

  btnAudit.addEventListener("click", () => {
    const addr = addrInput.value.trim();
    if (!addr) {
      showToast("Please enter a token contract address", "error");
      return;
    }
    runAudit(addr);
  });

  // Preset chips
  document.querySelectorAll(".preset-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const addr = chip.getAttribute("data-addr");
      const chain = chip.getAttribute("data-chain");
      addrInput.value = addr;
      document.getElementById("select-audit-chain").value = chain;
      runAudit(addr);
    });
  });
}

async function runAudit(tokenAddress) {
  const chain = document.getElementById("select-audit-chain").value;
  const resultCard = document.getElementById("audit-result-card");
  const verdictBadge = document.getElementById("audit-verdict-badge");
  const title = document.getElementById("audit-token-title");
  const desc = document.getElementById("audit-verdict-desc");

  showToast("Scanning token contract with GoPlus Security...", "info");

  try {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenAddress, chain })
    });

    const report = await res.json();
    resultCard.style.display = "block";

    if (report.safe) {
      verdictBadge.textContent = "SAFE";
      verdictBadge.className = "audit-badge-large safe";
      title.textContent = `${report.tokenName || "Unknown Token"} (${report.tokenSymbol || "TOKEN"})`;
      desc.textContent = "Contract passed all honeypot, blacklist, and tax verification tests.";

      document.getElementById("audit-honeypot-val").textContent = "Clean (0% Trap)";
      document.getElementById("audit-honeypot-val").className = "audit-item-val text-success";

      document.getElementById("audit-tax-val").textContent = `${report.buyTax} / ${report.sellTax}`;
      document.getElementById("audit-blacklist-val").textContent = "None Detected";
      document.getElementById("audit-source-val").textContent = "Open Source Verified";

      showToast("Token contract verified safe!", "success");
    } else {
      verdictBadge.textContent = "UNSAFE";
      verdictBadge.className = "audit-badge-large unsafe";
      title.textContent = "Warning: High Risk Contract";
      desc.textContent = `Security check flagged issue: ${report.reason}`;

      document.getElementById("audit-honeypot-val").textContent = report.reason.includes("HONEYPOT") ? "HONEYPOT DETECTED" : "Risk Detected";
      document.getElementById("audit-honeypot-val").className = "audit-item-val text-danger";

      document.getElementById("audit-tax-val").textContent = report.reason.includes("TAX") ? "Excessive Tax" : "--";
      document.getElementById("audit-blacklist-val").textContent = report.reason.includes("TRANSFER") ? "Blacklist Restrictions" : "--";
      document.getElementById("audit-source-val").textContent = report.reason.includes("UNVERIFIED") ? "Closed Source / Hidden" : "--";

      showToast("Warning: Token contract failed safety checks!", "error");
    }
  } catch (err) {
    showToast("Audit request failed: " + err.message, "error");
  }
}

/* ==========================================================================
   Profit Optimizer & Math Calculator
   ========================================================================== */

const CALC_PRESETS = {
  hardhat_sim: {
    r0_A: "100000000000000000000",      // 100 WETH
    r1_A: "200000000000000000000000",   // 200,000 USDT (Price: 2,000)
    r0_B: "100000000000000000000",      // 100 WETH
    r1_B: "220000000000000000000000",   // 220,000 USDT (Price: 2,200) -> 10% Spread
    feeA: "0.30",
    feeB: "0.30",
    token0Symbol: "WETH",
    token1Symbol: "USDT"
  },
  virtual_weth_loss: {
    r0_A: "2639148000000000000000000",   // VIRTUAL in Aerodrome (Liq $3.47M, price $0.6581)
    r1_A: "667000000000000000000",       // WETH (at $2,600)
    r0_B: "988676000000000000000000",    // VIRTUAL in Uniswap (Liq $1.29M, price $0.6530)
    r1_B: "248000000000000000000",       // WETH -> 0.78% Raw Spread
    feeA: "1.00",
    feeB: "0.30",
    token0Symbol: "VIRTUAL",
    token1Symbol: "WETH"
  },
  meme_high: {
    r0_A: "50000000000000000000",       // 50 WETH
    r1_A: "100000000000000000000000000",// 100,000,000 MEME
    r0_B: "50000000000000000000",       // 50 WETH
    r1_B: "105000000000000000000000000",// 105,000,000 MEME -> 5% Spread
    feeA: "0.30",
    feeB: "0.30",
    token0Symbol: "WETH",
    token1Symbol: "MEME"
  },
  stable_micro: {
    r0_A: "500000000000000000000000",   // 500k USDC
    r1_A: "500000000000000000000000",   // 500k USDT
    r0_B: "500000000000000000000000",   // 500k USDC
    r1_B: "501500000000000000000000",   // 501.5k USDT -> 0.3% Spread
    feeA: "0.30",
    feeB: "0.30",
    token0Symbol: "USDC",
    token1Symbol: "USDT"
  }
};

function initCalculator() {
  const btnCompute = document.getElementById("btn-compute-math");
  const presetSelect = document.getElementById("select-calc-preset");
  const tipRange = document.getElementById("input-tip-range");
  const tipDisplay = document.getElementById("tip-val-display");

  tipRange.addEventListener("input", () => {
    tipDisplay.textContent = tipRange.value + "%";
  });

  presetSelect.addEventListener("change", () => {
    const p = CALC_PRESETS[presetSelect.value];
    if (!p) return;
    document.getElementById("input-r0-A").value = p.r0_A;
    document.getElementById("input-r1-A").value = p.r1_A;
    document.getElementById("input-r0-B").value = p.r0_B;
    document.getElementById("input-r1-B").value = p.r1_B;
    const feeAEl = document.getElementById("input-fee-A");
    if (feeAEl) feeAEl.value = p.feeA || "0.30";
    const feeBEl = document.getElementById("input-fee-B");
    if (feeBEl) feeBEl.value = p.feeB || "0.30";
    computeTradeMath(p.token0Symbol, p.token1Symbol);
  });

  btnCompute.addEventListener("click", () => {
    computeTradeMath();
  });

  // Run initial calculation with preset
  computeTradeMath("WETH", "USDT");
}

async function computeTradeMath(token0Symbol = "Token0", token1Symbol = "Token1") {
  const r0_A = document.getElementById("input-r0-A").value.trim();
  const r1_A = document.getElementById("input-r1-A").value.trim();
  const r0_B = document.getElementById("input-r0-B").value.trim();
  const r1_B = document.getElementById("input-r1-B").value.trim();
  const tipPercent = parseInt(document.getElementById("input-tip-range").value, 10);
  const feeAEl = document.getElementById("input-fee-A");
  const feeBEl = document.getElementById("input-fee-B");
  const feeBorrowBps = Math.round(parseFloat(feeAEl?.value || "0.30") * 100);
  const feeTargetBps = Math.round(parseFloat(feeBEl?.value || "0.30") * 100);

  try {
    const res = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        r0_A,
        r1_A,
        r0_B,
        r1_B,
        feeBorrowBps,
        feeTargetBps,
        token0Symbol,
        token1Symbol,
        tipPercent
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast("Calculation error: " + (data.error || "Invalid input"), "error");
      return;
    }

    const banner = document.getElementById("calc-rejection-banner");
    const bannerText = document.getElementById("calc-rejection-text");

    if (data.isSubFeeLoss || !data.isProfitable) {
      if (banner && bannerText) {
        banner.style.display = "block";
        bannerText.textContent = data.rejectionReason || "Trade rejected: Gross spread is less than combined DEX swap fees. Executing this flash loan guarantees a loss.";
      }
      document.getElementById("calc-spread-tag").innerHTML = `Gross Spread: <span style="color:#38bdf8;">${data.spreadPercent}</span> | Combined Fees: <span style="color:#f87171;">-${data.combinedFeePercent}</span> | Net Yield: <span style="color:#f87171; font-weight:800;">${data.netSpreadPercent} (LOSS)</span>`;
      document.getElementById("res-optimal-borrow").textContent = `${data.optimalBorrow} ${data.token0Symbol}`;
      document.getElementById("res-output-b").textContent = `${data.expectedOutput} ${data.token1Symbol}`;
      document.getElementById("res-repay-a").textContent = `${data.requiredRepay} ${data.token1Symbol}`;
      document.getElementById("res-gross-profit").textContent = data.grossProfit;
      document.getElementById("res-gross-profit").className = "auto-stat-val text-danger";
      document.getElementById("res-validator-tip").textContent = `${data.validatorTip} ${data.token1Symbol}`;
      document.getElementById("res-net-profit").textContent = data.netProfit;
      document.getElementById("res-net-profit").className = "auto-stat-val text-danger";
    } else {
      if (banner) banner.style.display = "none";
      document.getElementById("calc-spread-tag").innerHTML = `Gross Spread: <span style="color:#38bdf8;">${data.spreadPercent}</span> | Combined Fees: <span style="color:#f87171;">-${data.combinedFeePercent}</span> | Net Yield: <span style="color:#34d399; font-weight:800;">+${data.netSpreadPercent} (PROFIT)</span>`;
      document.getElementById("res-optimal-borrow").textContent = `${parseFloat(data.optimalBorrow).toFixed(4)} ${data.token0Symbol}`;
      document.getElementById("res-output-b").textContent = `${parseFloat(data.expectedOutput).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data.token1Symbol}`;
      document.getElementById("res-repay-a").textContent = `${parseFloat(data.requiredRepay).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data.token1Symbol}`;
      document.getElementById("res-gross-profit").textContent = `+${parseFloat(data.grossProfit).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data.token1Symbol}`;
      document.getElementById("res-gross-profit").className = "auto-stat-val text-success";
      document.getElementById("res-validator-tip").textContent = `${parseFloat(data.validatorTip).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data.token1Symbol}`;
      document.getElementById("res-net-profit").textContent = `+${parseFloat(data.netProfit).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data.token1Symbol}`;
      document.getElementById("res-net-profit").className = "auto-stat-val text-success";
    }

    renderCurveTable(data.curvePoints, data.token0Symbol, data.token1Symbol, data.isSubFeeLoss);
  } catch (err) {
    showToast("Calculation failed: " + err.message, "error");
  }
}

function renderCurveTable(points, t0, t1, isSubFeeLoss = false) {
  const tbody = document.getElementById("tbody-curve");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!points || points.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">Opportunity is not profitable after swap fees or pool depth insufficient.</td></tr>`;
    return;
  }

  points.forEach(pt => {
    const tr = document.createElement("tr");
    if (pt.isOptimal) {
      tr.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
      tr.style.fontWeight = "700";
    } else if (pt.profit < 0) {
      tr.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
    }

    const profitClass = pt.profit > 0 ? "text-success" : "text-danger";

    const statusHtml = pt.profit < 0
      ? `<span class="badge-pro" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444;">Sub-Fee Loss (-LP Fees)</span>`
      : (pt.isOptimal ? '<span class="badge-pro">OPTIMAL SIZE</span>' : "Profitable");

    tr.innerHTML = `
      <td>${pt.fraction}</td>
      <td class="font-mono">${pt.borrow.toFixed(4)} ${t0}</td>
      <td class="font-mono ${profitClass}">${pt.profit > 0 ? "+" : ""}${pt.profit.toFixed(4)} ${t1}</td>
      <td>${statusHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

function loadPairIntoCalculator(pair) {
  switchTab("tab-calculator");

  // Approximate reserves from liquidity & price
  // Liquidity USD = 2 * Reserve0 * PriceUSD
  const priceA = parseFloat(pair.poolA?.priceUsd) || 1;
  const priceB = parseFloat(pair.poolB?.priceUsd) || 1;
  const liqA = parseFloat(pair.poolA?.liquidityUsd) || 50000;
  const liqB = parseFloat(pair.poolB?.liquidityUsd) || 50000;

  // Default synthetic pool reserves reflecting the market prices
  const r0_A = BigInt(Math.floor((liqA / 2 / (priceA || 1)) * 1e18)).toString();
  const r1_A = BigInt(Math.floor((liqA / 2) * 1e18)).toString();
  const r0_B = BigInt(Math.floor((liqB / 2 / (priceB || 1)) * 1e18)).toString();
  const r1_B = BigInt(Math.floor((liqB / 2) * 1e18)).toString();

  document.getElementById("input-r0-A").value = r0_A;
  document.getElementById("input-r1-A").value = r1_A;
  document.getElementById("input-r0-B").value = r0_B;
  document.getElementById("input-r1-B").value = r1_B;

  const feeAEl = document.getElementById("input-fee-A");
  if (feeAEl) {
    const feeA = parseFloat(String(pair.poolA?.feePercent || "0.30").replace("%", ""));
    feeAEl.value = isNaN(feeA) ? "0.30" : feeA.toFixed(2);
  }
  const feeBEl = document.getElementById("input-fee-B");
  if (feeBEl) {
    const feeB = parseFloat(String(pair.poolB?.feePercent || "0.30").replace("%", ""));
    feeBEl.value = isNaN(feeB) ? "0.30" : feeB.toFixed(2);
  }

  computeTradeMath(pair.symbol, pair.quoteSymbol);
  showToast(`Loaded ${pair.symbol} into Optimizer!`, "success");
}

/* ==========================================================================
   Configuration & Keys Manager (.env)
   ========================================================================== */

function initConfig() {
  const form = document.getElementById("form-config");
  const btnToggleKey = document.getElementById("btn-toggle-key");
  const keyInput = document.getElementById("cfg-private-key");

  btnToggleKey.addEventListener("click", () => {
    if (keyInput.type === "password") {
      keyInput.type = "text";
      btnToggleKey.textContent = "🙈 Hide";
    } else {
      keyInput.type = "password";
      btnToggleKey.textContent = "👁 Show";
    }
  });

  // RPC Presets
  const baseSepoliaRpcBtn = document.getElementById("preset-base-sepolia-rpc");
  if (baseSepoliaRpcBtn) {
    baseSepoliaRpcBtn.addEventListener("click", () => {
      document.getElementById("cfg-rpc").value = "https://base-sepolia.g.alchemy.com/v2/alch_c-sCht1K23THfmBKlfU4Q";
      document.getElementById("cfg-chain").value = "base_sepolia";
    });
  }
  document.getElementById("preset-base-rpc").addEventListener("click", () => {
    document.getElementById("cfg-rpc").value = "https://base-mainnet.g.alchemy.com/v2/alch_c-sCht1K23THfmBKlfU4Q";
    document.getElementById("cfg-chain").value = "base";
  });
  document.getElementById("preset-arb-rpc").addEventListener("click", () => {
    document.getElementById("cfg-rpc").value = "https://arb1.arbitrum.io/rpc";
    document.getElementById("cfg-chain").value = "arbitrum";
  });
  document.getElementById("preset-ankr-rpc").addEventListener("click", () => {
    document.getElementById("cfg-rpc").value = "https://rpc.ankr.com/eth";
    document.getElementById("cfg-chain").value = "ethereum";
  });

  // WSS Presets (Solution 2)
  const baseSepoliaWssBtn = document.getElementById("preset-base-sepolia-wss");
  if (baseSepoliaWssBtn) {
    baseSepoliaWssBtn.addEventListener("click", () => {
      document.getElementById("cfg-wss").value = "wss://base-sepolia.g.alchemy.com/v2/alch_c-sCht1K23THfmBKlfU4Q";
      document.getElementById("cfg-chain").value = "base_sepolia";
    });
  }
  const baseWssBtn = document.getElementById("preset-base-wss");
  if (baseWssBtn) {
    baseWssBtn.addEventListener("click", () => {
      document.getElementById("cfg-wss").value = "wss://base-mainnet.g.alchemy.com/v2/alch_c-sCht1K23THfmBKlfU4Q";
      document.getElementById("cfg-chain").value = "base";
    });
  }
  const arbWssBtn = document.getElementById("preset-arb-wss");
  if (arbWssBtn) {
    arbWssBtn.addEventListener("click", () => {
      document.getElementById("cfg-wss").value = "wss://arbitrum-one-rpc.publicnode.com";
      document.getElementById("cfg-chain").value = "arbitrum";
    });
  }
  const ethWssBtn = document.getElementById("preset-eth-wss");
  if (ethWssBtn) {
    ethWssBtn.addEventListener("click", () => {
      document.getElementById("cfg-wss").value = "wss://ethereum-rpc.publicnode.com";
      document.getElementById("cfg-chain").value = "ethereum";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btnSave = document.getElementById("btn-save-config");
    const statusMsg = document.getElementById("save-status-msg");

    btnSave.disabled = true;
    statusMsg.textContent = "Saving...";

    const payload = {
      CHAIN: document.getElementById("cfg-chain").value,
      RPC_URL: document.getElementById("cfg-rpc").value,
      WSS_URL: document.getElementById("cfg-wss") ? document.getElementById("cfg-wss").value : "",
      PRIVATE_KEY: document.getElementById("cfg-private-key").value,
      EXECUTOR_CONTRACT: document.getElementById("cfg-executor").value,
      PAIR_A: document.getElementById("cfg-pair-a").value,
      PAIR_B: document.getElementById("cfg-pair-b").value,
      FLASHBOTS_RELAY: document.getElementById("cfg-relay").value,
      MIN_PROFIT: document.getElementById("cfg-min-profit").value,
      TIP_PERCENT: document.getElementById("cfg-tip-percent").value,
      SMALL_POND_MODE: document.getElementById("cfg-small-pond") ? document.getElementById("cfg-small-pond").value : "true"
    };

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        statusMsg.textContent = "✓ Settings Saved to .env";
        statusMsg.className = "save-status text-success";
        showToast("Configuration saved successfully", "success");
        fetchStatus();
      } else {
        statusMsg.textContent = "Error saving";
        statusMsg.className = "save-status text-danger";
        showToast("Error saving: " + data.error, "error");
      }
    } catch (err) {
      statusMsg.textContent = "Network error";
      statusMsg.className = "save-status text-danger";
      showToast("Error: " + err.message, "error");
    } finally {
      btnSave.disabled = false;
      setTimeout(() => { statusMsg.textContent = ""; }, 4000);
    }
  });
}

async function fetchConfig() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    state.currentConfig = cfg;

    if (cfg.CHAIN) document.getElementById("cfg-chain").value = cfg.CHAIN;
    if (cfg.RPC_URL) document.getElementById("cfg-rpc").value = cfg.RPC_URL;
    if (cfg.WSS_URL && document.getElementById("cfg-wss")) document.getElementById("cfg-wss").value = cfg.WSS_URL;
    if (cfg.EXECUTOR_CONTRACT) document.getElementById("cfg-executor").value = cfg.EXECUTOR_CONTRACT;
    if (cfg.PAIR_A) document.getElementById("cfg-pair-a").value = cfg.PAIR_A;
    if (cfg.PAIR_B) document.getElementById("cfg-pair-b").value = cfg.PAIR_B;
    if (cfg.FLASHBOTS_RELAY) document.getElementById("cfg-relay").value = cfg.FLASHBOTS_RELAY;
    if (cfg.MIN_PROFIT) document.getElementById("cfg-min-profit").value = cfg.MIN_PROFIT;
    if (cfg.TIP_PERCENT) document.getElementById("cfg-tip-percent").value = cfg.TIP_PERCENT;
    if (cfg.SMALL_POND_MODE && document.getElementById("cfg-small-pond")) {
      document.getElementById("cfg-small-pond").value = cfg.SMALL_POND_MODE;
    }

    if (cfg.PRIVATE_KEY_MASKED) {
      document.getElementById("cfg-private-key").placeholder = cfg.PRIVATE_KEY_MASKED;
    }
  } catch (err) {
    console.error("Failed to load config:", err);
  }
}

async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    const status = await res.json();

    const rpcInd = document.getElementById("rpc-indicator");
    const netName = document.getElementById("network-name");
    const blockNum = document.getElementById("block-number");
    const latVal = document.getElementById("latency-val");

    const chainUpper = (status.chain || "Base").toUpperCase();
    netName.textContent = chainUpper;
    const topbarNet = document.getElementById("topbar-network-name");
    if (topbarNet) topbarNet.textContent = chainUpper;
    const heroNet = document.getElementById("hero-network-badge");
    if (heroNet) heroNet.textContent = chainUpper;

    if (status.rpcHealthy) {
      rpcInd.className = "status-indicator";
      blockNum.textContent = status.currentBlock ? `Block: #${status.currentBlock}` : "Connected";
      latVal.textContent = `${status.latencyMs || 25} ms`;
    } else {
      rpcInd.className = "status-indicator offline";
      blockNum.textContent = "RPC Offline";
      latVal.textContent = "-- ms";
    }

    const isTestnet = (status.chain || "").toLowerCase().includes("sepolia");
    const explorerBase = isTestnet ? "https://sepolia.basescan.org/address/" : "https://basescan.org/address/";

    const contract = status.executorContract;
    const hasContract = Boolean(contract && contract.startsWith("0x") && contract !== "0x0000000000000000000000000000000000000000");
    const shortContract = hasContract ? `${contract.substring(0, 6)}...${contract.substring(contract.length - 4)}` : "Not Deployed";
    const explorerUrl = hasContract ? `${explorerBase}${contract}` : "#";

    // Topbar Contract Elements
    const topbarContractText = document.getElementById("topbar-contract-text");
    const topbarContractLink = document.getElementById("topbar-contract-link");
    const topbarContractBadge = document.getElementById("topbar-contract-badge");
    const topbarContractDot = document.getElementById("pill-contract-dot");

    if (topbarContractText) topbarContractText.textContent = shortContract;
    if (topbarContractLink) topbarContractLink.href = explorerUrl;
    if (topbarContractBadge) {
      topbarContractBadge.textContent = hasContract ? "Verified ↗" : "Sim Mode";
      topbarContractBadge.style.color = hasContract ? "#10b981" : "#f59e0b";
      topbarContractBadge.style.background = hasContract ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)";
      topbarContractBadge.style.borderColor = hasContract ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.4)";
    }
    if (topbarContractDot) {
      topbarContractDot.className = hasContract ? "pill-dot connected" : "pill-dot";
      topbarContractDot.style.background = hasContract ? "#10b981" : "#f59e0b";
      topbarContractDot.style.boxShadow = hasContract ? "0 0 8px #10b981" : "none";
    }

    // Hero Contract Elements
    const heroContractBadge = document.getElementById("hero-contract-badge");
    const heroContractLink = document.getElementById("hero-contract-link");
    if (heroContractBadge) {
      heroContractBadge.textContent = hasContract ? `${shortContract} (Verified & Connected)` : "Simulation Mode (No Contract)";
    }
    if (heroContractLink) {
      heroContractLink.href = explorerUrl;
      heroContractLink.style.color = hasContract ? "#34d399" : "#fbbf24";
    }

    // Sidebar Contract Elements
    const sidebarContractText = document.getElementById("sidebar-contract-text");
    const sidebarContractLink = document.getElementById("sidebar-contract-link");
    const sidebarContractBadge = document.getElementById("sidebar-contract-badge");
    if (sidebarContractText) sidebarContractText.textContent = `${shortContract} ↗`;
    if (sidebarContractLink) sidebarContractLink.href = explorerUrl;
    if (sidebarContractBadge) {
      sidebarContractBadge.textContent = hasContract ? "Verified" : "Sim";
      sidebarContractBadge.style.color = hasContract ? "#10b981" : "#f59e0b";
      sidebarContractBadge.style.background = hasContract ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)";
    }

    // Mode Display
    const modeEl = document.getElementById("mode-display");
    if (hasContract) {
      modeEl.textContent = "Live Arbitrage (Contract Active)";
      modeEl.className = "pill-value text-success";
    } else {
      modeEl.textContent = "Simulation / Test Mode";
      modeEl.className = "pill-value highlight";
    }

    const discSelect = document.getElementById("select-disc-chain");
    if (discSelect && status.chain) {
      discSelect.value = status.chain;
    }

    // Solution 2: Stream Status Display
    const streamEl = document.getElementById("stream-display");
    const streamDot = document.getElementById("stream-dot");
    if (streamEl && streamDot) {
      if (status.autopilotState?.streamActive) {
        streamEl.textContent = "Live WSS Sync (< 25ms)";
        streamEl.className = "pill-value text-success";
        streamDot.className = "pill-dot connected";
      } else {
        streamEl.textContent = "Standby WSS (< 25ms)";
        streamEl.className = "pill-value highlight";
        streamDot.className = "pill-dot";
      }
    }

    if (status.autopilotState) {
      updateAutopilotUI(status.autopilotState);
    }
  } catch (err) {
    console.error("Failed to fetch status:", err);
  }
}

/* ==========================================================================
   Toast Notifications
   ========================================================================== */

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon = type === "success" ? "✓" : (type === "error" ? "⚠" : "ℹ");
  toast.innerHTML = `<span style="font-weight: 700;">${icon}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
