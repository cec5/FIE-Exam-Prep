"use strict";

const WEAPONS = { SAB: "Sabre", FOI: "Foil", EPE: "Épée" };
// Weapons that are switched on. Foil and épée stay off until their questions are ready,
// even if answer data for them is added to answers.json.
const IMPLEMENTED = { SAB: true, FOI: false, EPE: false };
const MIN_QUESTIONS = 20;
const SETTINGS_KEY = "fie-exam-settings-v1";

const $ = (id) => document.getElementById(id);
const root = $("practice");
const state = {
  pools: { GEN: [], SAB: [], FOI: [], EPE: [] }, // questions that have answer data
  settings: { mode: "weapon", weapon: "SAB", count: MIN_QUESTIONS },
  exam: null, // { items, index, finished }
};

/* ---------- pure helpers ---------- */

// Lines look like: [GEN-001] (#1) Question text
function parseQuestions(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\[([A-Z]+)-(\d+)\]\s*(?:\(#(\d+)\)\s*)?(.+)$/);
    if (m) out.push({ id: `${m[1]}-${m[2]}`, category: m[1], source: m[3] || "", text: m[4].trim() });
  }
  return out;
}

function hasAnswer(entry) {
  return !!entry && Array.isArray(entry.choices) && entry.choices.length >= 2 &&
    Number.isInteger(entry.correct) && entry.correct >= 0 && entry.correct < entry.choices.length;
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 80% rounded up, in integer arithmetic to avoid floating-point surprises.
function passMark(n) {
  return Math.ceil((n * 4) / 5);
}

// Split `count` questions between the general and weapon pools.
// Mix is 50/50 (the odd question goes to general) until a pool runs out.
function allocate(mode, count, generalAvail, weaponAvail) {
  if (mode === "general") return { general: count, weapon: 0 };
  if (mode === "weapon") return { general: 0, weapon: count };
  let weapon = Math.floor(count / 2);
  let general = count - weapon;
  if (weapon > weaponAvail) { weapon = weaponAvail; general = count - weapon; }
  if (general > generalAvail) { general = generalAvail; weapon = count - general; }
  return { general, weapon };
}

// What can be offered for the current mode and weapon.
function limits(mode, weapon) {
  const g = state.pools.GEN.length;
  const w = (state.pools[weapon] || []).length;
  const name = WEAPONS[weapon];
  if (mode === "general") {
    return g >= MIN_QUESTIONS
      ? { ok: true, max: g }
      : { ok: false, max: g, reason: `Only ${g} general question${g === 1 ? " has" : "s have"} answers so far; at least ${MIN_QUESTIONS} are needed.` };
  }
  if (mode === "weapon") {
    return w >= MIN_QUESTIONS
      ? { ok: true, max: w }
      : { ok: false, max: w, reason: `Only ${w} ${name} question${w === 1 ? " has" : "s have"} answers so far; at least ${MIN_QUESTIONS} are needed.` };
  }
  if (g === 0 || w === 0) {
    return { ok: false, max: g + w, reason: `A mixed exam needs both general and ${name} questions with answers.` };
  }
  return g + w >= MIN_QUESTIONS
    ? { ok: true, max: g + w }
    : { ok: false, max: g + w, reason: `Only ${g + w} questions are available; at least ${MIN_QUESTIONS} are needed.` };
}

/* ---------- settings ---------- */

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s && ["general", "weapon", "mix"].includes(s.mode) && WEAPONS[s.weapon] && Number.isInteger(s.count)) {
      state.settings = { mode: s.mode, weapon: s.weapon, count: s.count };
    }
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    /* ignore */
  }
}

/* ---------- setup screen ---------- */

function modeAvailable(mode) {
  if (mode === "general") return limits("general", "SAB").ok;
  return Object.keys(WEAPONS).some((w) => limits(mode, w).ok);
}

function setChoiceState(input, enabled, hint, hintText) {
  input.disabled = !enabled;
  input.closest(".choice").classList.toggle("disabled", !enabled);
  hint.textContent = hintText;
}

