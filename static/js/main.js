// static/js/main.js
// Home (index.html) interactions: grid, modal, predictions, portfolio

const INR_SYMBOL = "₹";
const COINS = [
  { id: "bitcoin",          symbol: "BTC",  name: "Bitcoin",       img: "/static/images/btc.png" },
  { id: "ethereum",         symbol: "ETH",  name: "Ethereum",      img: "/static/images/eth.png" },
  { id: "ripple",           symbol: "XRP",  name: "XRP",           img: "/static/images/xrp.png" },
  { id: "tether",           symbol: "USDT", name: "Tether",        img: "/static/images/usdt.png" },
  { id: "binancecoin",      symbol: "BNB",  name: "BNB",           img: "/static/images/bnb.png" },
  { id: "solana",           symbol: "SOL",  name: "Solana",        img: "/static/images/sol.png" },
  { id: "usd-coin",         symbol: "USDC", name: "USD Coin",      img: "/static/images/usdc.png" },
  { id: "dogecoin",         symbol: "DOGE", name: "Dogecoin",      img: "/static/images/doge.png" },
  { id: "tron",             symbol: "TRX",  name: "TRON",          img: "/static/images/trx.png" },
  { id: "cardano",          symbol: "ADA",  name: "Cardano",       img: "/static/images/ada.png" },
  { id: "chainlink",        symbol: "LINK", name: "Chainlink",     img: "/static/images/link.png" },
  { id: "hyperliquid",      symbol: "HYPE", name: "Hyperliquid",   img: "/static/images/hype.png" },
  { id: "stellar",          symbol: "XLM",  name: "Stellar",       img: "/static/images/xlm.png" },
  { id: "sui",              symbol: "SUI",  name: "Sui",           img: "/static/images/sui.png" },
  { id: "bitcoin-cash",     symbol: "BCH",  name: "Bitcoin Cash",  img: "/static/images/bch.png" },
  { id: "hedera-hashgraph", symbol: "HBAR", name: "Hedera",        img: "/static/images/hbar.png" },
  { id: "ethena-usde",      symbol: "USDe", name: "Ethena USDe",   img: "/static/images/usde.png" },
  { id: "avalanche-2",      symbol: "AVAX", name: "Avalanche",     img: "/static/images/avax.png" },
  { id: "litecoin",         symbol: "LTC",  name: "Litecoin",      img: "/static/images/ltc.png" },
  { id: "the-open-network", symbol: "TON",  name: "Toncoin",       img: "/static/images/ton.png" },
];

const ABOUT = {
  BTC: "Bitcoin is the first decentralized digital currency, secured by a global network...",
  ETH: "Ethereum is a programmable blockchain enabling smart contracts...",
  XRP: "XRP is designed for fast, low-cost cross-border payments...",
  USDT: "Tether (USDT) is a fiat-pegged stablecoin...",
  BNB: "BNB is the native token of BNB Chain...",
  SOL: "Solana is a high-performance blockchain...",
  USDC: "USD Coin is a fully-reserved stablecoin...",
  DOGE: "Dogecoin began as a meme coin...",
  TRX: "TRON focuses on high throughput...",
  ADA: "Cardano emphasizes peer-reviewed research...",
  LINK: "Chainlink provides decentralized oracle services...",
  HYPE: "Hyperliquid is associated with a derivatives ecosystem...",
  XLM: "Stellar targets cross-border payments...",
  SUI: "Sui is a high-throughput L1 based on Move...",
  BCH: "Bitcoin Cash is a fork of Bitcoin...",
  HBAR: "Hedera is a high-speed network using hashgraph...",
  USDe: "Ethena USDe is a synthetic dollar...",
  AVAX: "Avalanche is a smart contract platform...",
  LTC: "Litecoin is a long-standing peer-to-peer cryptocurrency...",
  TON: "Toncoin powers The Open Network...",
};

// ---------------- Theme ----------------
function setTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem("theme", mode);
}
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  setTheme(saved);
  const t = document.getElementById("themeToggle");
  if (t) t.checked = saved === "dark";
}
document.addEventListener("DOMContentLoaded", initTheme);
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("change", () =>
    setTheme(themeToggle.checked ? "dark" : "light")
  );
}

// ---------------- Helpers ----------------
async function fetchLivePricesInINR() {
  const ids = COINS.map((c) => c.id).join(",");
  const res = await fetch(`/api/simple_price?ids=${ids}&vs_currency=inr`);
  if (!res.ok) throw new Error("price failed");
  return res.json();
}
function formatINR(n) {
  try {
    return (
      INR_SYMBOL +
      new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)
    );
  } catch {
    return INR_SYMBOL + (Math.round(n * 100) / 100).toString();
  }
}
function toast(msg) {
  const el = document.getElementById("appToast");
  if (!el) return alert(msg);
  document.getElementById("toastBody").textContent = msg;
  new bootstrap.Toast(el).show();
}

