/* ListQA project page: navigation, figure lightbox, BibTeX copy, tabs and the
 * LLM-Judge-F1 scoring walkthrough. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- navbar
  var burger = document.querySelector(".navbar-burger");
  var menu = document.getElementById(burger ? burger.getAttribute("data-target") : "");
  if (burger && menu) {
    var setMenu = function (open) {
      burger.classList.toggle("is-active", open);
      menu.classList.toggle("is-active", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    burger.addEventListener("click", function () { setMenu(!burger.classList.contains("is-active")); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-active")) { setMenu(false); burger.focus(); }
    });
  }

  var smooth = function () {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  };

  // Highlight the nav link of the section currently in view.
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".site-nav .navbar-menu a.navbar-item[href^='#']"));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var current = sections.filter(function (s) { return visible[s.id]; })[0];
      navLinks.forEach(function (a) {
        var on = !!current && a.getAttribute("href") === "#" + current.id;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  // ---------------------------------------------------------------- back to top
  var toTop = document.querySelector(".to-top");
  if (toTop) {
    window.addEventListener("scroll", function () {
      toTop.classList.toggle("is-visible", window.scrollY > 900);
    }, { passive: true });
    toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: smooth() }); });
  }

  // ---------------------------------------------------------------- lightbox
  var lightbox = document.querySelector(".lightbox");
  if (lightbox) {
    var lbImg = lightbox.appendChild(document.createElement("img"));
    lbImg.alt = "";
    var lbClose = lightbox.querySelector(".lightbox-close");
    var lastFocus = null;
    var closeLb = function () {
      lightbox.classList.remove("is-open");
      lbImg.removeAttribute("src");
      document.documentElement.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    };
    document.addEventListener("click", function (e) {
      var img = e.target.closest(".figure-card img");
      if (img) {
        lastFocus = img;
        lbImg.src = img.currentSrc || img.src;
        lbImg.alt = img.alt;
        lightbox.classList.add("is-open");
        document.documentElement.style.overflow = "hidden";
        lbClose.focus();
      } else if (e.target.closest(".lightbox")) {
        closeLb();
      }
    });
    document.addEventListener("keydown", function (e) {
      var open = lightbox.classList.contains("is-open");
      if (open && e.key === "Escape") closeLb();
      if (open && e.key === "Tab") { e.preventDefault(); lbClose.focus(); }
      if (!open && (e.key === "Enter" || e.key === " ") && e.target.matches(".figure-card img")) {
        e.preventDefault();
        e.target.click();
      }
    });
  }

  // ---------------------------------------------------------------- copy BibTeX
  document.querySelectorAll("[data-copy-target]").forEach(function (btn) {
    var label = btn.innerHTML;
    var timer = null;
    btn.addEventListener("click", function () {
      var target = document.getElementById(btn.getAttribute("data-copy-target"));
      var text = target ? target.textContent : "";
      var done = function () {
        btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied';
        clearTimeout(timer);
        timer = setTimeout(function () { btn.innerHTML = label; }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done);
      } else {
        var range = document.createRange();
        range.selectNodeContents(target);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { document.execCommand("copy"); done(); } catch (err) { /* ignore */ }
        sel.removeAllRanges();
      }
    });
  });

  // ---------------------------------------------------------------- generic tabs
  // <div data-tabs> ... <button role="tab" aria-controls="panel-id"> ... <div role="tabpanel" id="panel-id">
  document.querySelectorAll("[data-tabs]").forEach(function (group) {
    var tabs = Array.prototype.slice.call(group.querySelectorAll("[role=tab]"));
    var select = function (tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    };
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        var next = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length]
          : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length]
          : e.key === "Home" ? tabs[0]
          : e.key === "End" ? tabs[tabs.length - 1] : null;
        if (!next) return;
        e.preventDefault();
        next.focus();
        select(next);
      });
    });
  });

  // ---------------------------------------------------------------- carousels
  // One slide at a time with prev/next arrows, dots, keyboard arrows and swipe.
  document.querySelectorAll("[data-carousel]").forEach(function (car) {
    var track = car.querySelector(".carousel-track");
    var slides = Array.prototype.slice.call(car.querySelectorAll(".carousel-slide"));
    var dotsBox = car.querySelector(".carousel-dots");
    var index = 0;
    var dots = slides.map(function (slide, i) {
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute("aria-label", (i + 1) + " of " + slides.length);
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot";
      var title = slide.querySelector(".fig-title");
      dot.setAttribute("aria-label", "Show " + (title ? title.textContent : "figure " + (i + 1)));
      dot.addEventListener("click", function () { go(i); });
      dotsBox.appendChild(dot);
      return dot;
    });
    var go = function (i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = "translateX(" + (-100 * index) + "%)";
      slides.forEach(function (slide, k) {
        var on = k === index;
        slide.setAttribute("aria-hidden", String(!on));
        if ("inert" in slide) slide.inert = !on;
      });
      dots.forEach(function (d, k) { d.setAttribute("aria-current", k === index ? "true" : "false"); });
    };
    car.querySelector(".carousel-btn.is-prev").addEventListener("click", function () { go(index - 1); });
    car.querySelector(".carousel-btn.is-next").addEventListener("click", function () { go(index + 1); });
    car.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    });
    var x0 = null;
    car.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    car.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    go(0);
  });

  // ---------------------------------------------------------------- animated stat counters
  var counters = document.querySelectorAll("[data-count]");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (counters.length && "IntersectionObserver" in window && !reduceMotion) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        var node = e.target;
        var target = Number(node.getAttribute("data-count"));
        var suffix = node.getAttribute("data-suffix") || "";
        var t0 = null;
        var step = function (ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / 1100);
          var eased = 1 - Math.pow(1 - p, 3);
          node.textContent = Math.round(target * eased).toLocaleString("en-US") + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { co.observe(c); });
  }

  // ---------------------------------------------------------------- scoring walkthrough
  // The multi-faceted example and its verdicts are from the paper (App. "Scoring
  // Example"); the single-faceted prediction is illustrative. ROUGE-1 overlaps are computed
  // live with the rouge_score default tokenizer (lowercase, alphanumeric tokens).
  var WT_EXAMPLES = {
    simple: {
      // Real ListQA question and reference (#1988); the prediction is illustrative.
      question: "Could you show me a list of the Grammy Awards categories in which Future was nominated in 2023?",
      reference: ["Best Rap Performance", "Best Rap Song", "Best Melodic Rap Performance", "Best Rap Album"],
      prediction: ["Best Rap Album", "Melodic Rap Performance", "Best Rap Performance", "Best R&B Song"],
      // verdict per predicted element (true = CORRECT)
      verdicts: [true, true, true, false],
      note: "Illustrative prediction for a real ListQA question. Three categories are right, one written as a paraphrase (“Melodic Rap Performance”). “Best R&B Song” is not in the reference: its word overlap pairs it with “Best Rap Song”, but the judge marks it INCORRECT, and Best Rap Song counts as missed.",
    },
    complex: {
      question: "Which years between 2017 and 2024 were works performed by Dua Lipa nominated for the MTV Video Music Award for Best Choreography, and what was the name of the work?",
      reference: [
        ["2018", "Name of the work: “IDGAF”"],
        ["2020", "Name of the work: “Physical”"],
        ["2023", "Name of the work: “Dance the Night”"],
        ["2024", "Name of the work: “Houdini”"],
      ],
      prediction: [
        ["2018", "Work: “IDGAF”"],
        ["2024", "Work: “Houdini”"],
      ],
      verdicts: [true, true],
      note: "Both predicted elements are correct, but the model misses 2020 (“Physical”) and 2023 (“Dance the Night”). With only 2 elements, the response also falls below the 3-element minimum required by Format-Correctness.",
    },
  };

  var wt = document.getElementById("walkthrough");
  if (wt) initWalkthrough(wt);

  function initWalkthrough(rootEl) {
    var picker = rootEl.querySelectorAll("[data-example]");
    var current = "simple";
    picker.forEach(function (b) {
      b.addEventListener("click", function () {
        current = b.getAttribute("data-example");
        picker.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        draw();
      });
    });
    draw();

    function draw() {
      var ex = WT_EXAMPLES[current];
      var ref = ex.reference.map(asElement);
      var pred = ex.prediction.map(asElement);
      var matrix = ref.map(function (r) { return pred.map(function (p) { return rouge1(r.text, p.text); }); });
      var assign = bestAssignment(matrix); // assign[predIdx] = refIdx | -1
      var verdicts = ex.verdicts;

      rootEl.querySelector("[data-wt=question]").textContent = ex.question;
      rootEl.querySelector("[data-wt=parse]").innerHTML =
        listBox("Reference", "is-ref", ref) + listBox("Model prediction", "is-pred", pred);
      rootEl.querySelector("[data-wt=parse-note]").textContent = ex.note;

      var legend = rootEl.querySelector("[data-wt=legend]");
      var assignCaption = rootEl.querySelector("[data-wt=assign-caption]");
      {
        var mh = "<table class=\"wt-matrix\"><thead><tr><th></th>";
        pred.forEach(function (p, j) { mh += "<th scope=\"col\" title=\"" + esc(p.label) + "\">P" + (j + 1) + "</th>"; });
        mh += "</tr></thead><tbody>";
        ref.forEach(function (r, i) {
          mh += "<tr><th scope=\"row\" title=\"" + esc(r.label) + "\">R" + (i + 1) + "</th>";
          pred.forEach(function (p, j) {
            var v = matrix[i][j];
            mh += "<td class=\"" + (assign[j] === i ? "is-match" : "") + "\" style=\"background:" + heat(v) + "\">" + v.toFixed(2) + "</td>";
          });
          mh += "</tr>";
        });
        rootEl.querySelector("[data-wt=matrix]").innerHTML = mh + "</tbody></table>";
        // Show the text actually compared: lowercased words, and for
        // multi-faceted elements the main element plus sub-attribute values only.
        var compared = function (e, tag) { return "<b>" + tag + "</b> <code>" + esc(norm(e.text)) + "</code>"; };
        var multi = ref.concat(pred).some(function (e) { return e.subs.length; });
        legend.innerHTML =
          '<span class="wt-legend-title">Compared as</span>' +
          '<span class="wt-legend-row">' + ref.map(function (r, i) { return compared(r, "R" + (i + 1)); }).join(" ") + "</span>" +
          '<span class="wt-legend-row">' + pred.map(function (p, j) { return compared(p, "P" + (j + 1)); }).join(" ") + "</span>" +
          '<span class="wt-legend-note">Text is lowercased and split into words before ROUGE-1 is computed' +
          (multi ? "; sub-attribute keys (e.g. &ldquo;Name of the work:&rdquo;) are dropped, so only the main element and the values are compared." : ".") +
          "</span>";
        assignCaption.innerHTML = "Pairwise ROUGE-1 F1 between reference (R) and predicted (P) elements forms the cost matrix. " +
          "The outlined cells are the optimal one-to-one assignment (Jonker&ndash;Volgenant). This takes <em>O(n)</em> judge calls instead of <em>O(n&sup2;)</em>.";
      }

      // Pairs + verdicts
      var correct = 0;
      var pairs = pred.map(function (p, j) {
        var i = assign[j];
        var ok = verdicts[j] && i !== -1;
        if (ok) correct++;
        return "<div class=\"wt-pair " + (ok ? "is-correct" : "is-incorrect") + "\">" +
          "<span class=\"pred\">" + esc(p.label) + "</span><span class=\"arrow\">&harr;</span>" +
          "<span class=\"ref\">" + (i === -1 ? "<em>unmatched</em>" : esc(ref[i].label)) + "</span>" +
          "<span class=\"verdict\">" + (ok ? "CORRECT" : "INCORRECT") + "</span></div>";
      }).join("");
      var pairsBox = rootEl.querySelector("[data-wt=pairs]");
      pairsBox.innerHTML = pairs;

      var P = pred.length ? correct / pred.length : 0;
      var R = ref.length ? correct / ref.length : 0;
      var F1 = P + R ? (2 * P * R) / (P + R) : 0;
      var score = "<div class=\"s\"><b>" + correct + "/" + pred.length + "</b><span>Precision</span></div>" +
        "<div class=\"s\"><b>" + correct + "/" + ref.length + "</b><span>Recall</span></div>" +
        "<div class=\"s is-main\"><b>" + F1.toFixed(2) + "</b><span>LLM-Judge-F1</span></div>";
      var formatOk = pred.length >= 3;
      score += "<div class=\"s\"><b>" + (formatOk ? "1" : "0") + "</b><span>Format-Correctness" +
        (formatOk ? "" : " (&lt; 3 elements)") + "</span></div>";
      rootEl.querySelector("[data-wt=score]").innerHTML = score;
    }
  }

  function asElement(x) {
    if (Array.isArray(x)) {
      var values = x.slice(1).map(function (s) { return s.replace(/^[^:]*:\s*/, ""); });
      return { label: x[0] + " — " + x.slice(1).join("; "), text: [x[0]].concat(values).join(" "), main: x[0], subs: x.slice(1) };
    }
    return { label: x, text: x, main: x, subs: [] };
  }

  function listBox(title, cls, items) {
    return "<div class=\"wt-list " + cls + "\"><h4>" + title + " (" + items.length + " elements)</h4><ol>" +
      items.map(function (it) {
        return "<li>" + esc(it.main) + (it.subs.length
          ? "<br><small>" + it.subs.map(function (s) { return "&bull; " + esc(s); }).join("<br>") + "</small>" : "") + "</li>";
      }).join("") + "</ol></div>";
  }

  function tokens(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean); }
  function norm(s) { return tokens(s).join(" "); }

  function rouge1(a, b) {
    var ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    var counts = {};
    ta.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    var overlap = 0;
    tb.forEach(function (t) { if (counts[t] > 0) { overlap++; counts[t]--; } });
    if (!overlap) return 0;
    var p = overlap / tb.length, r = overlap / ta.length;
    return (2 * p * r) / (p + r);
  }

  // Optimal one-to-one assignment maximising total ROUGE-1 (exhaustive search;
  // examples are tiny). Pairs with zero overlap are left unmatched.
  function bestAssignment(m) {
    var nRef = m.length, nPred = m[0].length;
    var best = { score: -1, map: null };
    var used = [];
    var map = [];
    (function rec(j, score) {
      if (j === nPred) {
        if (score > best.score) best = { score: score, map: map.slice() };
        return;
      }
      for (var i = 0; i < nRef; i++) {
        if (used[i]) continue;
        used[i] = true; map[j] = i;
        rec(j + 1, score + m[i][j]);
        used[i] = false;
      }
      if (nPred - j > nRef - used.filter(Boolean).length) { map[j] = -1; rec(j + 1, score); }
    })(0, 0);
    return best.map.map(function (i, j) { return i !== -1 && m[i][j] > 0 ? i : -1; });
  }

  function heat(v) {
    var a = 0.08 + 0.72 * v;
    return "rgba(74, 123, 235, " + a.toFixed(3) + ")";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