function refreshSetup() {
  const s = state.settings;

  // Weapon radios: only implemented weapons that have answered questions are usable.
  for (const code of Object.keys(WEAPONS)) {
    const n = state.pools[code].length;
    setChoiceState(
      document.querySelector(`input[name="weapon"][value="${code}"]`),
      n > 0,
      $(`hint-${code}`),
      !IMPLEMENTED[code] ? "not implemented" : n > 0 ? `${n} questions` : "no questions yet"
    );
  }

  // If the chosen weapon has nothing, fall back to one that does.
  if (!state.pools[s.weapon].length) {
    s.weapon = Object.keys(WEAPONS).find((c) => state.pools[c].length) || s.weapon;
  }

  // Mode radios.
  const g = state.pools.GEN.length;
  const modeHints = {
    weapon: modeAvailable("weapon") ? "" : "no weapon available yet",
    mix: modeAvailable("mix") ? "" : "needs general and weapon questions",
    general: g ? `${g} questions` : "no questions yet",
  };
  for (const mode of ["weapon", "mix", "general"]) {
    setChoiceState(
      document.querySelector(`input[name="mode"][value="${mode}"]`),
      modeAvailable(mode),
      $(`hint-${mode}`),
      modeHints[mode]
    );
  }
  if (!modeAvailable(s.mode)) s.mode = ["weapon", "mix", "general"].find(modeAvailable) || s.mode;

  document.querySelector(`input[name="mode"][value="${s.mode}"]`).checked = true;
  document.querySelector(`input[name="weapon"][value="${s.weapon}"]`).checked = true;
  $("weapon-field").hidden = s.mode === "general";

  // Count controls.
  const lim = limits(s.mode, s.weapon);
  const range = $("count-range");
  const num = $("count-number");
  for (const el of [range, num]) {
    el.min = MIN_QUESTIONS;
    el.max = Math.max(lim.max, MIN_QUESTIONS);
    el.disabled = !lim.ok;
  }
  s.count = Math.min(Math.max(s.count, MIN_QUESTIONS), Math.max(lim.max, MIN_QUESTIONS));
  range.value = num.value = s.count;

  // Summary and start button.
  const summary = $("summary");
  summary.classList.toggle("warn", !lim.ok);
  $("start").disabled = !lim.ok;
  if (!lim.ok) {
    summary.textContent = lim.reason;
    return;
  }
  const alloc = allocate(s.mode, s.count, state.pools.GEN.length, state.pools[s.weapon].length);
  const parts = [];
  if (alloc.weapon) parts.push(`${alloc.weapon} ${WEAPONS[s.weapon]}`);
  if (alloc.general) parts.push(`${alloc.general} general`);
  summary.textContent = `${s.count} questions (${parts.join(" + ")}). Pass mark: ${passMark(s.count)} correct (80%).`;
}

function onCountInput(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return;
  state.settings.count = n;
  refreshSetup();
}

/* ---------- exam ---------- */

function startExam() {
  const s = state.settings;
  const lim = limits(s.mode, s.weapon);
  if (!lim.ok) return;
  saveSettings();

  const alloc = allocate(s.mode, s.count, state.pools.GEN.length, state.pools[s.weapon].length);
  const picked = [
    ...shuffle(state.pools.GEN).slice(0, alloc.general),
    ...shuffle(state.pools[s.weapon]).slice(0, alloc.weapon),
  ];
  const items = shuffle(picked).map((q) => {
    const entry = q.answer;
    const choices = shuffle(entry.choices.map((text, i) => ({ text, correct: i === entry.correct })));
    return { q, entry, choices, picked: null };
  });

  state.exam = { items, index: 0, finished: false };
  show("exam");
  renderQuestion();
}

