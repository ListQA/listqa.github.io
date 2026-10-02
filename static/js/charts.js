/* Small, dependency-free charts for the ListQA page.
 *
 * Every number here is copied from the paper's tables or computed from the
 * released dataset (see scripts/build_data.py). Each chart shows a tooltip
 * on hover.
 */
(function () {
  "use strict";

  var C = {
    simple: "#4a7beb",
    complex: "#e0922a",
    accent: "#4a7beb",
  };

  var fmt = function (n, d) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  };

  var CHARTS = {
    // ---------------------------------------------------------------- dataset
    categories: {
      type: "hbar",
      title: "Questions per category",
      series: [{ key: "s", name: "SimpleListQA", color: C.simple }, { key: "c", name: "ComplexListQA", color: C.complex }],
      rows: [
        { label: "Sports", s: 1100, c: 722 },
        { label: "Entertainment", s: 1033, c: 731 },
        { label: "Politics", s: 950, c: 789 },
        { label: "Movies", s: 927, c: 772 },
        { label: "Lifestyle", s: 279, c: 275 },
        { label: "Places of Interest", s: 360, c: 139 },
        { label: "Food", s: 341, c: 153 },
        { label: "Travel", s: 388, c: 86 },
      ],
      total: 9045,
      max: 2000,
      ticks: [0, 500, 1000, 1500, 2000],
    },
    listLength: {
      type: "columns",
      title: "Top-level elements per reference answer",
      xLabel: "elements",
      color: C.accent,
      rows: [
        { label: "3", n: 2985 }, { label: "4", n: 1883 }, { label: "5", n: 1709 },
        { label: "6", n: 1002 }, { label: "7", n: 725 }, { label: "8", n: 741 },
      ],
      total: 9045,
      max: 3000,
      ticks: [0, 1000, 2000, 3000],
      height: 120,
    },
    years: {
      type: "columns",
      title: "Year-constrained questions whose time window includes each year",
      color: C.accent,
      rows: [
        [2000, 296], [2001, 334], [2002, 358], [2003, 387], [2004, 398], [2005, 424], [2006, 431],
        [2007, 440], [2008, 450], [2009, 469], [2010, 496], [2011, 484], [2012, 485], [2013, 492],
        [2014, 518], [2015, 513], [2016, 518], [2017, 1329], [2018, 1610], [2019, 1679], [2020, 1683],
        [2021, 1666], [2022, 2593], [2023, 2916], [2024, 2772],
      ].map(function (r) { return { label: String(r[0]), n: r[1] }; }),
      max: 3000,
      ticks: [0, 1000, 2000, 3000],
      tickEvery: ["2000", "2008", "2016", "2024"],
      height: 110,
      noShare: true,
    },

  };

  // ---------------------------------------------------------------- tooltip
  var tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.hidden = true;
  document.body.appendChild(tip);

  function showTip(target, lines, evt) {
    tip.textContent = "";
    lines.forEach(function (l, i) {
      var row = document.createElement("div");
      row.className = i === 0 ? "chart-tip-title" : "chart-tip-row";
      if (l.color) {
        var key = document.createElement("span");
        key.className = "chart-tip-key";
        key.style.background = l.color;
        row.appendChild(key);
      }
      if (l.value !== undefined) {
        var v = document.createElement("strong");
        v.textContent = l.value;
        row.appendChild(v);
        row.appendChild(document.createTextNode(" " + (l.text || "")));
      } else {
        row.textContent = l.text;
      }
      tip.appendChild(row);
    });
    tip.hidden = false;
    var r = target.getBoundingClientRect();
    var x = evt && evt.clientX ? evt.clientX : r.left + r.width / 2;
    var y = evt && evt.clientY ? evt.clientY : r.top;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.min(window.innerWidth - tw - 8, Math.max(8, x - tw / 2));
    var top = y - th - 12;
    if (top < 8) top = y + 18;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.hidden = true; }

  function bindTip(node, lines) {
    node.addEventListener("pointermove", function (e) { showTip(node, lines, e); });
    node.addEventListener("pointerleave", hideTip);
  }

  // ---------------------------------------------------------------- helpers
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function legend(series) {
    var box = h("div", "chart-legend");
    series.forEach(function (s) {
      var item = h("span", "chart-legend-item");
      var sw = h("span", "chart-swatch" + (s.shape === "dot" ? " is-dot" : ""));
      sw.style.background = s.color;
      item.appendChild(sw);
      item.appendChild(document.createTextNode(s.name));
      box.appendChild(item);
    });
    return box;
  }

  function axis(ticks, max, fmtTick) {
    var ax = h("div", "chart-axis");
    ticks.forEach(function (t) {
      var tk = h("span", "chart-tick", fmtTick ? fmtTick(t) : fmt(t));
      tk.style.left = (t / max) * 100 + "%";
      ax.appendChild(tk);
    });
    return ax;
  }

  function grid(ticks, max) {
    var g = h("div", "chart-grid");
    g.setAttribute("aria-hidden", "true");
    ticks.forEach(function (t) {
      var line = h("span");
      line.style.left = (t / max) * 100 + "%";
      g.appendChild(line);
    });
    return g;
  }

  // ---------------------------------------------------------------- renderers
  function renderHbar(el, spec) {
    var multi = spec.series.length > 1;
    if (multi) el.appendChild(legend(spec.series));
    var body = h("div", "chart-hbar");
    spec.rows.forEach(function (r) {
      var total = spec.series.reduce(function (a, s) { return a + r[s.key]; }, 0);
      var row = h("div", "chart-row");
      row.appendChild(h("span", "chart-label", r.label));
      var track = h("div", "chart-track");
      track.appendChild(grid(spec.ticks, spec.max));
      var bar = h("div", "chart-bar");
      bar.style.width = (total / spec.max) * 100 + "%";
      spec.series.forEach(function (s) {
        var seg = h("span", "chart-seg");
        seg.style.flexGrow = String(r[s.key]);
        seg.style.background = s.color;
        bar.appendChild(seg);
      });
      track.appendChild(bar);
      var share = spec.total ? " (" + fmt((total / spec.total) * 100, 1) + "%)" : "";
      var lines = [{ text: r.label }];
      spec.series.forEach(function (s) { if (multi) lines.push({ color: s.color, value: fmt(r[s.key]), text: s.name }); });
      lines.push({ value: fmt(total), text: "total" + share });
      bindTip(bar, lines);
      row.appendChild(track);
      body.appendChild(row);
    });
    var axRow = h("div", "chart-row is-axis");
    axRow.appendChild(h("span", "chart-label"));
    var axTrack = h("div", "chart-track");
    axTrack.appendChild(axis(spec.ticks, spec.max));
    axRow.appendChild(axTrack);
    body.appendChild(axRow);
    el.appendChild(body);

  }

  function renderColumns(el, spec) {
    var body = h("div", "chart-columns");
    var plot = h("div", "chart-col-plot");
    if (spec.height) plot.style.height = spec.height + "px";
    spec.ticks.forEach(function (t) {
      var line = h("span", "chart-hline");
      line.style.bottom = (t / spec.max) * 100 + "%";
      line.setAttribute("data-tick", fmt(t));
      plot.appendChild(line);
    });
    var cols = h("div", "chart-cols");
    spec.rows.forEach(function (r) {
      var col = h("div", "chart-col");
      var bar = h("span", "chart-colbar");
      bar.style.height = (r.n / spec.max) * 100 + "%";
      bar.style.background = spec.color;
      var share = spec.noShare || !spec.total ? "" : " (" + fmt((r.n / spec.total) * 100, 1) + "%)";
      bindTip(bar, [{ text: r.label + (spec.xLabel ? " " + spec.xLabel : "") }, { value: fmt(r.n), text: "questions" + share }]);
      col.appendChild(bar);
      cols.appendChild(col);
    });
    plot.appendChild(cols);
    body.appendChild(plot);
    var xs = h("div", "chart-xlabels");
    spec.rows.forEach(function (r) {
      var show = !spec.tickEvery || spec.tickEvery.indexOf(r.label) !== -1;
      xs.appendChild(h("span", null, show ? r.label : ""));
    });
    body.appendChild(xs);
    el.appendChild(body);
  }

  var RENDER = { hbar: renderHbar, columns: renderColumns };

  document.querySelectorAll("[data-chart]").forEach(function (el) {
    var spec = CHARTS[el.getAttribute("data-chart")];
    if (!spec) return;
    el.classList.add("chart");
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", spec.title);
    RENDER[spec.type](el, spec);
  });
  // World coverage map: inline the pre-rendered SVG (scripts/build_map.mjs) and
  // add hover tooltips to covered countries.
  document.querySelectorAll("[data-map]").forEach(function (el) {
    fetch(el.getAttribute("data-map"))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (svg) {
        el.innerHTML = svg;
        el.querySelectorAll("[data-name]").forEach(function (node) {
          var n = Number(node.getAttribute("data-n"));
          bindTip(node, [{ text: node.getAttribute("data-name") }, { value: fmt(n), text: n === 1 ? "question" : "questions" }]);
        });
      })
      .catch(function () {
        el.innerHTML = '<img src="' + el.getAttribute("data-map") + '" alt="World map of countries covered by ListQA">';
      });
  });

  window.addEventListener("scroll", hideTip, { passive: true });
})();
