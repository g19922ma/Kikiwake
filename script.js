// ==========================
// app.js (ULTIMATE INTEGRATED VERSION)
// ==========================

const CONFIG = {
  motorTrials: 30,
  mainRepetitions: 6,
  totalCategories: 100,
  breakInterval: 10,
  cueSoundPlaybackDuration: 2,
  cueSoundSilenceDuration: 1000,
  beepFreq: 440,
  beepDuration: 0.1,
  minWait: 800,
  maxWait: 1600
};

const TEST_CONFIG = {
  motorTrials: 3,
  mainRepetitions: 5,
  testCategoryIds: [1, 5, 10, 25, 50],
  breakInterval: 2,
  beepFreq: 440,
  beepDuration: 0.1,
  minWait: 100,
  maxWait: 200
};

const GOOGLE_APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzIhJmEIxwGPdrz7y344x-NR0pi0qDI8AainLiipmtfLqSpqcRa40LOF6K8yO2sHL1e/exec";
const BASE_PATH = location.pathname.replace(/\/[^\/]*$/, "/");

// ==========================
// Utilities
// ==========================
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleWithRng(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hashStringToUint(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ==========================
// State
// ==========================
let state = {
  participantId: "",
  participantSeed: 0,
  inputDevice: "",
  phase: "idle",
  isTestMode: false,
  isResumed: false,
  resumedTrialCount: 0,
  motorCompletedCount: 0,
  sessionTimestamp: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('T', ' ').replace(/\..+/, ''),
  cueAudioBuffer: null,
  motorResults: [],
  currentMotorTrial: 0,
  t_motor: 0,
  manifest: [],
  kimarijiData: [],
  cardData: [],
  trialDeck: [],
  currentTrialIndex: 0,
  currentTrialData: null,
  mainResults: [],
  unsavedResults: [],
  t0: 0,
  audioCtx: null,
  selectedChoice: null,
  menuSeedBase: 0,
  currentLevelMenuItems: [],
  pieMenuCX: 0,
  pieMenuCY: 0,
  reader: "sounds_Inaba"
};

// ==========================
// Audio Optimization
// ==========================
function getAudioContext() {
  if (!state.audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
  }
  return state.audioCtx;
}
let currentSource = null;
let currentGainNode = null;

async function playSound(sourceData, { offset = 0, duration = undefined, isCue = false } = {}) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  try {
    let audioBuffer;
    if (typeof sourceData === "string") {
      const url = /^(https?:)?\/\//.test(sourceData) ? sourceData : (BASE_PATH + sourceData);
      const res = await fetch(url);
      audioBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
    } else { audioBuffer = sourceData; }
    
    stopSound();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = audioBuffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    
    if (!isCue) state.t0 = performance.now();
    source.start(0, Math.max(0, offset), duration === undefined ? audioBuffer.duration - Math.max(0, offset) : duration);
    currentSource = source; currentGainNode = gain;
    return new Promise(resolve => {
      source.onended = () => { if (currentSource === source) { currentSource = null; currentGainNode = null; } resolve(); };
    });
  } catch (e) { console.error("Audio Error:", e); }
}
function stopSound() {
  const ctx = getAudioContext();
  if (currentGainNode) {
    currentGainNode.gain.cancelScheduledValues(ctx.currentTime);
    currentGainNode.gain.setValueAtTime(0, ctx.currentTime);
  }
  if (currentSource) { try { currentSource.stop(0); } catch(e){} currentSource = null; }
}

// ==========================
// UI Logic
// ==========================
const screens = ["welcome", "loading", "motor", "main-intro", "trial", "choice", "break", "results"];
function showScreen(id) {
  screens.forEach(s => {
    const el = document.getElementById("screen-" + s);
    if (el) el.classList.toggle("active", s === id);
  });
}

// ==========================
// Data Communication
// ==========================
async function postToGoogleSheet(payload) {
  try {
    await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) { console.error("GAS Post Error:", e); }
}

// ==========================
// Phase: Motor Calibration
// ==========================
async function startMotorPhase() {
  const id = (document.getElementById("participant-id").value || "anon").toLowerCase();
  state.participantId = id;
  state.inputDevice = document.getElementById("input-device").value;
  state.reader = document.getElementById("reader-select").value;
  state.isTestMode = document.getElementById("test-mode-toggle").checked;

  showScreen("loading");

  // GASに問い合わせてシードと進捗を取得
  state.participantSeed = hashStringToUint(id); // fallback
  try {
    const res = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'get_status', data: { participant_id: id } })
    });
    const result = await res.json();
    if (result.status === "success") {
      state.resumedTrialCount = result.data.completedCount;
      state.motorCompletedCount = result.data.motorCompletedCount;
      if (state.resumedTrialCount > 0) state.isResumed = true;
      if (result.data.seed) {
        state.participantSeed = result.data.seed;
      } else {
        // 新規参加者：シードを生成してGASに登録
        state.participantSeed = hashStringToUint(id + Date.now());
        postToGoogleSheet({ type: 'register_seed', data: { participant_id: id, seed: state.participantSeed } });
      }
      // 実験完了済みチェック（テストモードは除く）
      const totalRequired = CONFIG.totalCategories * CONFIG.mainRepetitions;
      if (!state.isTestMode && state.resumedTrialCount >= totalRequired) {
        document.getElementById("results-stats").innerHTML =
          `<p>参加者ID「${state.participantId}」はすでに実験をすべて完了しています。</p>`;
        showScreen("results");
        return;
      }
    }
  } catch (e) { console.warn("Status Check Failed:", e); }

  getAudioContext();
  state.phase = "motor_idle";
  state.motorResults = [];
  
  const normalTarget = (state.isTestMode ? TEST_CONFIG : CONFIG).motorTrials;
  if (state.isResumed) {
    state.currentMotorTrial = 0;
    state.targetMotorTrials = 5;
    alert(`参加者ID: ${id} の続きから再開します。\n（コンディション確認のため、反応速度テストを5回実施します）`);
  } else {
    state.currentMotorTrial = state.motorCompletedCount;
    state.targetMotorTrials = normalTarget;
  }
  
  document.getElementById("motor-total-trials").textContent = state.targetMotorTrials;
  showScreen("motor");
}

