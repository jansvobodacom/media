// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: chart-bar;

// ============================================================
//  ZADEČKY 2027 – widget objednávek ze Shoptetu (Scriptable)
//  Data: vlastní export „Widget iPhone - kalendare“ (Shoptet)
//  Odkaz s heslem (hash) je uložený v Klíčence iPhonu, ne tady.
// ============================================================

const KEY = "zadecky_shoptet_url";
const FROM = "2026-08-01";          // začátek předprodeje 2027
const GOAL = 800;                   // vytištěno celkem
const ITEM = /^467\//;              // 467/SAM a 467/KAL = ZADEČKY 2027
const ADMIN = "https://shop.jansvoboda.com/admin/prehled-objednavek/";

const C = {
  bg1: new Color("#1d0f24"), bg2: new Color("#0c060f"),
  pink: new Color("#ff2d8f"), pinkSoft: new Color("#ff2d8f", 0.45),
  text: Color.white(), dim: new Color("#ffffff", 0.6), faint: new Color("#ffffff", 0.15),
};

// ---------- pomocné ----------
function ymd(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function num(s) { return parseFloat(String(s || "").replace(/[^\d,.\-]/g, "").replace(",", ".")) || 0; }
function fmt(n) { return Math.round(n).toLocaleString("cs-CZ").replace(/,/g, " "); }
function mondayOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return ymd(d);
}

// ---------- odkaz na export ----------
async function askUrl() {
  const a = new Alert();
  a.title = "Odkaz na export ze Shoptetu";
  a.message = "Vlož trvalý odkaz exportu „Widget iPhone - kalendare“ (Shoptet → Objednávky → Export).";
  a.addTextField("https://shop.jansvoboda.com/export/orders.csv?…", Pasteboard.pasteString() || "");
  a.addAction("Uložit");
  a.addCancelAction("Zrušit");
  if (await a.presentAlert() === -1) return null;
  let u = a.textFieldValue(0).trim().replace(/&dateFrom=[^&]*/g, "");
  if (!/^https:\/\/shop\.jansvoboda\.com\/export\/orders\.csv\?/.test(u) || !/patternId=/.test(u)) {
    const e = new Alert();
    e.title = "Tohle není odkaz na export";
    e.message = "Musí začínat https://shop.jansvoboda.com/export/orders.csv?patternId=…";
    e.addAction("OK");
    await e.presentAlert();
    return null;
  }
  Keychain.set(KEY, u);
  return u;
}

// ---------- výpočet ----------
// bin = CSV jako "binární" řetězec (1 znak = 1 bajt, Shoptet posílá windows-1250).
// Porovnáváme jen ASCII části, takže diakritika nevadí.
function compute(bin) {
  const lines = bin.split("\n");
  const today = ymd(new Date());
  const days = {}, dayOrd = {};
  const s = { paid: 0, unpaid: 0, toShip: 0, shipped: 0, todayKs: 0, sam: 0, kal: 0, rev: 0 };
  const orders = new Set(), todayOrders = new Set(), unpaidOrders = new Set();
  let lastOrder = "";

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const f = l.replace(/^"/, "").replace(/";?$/, "").split('";"');
    const [code, date, status, amt, item, price, , rate] = f;
    if (!ITEM.test(item || "")) continue;
    if (/Stornov/.test(status)) continue;

    const n = num(amt);
    const d = (date || "").slice(0, 10);
    days[d] = (days[d] || 0) + n;
    (dayOrd[d] = dayOrd[d] || new Set()).add(code);
    if (d === today) { s.todayKs += n; todayOrders.add(code); }
    if ((date || "") > lastOrder) lastOrder = date;

    if (/^Nevy/.test(status)) { s.unpaid += n; unpaidOrders.add(code); continue; }

    s.paid += n;
    orders.add(code);
    if (/KAL odesl/.test(status)) s.shipped += n;
    else s.toShip += n;                       // Zaplacena, KAL k odeslání…
    if (/SAM/.test(item)) s.sam += n; else s.kal += n;
    const r = num(rate) || 1;                 // EUR: kurz CZK→EUR, tak dělíme
    s.rev += num(price) / r;
  }
  s.orders = orders.size;
  s.todayOrders = todayOrders.size;
  s.unpaidOrders = unpaidOrders.size;
  s.rev = Math.round(s.rev);
  s.days = days;
  s.dayOrders = {};
  Object.keys(dayOrd).forEach(k => s.dayOrders[k] = dayOrd[k].size);
  s.lastOrder = lastOrder;
  return s;
}

