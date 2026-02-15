// Configuration
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

const BASE_PATH = location.pathname.replace(/\/[^\/]*$/, "/");

// State
let state = {
    participantId: '',
    inputDevice: '',
    phase: 'idle',
    isTestMode: false,
    selectionStep: 1,
    selectedInitial: '',
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
    audioStartTime: 0,
    audioCtx: null,
    summaryStats: null,

    // Radial Menu State
    currentMenuLevel: 0, // 0: Initials (gojuon grid), 1: Top-level radial menu, 2+: Sub-level radial menus
    menuHistory: [], // To store previous menu states for "back" functionality
    currentLevelMenuItems: [], // Items currently displayed in the active radial menu
    activeRadialMenuElement: null, // Reference to the main radial menu DOM element
    activeSubMenuElement: null, // Reference to the currently displayed sub-menu DOM element (on hover)
    hoverTimeout: null, // For managing hover delays
    currentRadialMenuOrigin: { x: 0, y: 0 }, // Origin coordinates of the current radial menu
    currentBranchButton: null, // The button that currently has an active sub-menu
    selectedChoice: null // The final selected card ID
};

// DOM Elements
const screens = {
    welcome: document.getElementById('screen-welcome'),
    motor: document.getElementById('screen-motor'),
    mainIntro: document.getElementById('screen-main-intro'),
    trial: document.getElementById('screen-trial'),
    choice: document.getElementById('screen-choice'),
    break: document.getElementById('screen-break'),
    results: document.getElementById('screen-results')
};

// Init
async function init() {
    try {
        const [manifestRes, kimarijiRes] = await Promise.all([
            fetch(BASE_PATH + 'manifest.json'),
            fetch(BASE_PATH + 'kimariji.json')
        ]);
        state.manifest = await manifestRes.json();
        state.kimarijiData = await kimarijiRes.json();
    } catch (e) {
        console.error("Failed to load data files", e);
        alert("致命的なエラー: データファイルの読み込みに失敗しました。");
    }

    document.getElementById('btn-start-motor').addEventListener('click', startMotorPhase);
    document.getElementById('btn-start-calibration').addEventListener('click', () => {
        document.getElementById('btn-start-calibration').style.display = 'none';
        document.getElementById('motor-area').style.display = 'flex';
        nextMotorTrial();
    });
    document.getElementById('btn-start-main').addEventListener('click', startMainPhase);
    document.getElementById('press-button').addEventListener('mousedown', handlePress);
    document.getElementById('motor-area').addEventListener('mousedown', handlePress);
    document.getElementById('btn-confirm-choice').addEventListener('click', confirmChoice);
    document.getElementById('btn-resume').addEventListener('click', resumeFromBreak);
    document.getElementById('btn-download-logs').addEventListener('click', downloadLogs);
    // Modified back button listener
    document.getElementById('btn-back-to-initials').addEventListener('click', goBackInMenu);

    document.getElementById('test-mode-toggle').addEventListener('change', (e) => {
        state.isTestMode = e.target.checked;
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && (state.phase === 'motor_waiting' || state.phase === 'main_listening')) {
            e.preventDefault();
            handlePress(e);
        }
    });

    // Global mousemove to hide sub-menus if not hovering over them
    document.addEventListener('mousemove', (e) => {
        if (state.activeSubMenuElement && state.currentBranchButton) {
            const subMenuRect = state.activeSubMenuElement.getBoundingClientRect();
            const branchBtnRect = state.currentBranchButton.getBoundingClientRect();

            // Check if mouse is outside sub-menu AND outside its parent branch button
            if (
                !isPointInRect(e.clientX, e.clientY, subMenuRect) &&
                !isPointInRect(e.clientX, e.clientY, branchBtnRect)
            ) {
                hideSubMenu();
            }
        }
    });

    function isPointInRect(x, y, rect) {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    // Fallback: hide sub-menu if mouse leaves the document or if a new main radial menu is rendered
    document.addEventListener('mouseleave', hideSubMenu);


    requestAnimationFrame(gamepadLoop);
}

function showScreen(id) {
    Object.values(screens).forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (screens[id]) screens[id].classList.add('active');
}

function getAudioContext() {
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return state.audioCtx;
}