function handlePress(e) {
  const now = performance.now();
  if (state.phase === "motor_waiting") {
    // フィードバックを最初に（即時反応）
    const motorArea = document.getElementById("motor-area");
    if (motorArea) motorArea.classList.add("responded");
    stopSound();
    const rt = now - state.t0;
    const res = { participant_id: state.participantId, session_timestamp: state.sessionTimestamp, trial_start_time: state.lastMotorStartTimeJst, trial_num: state.currentMotorTrial, rt_ms: rt, input_device: e.type || "不明" };
    state.motorResults.push(res);
    postToGoogleSheet({ type: 'motor_trial', data: res });
    state.phase = "motor_idle";
    setTimeout(() => { if (motorArea) motorArea.classList.remove("responded"); }, 400);
    setTimeout(nextMotorTrial, 500);
  } else if (state.phase === "main_listening") {
    stopSound();
    state.currentTrialData.press_time = now - state.t0;
    state.currentTrialData.t_prime = state.currentTrialData.press_time - state.t_motor;
    state.currentTrialData.t_press_absolute = now;
    state.phase = "main_choosing";
    showScreen("choice");
    renderChoiceScreen();
  }
}

function nextMotorTrial() {
  if (state.currentMotorTrial >= state.targetMotorTrials) {
    const rts = state.motorResults.map(r => r.rt_ms).sort((a,b) => a-b);
    if (rts.length > 0) {
      const mid = Math.floor(rts.length / 2);
      state.t_motor = rts.length % 2 !== 0 ? rts[mid] : (rts[mid-1]+rts[mid])/2;
    }
    showScreen("main-intro");
    return;
  }
  state.currentMotorTrial++;
  document.getElementById("motor-counter").textContent = state.currentMotorTrial;
  
  const config = state.isTestMode ? TEST_CONFIG : CONFIG;
  
  // 試行間の「間（ま）」を確保
  // カウントアップしてから、一定の準備時間(1000ms) + ランダムな待機時間
  const preparationTime = 1000; 
  const randomWait = config.minWait + Math.random() * (config.maxWait - config.minWait);
  
  setTimeout(() => {
    state.phase = "motor_waiting";
    const jstNow = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('T', ' ').replace(/\..+/, '');
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = CONFIG.beepFreq;
    osc.start(); osc.stop(ctx.currentTime + CONFIG.beepDuration);
    state.t0 = performance.now();
    state.lastMotorStartTimeJst = jstNow;
  }, preparationTime + randomWait);
}