// ---------- načtení (s cache, když není signál) ----------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "zadecky2027_cache.json");

async function load(url) {
  try {
    const r = new Request(url + "&dateFrom=" + FROM);
    r.timeoutInterval = 30;
    const data = await r.load();
    const bin = atob(data.toBase64String());
    if (!/^"code"/.test(bin)) throw new Error("Shoptet vrátil něco jiného než CSV");
    const s = compute(bin);
    s.fetched = Date.now();
    fm.writeString(cachePath, JSON.stringify(s));
    return s;
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      const s = JSON.parse(fm.readString(cachePath));
      s.stale = true;
      return s;
    }
    throw e;
  }
}

// ---------- grafy ----------
function lastNDays(days, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = ymd(d);
    out.push({ k, v: days[k] || 0 });
  }
  return out;
}
function byWeek(days) {
  const w = {};
  Object.keys(days).forEach(k => { const m = mondayOf(k); w[m] = (w[m] || 0) + days[k]; });
  const keys = [];
  let d = new Date(mondayOf(FROM) + "T12:00:00");
  const end = new Date(mondayOf(ymd(new Date())) + "T12:00:00");
  while (d <= end) { keys.push(ymd(d)); d.setDate(d.getDate() + 7); }
  const out = keys.map(k => ({ k, v: w[k] || 0 }));
  while (out.length > 1 && out[0].v === 0) out.shift();   // bez prázdných týdnů na začátku
  return out;
}
function bars(items, w, h, labels) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const axis = labels === true;
  const lh = axis ? 12 : 0;
  const top = labels ? 14 : 2;
  const max = Math.max(1, ...items.map(x => x.v));
  const bw = w / items.length;
  items.forEach((x, i) => {
    const bh = x.v > 0 ? Math.max(3, (h - lh - top) * x.v / max) : 2;
    const p = new Path();
    p.addRoundedRect(new Rect(i * bw + bw * 0.15, h - lh - bh, bw * 0.7, bh), 2, 2);
    dc.addPath(p);
    dc.setFillColor(x.v === 0 ? C.faint : (i === items.length - 1 ? C.pink : C.pinkSoft));
    dc.fillPath();
    if (labels && x.v > 0) {                 // číslo nad sloupcem
      dc.setFont(Font.semiboldSystemFont(9));
      dc.setTextColor(i === items.length - 1 ? C.pink : C.dim);
      dc.setTextAlignedCenter();
      dc.drawTextInRect(fmt(x.v), new Rect(i * bw, h - lh - bh - 12, bw, 11));
    }
  });
  dc.setTextAlignedLeft();
  if (axis) {
    dc.setFont(Font.systemFont(9));
    dc.setTextColor(C.dim);
    const f = items[0].k.slice(8, 10) + "." + items[0].k.slice(5, 7) + ".";
    dc.drawText(f, new Point(0, h - 11));
    dc.setTextAlignedRight();
    dc.drawTextInRect("dnes", new Rect(0, h - 11, w, 11));
  }
  return dc.getImage();
}
function progress(v, max, w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h); dc.opaque = false; dc.respectScreenScale = true;
  let p = new Path(); p.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2);
  dc.addPath(p); dc.setFillColor(C.faint); dc.fillPath();
  const fw = Math.max(h, Math.min(1, v / max) * w);
  p = new Path(); p.addRoundedRect(new Rect(0, 0, fw, h), h / 2, h / 2);
  dc.addPath(p); dc.setFillColor(C.pink); dc.fillPath();
  return dc.getImage();
}

// ---------- widget ----------
function txt(stack, t, font, color) {
  const x = stack.addText(t); x.font = font; x.textColor = color || C.text; x.lineLimit = 1;
  x.minimumScaleFactor = 0.6; return x;
}

