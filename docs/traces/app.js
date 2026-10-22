(() => {
  const app = document.getElementById("app");
  const COLORS = SiteUtil.FAMILY_COLOR;
  const FAMILY_NAMES = {
    memory_safety: "Memory safety", injection: "Injection", resource: "Resource",
    info_disclosure: "Info disclosure", control_flow: "Control flow",
  };
  const state = { model: "qwen-7b", dataset: "deltasecommits", layer: "11", tLayer: "11", sort: "peak", dir: -1 };
  let data;

  // Text goes through textContent / createTextNode only.
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style") el.style.cssText = v;
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  const show = (...kids) => app.replaceChildren(...kids.flat(Infinity).filter(Boolean));
  const shade = (t) => `color-mix(in srgb, var(--primary) ${Math.round(6 + Math.max(0, Math.min(1, t)) * 94)}%, var(--surface))`;
  const ink = (t) => (t > 0.55 ? "#fff" : "var(--text)");

  const modelSelect = (keys, onchange) => {
    const s = h("select", { onchange: (e) => onchange(e.target.value) },
      keys.map((k) => h("option", { value: k, selected: k === state.model }, data.models[k].label)));
    return h("label", { class: "ctrl" }, "Model", s);
  };
  const layerChips = (layers, cur, onpick) =>
    h("div", { class: "ctrl" }, "Layer",
      h("div", { class: "chips" }, layers.map((L) => h("button", { type: "button", class: "chip" + (L === cur ? " on" : ""), onclick: () => onpick(L) }, "L" + L))));

  const sortedLayers = (obj) => Object.keys(obj).map(Number).sort((a, b) => a - b).map(String);

  /* ---------- alignment ---------- */
  function renderAlignment() {
    const host = h("div");
    show(
      h("div", { class: "panel-head" },
        h("h1", {}, "Vulnerability-direction alignment"),
        h("p", {}, "For each (secure, vulnerable) pair, does the vulnerable version project further along the vulnerability direction? Every model sits at 87–88% through the middle layers. That is the relational signal.")),
      h("figure", { class: "figure", style: "margin:0" }, host));
    AlignmentChart(host, data, { yMin: 60 });
  }

  /* ---------- CWE pairs ---------- */
  function renderPairs() {
    const keys = Object.keys(data.models).filter((k) => Object.keys(data.models[k].pairwise).length);
    if (!keys.includes(state.model)) state.model = keys[0];
    const m = data.models[state.model];
    const dsKeys = Object.keys(m.pairwise);
    if (!dsKeys.includes(state.dataset)) state.dataset = dsKeys[0];
    const pw = m.pairwise[state.dataset];
    const layers = sortedLayers(pw.layers);
    if (!layers.includes(state.layer)) state.layer = layers.includes("11") ? "11" : layers[0];
    const M = pw.layers[state.layer];
    const n = pw.cwes.length;

    const off = [];
    let worst = null;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      off.push(M[i][j]);
      if (!worst || M[i][j] < worst.v) worst = { v: M[i][j], a: pw.cwes[i], b: pw.cwes[j] };
    }
    const mean = off.reduce((a, b) => a + b, 0) / off.length;
    const med = [...off].sort((a, b) => a - b)[Math.floor(off.length / 2)];

    const detail = h("div", { class: "detail" }, "Hover a cell for the pair.");
    const table = h("table", { class: "heat" },
      h("thead", {}, h("tr", {}, h("th"), pw.cwes.map((c) => h("th", { class: "col" }, c)))),
      h("tbody", {}, pw.cwes.map((r, i) => h("tr", {}, h("th", { class: "row" }, r),
        pw.cwes.map((c, j) => {
          const v = M[i][j], t = (v - 0.5) / 0.5;
          return h("td", {
            class: i === j ? "diag" : "", style: i === j ? "" : `background:${shade(t)};color:${ink(t)}`,
            onmouseenter: () => detail.replaceChildren(h("b", {}, `${r} vs ${c}`), ` · AUROC ${v.toFixed(3)}`),
          }, i === j ? "·" : v.toFixed(2));
        })))));

    show(
      h("div", { class: "panel-head" },
        h("h1", {}, "CWE-type separability"),
        h("p", {}, "Pairwise AUROC for telling two vulnerability types apart from the same representations. Most pairs are highly separable. Related memory-safety types are the weak spots."),
        modelSelect(keys, (v) => { state.model = v; renderPairs(); }),
        h("label", { class: "ctrl" }, "Dataset",
          h("select", { onchange: (e) => { state.dataset = e.target.value; renderPairs(); } },
            dsKeys.map((d) => h("option", { value: d, selected: d === state.dataset }, data.datasets[d])))),
        layerChips(layers, state.layer, (L) => { state.layer = L; renderPairs(); })),
      h("div", { class: "kpis" },
        h("div", { class: "kpi" }, h("b", {}, mean.toFixed(3)), h("span", {}, "mean pairwise AUROC")),
        h("div", { class: "kpi" }, h("b", {}, med.toFixed(3)), h("span", {}, "median pairwise AUROC")),
        h("div", { class: "kpi" }, h("b", {}, worst.v.toFixed(3)), h("span", {}, `hardest: ${worst.a} vs ${worst.b}`))),
      h("figure", { class: "figure", style: "margin:0" },
        h("div", { class: "heat-wrap" }, table),
        detail,
        h("div", { class: "legend" }, "0.5", h("span", { class: "bar" }), "1.0")));
  }

  /* ---------- transfer ---------- */
  function renderTransfer() {
    const keys = Object.keys(data.models).filter((k) => data.models[k].transfer);
    if (!keys.includes(state.model)) state.model = keys[0];
    const m = data.models[state.model];
    const layers = sortedLayers(m.transfer);
    if (!layers.includes(state.tLayer)) state.tLayer = layers[0];
    const T = m.transfer[state.tLayer];
    const fams = data.families.filter((f) => `${f}->${f}` in T);

    const cross = [];
    fams.forEach((a) => fams.forEach((b) => { if (a !== b) cross.push(T[`${a}->${b}`]); }));
    const mean = cross.reduce((a, b) => a + b, 0) / cross.length;
    const detail = h("div", { class: "detail" }, "Hover a cell. Rows are the family the direction was learned on, columns the family it is tested on.");

    const table = h("table", { class: "heat" },
      h("thead", {}, h("tr", {}, h("th"), fams.map((f) => h("th", { class: "col" }, FAMILY_NAMES[f] || f)))),
      h("tbody", {}, fams.map((a) => h("tr", {}, h("th", { class: "row" }, `${FAMILY_NAMES[a] || a}${m.family_pairs ? ` (${m.family_pairs[a]})` : ""}`),
        fams.map((b) => {
          const v = T[`${a}->${b}`], t = (v - 50) / 50;
          return h("td", {
            style: `background:${shade(t)};color:${ink(t)}`,
            onmouseenter: () => detail.replaceChildren(h("b", {}, `${FAMILY_NAMES[a]} → ${FAMILY_NAMES[b]}`), ` · ${v.toFixed(1)}% of pairs aligned`),
          }, v.toFixed(0));
        })))));

    show(
      h("div", { class: "panel-head" },
        h("h1", {}, "Cross-family direction transfer"),
        h("p", {}, "Learn the vulnerability direction on one bug family, then test per-pair alignment on another. Columns are nearly constant: which family the direction was learned on barely matters, and the family being tested sets the score. That is consistent with one shared relational axis across bug types."),
        modelSelect(keys, (v) => { state.model = v; renderTransfer(); }),
        layerChips(layers, state.tLayer, (L) => { state.tLayer = L; renderTransfer(); })),
      h("div", { class: "kpis" },
        h("div", { class: "kpi" }, h("b", {}, mean.toFixed(1) + "%"), h("span", {}, "mean cross-family transfer (off-diagonal)")),
        h("div", { class: "kpi" }, h("b", {}, Math.min(...cross).toFixed(1) + "%"), h("span", {}, "weakest transfer"))),
      h("figure", { class: "figure", style: "margin:0" },
        h("div", { class: "heat-wrap" }, table),
        detail,
        h("div", { class: "legend" }, "50%", h("span", { class: "bar" }), "100%")));
  }

  /* ---------- models ---------- */
  function renderModels() {
    const rows = Object.entries(data.models).map(([k, m]) => {
      const L = sortedLayers(m.alignment);
      const vals = L.map((l) => m.alignment[l]);
      const peak = Math.max(...vals);
      return {
        k, label: m.label, family: m.family, size: m.size_b, peak, peakL: L[vals.indexOf(peak)],
        mean: vals.reduce((a, b) => a + b, 0) / vals.length, last: m.alignment["27"],
        auroc: m.length_controlled ? m.length_controlled.auroc : null,
      };
    });
    const cols = [
      ["label", "Model"], ["size", "Params (B)"], ["peak", "Peak alignment"], ["mean", "Mean alignment"],
      ["last", "Layer 27"], ["auroc", "Global AUROC (length-ctrl.)"],
    ];
    rows.sort((a, b) => (a[state.sort] > b[state.sort] ? 1 : -1) * state.dir);
    const maxAuc = 1, minAuc = 0.5;
    const head = h("tr", {}, cols.map(([key, name]) => h("th", {
      class: "sortable" + (key === "label" ? "" : " num"),
      onclick: () => { state.dir = state.sort === key ? -state.dir : -1; state.sort = key; renderModels(); },
    }, name, h("span", { class: "arrow" }, state.sort === key ? (state.dir < 0 ? "↓" : "↑") : ""))));
    const body = rows.map((r) => h("tr", {},
      h("td", {}, h("span", { style: `display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:${COLORS[r.family]}` }), h("strong", {}, r.label)),
      h("td", { class: "num" }, r.size),
      h("td", { class: "num" }, `${r.peak.toFixed(1)}% `, h("span", { class: "pill" }, "L" + r.peakL)),
      h("td", { class: "num" }, r.mean.toFixed(1) + "%"),
      h("td", { class: "num" }, r.last != null ? r.last.toFixed(1) + "%" : "–"),
      h("td", { class: "num bar-cell" }, r.auroc == null ? "–" : [r.auroc.toFixed(3), h("div", {}, h("i", { style: `width:${((r.auroc - minAuc) / (maxAuc - minAuc)) * 100}%;background:${COLORS[r.family]}` }))])));

    show(
      h("div", { class: "panel-head" },
        h("h1", {}, "Per-model summary"),
        h("p", {}, "Relative (paired) signal is near its ceiling for every model, while the global classifier sits between chance and 0.66. Click a column to sort.")),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, head), h("tbody", {}, body))));
  }

  const views = { alignment: renderAlignment, pairs: renderPairs, transfer: renderTransfer, models: renderModels };
  function route() {
    const tab = (location.hash.match(/^#\/(\w+)/) || [])[1];
    const name = views[tab] ? tab : "alignment";
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
    views[name]();
  }

  fetch("data/explorer.json").then((r) => r.json()).then((d) => {
    data = d;
    addEventListener("hashchange", route);
    route();
  }).catch(() => show(h("p", { class: "empty" }, "Could not load data/explorer.json. Serve this folder over HTTP.")));
})();