function renderQuestion() {
  const { items, index } = state.exam;
  const item = items[index];

  const answered = items.filter((i) => i.picked !== null).length;
  $("progress").textContent = `Question ${index + 1} of ${items.length}`;
  $("answered-count").textContent = `${answered} of ${items.length} answered`;
  $("bar-fill").style.width = `${(answered / items.length) * 100}%`;
  $("next-unanswered").disabled = answered === items.length;
  $("overview-summary").textContent = `Question overview (${items.length - answered} unanswered)`;
  $("qtext").textContent = item.q.text;

  const box = $("options");
  box.replaceChildren();
  item.choices.forEach((choice, i) => {
    const label = document.createElement("label");
    label.className = "option" + (item.picked === i ? " selected" : "");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.checked = item.picked === i;
    input.addEventListener("change", () => selectOption(i));
    const span = document.createElement("span");
    span.textContent = choice.text;
    label.append(input, span);
    box.append(label);
  });

  $("prev").disabled = index === 0;
  $("next").disabled = index === items.length - 1;
  renderNavigator();
}

function renderNavigator() {
  const { items, index } = state.exam;
  const nav = $("navigator");
  nav.replaceChildren();
  items.forEach((item, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = i + 1;
    b.title = item.picked === null ? "Not answered" : "Answered";
    b.className = (item.picked !== null ? "answered " : "") + (i === index ? "current" : "");
    b.setAttribute("aria-label", `Question ${i + 1}${item.picked !== null ? ", answered" : ""}`);
    b.addEventListener("click", () => jump(i));
    nav.append(b);
  });
}

function selectOption(i) {
  state.exam.items[state.exam.index].picked = i;
  renderQuestion();
}

function jump(i) {
  if (i >= 0 && i < state.exam.items.length) {
    state.exam.index = i;
    renderQuestion();
  }
}

// Next question without an answer after the current one, wrapping round to the start.
function jumpToUnanswered() {
  const { items, index } = state.exam;
  for (let step = 1; step <= items.length; step++) {
    const i = (index + step) % items.length;
    if (items[i].picked === null) {
      jump(i);
      return;
    }
  }
}

function finishExam() {
  const unanswered = state.exam.items.filter((i) => i.picked === null).length;
  if (unanswered && !confirm(`You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. They will count as wrong. Finish anyway?`)) {
    return;
  }
  state.exam.finished = true;
  show("results");
  renderResults();
}

/* ---------- results ---------- */

function statusOf(item) {
  return item.picked === null ? "skipped" : item.choices[item.picked].correct ? "correct" : "wrong";
}

function renderResults() {
  const { items } = state.exam;
  const score = items.filter((i) => statusOf(i) === "correct").length;
  const needed = passMark(items.length);
  const pct = Math.round((score / items.length) * 100);
  const pass = score >= needed;

  $("r-score").textContent = `${score} of ${items.length}`;
  $("r-percent").textContent = `${pct}%`;
  $("r-needed").textContent = `${needed} correct (80%)`;
  const result = $("r-result");
  result.textContent = pass ? "Passed" : "Not passed";
  result.className = pass ? "pass" : "fail";

  // Start on the questions worth reviewing, unless everything was right.
  $("review-filter").value = score === items.length ? "all" : "issues";
  renderReviewList();
}

const STATUS_LABEL = { correct: "Correct", wrong: "Wrong", skipped: "Not answered" };

function reviewLine(className, text) {
  const p = document.createElement("p");
  p.className = `review-line ${className}`;
  p.textContent = text;
  return p;
}