// ==========================
// Phase: Main Task
// ==========================
async function startMainPhase() {
  const reader = state.reader || "sounds_Inaba";
  try {
    const ctx = getAudioContext();
    const cueFile = reader === "sounds_kimoto" ? "sounds_kimoto/序歌.m4a" : "sounds_Inaba/I-000B.ogg";
    const res = await fetch(BASE_PATH + cueFile);
    state.cueAudioBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch(e){ console.error("Cue load error:", e); }

  const config = state.isTestMode ? TEST_CONFIG : CONFIG;
  const kimarijiMap = new Map(state.kimarijiData.map(k => [k.id, k.kimariji]));
  if (reader === "sounds_kimoto") {
    state.cardData = state.kimarijiData.map(k => ({
      id: k.id, label: k.kimariji, path: `sounds_kimoto/${k.kimariji} 上.m4a`, kimariji: k.kimariji
    }));
  } else {
    state.cardData = state.manifest.filter(m => m.path.endsWith("A.ogg")).map(m => ({ id: m.category_id, label: m.label, path: m.path, kimariji: kimarijiMap.get(m.category_id) || "" })).filter(c => c.kimariji);
  }
  
  let deck = [];
  let cards = state.isTestMode ? state.cardData.filter(c => new Set(config.testCategoryIds).has(c.id)) : state.cardData.filter(c => c.id <= config.totalCategories);
  for (const card of cards) {
    for (let r = 0; r < config.mainRepetitions; r++) {
      deck.push({ stimulus_id: card.id, stimulus_file: card.path, rep: r, kimariji: card.kimariji });
    }
  }
  state.trialDeck = shuffleWithRng(deck, mulberry32(state.participantSeed)).map((t, i) => ({ ...t, trial_index: i + 1 }));
  
  state.currentTrialIndex = state.isResumed ? state.resumedTrialCount : 0;
  document.getElementById("total-trials").textContent = state.trialDeck.length;
  nextMainTrial();
}

function nextMainTrial(fromBreak = false) {
  if (state.currentTrialIndex >= state.trialDeck.length) { finishExperiment(); return; }
  const config = state.isTestMode ? TEST_CONFIG : CONFIG;
  if (!fromBreak && state.currentTrialIndex > 0 && state.currentTrialIndex % config.breakInterval === 0) {
    sendBatchToGoogleSheet(); showScreen("break"); return;
  }
  const trial = state.trialDeck[state.currentTrialIndex];
  state.currentTrialData = { ...trial };
  state.selectedChoice = null;
  showScreen("trial");
  document.getElementById("trial-counter").textContent = state.currentTrialIndex + 1;
  document.getElementById("total-trials").textContent = state.trialDeck.length;
  startTrialWithCue(trial);
}

async function startTrialWithCue(trial) {
  const cueDuration = state.cueAudioBuffer.duration;
  const offset = Math.max(0, cueDuration - CONFIG.cueSoundPlaybackDuration);
  await playSound(state.cueAudioBuffer, { offset, duration: CONFIG.cueSoundPlaybackDuration, isCue: true });
  await new Promise(r => setTimeout(r, CONFIG.cueSoundSilenceDuration));
  state.phase = "main_listening";
  state.currentTrialData.trial_start_time = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('T', ' ').replace(/\..+/, '');
  playSound(trial.stimulus_file, {});
}

// ==========================
// Pie Menu (Fixed with Center Button)
// ==========================
function polarToXY(cx, cy, r, a) { return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }

// SVGを消さずに選択状態だけ更新（ちらつき防止）
function applyPieSelection(svg) {
  svg.querySelectorAll('[data-card-id]').forEach(el => {
    const selected = Number(el.getAttribute('data-card-id')) === state.selectedChoice;
    el.setAttribute('class', (el.tagName === 'path' ? 'pie-sector' : 'pie-label') + (selected ? ' selected' : ''));
  });
  svg.querySelector('.pie-center-circle')?.setAttribute('class', 'pie-center-circle active');
  const ct = svg.querySelector('.pie-center-text');
  if (ct) ct.textContent = '決定';
  const cg = svg.querySelector('.pie-center-group');
  if (cg) cg.onclick = (e) => { e.stopPropagation(); confirmChoice(); };
}
function applyPieDeselection(svg) {
  svg.querySelectorAll('[data-card-id]').forEach(el => {
    el.setAttribute('class', el.tagName === 'path' ? 'pie-sector' : 'pie-label');
  });
  svg.querySelector('.pie-center-circle')?.setAttribute('class', 'pie-center-circle back');
  const ct = svg.querySelector('.pie-center-text');
  if (ct) ct.textContent = '戻る';
  const cg = svg.querySelector('.pie-center-group');
  if (cg) cg.onclick = (e) => { e.stopPropagation(); goBackInMenu(); };
}
function donutPath(cx, cy, inner, outer, start, end) {
  // 360度（フル円）の場合、始点と終点が重なると描画されないため、微小な隙間を空ける
  if (end - start >= 2 * Math.PI) end = start + 2 * Math.PI - 0.0001;
  const large = end - start > Math.PI ? 1 : 0;
  const p1=polarToXY(cx,cy,outer,start), p2=polarToXY(cx,cy,outer,end), p3=polarToXY(cx,cy,inner,end), p4=polarToXY(cx,cy,inner,start);
  return `M ${p1.x} ${p1.y} A ${outer} ${outer} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${inner} ${inner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

function renderPieRoot(cx, cy, items, parentLabel = "") {
  state.pieMenuCX = cx;
  state.pieMenuCY = cy;
  // 毎回ランダムにするための新しいシード生成
  state.menuSeedBase = Math.floor(Math.random() * 0xFFFFFFFF);

  let overlay = document.getElementById("pie-overlay");
  if (!overlay) {
    overlay = document.createElement("div"); overlay.id = "pie-overlay"; overlay.className = "pie-overlay";
    overlay.innerHTML = `<svg id="pie-svg" class="pie-svg"></svg>`;
    document.body.appendChild(overlay);
  }

  // オーバーレイ背景クリック: 選択中なら選択解除、そうでなければ閉じる
  overlay.onclick = (e) => {
    const svg = document.getElementById("pie-svg");
    if (e.target === overlay || e.target === svg) {
      if (state.selectedChoice) {
        state.selectedChoice = null;
        applyPieDeselection(svg);
      } else {
        goBackInMenu();
      }
    }
  };

  const svg = document.getElementById("pie-svg");
  svg.innerHTML = "";
  state.currentLevelMenuItems = items;

  // Center Button Group
  const centerG = document.createElementNS("http://www.w3.org/2000/svg", "g");
  centerG.setAttribute("class", "pie-center-group");
  centerG.setAttribute("transform", `translate(${cx}, ${cy})`);

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("r", "55");
  circle.setAttribute("class", state.selectedChoice ? "pie-center-circle active" : "pie-center-circle back");

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("class", state.selectedChoice ? "pie-center-text active" : "pie-center-text");
  text.textContent = state.selectedChoice ? "決定" : (parentLabel || "戻る");

  centerG.onclick = (e) => {
    e.stopPropagation();
    if (state.selectedChoice) confirmChoice(); else goBackInMenu();
  };

  centerG.appendChild(circle);
  centerG.appendChild(text);
  svg.appendChild(centerG);
  renderPieLevel(cx, cy, items, 1);
}

function renderPieLevel(cx, cy, items, level, startA = -Math.PI/2, span = 2*Math.PI) {
  const svg = document.getElementById("pie-svg");

  // このレベル以降の既存要素を削除（別ブランチへの移動時にクリア）
  svg.querySelectorAll('[data-pie-level]').forEach(el => {
    if (parseInt(el.getAttribute('data-pie-level')) >= level) el.remove();
  });

  const inner = 60 + (85 * (level-1)), outer = inner + 80;
  const rng = mulberry32(state.menuSeedBase + level);
  const rotatedItems = shuffleWithRng(items, rng);
  // レベル1（全円）のみランダム回転。サブレベルは回転なし（親セクター内に収める）
  const rotation = level === 1 ? (rng() * 2 * Math.PI) : 0;

  const dA = span / items.length;
  rotatedItems.forEach((item, i) => {
    const a1 = startA + rotation + (dA * i), a2 = a1 + dA;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "pie-sector" + (state.selectedChoice === item.cardId ? " selected" : ""));
    path.setAttribute("d", donutPath(cx, cy, inner, outer, a1, a2));
    path.setAttribute("data-pie-level", level);
    if (item.type === "leaf") path.setAttribute("data-card-id", item.cardId);

    path.onmouseenter = () => {
      if (state.selectedChoice) return; // 選択中はホバーで変えない
      if (item.type === "branch") renderPieLevel(cx, cy, item.children, level + 1, a1, dA);
      else {
        svg.querySelectorAll('[data-pie-level]').forEach(el => {
          if (parseInt(el.getAttribute('data-pie-level')) > level) el.remove();
        });
      }
    };
    path.onclick = (e) => {
      e.stopPropagation();
      if (item.type === "leaf") {
        state.selectedChoice = item.cardId;
        applyPieSelection(svg);  // SVGを消さず色だけ更新
      }
    };

    const mid = (a1 + a2) / 2;
    const pos = polarToXY(cx, cy, (inner + outer) / 2, mid);
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", pos.x); txt.setAttribute("y", pos.y);
    txt.setAttribute("text-anchor", "middle"); txt.setAttribute("dominant-baseline", "central");
    txt.setAttribute("class", "pie-label" + (state.selectedChoice === item.cardId ? " selected" : ""));
    txt.setAttribute("data-pie-level", level);
    if (item.type === "leaf") txt.setAttribute("data-card-id", item.cardId);
    txt.textContent = item.label;
    
    svg.appendChild(path);
    svg.appendChild(txt);
  });
}

function renderChoiceScreen() {
  const container = document.getElementById("choice-step-1-initials");
  container.innerHTML = "";
  container.classList.add("gojuon-grid");
  const gojuon = ["わ","ら","や","ま","は","な","た","さ","か","あ","を","り"," ","み","ひ","に","ち","し","き","い","ん","る","ゆ","む","ふ","ぬ","つ","す","く","う"," ","れ"," ","め","へ","ね","て","せ","け","え"," ","ろ","よ","も","ほ","の","と","そ","こ","お"];
  const valid = new Set(state.cardData.map(c => c.kimariji[0]));
  gojuon.forEach(char => {
    const btn = document.createElement("button"); btn.className = "choice-btn initial-btn";
    if (char === " ") btn.style.visibility = "hidden";
    else {
      btn.textContent = char;
      if (valid.has(char)) btn.onclick = (e) => {
        const cards = state.cardData.filter(c => c.kimariji.startsWith(char));
        const items = groupCandidates(cards);
        if (items.length === 1 && items[0].type === 'leaf') {
          // 一字決まり: 選択状態にしつつ、円形メニューも表示して何を選択したか見えるようにする
          state.selectedChoice = items[0].cardId;
        }
        renderPieRoot(e.clientX, e.clientY, items);
      };
      else btn.disabled = true;
    }
    container.appendChild(btn);
  });
}

function groupCandidates(cards) {
  const map = new Map();
  cards.forEach(c => {
    const k = c.kimariji.length > 1 ? c.kimariji.substring(0,2) : c.kimariji;
    if (!map.has(k)) map.set(k, []); map.get(k).push(c);
  });
  return Array.from(map.entries()).map(([k, v]) => {
    if (v.length === 1) return { type: "leaf", label: v[0].kimariji, cardId: v[0].id };
    return { type: "branch", label: k, children: v.map(c => ({ type: "leaf", label: c.kimariji, cardId: c.id })) };
  });
}
function confirmChoice() {
  const decision_time = performance.now() - state.currentTrialData.t_press_absolute;
  const res = { ...state.currentTrialData, choice_id: state.selectedChoice, is_correct: state.selectedChoice === state.currentTrialData.stimulus_id ? 1 : 0, t_answer: Math.round(decision_time) };
  state.mainResults.push(res);
  // 試行ごとに即時保存
  postToGoogleSheet({
    type: 'trial_single',
    data: { participant_id: state.participantId, session_timestamp: state.sessionTimestamp, random_seed: state.participantSeed, is_test_mode: state.isTestMode, t_motor: state.t_motor, userAgent: navigator.userAgent, ...res }
  });
  state.currentTrialIndex++;
  const o = document.getElementById("pie-overlay"); if(o) o.remove();
  nextMainTrial();
}
function goBackInMenu() { state.selectedChoice = null; const o = document.getElementById("pie-overlay"); if(o) o.remove(); }

// ==========================
// Finalization
// ==========================
async function sendBatchToGoogleSheet() {
  if (state.unsavedResults.length === 0) return;
  const data = state.unsavedResults.splice(0);
  postToGoogleSheet({
    type: 'trials_batch',
    data: data.map(t => ({ participant_id: state.participantId, session_timestamp: state.sessionTimestamp, is_test_mode: state.isTestMode, t_motor: state.t_motor, userAgent: navigator.userAgent, ...t }))
  });
}
function finishExperiment() {
  sendBatchToGoogleSheet(); showScreen("results");
  const valid = state.mainResults.filter(t => t.press_time > 0);
  const correct = valid.filter(t => t.is_correct);
  const t_primes = valid.map(t => t.t_prime).sort((a,b) => a-b);
  let S = 0; if (t_primes.length > 0) { const mid = Math.floor(t_primes.length/2); S = t_primes.length%2!==0 ? t_primes[mid] : (t_primes[mid-1]+t_primes[mid])/2; }
  postToGoogleSheet({ type: 'summary', data: { participant_id: state.participantId, session_timestamp: state.sessionTimestamp, is_test_mode: state.isTestMode, Summary_Speed_S_ms: S, Summary_Accuracy_A_percent: (correct.length/(valid.length||1))*100 } });
}

// ==========================
// Init
// ==========================
async function init() {
  try {
    const [m, k] = await Promise.all([fetch(BASE_PATH + "manifest.json").then(r => r.json()), fetch(BASE_PATH + "kimariji.json").then(r => r.json())]);
    state.manifest = m; state.kimarijiData = k;
  } catch(e){}
  document.getElementById("btn-start-motor").onclick = startMotorPhase;
  document.getElementById("btn-start-calibration").onclick = () => {
    document.getElementById("btn-start-calibration").style.display = "none";
    document.getElementById("motor-area").style.display = "flex";
    // 最初の試行の前に少し待つ
    setTimeout(nextMotorTrial, 1000);
  };
  document.getElementById("btn-start-main").onclick = startMainPhase;
  document.getElementById("btn-resume").onclick = () => nextMainTrial(true);
  document.getElementById("motor-area").onclick = handlePress;
  document.getElementById("press-button").onclick = handlePress;
  document.getElementById("btn-unknown-global").onclick = () => {
    // わからない回答をGASに保存
    const t_unknown = state.currentTrialData.t_press_absolute
      ? Math.round(performance.now() - state.currentTrialData.t_press_absolute)
      : null;
    const unknownRes = {
      ...state.currentTrialData,
      choice_id: null,
      is_correct: 0,
      t_answer: t_unknown,
      is_unknown: 1
    };
    postToGoogleSheet({
      type: 'trial_single',
      data: { participant_id: state.participantId, session_timestamp: state.sessionTimestamp, random_seed: state.participantSeed, is_test_mode: state.isTestMode, t_motor: state.t_motor, userAgent: navigator.userAgent, ...unknownRes }
    });
    // 刺激情報のみをコピーしてデッキ末尾に追加（タイミングデータは除く）
    state.trialDeck.push({
      stimulus_id: state.currentTrialData.stimulus_id,
      stimulus_file: state.currentTrialData.stimulus_file,
      rep: state.currentTrialData.rep,
      kimariji: state.currentTrialData.kimariji,
      trial_index: state.currentTrialData.trial_index
    });
    state.currentTrialIndex++;
    const o = document.getElementById("pie-overlay"); if(o) o.remove();
    nextMainTrial();
  };
  document.getElementById("test-mode-toggle").onchange = (e) => state.isTestMode = e.target.checked;
  window.onkeydown = (e) => {
    if (e.code === "Space" && (state.phase === "motor_waiting" || state.phase === "main_listening")) { e.preventDefault(); handlePress(e); }
    if (e.code === "Escape" && document.getElementById("pie-overlay")) {
      e.preventDefault();
      if (state.selectedChoice) { state.selectedChoice = null; applyPieDeselection(document.getElementById("pie-svg")); }
      else goBackInMenu();
    }
  };
}
init();