function build(s, family) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.bg1, C.bg2]; g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = ADMIN;
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const y = new Date(); y.setDate(y.getDate() - 1);
  const yKs = s.days[ymd(y)] || 0;
  const pct = Math.round(s.paid / GOAL * 100);
  const small = family === "small";

  // hlavička
  const head = w.addStack();
  head.centerAlignContent();
  txt(head, "🍑 ZADEČKY 2027", Font.heavySystemFont(small ? 11 : 12), C.pink);
  head.addSpacer();
  if (!small) txt(head, (s.stale ? "⚠︎ " : "") + new Date(s.fetched).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }), Font.systemFont(10), C.dim);
  w.addSpacer(small ? 2 : 6);

  // dnes (velké) + včera (menší) – počet objednávek
  const od = s.dayOrders || {};
  const tOrd = od[ymd(new Date())] || 0;
  const yOrd = od[ymd(y)] || 0;
  const row = w.addStack();
  row.bottomAlignContent();
  const left = row.addStack();
  left.layoutVertically();
  const medium = family === "medium";
  if (!medium) txt(left, "dnes", Font.semiboldSystemFont(11), C.pink);
  const big = left.addStack();
  big.bottomAlignContent();
  txt(big, fmt(tOrd), Font.heavyRoundedSystemFont(small ? 40 : family === "large" ? 50 : 36));
  big.addSpacer(4);
  txt(big, "obj.", Font.semiboldSystemFont(14), C.dim);
  if (medium) { big.addSpacer(4); txt(big, "dnes", Font.semiboldSystemFont(14), C.pink); }
  if (!small) {
    row.addSpacer();
    const yv = row.addStack();
    yv.layoutVertically();
    const l1 = yv.addStack(); l1.addSpacer(); txt(l1, "včera", Font.systemFont(11), C.dim);
    const l2 = yv.addStack(); l2.addSpacer(); txt(l2, fmt(yOrd) + " obj.", Font.boldRoundedSystemFont(family === "large" ? 22 : 18), C.dim);
  } else {
    txt(w, "včera " + fmt(yOrd) + " obj.", Font.semiboldSystemFont(12), C.dim);
  }

  // graf (střední a velký)
  if (!small) {
    w.addSpacer(family === "large" ? 14 : 4);
    const ch = family === "large" ? 190 : 42;
    const img = w.addImage(bars(lastNDays(s.dayOrders || s.days, 14), 305, ch, family === "large" ? true : "values"));
    img.imageSize = new Size(305, ch);
  }

  // progress bar
  w.addSpacer();
  const pr = w.addStack();
  txt(pr, fmt(s.paid) + " ks z " + fmt(GOAL), Font.systemFont(10), C.dim);
  pr.addSpacer();
  txt(pr, pct + " %", Font.boldSystemFont(10), C.text);
  w.addSpacer(3);
  const pw = small ? 128 : 305;
  const pi = w.addImage(progress(s.paid, GOAL, pw, 7));
  pi.imageSize = new Size(pw, 7);
  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = C.bg2;
  txt(w, "🍑 ZADEČKY 2027", Font.heavySystemFont(12), C.pink);
  w.addSpacer(6);
  const t = w.addText(msg); t.font = Font.systemFont(11); t.textColor = C.dim;
  return w;
}

// ---------- spuštění ----------
let url = Keychain.contains(KEY) ? Keychain.get(KEY) : null;

if (config.runsInApp) {
  if (url) {
    const m = new Alert();
    m.title = "ZADEČKY 2027";
    m.addAction("Náhled widgetu");
    m.addAction("Změnit odkaz na export");
    m.addCancelAction("Zavřít");
    const ch = await m.presentAlert();
    if (ch === 1) url = await askUrl() || url;
    if (ch === -1) { Script.complete(); return; }
  } else {
    url = await askUrl();
  }
}

let widget;
if (!url) {
  widget = errorWidget("Otevři skript v appce Scriptable a vlož odkaz na export.");
} else {
  try {
    const s = await load(url);
    widget = build(s, config.widgetFamily || "large");
  } catch (e) {
    widget = errorWidget("Nejde načíst Shoptet: " + e.message);
  }
}

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
