/* Shared behaviour: theme, copy-to-clipboard, scroll helpers, and the alignment chart. */
(() => {
  const root = document.documentElement;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const saved = store.get("theme");
  if (saved) root.dataset.theme = saved;

  const isDark = () => root.dataset.theme === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    const paint = () => { b.textContent = isDark() ? "☀" : "☾"; };
    paint();
    b.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      store.set("theme", root.dataset.theme);
      paint();
    });
  });

  document.querySelectorAll("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const target = document.querySelector(b.dataset.copy);
      try { await navigator.clipboard.writeText(target.innerText); b.textContent = "Copied"; }
      catch (e) { b.textContent = "Press ⌘C"; }
      setTimeout(() => { b.textContent = "Copy"; }, 1600);
    });
  });

  const top = document.querySelector(".to-top");
  if (top) {
    addEventListener("scroll", () => top.classList.toggle("show", scrollY > 600), { passive: true });
    top.addEventListener("click", () => scrollTo({ top: 0 }));
  }

  const links = [...document.querySelectorAll(".nav .links a[href^='#']")];
  if (links.length && "IntersectionObserver" in window) {
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => a.classList.remove("on")); map.get(e.target.id)?.classList.add("on"); } });
    }, { rootMargin: "-40% 0px -55% 0px" });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /* ---------- alignment chart ---------- */
  const FAMILY_COLOR = { Qwen: "#2563eb", CodeLlama: "#f59e0b", StarCoder2: "#059669", DeepSeek: "#db2777" };
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };

  window.AlignmentChart = function (container, data, opts = {}) {
    const W = 760, H = 380, m = { l: 52, r: 24, t: 16, b: 46 };
    const yMin = opts.yMin ?? 60, yMax = 100;
    const layers = [0, 3, 7, 11, 15, 19, 23, 27];
    const x = (L) => m.l + (L / 27) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
    const keys = Object.keys(data.models).filter((k) => data.models[k].alignment);
    const on = new Set(opts.initial || keys);

    container.innerHTML = "";
    const chips = document.createElement("div");
    chips.className = "chips";
    chips.style.marginBottom = "14px";
    const chart = document.createElement("div");
    chart.className = "chart";
    const tip = document.createElement("div");
    tip.className = "tip";
    container.append(chips, chart);
    chart.append(tip);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Per-pair vulnerability direction alignment by layer for 8 code models" });
    chart.prepend(svg);

    for (let v = yMin; v <= yMax; v += 10) {
      svg.append(el("line", { class: "grid", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      svg.append(el("text", { x: m.l - 10, y: y(v) + 4, "text-anchor": "end" }, v + "%"));
    }
    layers.forEach((L) => svg.append(el("text", { x: x(L), y: H - m.b + 20, "text-anchor": "middle" }, "L" + L)));
    svg.append(el("text", { class: "axis-label", x: (W + m.l) / 2, y: H - 6, "text-anchor": "middle" }, "Layer"));
    svg.append(el("text", { class: "axis-label", transform: `translate(14 ${H / 2}) rotate(-90)`, "text-anchor": "middle" }, "Per-pair alignment"));
    if (yMin <= 50) {
      svg.append(el("line", { x1: m.l, x2: W - m.r, y1: y(50), y2: y(50), stroke: "var(--text-3)", "stroke-dasharray": "4 4" }));
      svg.append(el("text", { x: W - m.r, y: y(50) - 6, "text-anchor": "end" }, "chance (50%)"));
    }

    const lines = el("g");
    const guide = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--text-3)", "stroke-width": 1, opacity: 0 });
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" });
    svg.append(lines, guide, hit);

    const label = (k) => data.models[k].label;
    const color = (k) => FAMILY_COLOR[data.models[k].family];
    const dash = (k) => (data.models[k].size_b >= 13 ? "6 4" : "none");

    function draw() {
      lines.replaceChildren();
      keys.filter((k) => on.has(k)).forEach((k) => {
        const a = data.models[k].alignment;
        const pts = layers.filter((L) => a[L] != null).map((L) => [x(L), y(a[L])]);
        lines.append(el("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: color(k), "stroke-width": 2.5, "stroke-dasharray": dash(k), "stroke-linejoin": "round", "stroke-linecap": "round" }));
        pts.forEach((p) => lines.append(el("circle", { cx: p[0], cy: p[1], r: 3.6, fill: color(k), stroke: "var(--surface)", "stroke-width": 1.5 })));
      });
    }

    keys.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (on.has(k) ? " on" : "");
      b.innerHTML = `<i style="background:${color(k)}"></i>`;
      b.append(label(k).replace("-Instruct", ""));
      b.addEventListener("click", () => {
        on.has(k) ? on.delete(k) : on.add(k);
        b.classList.toggle("on", on.has(k));
        draw();
      });
      chips.append(b);
    });

    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const L = layers.reduce((best, c) => (Math.abs(x(c) - px) < Math.abs(x(best) - px) ? c : best), layers[0]);
      guide.setAttribute("x1", x(L)); guide.setAttribute("x2", x(L)); guide.setAttribute("opacity", 1);
      const rows = keys.filter((k) => on.has(k) && data.models[k].alignment[L] != null)
        .sort((a, b) => data.models[b].alignment[L] - data.models[a].alignment[L]);
      tip.innerHTML = `<b>Layer ${L}</b>` + rows.map((k) => `<div><span style="color:${color(k)}">●</span> ${label(k).replace("-Instruct", "")}: <b>${data.models[k].alignment[L].toFixed(1)}%</b></div>`).join("");
      const cr = chart.getBoundingClientRect();
      tip.style.left = Math.min(Math.max(e.clientX - cr.left, 90), cr.width - 90) + "px";
      tip.style.top = (e.clientY - cr.top) + "px";
      tip.classList.add("show");
    });
    hit.addEventListener("pointerleave", () => { tip.classList.remove("show"); guide.setAttribute("opacity", 0); });
    draw();
  };

  window.SiteUtil = { FAMILY_COLOR, el };
})();
