// ==========================
// app.js (FULL)
// - Pie-menu (donut sectors) that expands OUTWARD only in the hovered wedge
//   e.g., "はる" wedge expands to show "はるの / はるす" in that wedge
// - Fix: n===1 selectable (full ring path)
// - Fix: selection highlight remains visible until confirm/back
// - Randomize menu positions EACH TRIAL (fairness) with seeded shuffle + random rotation
// ==========================

// ==========================
// Configuration
// ==========================
const CONFIG = {
    motorTrials: 30,
    mainRepetitions: 6,
    totalCategories: 100,
    breakInterval: 50,
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
  
  // ==========================
  // Seeded RNG + Shuffle (for fair random positions)
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
    inputDevice: "",
    phase: "idle",
    isTestMode: false,
  
    // experiment
    selectionStep: 1,
    selectedInitial: "",
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
    t0: 0,
    audioCtx: null,
    summaryStats: null,
  
    // menu
    currentMenuLevel: 0,
    menuHistory: [],
    currentLevelMenuItems: [],
    currentRadialMenuOrigin: { x: 0, y: 0 },
    selectedChoice: null,
  
    // selection lock
    isMenuLockedBySelection: false,
  
    // fairness randomization (trial-seeded)
    menuSeedBase: 0,
    menuRng: null
  };
  
  // ==========================
  // DOM Elements
  // ==========================
  const screens = {
    welcome: document.getElementById("screen-welcome"),
    motor: document.getElementById("screen-motor"),
    mainIntro: document.getElementById("screen-main-intro"),
    trial: document.getElementById("screen-trial"),
    choice: document.getElementById("screen-choice"),
    break: document.getElementById("screen-break"),
    results: document.getElementById("screen-results")
  };
  
  // ==========================
  // Screen control
  // ==========================
  function showScreen(id) {
    Object.values(screens).forEach((s) => s && s.classList.remove("active"));
    if (screens[id]) screens[id].classList.add("active");
  }
  
  // ==========================
  // Audio
  // ==========================
  function getAudioContext() {
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return state.audioCtx;
  }
  
  let currentSource = null;
  
  async function playSound(sourceData, { offset = 0, duration = undefined, isCue = false } = {}) {
    return new Promise(async (resolve, reject) => {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      try {
        let audioBuffer;
        if (typeof sourceData === "string") {
          const response = await fetch(sourceData);
          if (!response.ok) throw new Error("HTTPエラー");
          audioBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
        } else if (sourceData instanceof AudioBuffer) {
          audioBuffer = sourceData;
        } else {
          throw new Error("Invalid sourceData");
        }
  
        if (currentSource) currentSource.stop();
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
  
        if (!isCue) state.t0 = performance.now();
  
        source.start(
          0,
          Math.max(0, offset),
          duration === undefined ? audioBuffer.duration - Math.max(0, offset) : duration
        );
  
        currentSource = source;
  
        source.onended = () => {
          if (currentSource === source) currentSource = null;
          resolve(audioBuffer);
        };
      } catch (e) {
        console.error("playSoundでのエラー:", e);
        reject(e);
      }
    });
  }
  
  function stopSound() {
    if (currentSource) {
      currentSource.stop();
      currentSource = null;
    }
  }
  
  // ==========================
  // Gamepad
  // ==========================
  let lastGamepadState = false;
  function gamepadLoop() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pressed = false;
    for (const gp of gamepads) {
      if (gp && gp.buttons.some((b) => b.pressed)) {
        pressed = true;
        break;
      }
    }
    if (pressed && !lastGamepadState && (state.phase === "motor_waiting" || state.phase === "main_listening")) {
      handlePress({ type: "gamepad" });
    }
    lastGamepadState = pressed;
    requestAnimationFrame(gamepadLoop);
  }
  
  // ==========================
  // Input press handler
  // ==========================
  function handlePress(e) {
    const now = performance.now();
  
    if (state.phase === "motor_waiting") {
      stopSound();
      state.motorResults.push({
        rt: now - state.t0,
        input_device: e.type || "不明"
      });
      document.getElementById("motor-area")?.classList.add("responded");
      state.phase = "motor_idle";
      setTimeout(() => {
        document.getElementById("motor-area")?.classList.remove("responded");
        nextMotorTrial();
      }, 500);
      return;
    }
  
    if (state.phase === "main_listening") {
      stopSound();
      state.currentTrialData.press_time = now - state.t0;
      state.currentTrialData.t_prime = state.currentTrialData.press_time - state.t_motor;
      state.currentTrialData.input_device = e.type || "不明";
      state.phase = "main_choosing";
      showScreen("choice");
      return;
    }
  }
  
  // ==========================
  // Motor phase
  // ==========================
  function startMotorPhase() {
    state.participantId = document.getElementById("participant-id")?.value || "anon";
    state.inputDevice = document.getElementById("input-device")?.value || "";
    getAudioContext();
  
    state.phase = "motor_idle";
    state.currentMotorTrial = 0;
    state.motorResults = [];
  
    const total = (state.isTestMode ? TEST_CONFIG : CONFIG).motorTrials;
    const el = document.getElementById("motor-total-trials");
    if (el) el.textContent = total;
  
    showScreen("motor");
  }
  
  function nextMotorTrial() {
    const currentConfig = state.isTestMode ? TEST_CONFIG : CONFIG;
  
    if (state.currentMotorTrial >= currentConfig.motorTrials) {
      const rts = state.motorResults.map((r) => r.rt).sort((a, b) => a - b);
      if (rts.length > 0) {
        const mid = Math.floor(rts.length / 2);
        state.t_motor = rts.length % 2 !== 0 ? rts[mid] : (rts[mid - 1] + rts[mid]) / 2;
      }
      showScreen("mainIntro");
      return;
    }
  
    state.currentMotorTrial++;
    const counter = document.getElementById("motor-counter");
    if (counter) counter.textContent = state.currentMotorTrial;
  
    const delay = currentConfig.minWait + Math.random() * (currentConfig.maxWait - currentConfig.minWait);
    setTimeout(() => {
      state.phase = "motor_waiting";
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = CONFIG.beepFreq;
      osc.start();
      osc.stop(ctx.currentTime + CONFIG.beepDuration);
      state.t0 = performance.now();
    }, delay);
  }
  
  // ==========================
  // Main phase
  // ==========================
  async function startMainPhase() {
    try {
      const ctx = getAudioContext();
      const response = await fetch("I-000B.ogg");
      if (!response.ok) throw new Error("合図音ファイルが見つかりません");
      state.cueAudioBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (e) {
      console.error("合図音のプリロードに失敗しました", e);
      alert("致命的なエラー: 合図音を読み込めませんでした。");
      return;
    }
  
    const currentConfig = state.isTestMode ? TEST_CONFIG : CONFIG;
  
    const kimarijiMap = new Map(state.kimarijiData.map((k) => [k.id, k.kimariji]));
    state.cardData = state.manifest
      .filter((m) => m.path.endsWith("A.ogg"))
      .map((m) => ({
        id: m.category_id,
        label: m.label,
        path: m.path,
        kimariji: kimarijiMap.get(m.category_id) || ""
      }))
      .filter((c) => c.kimariji);
  
    let availableCards = state.isTestMode
      ? state.cardData.filter((c) => new Set(currentConfig.testCategoryIds).has(c.id))
      : state.cardData.filter((c) => c.id <= currentConfig.totalCategories);
  
    let deck = [];
    for (const card of availableCards) {
      for (let r = 0; r < currentConfig.mainRepetitions; r++) {
        deck.push({ stimulus_id: card.id, stimulus_file: card.path, rep: r });
      }
    }
  
    state.trialDeck = shuffle(deck).map((t, i) => ({ ...t, trial_index: i + 1 }));
    state.currentTrialIndex = 0;
    state.mainResults = [];
  
    const totalTrials = document.getElementById("total-trials");
    if (totalTrials) totalTrials.textContent = state.trialDeck.length;
  
    renderChoiceScreen();
    nextMainTrial();
  }
  
  async function startTrialWithCue(trial) {
    try {
      const cueDuration = state.cueAudioBuffer.duration;
      const offset = Math.max(0, cueDuration - CONFIG.cueSoundPlaybackDuration);
  
      await playSound(state.cueAudioBuffer, {
        offset,
        duration: CONFIG.cueSoundPlaybackDuration,
        isCue: true
      });
  
      await new Promise((resolve) => setTimeout(resolve, CONFIG.cueSoundSilenceDuration));
  
      state.phase = "main_listening";
      playSound(trial.stimulus_file, {});
    } catch (error) {
      console.error("試行の再生エラー:", error);
      alert("再生エラーが発生しました。");
      state.currentTrialIndex++;
      nextMainTrial();
    }
  }
  
  function proceedToNextTrial() {
    const trial = state.trialDeck[state.currentTrialIndex];
    state.currentTrialData = { ...trial };
  
    // ★ trialごとにメニュー配置を固定ランダム（同trial内で位置がブレない）
    const base = hashStringToUint(
      `${state.participantId}|${trial.trial_index}|${trial.stimulus_id}|${trial.rep}`
    );
    state.menuSeedBase = base;
    state.menuRng = mulberry32(base);
  
    renderChoiceScreen();
    showScreen("trial");
  
    const counter = document.getElementById("trial-counter");
    if (counter) counter.textContent = state.currentTrialIndex + 1;
  
    startTrialWithCue(trial);
  }
  
  function nextMainTrial() {
    const currentConfig = state.isTestMode ? TEST_CONFIG : CONFIG;
  
    if (state.currentTrialIndex >= state.trialDeck.length) {
      finishExperiment();
      return;
    }
  
    if (state.currentTrialIndex > 0 && state.currentTrialIndex % currentConfig.breakInterval === 0) {
      showScreen("break");
      return;
    }
  
    proceedToNextTrial();
  }
  
  function resumeFromBreak() {
    proceedToNextTrial();
  }
  
  // ==========================
  // Pie Menu (donut sectors) with wedge-only expansion
  // - Randomized ordering + randomized rotation each trial
  // ==========================
  
  function polarToXY(cx, cy, r, a) {
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  
  // n>1: donut sector path
  function donutSectorPath(cx, cy, innerR, outerR, startA, endA) {
    const largeArc = (endA - startA) > Math.PI ? 1 : 0;
  
    const p1 = polarToXY(cx, cy, outerR, startA);
    const p2 = polarToXY(cx, cy, outerR, endA);
    const p3 = polarToXY(cx, cy, innerR, endA);
    const p4 = polarToXY(cx, cy, innerR, startA);
  
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
      "Z"
    ].join(" ");
  }
  
  // n===1: full ring path
  function donutFullRingPath(cx, cy, innerR, outerR) {
    const o1 = polarToXY(cx, cy, outerR, -Math.PI / 2);
    const o2 = polarToXY(cx, cy, outerR, Math.PI / 2);
  
    const i1 = polarToXY(cx, cy, innerR, -Math.PI / 2);
    const i2 = polarToXY(cx, cy, innerR, Math.PI / 2);
  
    return [
      `M ${o1.x} ${o1.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${o2.x} ${o2.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${o1.x} ${o1.y}`,
      `L ${i1.x} ${i1.y}`,
      `A ${innerR} ${innerR} 0 1 0 ${i2.x} ${i2.y}`,
      `A ${innerR} ${innerR} 0 1 0 ${i1.x} ${i1.y}`,
      "Z"
    ].join(" ");
  }
  
  function clampToViewport(x, y, pad = 16) {
    return {
      x: Math.min(Math.max(x, pad), window.innerWidth - pad),
      y: Math.min(Math.max(y, pad), window.innerHeight - pad)
    };
  }
  
  function ensurePieOverlay() {
    let overlay = document.getElementById("pie-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "pie-overlay";
      overlay.className = "pie-overlay";
      overlay.innerHTML = `
        <svg class="pie-svg" id="pie-svg"></svg>
        <div class="pie-controls" id="pie-controls" style="left:50vw; top:50vh;">
          <button id="pie-back" type="button">戻る</button>
          <button id="pie-confirm" type="button" disabled>決定</button>
        </div>
      `;
      document.body.appendChild(overlay);
  
      overlay.querySelector("#pie-back").addEventListener("click", (e) => {
        e.stopPropagation();
        goBackInMenu();
      });
      overlay.querySelector("#pie-confirm").addEventListener("click", (e) => {
        e.stopPropagation();
        confirmChoice();
      });
  
      // click outside: do nothing (avoid accidental close)
      overlay.addEventListener("click", (e) => {
        // prevent click-through
        e.stopPropagation();
      });
    }
    return overlay;
  }
  
  function clearPieOverlay() {
    const overlay = document.getElementById("pie-overlay");
    if (overlay) overlay.remove();
  }
  
  function ringForLevel(level) {
    const w = 80;  // ring width
    const gap = 6; // ring gap
    const inner = 30 + (w + gap) * (level - 1);
    const outer = inner + w;
    return { inner, outer };
  }
  
  let expandTimer = null;
  
  function clearOuterRings(fromLevel) {
    const svg = document.getElementById("pie-svg");
    if (!svg) return;
    const groups = svg.querySelectorAll("g[data-level]");
    groups.forEach((g) => {
      const lv = parseInt(g.getAttribute("data-level"), 10);
      if (lv >= fromLevel) g.remove();
    });
  }
  
  function syncPieControls(cx, cy) {
    const controls = document.getElementById("pie-controls");
    if (controls) {
      const p = clampToViewport(cx, cy + 140, 30);
      controls.style.left = `${p.x}px`;
      controls.style.top = `${p.y}px`;
  
      const pieConfirm = document.getElementById("pie-confirm");
      if (pieConfirm) pieConfirm.disabled = !state.selectedChoice;
    }
  }
  
  function renderPieRoot(cx, cy, level1Items) {
    ensurePieOverlay();
    const svg = document.getElementById("pie-svg");
    svg.innerHTML = "";
  
    state.currentRadialMenuOrigin = { x: cx, y: cy };
    state.currentMenuLevel = 1;
    state.currentLevelMenuItems = level1Items;
    state.isMenuLockedBySelection = false;
  
    renderPieLevel(cx, cy, level1Items, 1);
    syncPieControls(cx, cy);
  }
  
  // ★ 子扇形を「親の角度範囲だけ」分割して外側に描く
  function renderPieChildrenInWedge(cx, cy, childrenItems, level, parentStartA, parentEndA) {
    const svg = document.getElementById("pie-svg");
    if (!svg) return;
  
    clearOuterRings(level);
  
    // ★ 子候補の順番も trialごとに固定ランダム（枝ごとに違うseed）
    const key = `${state.selectedInitial}|L${level}|${parentStartA.toFixed(4)}|${parentEndA.toFixed(4)}`;
    const rng = mulberry32(state.menuSeedBase ^ hashStringToUint(key));
    childrenItems = shuffleWithRng(childrenItems, rng);
  
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-level", String(level));
    g.style.opacity = "0";
    g.style.transformOrigin = `${cx}px ${cy}px`;
    g.style.transform = "scale(0.92)";
    g.style.transition = "opacity 120ms ease, transform 140ms ease";
  
    const { inner, outer } = ringForLevel(level);
    const n = childrenItems.length;
    if (n === 0) return;
  
    const span = parentEndA - parentStartA;
    const dA = span / n;
  
    childrenItems.forEach((item, i) => {
      const a1 = parentStartA + dA * i;
      const a2 = parentStartA + dA * (i + 1);
  
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("pie-sector");
      path.setAttribute("d", donutSectorPath(cx, cy, inner, outer, a1, a2));
  
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = item.fullKimariji || item.label;
      path.appendChild(title);
  
      if (item.type === "leaf" && state.selectedChoice === item.cardId) {
        path.classList.add("selected");
      }
  
      path.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.type === "leaf") {
          handleFinalSelection(item.cardId, item.fullKimariji);
          renderPieChildrenInWedge(cx, cy, childrenItems, level, parentStartA, parentEndA);
          syncPieControls(cx, cy);
        }
      });
  
      g.appendChild(path);
  
      const midA = (a1 + a2) / 2;
      const midR = (inner + outer) / 2;
      const tp = polarToXY(cx, cy, midR, midA);
  
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", tp.x);
      text.setAttribute("y", tp.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.classList.add("pie-label");
      text.textContent = item.label;
  
      if (item.type === "leaf" && state.selectedChoice === item.cardId) {
        text.classList.add("selected");
      }
  
      g.appendChild(text);
    });
  
    svg.appendChild(g);
  
    requestAnimationFrame(() => {
      g.style.opacity = "1";
      g.style.transform = "scale(1)";
    });
  }
  
  // render base level ring (inner ring)
  // - shuffled order per trial
  // - randomized rotation per trial & level
  function renderPieLevel(cx, cy, items, level) {
    const svg = document.getElementById("pie-svg");
    if (!svg) return;
  
    clearOuterRings(level);
  
    // ★ 並び順を trialごとに固定ランダム（levelごとに違うseed）
    const rngOrder = mulberry32(state.menuSeedBase ^ (level * 0xA511E9B3));
    items = shuffleWithRng(items, rngOrder);
  
    // ★ 全体回転も trialごとに固定ランダム（levelごとに違うseed）
    const rngRot = mulberry32(state.menuSeedBase ^ (level * 0x9E3779B9));
    const rotation = rngRot() * 2 * Math.PI;
  
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-level", String(level));
    g.style.opacity = "0";
    g.style.transformOrigin = `${cx}px ${cy}px`;
    g.style.transform = "scale(0.92)";
    g.style.transition = "opacity 120ms ease, transform 140ms ease";
  
    const { inner, outer } = ringForLevel(level);
    const n = items.length;
    if (n === 0) return;
  
    const startBase = -Math.PI / 2 + rotation;
    const dA = (2 * Math.PI) / Math.max(1, n);
  
    items.forEach((item, i) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("pie-sector");
  
      // ★ keep angles for wedge expansion
      let a1, a2;
  
      if (n === 1) {
        path.setAttribute("d", donutFullRingPath(cx, cy, inner, outer));
        a1 = -Math.PI;
        a2 = Math.PI;
      } else {
        a1 = startBase + dA * i;
        a2 = a1 + dA;
        path.setAttribute("d", donutSectorPath(cx, cy, inner, outer, a1, a2));
      }
  
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = item.fullKimariji || item.label;
      path.appendChild(title);
  
      if (item.type === "leaf" && state.selectedChoice === item.cardId) {
        path.classList.add("selected");
      }
  
      // branch hover -> expand only within this wedge
      path.addEventListener("mouseenter", () => {
        if (item.type !== "branch") return;
        if (state.isMenuLockedBySelection) return;
  
        clearTimeout(expandTimer);
        expandTimer = setTimeout(() => {
          renderPieChildrenInWedge(cx, cy, item.childrenMenuItems, level + 1, a1, a2);
          syncPieControls(cx, cy);
        }, 120);
      });
  
      // leaf click
      path.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.type === "leaf") {
          handleFinalSelection(item.cardId, item.fullKimariji);
          renderPieLevel(cx, cy, items, level);
          syncPieControls(cx, cy);
        }
      });
  
      g.appendChild(path);
  
      // label
      let midA;
      if (n === 1) {
        midA = -Math.PI / 2;
      } else {
        midA = (a1 + a2) / 2;
      }
      const midR = (inner + outer) / 2;
      const tp = polarToXY(cx, cy, midR, midA);
  
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", tp.x);
      text.setAttribute("y", tp.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.classList.add("pie-label");
      text.textContent = item.label;
  
      if (item.type === "leaf" && state.selectedChoice === item.cardId) {
        text.classList.add("selected");
      }
  
      g.appendChild(text);
    });
  
    svg.appendChild(g);
  
    requestAnimationFrame(() => {
      g.style.opacity = "1";
      g.style.transform = "scale(1)";
    });
  }
  
  // ==========================
  // Candidate grouping
  // "はる" (2-char prefix) becomes a branch and expands to "はるの/はるす"
  // ==========================
  function toLeaf(card) {
    return {
      type: "leaf",
      label: card.kimariji,
      cardId: card.id,
      fullKimariji: card.kimariji
    };
  }
  
  function groupCandidatesForFirstLevel(candidates) {
    const groupedByPrefix = new Map();
  
    candidates.forEach((card) => {
      const key = card.kimariji.length > 1 ? card.kimariji.substring(0, 2) : card.kimariji;
      if (!groupedByPrefix.has(key)) groupedByPrefix.set(key, []);
      groupedByPrefix.get(key).push(card);
    });
  
    const menuItems = [];
  
    groupedByPrefix.forEach((cardsInGroup, prefixLabel) => {
      cardsInGroup.sort((a, b) => a.kimariji.localeCompare(b.kimariji, "ja"));
  
      if (cardsInGroup.length === 1) {
        menuItems.push(toLeaf(cardsInGroup[0]));
        return;
      }
  
      // ★ always make branch for multi-cards like "はる"
      menuItems.push({
        type: "branch",
        label: prefixLabel,
        childrenMenuItems: cardsInGroup.map(toLeaf)
      });
    });
  
    // note: final order is randomized in renderPieLevel
    return menuItems;
  }
  
  // ==========================
  // Choice screen (gojuon grid -> pie menu)
  // ==========================
  function renderChoiceScreen() {
    state.selectionStep = 1;
    state.currentMenuLevel = 0;
    state.menuHistory = [];
    state.selectedChoice = null;
    state.selectedInitial = "";
    state.isMenuLockedBySelection = false;
  
    clearPieOverlay();
  
    const step1Container = document.getElementById("choice-step-1-initials");
    const step2Container = document.getElementById("choice-step-2-candidates");
  
    if (step1Container) step1Container.innerHTML = "";
    if (step2Container) {
      step2Container.className = "choice-step";
      step2Container.innerHTML = "";
    }
  
    if (step1Container) step1Container.className = "choice-step active gojuon-grid";
  
    const gojuon = [
      "わ","ら","や","ま","は","な","た","さ","か","あ",
      "を","り"," ","み","ひ","に","ち","し","き","い",
      "ん","る","ゆ","む","ふ","ぬ","つ","す","く","う",
      " ","れ"," ","め","へ","ね","て","せ","け","え",
      " ","ろ","よ","も","ほ","の","と","そ","こ","お"
    ];
  
    const validInitials = new Set(state.cardData.map((c) => c.kimariji.charAt(0)));
  
    gojuon.forEach((char) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn initial-btn";
  
      if (char === " ") {
        btn.classList.add("placeholder");
        btn.disabled = true;
      } else {
        btn.textContent = char;
        if (validInitials.has(char)) {
          btn.onclick = (e) => handleInitialClick(char, e);
        } else {
          btn.classList.add("disabled");
          btn.disabled = true;
        }
      }
      step1Container?.appendChild(btn);
    });
  
    const backBtn = document.getElementById("btn-back-to-initials");
    if (backBtn) backBtn.style.display = "none";
  
    const confirmBtn = document.getElementById("btn-confirm-choice");
    if (confirmBtn) confirmBtn.disabled = true;
  }
  
  function handleInitialClick(initial, event) {
    state.selectionStep = 2;
    state.selectedInitial = initial;
    state.selectedChoice = null;
    state.isMenuLockedBySelection = false;
  
    const candidates = state.cardData.filter((c) => c.kimariji.startsWith(initial));
    candidates.sort((a, b) => a.kimariji.localeCompare(b.kimariji, "ja"));
  
    let menuItems = groupCandidatesForFirstLevel(candidates);
  
    // ★ also shuffle level1 once here (renderPieLevel shuffles again per level)
    const rng1 = mulberry32(state.menuSeedBase ^ 0xA1B2C3D4);
    menuItems = shuffleWithRng(menuItems, rng1);
  
    renderPieRoot(event.clientX, event.clientY, menuItems);
  
    const backBtn = document.getElementById("btn-back-to-initials");
    if (backBtn) backBtn.style.display = "inline-block";
  
    const confirmBtn = document.getElementById("btn-confirm-choice");
    if (confirmBtn) confirmBtn.disabled = true;
  
    state.menuHistory = [{ level: 0 }];
  }
  
  function handleFinalSelection(cardId, fullKimariji) {
    state.selectedChoice = cardId;
    state.isMenuLockedBySelection = true;
  
    const confirmBtn = document.getElementById("btn-confirm-choice");
    if (confirmBtn) confirmBtn.disabled = false;
  
    const pieConfirm = document.getElementById("pie-confirm");
    if (pieConfirm) pieConfirm.disabled = false;
  }
  
  function goBackInMenu() {
    state.isMenuLockedBySelection = false;
    state.selectedChoice = null;
  
    clearPieOverlay();
  
    const confirmBtn = document.getElementById("btn-confirm-choice");
    if (confirmBtn) confirmBtn.disabled = true;
  
    const backBtn = document.getElementById("btn-back-to-initials");
    if (backBtn) backBtn.style.display = "none";
  
    renderChoiceScreen();
  }
  
  function confirmChoice() {
    if (!state.selectedChoice) return;
  
    state.isMenuLockedBySelection = false;
    clearPieOverlay();
  
    state.mainResults.push({
      ...state.currentTrialData,
      choice_id: state.selectedChoice,
      is_correct: state.selectedChoice === state.currentTrialData.stimulus_id ? 1 : 0,
      t_answer: performance.now()
    });
  
    state.currentMenuLevel = 0;
    state.menuHistory = [];
    state.selectedChoice = null;
  
    state.currentTrialIndex++;
    nextMainTrial();
  }
  
  // ==========================
  // Finish + export
  // ==========================
  function finishExperiment() {
    state.phase = "finished";
    showScreen("results");
  
    const validTrials = state.mainResults.filter((t) => t.press_time > 0);
    const correctTrials = validTrials.filter((t) => t.is_correct);
  
    const t_primes = validTrials.map((t) => t.t_prime).sort((a, b) => a - b);
    let S = 0;
    if (t_primes.length > 0) {
      const mid = Math.floor(t_primes.length / 2);
      S = t_primes.length % 2 !== 0 ? t_primes[mid] : (t_primes[mid - 1] + t_primes[mid]) / 2;
    }
  
    const A = validTrials.length > 0 ? correctTrials.length / validTrials.length : 0;
  
    const meanCorrect =
      correctTrials.length > 0 ? correctTrials.reduce((s, t) => s + t.t_prime, 0) / correctTrials.length : 0;
  
    const incorrect = validTrials.filter((t) => !t.is_correct);
    const meanIncorrect =
      incorrect.length > 0 ? incorrect.reduce((s, t) => s + t.t_prime, 0) / incorrect.length : 0;
  
    const Delta = meanIncorrect - meanCorrect;
  
    state.summaryStats = {
      Summary_Speed_S_ms: S,
      Summary_Accuracy_A_percent: A * 100,
      Summary_Risk_Delta_ms: Delta
    };
  
    const statsHTML = `<h3>概要統計</h3>
      <p><strong>運動反応時間 (t_motor):</strong> ${state.t_motor.toFixed(2)} ms</p>
      <p><strong>速度 (S):</strong> ${S.toFixed(2)} ms</p>
      <p><strong>正確度 (A):</strong> ${(A * 100).toFixed(1)} %</p>
      <p><strong>リスク指標 (Delta):</strong> ${Delta.toFixed(2)} ms</p>`;
  
    let container = document.getElementById("results-stats");
    if (!container) {
      container = document.createElement("div");
      container.id = "results-stats";
      document.getElementById("screen-results")?.insertBefore(container, document.getElementById("btn-download-logs"));
    }
    if (container) container.innerHTML = statsHTML;
  }
  
  function convertToCSV(data) {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(",")];
  
    for (const row of data) {
      const values = headers.map((header) => {
        let value = String(row[header] ?? "");
        if (value.includes(",")) value = `"${value}"`;
        return value;
      });
      csvRows.push(values.join(","));
    }
    return csvRows.join("\n");
  }
  
  function downloadLogs() {
    const metaData = {
      participantId: state.participantId,
      inputDevice: state.inputDevice,
      date: new Date().toISOString(),
      userAgent: navigator.userAgent,
      experimentVersion: "1.0",
      t_motor: state.t_motor
    };
  
    const flattenedMainTrials = state.mainResults.map((trial) => ({
      ...metaData,
      ...(state.summaryStats || {}),
      ...trial
    }));
  
    const csvContent = convertToCSV(flattenedMainTrials);
    if (!csvContent) {
      const s = document.getElementById("save-status");
      if (s) s.textContent = "データがありません。";
      return;
    }
  
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kikiwake_main_${state.participantId}_${Date.now()}.csv`;
    a.click();
  
    const s = document.getElementById("save-status");
    if (s) s.textContent = "CSVをダウンロードしました。";
  }
  
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  
  // ==========================
  // Init
  // ==========================
  async function init() {
    try {
      const [manifestRes, kimarijiRes] = await Promise.all([fetch("manifest.json"), fetch("kimariji.json")]);
      state.manifest = await manifestRes.json();
      state.kimarijiData = await kimarijiRes.json();
    } catch (e) {
      console.error("Failed to load data files", e);
      alert("致命的なエラー: データファイルの読み込みに失敗しました。");
    }
  
    document.getElementById("btn-start-motor")?.addEventListener("click", startMotorPhase);
  
    document.getElementById("btn-start-calibration")?.addEventListener("click", () => {
      const b = document.getElementById("btn-start-calibration");
      const area = document.getElementById("motor-area");
      if (b) b.style.display = "none";
      if (area) area.style.display = "flex";
      nextMotorTrial();
    });
  
    document.getElementById("btn-start-main")?.addEventListener("click", startMainPhase);
  
    document.getElementById("press-button")?.addEventListener("mousedown", handlePress);
    document.getElementById("motor-area")?.addEventListener("mousedown", handlePress);
  
    document.getElementById("btn-confirm-choice")?.addEventListener("click", confirmChoice);
    document.getElementById("btn-back-to-initials")?.addEventListener("click", goBackInMenu);
  
    document.getElementById("btn-resume")?.addEventListener("click", resumeFromBreak);
    document.getElementById("btn-download-logs")?.addEventListener("click", downloadLogs);
  
    document.getElementById("test-mode-toggle")?.addEventListener("change", (e) => {
      state.isTestMode = e.target.checked;
    });
  
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && (state.phase === "motor_waiting" || state.phase === "main_listening")) {
        e.preventDefault();
        handlePress(e);
      }
      if (e.code === "Escape" && state.phase === "main_choosing") {
        if (!state.isMenuLockedBySelection) {
          clearPieOverlay();
          goBackInMenu();
        }
      }
    });
  
    requestAnimationFrame(gamepadLoop);
  }
  
  init();
  