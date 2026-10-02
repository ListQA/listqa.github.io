/* ListQA dataset explorer.
 *
 * Lazily fetches data/listqa.bin (built by scripts/build_data.py; data/listqa.js
 * when opened from disk) when the explorer section approaches the viewport,
 * decodes it in the browser, and shows a few matching samples at a time next
 * to a filter sidebar. All filtering is in-memory.
 */
(function () {
  "use strict";

  var DATA_URL = "data/listqa.bin";
  var DATA_JS_URL = "data/listqa.js"; // same bytes, for file:// (see scriptData)
  // Must match scripts/build_data.py.
  var XOR_KEY = "ListQA-NeurIPS2026-explorer";
  var MAGIC = "LQA1";
  var WIKI_PREFIX = "https://en.wikipedia.org/wiki/";
  var PAGE_SIZE = 5;

  var F = { question: 0, answer: 1, category: 2, complex: 3, continent: 4, country: 5,
            yearStart: 6, yearEnd: 7, ordered: 8, source: 9, nElements: 10 };

  var root = document.getElementById("explorer-app");
  if (!root) return;

  var el = {
    status: root.querySelector("[data-role=status]"),
    controls: root.querySelector("[data-role=controls]"),
    results: root.querySelector("[data-role=results]"),
    summary: root.querySelector("[data-role=summary]"),
    count: root.querySelector("[data-role=count]"),
    pager: root.querySelector("[data-role=pager]"),
    filterBox: root.querySelector(".ex-filter-box"),
    search: root.querySelector("#ex-search"),
    searchAnswers: root.querySelector("#ex-search-answers"),
    subset: root.querySelector("#ex-subset"),
    category: root.querySelector("#ex-category"),
    continent: root.querySelector("#ex-continent"),
    country: root.querySelector("#ex-country"),
    time: root.querySelector("#ex-time"),
    year: root.querySelector("#ex-year"),
    length: root.querySelector("#ex-length"),
    ordered: root.querySelector("#ex-ordered"),
    shuffle: root.querySelector("#ex-shuffle"),
    reset: root.querySelector("#ex-reset"),
  };

  var db = null;          // decoded payload
  var order = null;       // current display order (array of row indices)
  var matches = [];       // filtered row indices, in display order
  var page = 0;
  var loadStarted = false;
  var searchLower = null; // lowercased questions
  var answerLower = null; // lowercased answers (built lazily)
  var pinnedId = null;    // question id from a permalink (#q=N)

  // ---------------------------------------------------------------- loading

  function setStatus(html, isError) {
    el.status.innerHTML = html;
    el.status.hidden = !html;
    el.status.classList.toggle("is-error", !!isError);
  }

  function decode(buffer) {
    var bytes = new Uint8Array(buffer);
    for (var m = 0; m < MAGIC.length; m++) {
      if (bytes[m] !== MAGIC.charCodeAt(m)) throw new Error("Unrecognised data file.");
    }
    var body = bytes.slice(MAGIC.length);
    var key = new TextEncoder().encode(XOR_KEY);
    for (var i = 0; i < body.length; i++) body[i] ^= key[i % key.length];
    return gunzip(body);
  }

  function gunzip(bytes) {
    if (typeof DecompressionStream === "function") {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).text();
    }
    return Promise.reject(new Error("this browser cannot decompress the data; please use a current version of Chrome, Edge, Firefox or Safari"));
  }

  function fetchData() {
    return fetch(DATA_URL).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.arrayBuffer();
    });
  }

  // Browsers block fetch() on pages opened from disk, so load the same bytes
  // from a base64-wrapped script instead.
  function scriptData() {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = DATA_JS_URL;
      s.onload = function () {
        var b64 = window.LISTQA_DATA;
        delete window.LISTQA_DATA;
        if (typeof b64 !== "string") { reject(new Error("data script was empty")); return; }
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(bytes.buffer);
      };
      s.onerror = function () { reject(new Error("could not read " + DATA_JS_URL)); };
      document.head.appendChild(s);
    });
  }

  function load() {
    if (loadStarted) return;
    loadStarted = true;
    setStatus('<span class="loader-dot"></span> Loading 9,045 questions&hellip;');
    (location.protocol === "file:" ? scriptData() : fetchData())
      .then(decode)
      .then(function (text) {
        db = JSON.parse(text);
        init();
      })
      .catch(function (err) {
        loadStarted = false;
        console.error(err);
        setStatus("Could not load the dataset (" + escapeHtml(err.message) + "). " +
          '<button type="button" class="button is-small is-light" data-role="retry">Retry</button>', true);
        var retry = el.status.querySelector("[data-role=retry]");
        if (retry) retry.addEventListener("click", load);
      });
  }

  function startWhenNear() {
    setStatus("The dataset loads when you scroll here.");
    if (!("IntersectionObserver" in window)) { load(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        io.disconnect();
        load();
      }
    }, { rootMargin: "900px 0px" });
    io.observe(root);
  }

  // ---------------------------------------------------------------- setup

  function init() {
    var rows = db.rows;
    order = rows.map(function (_, i) { return i; });
    shuffle(order);
    searchLower = rows.map(function (r) { return r[F.question].toLowerCase(); });

    fillSelect(el.category, "All categories", countBy(F.category, db.categories));
    fillSelect(el.continent, "All regions", countBy(F.continent, db.continents));
    fillCountries();

    var years = [];
    for (var y = 2024; y >= 2000; y--) years.push({ value: String(y), label: String(y) });
    fillSelect(el.year, "Any year", years);

    var lengths = {};
    rows.forEach(function (r) { lengths[r[F.nElements]] = (lengths[r[F.nElements]] || 0) + 1; });
    fillSelect(el.length, "Any length", Object.keys(lengths).sort(function (a, b) { return a - b; }).map(function (n) {
      return { value: n, label: n + " elements (" + fmt(lengths[n]) + ")" };
    }));

    var onChange = function () { unpin(); page = 0; apply(); };
    [el.subset, el.category, el.country, el.year, el.length, el.ordered, el.searchAnswers]
      .forEach(function (node) { node.addEventListener("change", onChange); });
    el.continent.addEventListener("change", function () { fillCountries(); onChange(); });
    el.time.addEventListener("change", function () {
      el.year.disabled = el.time.value === "timeless";
      if (el.year.disabled) el.year.value = "";
      onChange();
    });
    el.search.addEventListener("input", debounce(onChange, 160));
    el.shuffle.addEventListener("click", function () {
      shuffle(order);
      unpin();
      page = 0;
      apply();
    });
    el.reset.addEventListener("click", function () {
      el.search.value = "";
      el.searchAnswers.checked = false;
      [el.subset, el.category, el.continent, el.country, el.time, el.year, el.length, el.ordered]
        .forEach(function (s) { s.value = ""; });
      el.year.disabled = false;
      fillCountries();
      unpin();
      page = 0;
      apply();
    });

    el.results.addEventListener("click", onResultsClick);
    el.pager.addEventListener("click", onPagerClick);

    // Collapse the filters by default on small screens.
    if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) el.filterBox.open = false;

    setStatus("");
    el.controls.hidden = false;
    readPermalink();
    apply();
    window.addEventListener("hashchange", function () {
      if (readPermalink()) apply();
      else if (pinnedId !== null && !/^#q=/.test(location.hash)) { pinnedId = null; page = 0; apply(); }
    });
  }

  // Leave single-question (permalink) view and drop "#q=N" from the URL.
  function unpin() {
    pinnedId = null;
    if (/^#q=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#explorer");
  }

  function countBy(field, labels) {
    var counts = labels.map(function () { return 0; });
    db.rows.forEach(function (r) { counts[r[field]]++; });
    return labels
      .map(function (label, i) { return { value: String(i), label: label + " (" + fmt(counts[i]) + ")", n: counts[i] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  function fillCountries() {
    var continent = el.continent.value;
    var counts = {};
    db.rows.forEach(function (r) {
      if (continent === "" || String(r[F.continent]) === continent) {
        counts[r[F.country]] = (counts[r[F.country]] || 0) + 1;
      }
    });
    var opts = Object.keys(counts).map(function (i) {
      return { value: i, label: db.countries[i] + " (" + fmt(counts[i]) + ")", n: counts[i] };
    }).sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label); });
    var previous = el.country.value;
    fillSelect(el.country, "All countries", opts);
    if (counts[previous]) el.country.value = previous;
  }

  function fillSelect(select, allLabel, options) {
    select.innerHTML = "";
    select.appendChild(new Option(allLabel, ""));
    options.forEach(function (o) { select.appendChild(new Option(o.label, o.value)); });
  }

  // ---------------------------------------------------------------- filtering

  function apply() {
    var rows = db.rows;
    if (pinnedId !== null) {
      matches = [pinnedId];
      render();
      return;
    }
    var terms = el.search.value.toLowerCase().split(/\s+/).filter(Boolean);
    var inAnswers = el.searchAnswers.checked;
    if (inAnswers && terms.length && !answerLower) {
      answerLower = rows.map(function (r) { return r[F.answer].toLowerCase(); });
    }
    var subset = el.subset.value;
    var category = el.category.value;
    var continent = el.continent.value;
    var country = el.country.value;
    var time = el.time.value;
    var year = el.year.value ? Number(el.year.value) : null;
    var length = el.length.value ? Number(el.length.value) : null;
    var ordered = el.ordered.value;

    matches = order.filter(function (i) {
      var r = rows[i];
      if (subset !== "" && String(r[F.complex]) !== subset) return false;
      if (category !== "" && String(r[F.category]) !== category) return false;
      if (continent !== "" && String(r[F.continent]) !== continent) return false;
      if (country !== "" && String(r[F.country]) !== country) return false;
      if (time === "timeless" && r[F.yearStart] !== 0) return false;
      if (time === "constrained" && r[F.yearStart] === 0) return false;
      if (year !== null && (r[F.yearStart] === 0 || year < r[F.yearStart] || year > r[F.yearEnd])) return false;
      if (length !== null && r[F.nElements] !== length) return false;
      if (ordered !== "" && String(r[F.ordered]) !== ordered) return false;
      for (var t = 0; t < terms.length; t++) {
        if (searchLower[i].indexOf(terms[t]) === -1 &&
            !(inAnswers && answerLower[i].indexOf(terms[t]) !== -1)) return false;
      }
      return true;
    });
    render();
  }

  // ---------------------------------------------------------------- rendering

  function render() {
    var pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    var start = page * PAGE_SIZE;
    var slice = matches.slice(start, start + PAGE_SIZE);
    var terms = el.search.value.trim().split(/\s+/).filter(Boolean);

    el.count.textContent = pinnedId !== null ? "" : fmt(matches.length) + " match" + (matches.length === 1 ? "" : "es");
    if (pinnedId !== null) {
      el.summary.innerHTML = "Question <strong>#" + (pinnedId + 1) + "</strong> &middot; " +
        '<a href="#explorer" data-role="unpin">back to all questions</a>';
      el.summary.querySelector("[data-role=unpin]").addEventListener("click", function (e) {
        e.preventDefault();
        unpin();
        apply();
      });
    } else if (!matches.length) {
      el.summary.innerHTML = "No questions match these filters.";
    } else {
      el.summary.innerHTML = "<strong>" + fmt(start + 1) + "&ndash;" + fmt(start + slice.length) +
        "</strong> of <strong>" + fmt(matches.length) + "</strong> question" + (matches.length === 1 ? "" : "s") +
        (matches.length !== db.rows.length ? " (filtered)" : "");
    }

    el.results.innerHTML = slice.length
      ? slice.map(function (i) { return card(i, terms, el.searchAnswers.checked ? terms : []); }).join("")
      : '<div class="ex-empty">Try removing a filter or searching for a different term.</div>';
    el.results.scrollTop = 0;
    clampLongAnswers();

    el.pager.innerHTML = pages > 1
      ? '<button type="button" class="button is-small is-rounded" data-page="' + (page - 1) + '"' + (page === 0 ? " disabled" : "") +
          ' aria-label="Previous samples"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
        '<span class="ex-page">' + fmt(page + 1) + " / " + fmt(pages) + "</span>" +
        '<button type="button" class="button is-small is-rounded" data-page="' + (page + 1) + '"' + (page >= pages - 1 ? " disabled" : "") +
          ' aria-label="Next samples"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>'
      : "";
  }

  function card(i, terms, answerTerms) {
    var r = db.rows[i];
    var isComplex = r[F.complex] === 1;
    var years = r[F.yearStart] === 0 ? "Timeless"
      : (r[F.yearStart] === r[F.yearEnd] ? String(r[F.yearStart]) : r[F.yearStart] + "&ndash;" + r[F.yearEnd]);
    var sourcePath = r[F.source];
    var sourceUrl = /^https?:/.test(sourcePath) ? sourcePath : WIKI_PREFIX + sourcePath;

    var meta = [
      '<span class="ex-type ' + (isComplex ? "is-complex" : "is-simple") + '">' + (isComplex ? "ComplexListQA" : "SimpleListQA") + "</span>",
      escapeHtml(db.categories[r[F.category]]),
      escapeHtml(db.countries[r[F.country]]),
      years,
      r[F.nElements] + " elements",
    ];
    if (r[F.ordered] === 1) meta.push('<span class="ex-ordered">ordered</span>');

    return '<article class="ex-card" data-id="' + i + '">' +
      '<header class="ex-card-head"><div class="ex-meta">' + meta.join('<span class="ex-dot" aria-hidden="true">&middot;</span>') + "</div>" +
        '<span class="ex-id">#' + (i + 1) + "</span></header>" +
      '<p class="ex-question">' + highlight(r[F.question], terms) + "</p>" +
      '<div class="ex-answer" id="ex-answer-' + i + '">' + renderAnswer(r[F.answer], answerTerms, isComplex) + "</div>" +
      '<footer class="ex-card-foot"><a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener">' +
        "Source: " + escapeHtml(sourceTitleOf(sourcePath)) + ' <i class="fa-solid fa-arrow-up-right-from-square fa-xs" aria-hidden="true"></i></a>' +
      "</footer></article>";
  }

  // Parse a reference answer into preamble prose, numbered items (each with
  // "* key: value" sub-attributes and other lines, in source order), and prose
  // that follows the list after a blank line.
  function parseAnswer(text) {
    var lines = text.replace(/\r/g, "").split("\n");
    var out = { preamble: [], items: [], trailer: [] };
    var current = null, blankSinceItem = false;
    lines.forEach(function (line) {
      var s = line.trim();
      if (!s) { if (current) blankSinceItem = true; return; }
      var num = /^(\d+)\.(?:\s+|(?=[^\d\s]))(\S.*)$/.exec(s);
      var sub = /^[*\-•]\s+(.*)$/.exec(s);
      if (num) {
        current = { n: num[1], main: num[2], parts: [] };
        out.items.push(current);
        blankSinceItem = false;
        out.trailer = [];
      } else if (sub && current) {
        current.parts.push({ sub: true, s: sub[1] });
      } else if (current && blankSinceItem) {
        out.trailer.push(s);
      } else if (current) {
        current.parts.push({ sub: false, s: s });
      } else {
        out.preamble.push(s);
      }
    });
    return out;
  }

  // SimpleListQA: a flat numbered list (two columns when long).
  // ComplexListQA: a grid of element blocks, each with a key/value table.
  function renderAnswer(text, terms, isComplex) {
    var hl = function (x) { return highlight(x, terms || []); };
    var a = parseAnswer(text);
    if (!a.items.length) return '<p class="ex-preamble">' + hl(text) + "</p>";

    var html = a.preamble.length
      ? '<p class="ex-preamble" title="Click to expand">' + a.preamble.map(hl).join(" ") + "</p>" : "";
    var hasSubs = a.items.some(function (it) { return it.parts.some(function (p) { return p.sub; }); });

    if (isComplex || hasSubs) {
      html += '<ol class="ex-tree">';
      a.items.forEach(function (it) {
        html += '<li value="' + it.n + '"><div class="ex-el">' + hl(it.main) + "</div>";
        var inTable = false;
        it.parts.forEach(function (part) {
          if (part.sub && !inTable) { html += '<dl class="ex-attrs">'; inTable = true; }
          if (!part.sub && inTable) { html += "</dl>"; inTable = false; }
          if (part.sub) {
            var kv = /^(.*?):\s(.*)$/.exec(part.s);
            html += kv ? "<dt>" + hl(kv[1]) + "</dt><dd>" + hl(kv[2]) + "</dd>" : '<dd class="is-wide">' + hl(part.s) + "</dd>";
          } else {
            html += '<div class="ex-extra">' + hl(part.s) + "</div>";
          }
        });
        if (inTable) html += "</dl>";
        html += "</li>";
      });
      html += "</ol>";
    } else {
      html += '<ol class="ex-flat' + (a.items.length > 4 ? " is-cols" : "") + '">';
      a.items.forEach(function (it) {
        html += '<li value="' + it.n + '">' + hl(it.main) +
          it.parts.map(function (p) { return '<div class="ex-extra">' + hl(p.s) + "</div>"; }).join("") + "</li>";
      });
      html += "</ol>";
    }
    return html + a.trailer.map(function (p) { return '<p class="ex-trailer">' + hl(p) + "</p>"; }).join("");
  }

  // Collapse very long answers behind a "Show full answer" toggle.
  function clampLongAnswers() {
    el.results.querySelectorAll(".ex-answer").forEach(function (a) {
      if (a.classList.contains("is-clamped") || a.scrollHeight <= 320) return;
      a.classList.add("is-clamped");
      var more = document.createElement("button");
      more.type = "button";
      more.className = "ex-more";
      more.setAttribute("data-role", "more");
      more.setAttribute("aria-expanded", "false");
      more.setAttribute("aria-controls", a.id);
      more.textContent = "Show full answer";
      a.insertAdjacentElement("afterend", more);
    });
  }

  // ---------------------------------------------------------------- events

  function onPagerClick(e) {
    var b = e.target.closest("[data-page]");
    if (!b || b.disabled) return;
    page = Number(b.getAttribute("data-page"));
    render();
  }

  function onResultsClick(e) {
    var pre = e.target.closest(".ex-preamble");
    if (pre) { pre.classList.toggle("is-open"); return; }
    var more = e.target.closest("[data-role=more]");
    if (more) {
      var answer = more.previousElementSibling;
      var open = answer.classList.toggle("is-clamped") === false;
      more.textContent = open ? "Show less" : "Show full answer";
      more.setAttribute("aria-expanded", String(open));
    }
  }

  function readPermalink() {
    var m = /^#q=(\d+)$/.exec(location.hash);
    if (!m || !db) return false;
    var id = Number(m[1]) - 1;
    if (id < 0 || id >= db.rows.length) return false;
    pinnedId = id;
    page = 0;
    requestAnimationFrame(function () {
      root.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    });
    return true;
  }

  // ---------------------------------------------------------------- helpers

  function sourceTitleOf(path) {
    var q = /[?&]title=([^&#]+)/.exec(path);
    var title = q ? q[1] : path.replace(/^https?:\/\/[^/]+\/wiki\//, "").split("#")[0];
    try { title = decodeURIComponent(title); } catch (err) { /* keep raw */ }
    return title.replace(/_/g, " ");
  }

  // Highlight search terms on the raw text, escaping each piece, so matches
  // never land inside HTML entities.
  function highlight(text, terms) {
    if (!terms || !terms.length) return escapeHtml(text);
    var re = new RegExp("(" + terms
      .map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); })
      .sort(function (a, b) { return b.length - a.length; })
      .join("|") + ")", "gi");
    return String(text).split(re).map(function (part, k) {
      return k % 2 ? "<mark>" + escapeHtml(part) + "</mark>" : escapeHtml(part);
    }).join("");
  }

  function scrollBehavior() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // Start loading immediately for permalinks, otherwise when scrolled near.
  if (/^#q=\d+$/.test(location.hash)) load(); else startWhenNear();
  window.addEventListener("hashchange", function () { if (/^#q=\d+$/.test(location.hash)) load(); });
})();