// ---------------- Grid ----------------
const grid = document.getElementById("coinGrid");
function coinCardTemplate(c, livePrice) {
  const priceText = livePrice ? formatINR(livePrice) : "—";
  return `
  <div class="coin-card flip-3d" data-symbol="${c.symbol}" data-id="${c.id}" data-name="${c.name}">
    <img class="coin-img" src="${c.img}" alt="${c.name}" onerror="this.style.display='none';this.nextElementSibling.classList.remove('d-none');">
    <div class="coin-fallback d-none place-center">${c.symbol}</div>
    <div class="coin-overlay">
      <div>
        <div class="name">${c.name} <span class="subtle">(${c.symbol})</span></div>
        <div class="price">${priceText}</div>
      </div>
    </div>
  </div>`;
}
async function renderGrid() {
  if (!grid) return;
  try {
    const prices = await fetchLivePricesInINR();
    grid.innerHTML = COINS.map((c) =>
      coinCardTemplate(c, prices?.[c.id]?.inr)
    ).join("");
  } catch {
    grid.innerHTML = COINS.map((c) => coinCardTemplate(c, null)).join("");
  }
  const gsp = document.getElementById("globalSpinner");
  if (gsp) gsp.style.display = "none";

  document.querySelectorAll(".coin-card").forEach((el) => {
    el.addEventListener("click", async () => {
      el.classList.add("is-flipping");
      await new Promise((r) => setTimeout(r, 820));
      el.classList.remove("is-flipping");
      openCoinModal({
        symbol: el.dataset.symbol,
        id: el.dataset.id,
        name: el.dataset.name,
      });
    });
  });
}

// ---------------- Modal + Chart ----------------
let chart;
const coinModal = () => new bootstrap.Modal(document.getElementById("coinModal"));

async function openCoinModal({ symbol, id, name }) {
  try {
    // header
    document.getElementById("modalLogo").src =
      COINS.find((c) => c.symbol === symbol)?.img || "";
    document.getElementById("modalName").textContent = name;
    document.getElementById("modalSymbol").textContent = symbol;
    document.getElementById("modalAbout").textContent = ABOUT[symbol] || "—";

    // history
    const hres = await fetch(`/api/history/${id}?vs_currency=inr&days=365`);
    const hist = await hres.json();
    const points = (hist.prices || []).map((p) => ({
      t: new Date(p[0]),
      y: p[1],
    }));
    const labelsHist = points.map((p) => p.t.toISOString().slice(0, 10));
    const pricesHist = points.map((p) => p.y);

    // predictions (includes current price)
    const pres = await fetch(
      `/api/predict/${id}?symbol=${encodeURIComponent(symbol)}&vs_currency=inr`
    );
    const preds = pres.ok ? await pres.json() : {};

    document.getElementById("modalCurrent").textContent = preds.current_price
      ? formatINR(preds.current_price)
      : "—";
    document.getElementById("pred3m").textContent = preds.pred_3m
      ? formatINR(preds.pred_3m)
      : "—";
    document.getElementById("pred6m").textContent = preds.pred_6m
      ? formatINR(preds.pred_6m)
      : "—";
    document.getElementById("pred1y").textContent = preds.pred_1y
      ? formatINR(preds.pred_1y)
      : "—";

    // labels (history + 365 future days)
    const labelsFull = [...labelsHist];
    const lastDate = points.length ? new Date(points[points.length - 1].t) : new Date();
    for (let i = 1; i <= 365; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      labelsFull.push(d.toISOString().slice(0, 10));
    }

    // chart data
    const histPadded = [
      ...pricesHist,
      ...Array(labelsFull.length - pricesHist.length).fill(null),
    ];

    const ctx = document.getElementById("priceChart");
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labelsFull,
        datasets: [
          {
            label: "Historical (INR)",
            data: histPadded,
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 0,
          },
          {
            label: "Pred 3M",
            data: preds.series3m || [],
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
          },
          {
            label: "Pred 6M",
            data: preds.series6m || [],
            borderDash: [2, 6],
            borderWidth: 2,
            pointRadius: 0,
          },
          {
            label: "Pred 1Y",
            data: preds.series1y || [],
            borderDash: [1, 8],
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 10 } },
          y: {
            beginAtZero: false,
            ticks: {
              callback: (v) => INR_SYMBOL + new Intl.NumberFormat("en-IN").format(v),
            },
          },
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatINR(ctx.parsed.y)}`,
            },
          },
        },
      },
    });

    // portfolio handlers
    document.getElementById("btnAddPortfolio").onclick = () =>
      addToPortfolio(symbol, name, preds.current_price);

    const modeQty = document.getElementById("modeQty");
    const modeBudget = document.getElementById("modeBudget");
    modeQty.onchange = modeBudget.onchange = () => {
      document.getElementById("qtyGroup").style.display = modeQty.checked ? "" : "none";
      document.getElementById("budgetGroup").style.display = modeBudget.checked ? "" : "none";
    };

    coinModal().show();
  } catch (e) {
    console.error(e);
    toast("Failed to load coin details. Please try again.");
  }
}

// ---------------- Portfolio ----------------
function addToPortfolio(symbol, name, currentPrice) {
  const modeQty = document.getElementById("modeQty")?.checked;
  const qty = parseFloat(document.getElementById("inputQty")?.value || "0");
  const budget = parseFloat(document.getElementById("inputBudget")?.value || "0");

  let finalQty = 0;
  if (modeQty) {
    if (!qty || qty <= 0) return toast("Enter a valid quantity.");
    finalQty = qty;
  } else {
    if (!budget || budget <= 0 || !currentPrice)
      return toast("Enter a valid budget (and ensure price loaded).");
    finalQty = budget / currentPrice;
  }

  const key = "portfolio";
  const data = JSON.parse(localStorage.getItem(key) || "[]");
  const idx = data.findIndex((x) => x.symbol === symbol);
  if (idx >= 0) data[idx].qty += finalQty;
  else data.push({ symbol, name, qty: finalQty });

  localStorage.setItem(key, JSON.stringify(data));
  const q = document.getElementById("inputQty");
  const b = document.getElementById("inputBudget");
  if (q) q.value = "";
  if (b) b.value = "";
  toast(`${name} (${symbol}) added to portfolio.`);
}

// ---------------- Init ----------------
window.COIN_LIST = COINS;
if (document.getElementById("coinGrid")) renderGrid();