let currentSource = null;
async function playSound(sourceData, { offset = 0, duration = undefined, isCue = false } = {}) {
    return new Promise(async (resolve, reject) => {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        try {
            let audioBuffer;
            if (typeof sourceData === 'string') {
                const url = /^(https?:)?\/\//.test(sourceData) ? sourceData : (BASE_PATH + sourceData);
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTPエラー`);
                audioBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
            } else if (sourceData instanceof AudioBuffer) {
                audioBuffer = sourceData;
            } else { throw new Error("Invalid sourceData"); }

            if (currentSource) currentSource.stop();
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            if (!isCue) state.t0 = performance.now();
            source.start(0, Math.max(0, offset), duration === undefined ? audioBuffer.duration - Math.max(0, offset) : duration);
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

let lastGamepadState = false;
function gamepadLoop() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pressed = false;
    for (const gp of gamepads) {
        if (gp && gp.buttons.some(b => b.pressed)) {
            pressed = true;
            break;
        }
    }
    if (pressed && !lastGamepadState && (state.phase === 'motor_waiting' || state.phase === 'main_listening')) {
        handlePress({ type: 'gamepad' });
    }
    lastGamepadState = pressed;
    requestAnimationFrame(gamepadLoop);
}

function handlePress(e) {
    const now = performance.now();
    if (state.phase === 'motor_waiting') {
        stopSound();
        state.motorResults.push({
            rt: now - state.t0,
            input_device: e.type || '不明'
        });
        document.getElementById('motor-area').classList.add('responded');
        state.phase = 'motor_idle';
        setTimeout(() => {
            document.getElementById('motor-area').classList.remove('responded');
            nextMotorTrial();
        }, 500);
    } else if (state.phase === 'main_listening') {
        stopSound();
        state.currentTrialData.press_time = now - state.t0;
        state.currentTrialData.t_prime = state.currentTrialData.press_time - state.t_motor;
        state.currentTrialData.input_device = e.type || '不明';
        state.phase = 'main_choosing';
        showScreen('choice');
    }
}

function startMotorPhase() {
    state.participantId = document.getElementById('participant-id').value || 'anon';
    state.inputDevice = document.getElementById('input-device').value;
    getAudioContext();
    state.phase = 'motor_idle';
    state.currentMotorTrial = 0;
    state.motorResults = [];
    document.getElementById('motor-total-trials').textContent = (state.isTestMode ? TEST_CONFIG : CONFIG).motorTrials;
    showScreen('motor');
}

function nextMotorTrial() {
    const currentConfig = state.isTestMode ? TEST_CONFIG : CONFIG;
    if (state.currentMotorTrial >= currentConfig.motorTrials) {
        const rts = state.motorResults.map(r => r.rt).sort((a,b) => a-b);
        if (rts.length > 0) {
            const mid = Math.floor(rts.length / 2);
            state.t_motor = rts.length % 2 !== 0 ? rts[mid] : (rts[mid - 1] + rts[mid]) / 2;
        }
        showScreen('mainIntro');
        return;
    }
    state.currentMotorTrial++;
    document.getElementById('motor-counter').textContent = state.currentMotorTrial;
    const delay = currentConfig.minWait + Math.random() * (currentConfig.maxWait - currentConfig.minWait);
    setTimeout(() => {
        state.phase = 'motor_waiting';
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

async function startMainPhase() {
    try {
        const ctx = getAudioContext();
        const response = await fetch(BASE_PATH + "I-000B.ogg");
        if (!response.ok) throw new Error("合図音ファイルが見つかりません");
        state.cueAudioBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (e) {
        console.error("合図音のプリロードに失敗しました", e);
        alert("致命的なエラー: 合図音を読み込めませんでした。");
        return;
    }

    const currentConfig = state.isTestMode ? TEST_CONFIG : CONFIG;
    const kimarijiMap = new Map(state.kimarijiData.map(k => [k.id, k.kimariji]));
    state.cardData = state.manifest
        .filter(m => m.path.endsWith('A.ogg'))
        .map(m => ({ id: m.category_id, label: m.label, path: m.path, kimariji: kimarijiMap.get(m.category_id) || '' }))
        .filter(c => c.kimariji);

    let availableCards = state.isTestMode 
        ? state.cardData.filter(c => new Set(currentConfig.testCategoryIds).has(c.id))
        : state.cardData.filter(c => c.id <= currentConfig.totalCategories);

    let deck = [];
    for (const card of availableCards) {
        for (let r = 0; r < currentConfig.mainRepetitions; r++) {
            deck.push({ stimulus_id: card.id, stimulus_file: card.path, rep: r });
        }
    }

    state.trialDeck = shuffle(deck).map((t, i) => ({ ...t, trial_index: i + 1 }));
    state.currentTrialIndex = 0;
    state.mainResults = [];
    document.getElementById('total-trials').textContent = state.trialDeck.length;
    renderChoiceScreen();
    nextMainTrial();
}

async function startTrialWithCue(trial) {
    try {
        const cueDuration = state.cueAudioBuffer.duration;
        const offset = Math.max(0, cueDuration - CONFIG.cueSoundPlaybackDuration);
        await playSound(state.cueAudioBuffer, { offset, duration: CONFIG.cueSoundPlaybackDuration, isCue: true });
        await new Promise(resolve => setTimeout(resolve, CONFIG.cueSoundSilenceDuration));
        state.phase = 'main_listening';
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
    renderChoiceScreen();
    showScreen('trial');
    document.getElementById('trial-counter').textContent = (state.currentTrialIndex + 1);
    startTrialWithCue(trial);
}

function nextMainTrial() {
    if (state.currentTrialIndex >= state.trialDeck.length) {
        finishExperiment();
        return;
    }
    if (state.currentTrialIndex > 0 && state.currentTrialIndex % (state.isTestMode ? TEST_CONFIG : CONFIG).breakInterval === 0) {
        showScreen('break');
        return;
    }
    proceedToNextTrial();
}

function resumeFromBreak() {
    proceedToNextTrial();
}

function groupCandidatesForFirstLevel(candidates) {
    const groupedByPrefix = new Map(); // Key: 2-char prefix (or full kimariji if < 2), Value: array of full card objects

    candidates.forEach(card => {
        // Use the first 2 characters as the primary grouping key.
        // If kimariji is shorter than 2 chars, use the full kimariji as the key.
        const prefixKey = card.kimariji.length > 1 ? card.kimariji.substring(0, 2) : card.kimariji;
        
        if (!groupedByPrefix.has(prefixKey)) {
            groupedByPrefix.set(prefixKey, []);
        }
        groupedByPrefix.get(prefixKey).push(card);
    });

    const menuItems = [];
    groupedByPrefix.forEach((cardsInGroup, prefixLabel) => {
        // Sort cards within each group for consistent sub-menu display
        cardsInGroup.sort((a, b) => a.kimariji.localeCompare(b.kimariji, 'ja'));

        const directMatchCard = cardsInGroup.find(c => c.kimariji === prefixLabel);
        const nonDirectMatches = cardsInGroup.filter(c => c.kimariji !== prefixLabel);

        // If there's an exact match for the prefix, add it as a leaf.
        if (directMatchCard) {
            menuItems.push({ type: 'leaf', label: prefixLabel, cardId: directMatchCard.id, fullKimariji: directMatchCard.kimariji });
        }

        // If there are other cards that start with this prefix but are longer, create a branch.
        if (nonDirectMatches.length > 0) {
            const branchLabel = directMatchCard ? prefixLabel + '...' : prefixLabel; // Differentiate if direct match exists
            menuItems.push({ type: 'branch', label: branchLabel, childrenCards: nonDirectMatches });
        } else if (!directMatchCard && cardsInGroup.length === 1) {
            // This case handles a single card (e.g., "あきの") whose kimariji is longer than its 2-char prefix (e.g., "あき").
            // It should be a leaf representing the full kimariji.
            menuItems.push({ type: 'leaf', label: cardsInGroup[0].kimariji, cardId: cardsInGroup[0].id, fullKimariji: cardsInGroup[0].kimariji });
        }
        // No 'else' needed here for the `cardsInGroup.length > 1` case because it's covered by `nonDirectMatches.length > 0`
        // (since if no directMatchCard and multiple cards, all cards are 'nonDirectMatches').
    });

    menuItems.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    return menuItems;
}

// Global variable to hold the current hovered branch button
let currentHoveredBranchButton = null;

// Function to hide the currently active sub-menu
function hideSubMenu() {
    if (state.activeSubMenuElement && state.activeSubMenuElement.parentNode) {
        state.activeSubMenuElement.parentNode.removeChild(state.activeSubMenuElement);
        state.activeSubMenuElement = null;
        state.currentBranchButton = null;
    }
    clearTimeout(state.hoverTimeout);
    state.hoverTimeout = null;
}

// Function to render a radial menu
function renderRadialMenu(menuItems, originX, originY, parentDiv, level, isSubMenu = false) {
    // Hide any active sub-menu if this is a main menu rendering
    if (!isSubMenu) { // Only clear sub-menus when rendering a new top-level menu
        hideSubMenu();
    }
    
    // Clear previous menu at this level if it exists (e.g., if going back)
    if (!isSubMenu && state.activeRadialMenuElement && state.activeRadialMenuElement.parentNode === parentDiv) {
        state.activeRadialMenuElement.parentNode.removeChild(state.activeRadialMenuElement);
        state.activeRadialMenuElement = null;
    } else if (isSubMenu && state.activeSubMenuElement && state.activeSubMenuElement.parentNode === parentDiv) {
        state.activeSubMenuElement.parentNode.removeChild(state.activeSubMenuElement);
        state.activeSubMenuElement = null;
    }

    const radialMenu = document.createElement('div');
    radialMenu.className = 'radial-menu';
    
    // Position the radial menu based on originX, originY
    radialMenu.style.position = 'absolute';
    radialMenu.style.left = `${originX}px`;
    radialMenu.style.top = `${originY}px`;
    radialMenu.style.transform = 'translate(-50%, -50%)'; // Center it on the origin

    // Store origin for sub-menus
    if (!isSubMenu) { // Only update main menu origin
        state.currentRadialMenuOrigin = { x: originX, y: originY };
    }
    state.currentLevelMenuItems = menuItems; // Store current items for state management
    state.currentMenuLevel = level; // Update current level

    const radius = 120; // Re-use the same radius for all levels
    menuItems.forEach((item, i) => {
        const angle = (i / menuItems.length) * 2 * Math.PI - (Math.PI / 2);
        const btnX = radius * Math.cos(angle);
        const btnY = radius * Math.sin(angle);

        const btn = document.createElement('button');
        btn.className = `choice-btn candidate-btn ${item.type}`;
        btn.textContent = item.label;
        btn.style.position = 'absolute';
        btn.style.left = `calc(50% + ${btnX}px)`;
        btn.style.top = `calc(50% + ${btnY}px)`;
        btn.style.transform = 'translate(-50%, -50%)';

        if (item.type === 'leaf') {
            btn.dataset.id = item.cardId;
            btn.dataset.fullKimariji = item.fullKimariji;
            btn.onclick = () => handleFinalSelection(item.cardId, item.fullKimariji);
        } else { // type === 'branch'
            btn.dataset.prefix = item.label;
            // Store childrenCards for next level
            btn.childrenData = item.childrenCards; 

            btn.onmouseover = (e) => {
                // Only show sub-menu if this is not the current active branch
                if (state.currentBranchButton === btn) return;

                clearTimeout(state.hoverTimeout); // Clear any existing timeout
                state.hoverTimeout = setTimeout(() => {
                    hideSubMenu(); // Hide any previous sub-menu
                    state.currentBranchButton = btn; // Set this button as the current active branch
                    // Calculate sub-menu origin: offset from the branch button, spreading outwards
                    const mainRadialMenuCenter = {
                        x: state.activeRadialMenuElement.getBoundingClientRect().left + state.activeRadialMenuElement.offsetWidth / 2,
                        y: state.activeRadialMenuElement.getBoundingClientRect().top + state.activeRadialMenuElement.offsetHeight / 2
                    };
                    const branchBtnRect = btn.getBoundingClientRect();
                    const branchBtnCenter = {
                        x: branchBtnRect.left + branchBtnRect.width / 2,
                        y: branchBtnRect.top + branchBtnRect.height / 2
                    };

                    let vecX = branchBtnCenter.x - mainRadialMenuCenter.x;
                    let vecY = branchBtnCenter.y - mainRadialMenuCenter.y;
                    let vecLength = Math.sqrt(vecX * vecX + vecY * vecY);

                    // Ensure vecLength is not zero to avoid division by zero, default to right if no vector
                    const normalizedVecX = vecLength > 0 ? vecX / vecLength : 1;
                    const normalizedVecY = vecLength > 0 ? vecY / vecLength : 0;

                    const radiusOffset = 180; // Distance to push the sub-menu center outwards (main menu radius + extra buffer)
                    const subMenuOriginX = branchBtnCenter.x + normalizedVecX * radiusOffset;
                    const subMenuOriginY = branchBtnCenter.y + normalizedVecY * radiusOffset;

                    renderRadialMenu(item.childrenCards, subMenuOriginX, subMenuOriginY, parentDiv, level + 1, true); // Pass true for isSubMenu
                }, 300); // 300ms delay for hover
            };
            btn.onmouseout = (e) => {
                // Handled by global mousemove/mouseleave listeners now, to allow transition to sub-menu
            };
        }
        radialMenu.appendChild(btn);
    });

    parentDiv.appendChild(radialMenu);
    if (!isSubMenu) { // If it's the main radial menu
        state.activeRadialMenuElement = radialMenu;
    } else { // If it's a sub-menu
        state.activeSubMenuElement = radialMenu;
    }
}

function renderChoiceScreen() {
    state.selectionStep = 1;
    state.currentMenuLevel = 0; // Reset level for initial screen
    state.menuHistory = []; // Clear history
    hideSubMenu(); // Ensure no sub-menus are lingering

    const step1Container = document.getElementById('choice-step-1-initials');
    step1Container.innerHTML = '';
    const step2Container = document.getElementById('choice-step-2-candidates');
    step2Container.className = 'choice-step';
    step2Container.innerHTML = ''; // Clear any radial menu that might be there
    step1Container.className = 'choice-step active gojuon-grid';

    const gojuon = [
        'わ','ら','や','ま','は','な','た','さ','か','あ',
        'を','り',' ','み','ひ','に','ち','し','き','い',
        'ん','る','ゆ','む','ふ','ぬ','つ','す','く','う',
        ' ','れ',' ','め','へ','ね','て','せ','け','え',
        ' ','ろ','よ','も','ほ','の','と','そ','こ','お'
    ];
    const validInitials = new Set(state.cardData.map(c => c.kimariji.charAt(0)));

    gojuon.forEach(char => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn initial-btn';
        if (char === ' ') {
            btn.classList.add('placeholder');
            btn.disabled = true;
        } else {
            btn.textContent = char;
            if (validInitials.has(char)) {
                btn.onclick = (e) => handleInitialClick(char, e);
            } else {
                btn.classList.add('disabled');
                btn.disabled = true;
            }
        }
        step1Container.appendChild(btn);
    });
}

// Modified handleInitialClick to render first level radial menu
function handleInitialClick(initial, event) {
    state.selectionStep = 2;
    state.selectedInitial = initial;
    state.selectedChoice = null; // Clear any previous selection

    const candidates = state.cardData.filter(c => c.kimariji.startsWith(initial));
    candidates.sort((a, b) => a.kimariji.localeCompare(b.kimariji, 'ja'));

    // Push current state to history before changing
    state.menuHistory.push({
        level: state.currentMenuLevel,
        items: state.currentLevelMenuItems, // Store current items for the level that is being left
        initial: state.selectedInitial,
        origin: state.currentRadialMenuOrigin
    });

    const menuItems = groupCandidatesForFirstLevel(candidates); // Use the new grouping function
    state.currentLevelMenuItems = menuItems; // Store for current level

    const step2Container = document.getElementById('choice-step-2-candidates');
    step2Container.className = 'choice-step active radial-menu-overlay'; // Ensure overlay is active
    document.getElementById('choice-step-1-initials').classList.remove('active'); // Hide initials grid

    // Render the first level radial menu
    renderRadialMenu(menuItems, event.clientX, event.clientY, step2Container, 1);

    const controls = document.getElementById('choice-controls');
    controls.className = 'overlay-controls';
    // Removed: step2Container.appendChild(controls); // Controls should not be moved
    document.getElementById('btn-back-to-initials').style.display = 'inline-block';
    document.getElementById('btn-confirm-choice').disabled = true;
}

// New function for final selection (replaces old handleCandidateClick logic for leaf nodes)
function handleFinalSelection(cardId, fullKimariji) {
    state.selectedChoice = cardId;
    // Highlight the selected button
    document.querySelectorAll('.candidate-btn').forEach(b => {
        // Ensure to remove selected class from all and then add to the current one
        b.classList.remove('selected');
        if (b.dataset.id && parseInt(b.dataset.id) === cardId && b.dataset.fullKimariji === fullKimariji) {
            b.classList.add('selected');
        }
    });
    document.getElementById('btn-confirm-choice').disabled = false;
    // Clear any open sub-menus
    hideSubMenu();
}


// Modified backToInitials -> now a generic back function
function goBackInMenu() {
    hideSubMenu(); // Always hide sub-menu when going back
    state.selectedChoice = null; // Clear selection

    if (state.menuHistory.length > 0) {
        const previousState = state.menuHistory.pop();
        
        // Remove current active radial menu if exists
        if (state.activeRadialMenuElement && state.activeRadialMenuElement.parentNode) {
            state.activeRadialMenuElement.parentNode.removeChild(state.activeRadialMenuElement);
            state.activeRadialMenuElement = null;
        }

        if (previousState.level === 0) { // Back to initials grid
            state.selectionStep = 1;
            state.selectedInitial = '';
            
            const controls = document.getElementById('choice-controls');
            controls.className = 'choice-controls';
            // Removed: document.getElementById('choice-container').appendChild(controls); // Controls should not be moved

            const step2Container = document.getElementById('choice-step-2-candidates');
            step2Container.className = 'choice-step';
            step2Container.innerHTML = ''; // Clear radial menu

            document.getElementById('choice-step-1-initials').classList.add('active'); // Activate gojuon grid
            document.getElementById('btn-back-to-initials').style.display = 'none';
            document.getElementById('btn-confirm-choice').disabled = true;

        } else { // Go back one level in radial menu
            const step2Container = document.getElementById('choice-step-2-candidates');
            // Re-render the previous radial menu state from history
            renderRadialMenu(previousState.items, previousState.origin.x, previousState.origin.y, step2Container, previousState.level);
            
            document.getElementById('btn-confirm-choice').disabled = true;
        }
    }
}

function confirmChoice() {
    if (!state.selectedChoice) return;
    
    state.mainResults.push({
        ...state.currentTrialData,
        choice_id: state.selectedChoice,
        is_correct: (state.selectedChoice === state.currentTrialData.stimulus_id) ? 1 : 0,
        t_answer: performance.now()
    });
    
    // Reset radial menu state and clear choice screen
    state.currentMenuLevel = 0;
    state.menuHistory = [];
    state.selectedChoice = null;
    hideSubMenu(); // Ensure all sub-menus are hidden

    // Go back to initials screen or simply proceed to next trial, clearing the choice screen
    goBackInMenu(); // This will clean up the radial menu overlay and go back to initial grid state

    state.currentTrialIndex++;
    nextMainTrial();
}

function finishExperiment() {
    state.phase = 'finished';
    showScreen('results');
    
    const validTrials = state.mainResults.filter(t => t.press_time > 0);
    const correctTrials = validTrials.filter(t => t.is_correct);
    const t_primes = validTrials.map(t => t.t_prime).sort((a,b) => a-b);
    let S = 0;
    if (t_primes.length > 0) {
        const mid = Math.floor(t_primes.length / 2);
        S = t_primes.length % 2 !== 0 ? t_primes[mid] : (t_primes[mid - 1] + t_primes[mid]) / 2;
    }
    const A = validTrials.length > 0 ? (correctTrials.length / validTrials.length) : 0;
    const meanCorrect = correctTrials.length > 0 ? (correctTrials.reduce((s,t) => s + t.t_prime, 0) / correctTrials.length) : 0;
    const meanIncorrect = validTrials.filter(t => !t.is_correct).length > 0 ? (validTrials.filter(t => !t.is_correct).reduce((s,t) => s + t.t_prime, 0) / validTrials.filter(t => !t.is_correct).length) : 0;
    const Delta = meanIncorrect - meanCorrect;

    state.summaryStats = { Summary_Speed_S_ms: S, Summary_Accuracy_A_percent: (A * 100), Summary_Risk_Delta_ms: Delta };
    
    const statsHTML = `<h3>概要統計</h3>
        <p><strong>運動反応時間 (t_motor):</strong> ${state.t_motor.toFixed(2)} ms</p>
        <p><strong>速度 (S):</strong> ${S.toFixed(2)} ms</p>
        <p><strong>正確度 (A):</strong> ${(A * 100).toFixed(1)} %</p>
        <p><strong>リスク指標 (Delta):</strong> ${Delta.toFixed(2)} ms</p>`;
    
    let container = document.getElementById('results-stats');
    if (!container) {
        container = document.createElement('div');
        container.id = 'results-stats';
        document.getElementById('screen-results').insertBefore(container, document.getElementById('btn-download-logs'));
    }
    container.innerHTML = statsHTML;
}

function convertToCSV(data) {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
        const values = headers.map(header => {
            let value = String(row[header] || '');
            if (value.includes(',')) value = `"${value}"`;
            return value;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
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
    const flattenedMainTrials = state.mainResults.map(trial => ({ ...metaData, ...(state.summaryStats || {}), ...trial }));
    const csvContent = convertToCSV(flattenedMainTrials);
    if (!csvContent) {
        document.getElementById('save-status').textContent = "データがありません。";
        return;
    }
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kikiwake_main_${state.participantId}_${Date.now()}.csv`;
    a.click();
    document.getElementById('save-status').textContent = "CSVをダウンロードしました。";
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

init();