function renderReviewList() {
  const filter = $("review-filter").value;
  const list = $("review-list");
  list.replaceChildren();

  const rows = state.exam.items
    .map((item, n) => ({ item, n, status: statusOf(item) }))
    .filter(({ status }) => filter === "all" || (filter === "correct" ? status === "correct" : status !== "correct"));

  if (!rows.length) {
    const p = document.createElement("p");
    p.textContent = filter === "correct" ? "No questions were answered correctly." : "Nothing to show: every question was answered correctly.";
    list.append(p);
    return;
  }

  // Short lists open fully; long ones start collapsed so they stay easy to scan.
  const openByDefault = rows.length <= 8;

  for (const { item, n, status } of rows) {
    const card = document.createElement("details");
    card.className = `review-item ${status}`;
    card.open = openByDefault;

    const summary = document.createElement("summary");
    const num = document.createElement("span");
    num.className = "rv-num";
    num.textContent = `${n + 1}.`;
    const label = document.createElement("span");
    label.className = "rv-status";
    label.textContent = STATUS_LABEL[status];
    const q = document.createElement("span");
    q.className = "rv-q";
    q.textContent = item.q.text;
    summary.append(num, label, q);

    const body = document.createElement("div");
    body.className = "rv-body";
    if (item.picked !== null) {
      body.append(reviewLine(status === "correct" ? "right" : "mine-wrong", `Your answer: ${item.choices[item.picked].text}`));
    }
    if (status !== "correct") {
      body.append(reviewLine("right", `Correct answer: ${item.choices.find((c) => c.correct).text}`));
    }

    const explain = document.createElement("div");
    explain.className = "review-explain";
    explain.textContent = item.entry.explain;
    if (item.entry.ref) {
      const ref = document.createElement("div");
      ref.className = "review-ref";
      ref.textContent = `Rules: ${item.entry.ref}`;
      explain.append(ref);
    }
    body.append(explain);

    card.append(summary, body);
    list.append(card);
  }
}

function setAllReviewOpen(open) {
  for (const d of document.querySelectorAll("#review-list details")) d.open = open;
}

/* ---------- screens and wiring ---------- */

function show(screen) {
  for (const id of ["setup", "exam", "results"]) $(id).hidden = id !== screen;
  window.scrollTo(0, 0);
}

function init() {
  for (const el of document.querySelectorAll('input[name="mode"]')) {
    el.addEventListener("change", () => { state.settings.mode = el.value; refreshSetup(); });
  }
  for (const el of document.querySelectorAll('input[name="weapon"]')) {
    el.addEventListener("change", () => { state.settings.weapon = el.value; refreshSetup(); });
  }
  $("count-range").addEventListener("input", (e) => onCountInput(e.target.value));
  $("count-number").addEventListener("change", (e) => onCountInput(e.target.value));
  $("start").addEventListener("click", startExam);

  $("prev").addEventListener("click", () => jump(state.exam.index - 1));
  $("next").addEventListener("click", () => jump(state.exam.index + 1));
  $("finish").addEventListener("click", finishExam);

  $("retake").addEventListener("click", startExam);
  $("new-exam").addEventListener("click", () => { show("setup"); refreshSetup(); });
  $("review-filter").addEventListener("change", renderReviewList);
  $("expand-all").addEventListener("click", () => setAllReviewOpen(true));
  $("collapse-all").addEventListener("click", () => setAllReviewOpen(false));
  $("next-unanswered").addEventListener("click", jumpToUnanswered);

  document.addEventListener("keydown", (e) => {
    // Leave keys alone while a form control has focus (radios use the arrows themselves).
    if ($("exam").hidden || e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight") jump(state.exam.index + 1);
    else if (e.key === "ArrowLeft") jump(state.exam.index - 1);
    else if (/^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < state.exam.items[state.exam.index].choices.length) selectOption(i);
    }
  });

  load()
    .then(() => {
      loadSettings();
      show("setup");
      refreshSetup();
    })
    .catch((err) => {
      $("error").hidden = false;
      $("error").textContent = err.message;
    });
}

async function load() {
  const qres = await fetch(root.dataset.questions);
  if (!qres.ok) throw new Error(`Could not load questions (${qres.status})`);
  const questions = parseQuestions(await qres.text());

  const ares = await fetch(root.dataset.answers);
  if (!ares.ok) throw new Error(`Could not load answers (${ares.status})`);
  const answers = await ares.json();

  // Only questions that have usable answer data can be put in an exam.
  for (const q of questions) {
    const entry = answers[q.id];
    if (hasAnswer(entry) && state.pools[q.category] && (q.category === "GEN" || IMPLEMENTED[q.category])) {
      state.pools[q.category].push({ ...q, answer: entry });
    }
  }
}

init();
