/*
 * Copyright © 2025 Thorgin (on GitHub: itsThorgin). All rights reserved.
 * This file is part of a project published for public viewing only.
 * Reuse, modification, or redistribution is strictly prohibited.
 */

// ==============================
// Level/Tier Configuration
// Part of: Level system
// ==============================

// Tiers for user progression
const tiers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"];
const levelsPerTier = 10;
const FHD_REFERENCE_SHORT_SIDE = 1080;
const CURVE_ARC_SAMPLES = 512;
const DOOR_ARC_SAMPLES = 96;

// Table for a parameterized 2D curve
// Converting between curve parameter and travelled distance lets curved paths honor px/s
// instead of speeding up or slowing down as their geometry changes
function buildArcLengthLookup(pointAt, maxParameter = 1, samples = CURVE_ARC_SAMPLES) {
    const cumulative = new Float64Array(samples + 1);
    let previous = pointAt(0);

    for (let i = 1; i <= samples; i++) {
        const parameter = (i / samples) * maxParameter;
        const point = pointAt(parameter);
        cumulative[i] = cumulative[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
    }

    return { cumulative, maxParameter, samples, totalLength: cumulative[samples] };
}

function parameterAtArcDistance(lookup, distance) {
    const target = Math.max(0, Math.min(lookup.totalLength, distance));
    let low = 0;
    let high = lookup.samples;

    while (low < high) {
        const middle = (low + high) >> 1;
        if (lookup.cumulative[middle] < target) low = middle + 1;
        else high = middle;
    }

    const upper = Math.max(1, low);
    const lower = upper - 1;
    const segmentStart = lookup.cumulative[lower];
    const segmentLength = lookup.cumulative[upper] - segmentStart;
    const fraction = segmentLength > 0 ? (target - segmentStart) / segmentLength : 0;
    return ((lower + fraction) / lookup.samples) * lookup.maxParameter;
}

function arcDistanceAtParameter(lookup, parameter) {
    const normalized = Math.max(0, Math.min(1, parameter / lookup.maxParameter));
    const samplePosition = normalized * lookup.samples;
    const lower = Math.min(lookup.samples - 1, Math.floor(samplePosition));
    const upper = lower + 1;
    const fraction = samplePosition - lower;
    return lookup.cumulative[lower] +
        (lookup.cumulative[upper] - lookup.cumulative[lower]) * fraction;
}

// Base speeds for each level (unscaled, for full HD)
let baseSpeeds = [1000, 350, 600, 1200, 400, 200, 500, 700, 550];

// Currently selected tier and sublevel (user selection state)
let selectedTier = "12";
let selectedSublevel = 1;

// Stores all calculated speeds for all levels/tiers
let allLevelSpeeds = [];

// Level 4 direction change
let lastDirectionChangeTime = 0;
const directionChangeCooldown = 3000; // 3 sec
const directionChangeChance = 0.33; // % chance
// Minimum distance (fraction of smaller screen dimension)
// the target must travel since the last reversal before another reversal can be considered
// This keeps the behavior speed independent: at low speeds the target won't flip after only a tiny move
const directionChangeMinDistFraction = 0.25; // 25% of min(width, height)
let distanceSinceDirectionChange = 0; // Accumulated travel since last reversal

// ----------------------------------
// Generates speed values for all levels/tiers
// Part of: Level system - returns an array of speed arrays, one for each level
// ----------------------------------
function generateAllSpeeds(baseSpeeds, tiers, levelsPerTier) {
    const allSpeeds = [];
    const anchorTier = 12, anchorSublevel = 1;
    const anchorStep = (anchorTier - 1) * levelsPerTier + (anchorSublevel - 1);
    const totalSteps = (tiers.length * levelsPerTier) - 1;
    const minDownFactor = 0.2; // 20% of base at lowest
    const maxUpFactor = 2.0;   // 200% of base at highest

    for (let t = 0; t < tiers.length; t++) {
        for (let l = 0; l < levelsPerTier; l++) {
            const step = t * levelsPerTier + l;
            let factor;
            if (step < anchorStep) {
                // Extrapolate down from anchor
                const progress = (anchorStep - step) / anchorStep;
                factor = 1 - (1 - minDownFactor) * progress;
            } else if (step > anchorStep) {
                // Extrapolate up from anchor
                const progress = (step - anchorStep) / (totalSteps - anchorStep);
                factor = 1 + (maxUpFactor - 1) * progress;
            } else {
                // Anchor
                factor = 1;
            }
            const levelSpeeds = baseSpeeds.map(s => parseFloat((s * factor).toFixed(2)));
            allSpeeds.push(levelSpeeds);
        }
    }
    return allSpeeds;
}

// ----------------------------------
// Updates the current level and speed based on tier/sublevel selection
// Part of: Level system, UI interaction
// ----------------------------------
function updateLevelFromTier() {
    selectedTier = document.getElementById('tierSelect').value;
    selectedSublevel = parseInt(document.getElementById('subLevelInput').value);
    allLevelSpeeds = generateAllSpeeds(baseSpeeds, tiers, levelsPerTier);

    // Get the correct speeds for the selected tier/sublevel
    const tierIndex = tiers.indexOf(selectedTier);
    const levelIndex = (tierIndex * levelsPerTier) + (selectedSublevel - 1);
    referenceLevelSpeeds = [...allLevelSpeeds[levelIndex]];
    const speeds = scaleReferenceSpeeds(referenceLevelSpeeds);
    levelSpeeds = [...speeds];
    speedInputs.forEach((input, i) => input.value = speeds[i]);

    // Update speedPercent for the current level (1 based)
    speedPercent = levelSpeeds[level - 1];
    document.getElementById('speedInput').value = speedPercent;

    // Update UI display (but do NOT change the global level)
    $('levelDisplay').innerText = "Level " + level;

    resetLevel();
}

// ==============================
// Canvas Setup
// Part of: Drawing/game rendering
// ==============================

const $ = id => document.getElementById(id);

// Get canvas and its 2D drawing context
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');

// ----------------------------------
// Canvas Resizing
// Part of: Drawing/game rendering
// ----------------------------------
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

let screenScaleResizeTimer = null;
function handleViewportResize() {
    resizeCanvas();
    clearTimeout(screenScaleResizeTimer);
    screenScaleResizeTimer = setTimeout(updateScreenScaling, 120);
}

// A monitor move can change devicePixelRatio without otherwise changing the viewport
// Rearm the media query after every change because its value is fixed when created
let removePixelRatioListener = null;
function watchPixelRatioChanges() {
    if (removePixelRatioListener) removePixelRatioListener();
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const handleChange = () => {
        watchPixelRatioChanges();
        handleViewportResize();
    };
    query.addEventListener('change', handleChange, { once: true });
    removePixelRatioListener = () => query.removeEventListener('change', handleChange);
}

// Resize immediately, then debounce the more expensive level rescaling/reset
window.addEventListener('resize', handleViewportResize);
document.addEventListener('fullscreenchange', handleViewportResize);
resizeCanvas();
watchPixelRatioChanges();

// ==============================
// Level and Meditation Initialization
// Part of: Level system, Meditation mode
// ==============================

// Current level, max level, and meditation levels
let level = 1;
const maxLevel = 9;
const meditationLevels = [4]; // advanced bounce only
let meditationLevelIndex = 0;
$('levelDisplay').innerText = "Level " + level;

// Meditation mode configuration
const meditationSpeeds = [75, 0, 0, 75, 0, 0, 0, 0, 0];
let meditationSpeedsScaled = [...meditationSpeeds]; // Holds scaled values for current resolution
let isMeditationMode = false;
const MEDITATION_END_DURATION = 4;
const MEDITATION_START_DURATION = 1.5;
const MEDITATION_NORMAL_TURN_RATE = 0.22;
const MEDITATION_BOUNDARY_TURN_RATE = 0.75;
let meditationSessionState = 'idle'; // idle, running, ending, complete
let meditationEndingElapsed = 0;
let meditationStartingElapsed = MEDITATION_START_DURATION;
let meditationMotionState = null;
let savedReferenceSpeeds = [];
let savedColors = {};
let savedAutoSwitch = false;
let savedSizePercent = 50;
let savedRoundDuration = 30;
// Reading UI Codes, 3D depth, and stripe/hashtag overlays are forced off during
// meditation and restored to the pre meditation state on exit
let savedReadingUIEnabled = false;
let saved3DEnabled = false;
let savedOverlays = {}; // hashtag / vertical / horizontal / solid stripe toggles
let savedFlashDisabled = false; // disableFlashToggle state, restored on exit

// ----------------------------------
// Visibility of the menu/controls toggle
// Part of: UI interaction
// ----------------------------------
function toggleMenu() {
    const controls = $('controls');
    const willOpen = controls.style.display === 'none';
    controls.style.display = willOpen ? 'block' : 'none';
    $('menuButton').setAttribute('aria-expanded', String(willOpen));
}

function showKeyboardLevelToast() {
    const toast = $('levelToast');
    toast.textContent = `Level ${level}`;
    toast.classList.remove('is-visible');
    // Restart the short animation so rapid arrow presses show the latest value
    void toast.offsetWidth;
    toast.classList.add('is-visible');
}

$('levelToast').addEventListener('animationend', () => {
    $('levelToast').classList.remove('is-visible');
});

// ----------------------------------
// Keyboard shortcut for toggling menu
// ----------------------------------
document.addEventListener('keydown', function(e) {
    const active = document.activeElement;
    // Only blocks 'm' key if a text field or textarea is focused
    if (
        active &&
        (
            (active.tagName === 'INPUT' && ['text', 'password', 'email', 'search', 'url', 'tel'].includes(active.type))
            || active.tagName === 'TEXTAREA'
            || active.isContentEditable
        )
    ) {
        return;
    }
    if (e.key === 'm' || e.key === 'M') {
        toggleMenu();
    }
    // Spacebar toggles pause (preventDefault stops the page from scrolling)
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePause();
    }
    // Left/Right arrows step through levels (prev/next)
    // Skip when a form control is focused so arrows still adjust number
    // fields and dropdowns normally, and skip in ABC mode
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
            return;
        }
        if (isABCMode) return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') {
            prevLevel();
        } else {
            nextLevel();
        }
        showKeyboardLevelToast();
    }
});

// ==============================
// Global Settings and UI Bindings
// Part of: Color settings, Level speed settings
// ==============================

// Color settings (from color pickers)
let ballColor = $('ballColor').value;
let dotColor = $('dotColor').value;
let backgroundColor = $('bgColor').value;
let flashColor = $('flashColor').value;

// Curated target / center-dot pairs
// Selection is filtered against each chosen background at runtime
const TARGET_COLOR_PAIRS = [
    { target: '#ff6b6b', dot: '#1a0b0b' }, // coral / deep brown
    { target: '#f59e0b', dot: '#1a1203' }, // amber / espresso
    { target: '#facc15', dot: '#171204' }, // gold / near black
    { target: '#a3e635', dot: '#152006' }, // lime / forest black
    { target: '#2dd4bf', dot: '#06211e' }, // mint / dark teal
    { target: '#22d3ee', dot: '#062027' }, // cyan / deep blue
    { target: '#e9c46a', dot: '#1b170b' }, // sand / umber
    { target: '#bae6fd', dot: '#102131' }, // ice / navy
    { target: '#7f1d1d', dot: '#ffffff' }, // deep red / white
    { target: '#14532d', dot: '#ffffff' }, // forest / white
    { target: '#115e59', dot: '#ffffff' }, // deep teal / white
    { target: '#0c4a6e', dot: '#ffffff' }, // navy / white
    { target: '#1e3a8a', dot: '#ffffff' }, // deep blue / white
    { target: '#3730a3', dot: '#ffffff' }, // indigo / white
    { target: '#581c87', dot: '#ffffff' }, // plum / white
    { target: '#111827', dot: '#ffffff' }, // charcoal / white
    { target: '#ef4444', dot: '#ffffff' }, // red / white
    { target: '#3b82f6', dot: '#ffffff' }, // blue / white
    { target: '#8b5cf6', dot: '#ffffff' }, // violet / white
    { target: '#ec4899', dot: '#1d0b16' }, // pink / near black
];

// Muted dark backgrounds
const COLOR_CYCLE_BACKGROUNDS = [
    '#30343b', // graphite
    '#293241', // slate blue
    '#273043', // dusk blue
    '#2d2a40', // muted indigo
    '#33283c', // muted plum
    '#3a2b35', // muted berry
    '#352f2a', // soft umber
    '#30352c', // olive charcoal
    '#25372f', // forest charcoal
    '#233838', // deep muted teal
    '#24363d', // blue charcoal
    '#263447', // storm blue
    '#2e3440', // cool graphite
    '#34323d', // smoky violet
    '#3b3330', // warm charcoal
    '#31383a', // steel charcoal
    '#3a3036', // smoky rose
    '#28353a', // deep blue-grey
    '#303047', // twilight indigo
    '#2f3a32', // muted pine
];
const COLOR_CYCLE_MIN_SECONDS = 3;
const COLOR_CYCLE_MAX_SECONDS = 10;
const MIN_TARGET_BACKGROUND_CONTRAST = 2.4;
const MIN_DOT_TARGET_CONTRAST = 3.5;
let colorCycleTimeRemaining = 0;
let lastColorPairIndex = -1;
let lastColorBackgroundIndex = -1;
let colorCycleBaseColors = null;
let clockState = null; // Used for clock level 5
let resolutionScale = 1; // Native monitor resolution relative to Full HD
let displayPixelRatio = 1; // Native display pixels represented by one canvas/CSS pixel
let detectedDisplayWidth = 1920;
let detectedDisplayHeight = 1080;
let lastDisplaySignature = '';
let peekState = null; // Used for peek level 6
// Level 6 pillar wander: the pillar (and the target's peek) drift slowly around screen center
// Persistent across peeks so the motion is continuous
// Uses two slow sine waves of different frequencies for the wander
let peekWanderT = 0;                 // time accumulator for the wander
const PEEK_WANDER_SPEED = 0.5;       // base radians/sec of the drift
const PEEK_WANDER_AMP_X = 0.10;      // x amplitude as fraction of screen width
const PEEK_WANDER_AMP_Y = 0.10;      // y amplitude as fraction of screen height
// Current wandering pillar center (updated each frame in level 6)
function peekAnchor() {
    const cx = canvas.width / 2 + Math.sin(peekWanderT) * canvas.width * PEEK_WANDER_AMP_X;
    const cy = canvas.height / 2 + Math.sin(peekWanderT * 1.3 + 0.7) * canvas.height * PEEK_WANDER_AMP_Y;
    return { x: cx, y: cy };
}
let doorsState = null; // Used for door peek level 8

// ==============================
// Level 9: Recursive Star (nested 12 arm stars)
// ==============================
// A 12 arm hub at a drifting center
// The target goes center -> tip of a random arm -> tip of a random arm on a smaller star there -> tip of a random arm
// on an even smaller star -> then reverses the whole path back to center and starts a new random journey
// The whole structure drifts a bit around center
const STAR_ARMS = 12;                 // spokes per star (clock positions)
const STAR_R1_FRAC = 0.20;            // first arm length, fraction of min screen dim
const STAR_R2_FRAC = 0.11;            // second (smaller) star arm length
const STAR_R3_FRAC = 0.06;            // third (smallest) star arm length
const STAR_LEG_SPEED_MULTIPLIERS = [1, 0.75, 0.55]; // slow shorter inner legs for readability
const STAR_INTER_LEG_PAUSE_RATIO = 0.18; // pause relative to first-leg travel time
const STAR_TURN_PAUSE_RATIO = 0.30;      // longer pause before reversing / starting over
const STAR_DRIFT_SPEED = 0.4;         // radians/sec of center drift
const STAR_DRIFT_AMP_X = 0.05;        // drift amplitude, fraction of width
const STAR_DRIFT_AMP_Y = 0.05;        // drift amplitude, fraction of height
let starDriftT = 0;                   // persistent drift accumulator
let starState = null;                 // tracer state for level 9

// Current drifting center of the whole star structure
function starCenter() {
    return {
        x: canvas.width / 2 + Math.sin(starDriftT) * canvas.width * STAR_DRIFT_AMP_X,
        y: canvas.height / 2 + Math.sin(starDriftT * 1.3 + 0.5) * canvas.height * STAR_DRIFT_AMP_Y,
    };
}
let circleState = null; // Used for circular orbit level 7

// ==============================
// ABC Mode (letter/shape tracing)
// ==============================
// Each glyph is a list of STROKES; each stroke a polyline in a 0..1 box (y down)
// The target traces a stroke forward, reverses back to its start, then moves to the next stroke
// after all strokes, the MIRRORED glyph does the same, then the next glyph in the sequence
// Multi stroke means every segment is covered exactly twice (once each direction)
// Runs continuously with no round timer
// Mirror = x -> 1-x
function abcArc(cx,cy,r,a0,a1,steps){const p=[];for(let i=0;i<=steps;i++){const a=a0+(a1-a0)*i/steps;p.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return p;}
const ABC_GLYPHS = {
    PLUS: [ [[0.5,0.0],[0.5,1.0]], [[0.0,0.5],[1.0,0.5]] ],
    X:    [ [[0.0,0.0],[1.0,1.0]], [[1.0,0.0],[0.0,1.0]] ],
    A: [ [[0.0,1.0],[0.5,0.0],[1.0,1.0]], [[0.25,0.55],[0.75,0.55]] ],
    B: [ [[0.2,0.0],[0.2,1.0]], [...abcArc(0.2,0.25,0.25,-Math.PI/2,Math.PI/2,8)], [...abcArc(0.2,0.72,0.28,-Math.PI/2,Math.PI/2,10)] ],
    C: [ abcArc(0.55,0.5,0.42,-Math.PI*0.32,Math.PI*0.32-2*Math.PI,18) ],
    D: [ [[0.2,0.0],[0.2,1.0]], [[0.2,0.0],[0.55,0.06],[0.8,0.35],[0.8,0.65],[0.55,0.94],[0.2,1.0]] ],
    E: [ [[0.2,0.0],[0.2,1.0]], [[0.2,0.0],[0.85,0.0]], [[0.2,0.5],[0.7,0.5]], [[0.2,1.0],[0.85,1.0]] ],
    F: [ [[0.2,0.0],[0.2,1.0]], [[0.2,0.0],[0.85,0.0]], [[0.2,0.5],[0.7,0.5]] ],
    G: [ [...abcArc(0.55,0.5,0.42,-Math.PI*0.32,Math.PI*0.32-2*Math.PI,16)], [[0.6,0.5],[0.95,0.5]] ],
    H: [ [[0.2,0.0],[0.2,1.0]], [[0.8,0.0],[0.8,1.0]], [[0.2,0.5],[0.8,0.5]] ],
    I: [ [[0.5,0.0],[0.5,1.0]], [[0.25,0.0],[0.75,0.0]], [[0.25,1.0],[0.75,1.0]] ],
    J: [ [[0.7,0.0],[0.7,0.78],[0.52,0.96],[0.32,0.96],[0.18,0.8]] ],
    K: [ [[0.2,0.0],[0.2,1.0]], [[0.8,0.0],[0.2,0.55]], [[0.2,0.55],[0.8,1.0]] ],
    L: [ [[0.2,0.0],[0.2,1.0],[0.85,1.0]] ],
    M: [ [[0.1,1.0],[0.1,0.0],[0.5,0.6],[0.9,0.0],[0.9,1.0]] ],
    N: [ [[0.2,1.0],[0.2,0.0],[0.8,1.0],[0.8,0.0]] ],
    O: [ abcArc(0.5,0.5,0.42,-Math.PI/2,3*Math.PI/2,24) ],
    P: [ [[0.2,0.0],[0.2,1.0]], [[0.2,0.0],[0.6,0.05],[0.78,0.24],[0.6,0.46],[0.2,0.5]] ],
    Q: [ abcArc(0.5,0.45,0.42,-Math.PI/2,3*Math.PI/2,24), [[0.6,0.6],[0.95,1.0]] ],
    R: [ [[0.2,0.0],[0.2,1.0]], [[0.2,0.0],[0.6,0.05],[0.78,0.24],[0.6,0.46],[0.2,0.5]], [[0.45,0.5],[0.85,1.0]] ],
    S: [ [[0.78,0.18],[0.62,0.06],[0.40,0.06],[0.24,0.18],[0.22,0.34],[0.38,0.46],[0.55,0.52],[0.72,0.60],[0.78,0.74],[0.62,0.92],[0.40,0.94],[0.22,0.84]] ],
    T: [ [[0.1,0.0],[0.9,0.0]], [[0.5,0.0],[0.5,1.0]] ],
    U: [ [[0.2,0.0],[0.2,0.7],[0.35,0.93],[0.65,0.93],[0.8,0.7],[0.8,0.0]] ],
    V: [ [[0.1,0.0],[0.5,1.0],[0.9,0.0]] ],
    W: [ [[0.05,0.0],[0.275,1.0],[0.5,0.3],[0.725,1.0],[0.95,0.0]] ],
    Y: [ [[0.1,0.0],[0.5,0.5],[0.9,0.0]], [[0.5,0.5],[0.5,1.0]] ],
    Z: [ [[0.1,0.0],[0.9,0.0],[0.1,1.0],[0.9,1.0]] ],
};
// Sequence order: shape first, then the alphabet
const ABC_SEQUENCE = ['PLUS', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
const ABC_SPEED = 450; // on screen tracing speed (px/sec, scaled by resolution)
let isABCMode = false;  // whether ABC mode is active
let abcState = null;    // tracer state for ABC mode

// Level speed input fields and their values
const speedInputs = [];
let referenceLevelSpeeds = [];
let levelSpeeds = [];
for (let i = 1; i <= maxLevel; i++) {
    const input = $(`speedLevel${i}`);
    const initialSpeed = parseFloat(input.value);
    speedInputs.push(input);
    referenceLevelSpeeds.push(initialSpeed);
    levelSpeeds.push(initialSpeed);
}

// Listening for changes to speed input fields
document.getElementById('tierSelect').addEventListener('change', updateLevelFromTier);
document.getElementById('subLevelInput').addEventListener('change', updateLevelFromTier);

// ==============================
// Refresh/Reset Speed Button Logic
// ==============================

document.addEventListener('click', function (e) {
  // Handles SVG inside button too
  let btn = e.target;
  if (btn.classList && btn.classList.contains('refresh-speed-btn')) {
  } else if (btn.parentElement && btn.parentElement.classList && btn.parentElement.classList.contains('refresh-speed-btn')) {
    btn = btn.parentElement;
  } else {
    return;
  }

  // Blur active elements to ensure its value goes through
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  const levelIdx = parseInt(btn.getAttribute('data-level'), 10) - 1;

  // If meditation mode, reset only meditation levels to meditationSpeeds
  if (isMeditationMode && meditationLevels.includes(levelIdx + 1)) {
    const correctSpeed = meditationSpeedsScaled[levelIdx];
    speedInputs[levelIdx].value = correctSpeed;
    levelSpeeds[levelIdx] = correctSpeed;
    if (level - 1 === levelIdx) {
      speedPercent = correctSpeed;
      document.getElementById('speedInput').value = correctSpeed;
      resetLevel();
    }
    return;
  }

  // Normal behavior (non meditation or abc mode)
  const tier = document.getElementById('tierSelect').value;
  const subLevel = parseInt(document.getElementById('subLevelInput').value);
  const tierIndex = tiers.indexOf(tier);
  const levelIndex = (tierIndex * levelsPerTier) + (subLevel - 1);
  // Always restore allLevelSpeeds
  allLevelSpeeds = generateAllSpeeds(baseSpeeds, tiers, levelsPerTier);
  if (!allLevelSpeeds || !allLevelSpeeds[levelIndex]) return;
  const correctReferenceSpeed = allLevelSpeeds[levelIndex][levelIdx];
  const correctSpeed = scaleReferenceSpeed(correctReferenceSpeed);
  referenceLevelSpeeds[levelIdx] = correctReferenceSpeed;
  speedInputs[levelIdx].value = correctSpeed;
  levelSpeeds[levelIdx] = correctSpeed;
  if (level - 1 === levelIdx) {
    speedPercent = correctSpeed;
    document.getElementById('speedInput').value = correctSpeed;
    resetLevel();
  }
});

speedInputs.forEach((input, index) => {
    input.addEventListener('input', e => {
        const newSpeed = parseFloat(e.target.value);
        if (!isNaN(newSpeed)) {
            levelSpeeds[index] = newSpeed;
            if (!isMeditationMode) {
                referenceLevelSpeeds[index] = unscaleEffectiveSpeed(newSpeed);
            }

            // If current level speed edited, apply and reset the level
            if (level - 1 === index) {
                document.getElementById('speedInput').value = newSpeed;
                resetLevel();
            }
        }
    });
});

// ==============================
// Breathing Timer Overlay
// Part of: Meditation mode, Overlay
// ==============================
// Breathing runs off a phase table so patterns can be swapped cleanly
// Each phase has kind, duration (seconds) and the label shown on the overlay
// relaxed = original 4-6 (longer exhale), box = 4-4-4-4 with two holds
const BREATH_PATTERNS = {
    relaxed: [
        { kind: 'inhale', duration: 4, label: 'Inhale...' },
        { kind: 'exhale', duration: 6, label: 'Exhale...' },
    ],
    box: [
        { kind: 'inhale',     duration: 4, label: 'Inhale...' },
        { kind: 'hold-full',  duration: 4, label: 'Hold...'   },
        { kind: 'exhale',     duration: 4, label: 'Exhale...' },
        { kind: 'hold-empty', duration: 4, label: 'Hold...'   },
    ],
};
let breathPatternName = 'relaxed'; // active pattern key
let breathPhaseIndex = 0;          // index into the active pattern array
let breathTimer = 0;               // elapsed time in the current phase

// Returns the active pattern array
function breathPattern() {
    return BREATH_PATTERNS[breathPatternName] || BREATH_PATTERNS.relaxed;
}

// Returns the current phase descriptor
function currentBreathPhase() {
    const pat = breathPattern();
    return pat[breathPhaseIndex % pat.length];
}

// ----------------------------------
// Updates the breathing timer and switches phases
// Part of: Meditation mode, Overlay
// ----------------------------------
function updateBreathTimer(deltaTime) {
    if (!isMeditationMode || meditationSessionState === 'complete') return;
    breathTimer += deltaTime;
    const phase = currentBreathPhase();
    if (breathTimer >= phase.duration) {
        // Carry overshoot so phase changes stay smooth across frames
        breathTimer -= phase.duration;
        const pat = breathPattern();
        breathPhaseIndex = (breathPhaseIndex + 1) % pat.length;
    }
}

// ----------------------------------
// Builds the responsive, eased visual state shared by the halo and its label
// Part of: Meditation mode, Overlay
// ----------------------------------
function smoothstep01(value) {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
}

function breathingVisualState() {
    if (!isMeditationMode || meditationSessionState === 'complete') return null;
    const phase = currentBreathPhase();
    const progress = Math.min(1, breathTimer / phase.duration); // 0..1 within the phase
    const easedProgress = 0.5 - 0.5 * Math.cos(progress * Math.PI);

    // Fullness maps the phase to halo size: 0 = empty, 1 = full
    // Cosine easing
    // holds pin to their endpoint so the circle visibly pauses during box breathing
    let fullness;
    switch (phase.kind) {
        case 'inhale':     fullness = easedProgress;     break;
        case 'exhale':     fullness = 1 - easedProgress; break;
        case 'hold-full':  fullness = 1;                  break;
        case 'hold-empty': fullness = 0;                  break;
        default:           fullness = easedProgress;     break;
    }

    const minDimension = Math.min(canvas.width, canvas.height);
    const minRadius = Math.max(70, minDimension * 0.14);
    const maxRadius = Math.max(minRadius + 40, minDimension * 0.37);
    const isHold = phase.kind === 'hold-full' || phase.kind === 'hold-empty';
    const endingProgress = meditationSessionState === 'ending'
        ? smoothstep01(meditationEndingElapsed / MEDITATION_END_DURATION)
        : 0;
    const radius = minRadius + (maxRadius - minRadius) * fullness;

    // During box breathing holds, ease a traveling ripple into and out of the three guide rings
    // The central halo stays still so the hold reads clearly
    const holdWaveEdge = Math.min(
        smoothstep01(progress / 0.16),
        smoothstep01((1 - progress) / 0.16)
    );

    // Fade outs
    const labelFadeDuration = Math.min(0.65, phase.duration * 0.18);
    const labelFadeIn = smoothstep01(breathTimer / labelFadeDuration);
    const labelFadeOut = smoothstep01((phase.duration - breathTimer) / labelFadeDuration);
    const visibility = 1 - endingProgress;

    return {
        phase,
        progress,
        radius: radius * (1 - endingProgress * 0.15),
        visibility,
        labelAlpha: Math.min(labelFadeIn, labelFadeOut) * visibility,
        warm: phase.kind === 'inhale' || phase.kind === 'hold-full',
        isHold,
        holdWaveStrength: isHold ? holdWaveEdge : 0,
        holdWavePhase: progress * Math.PI * 3
    };
}

// Draws circle and ripples
function strokeBreathingRing(centerX, centerY, radius, waveAmplitude, wavePhase) {
    ctx.beginPath();
    if (waveAmplitude <= 0.01) {
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    } else {
        const segments = 120;
        const ripples = 6;
        for (let index = 0; index <= segments; index++) {
            const angle = (index / segments) * Math.PI * 2;
            const wavedRadius = radius + Math.sin(angle * ripples - wavePhase) * waveAmplitude;
            const x = centerX + Math.cos(angle) * wavedRadius;
            const y = centerY + Math.sin(angle) * wavedRadius;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }
    ctx.stroke();
}

// ----------------------------------
// Draws a feathered breathing halo behind the moving target
// Part of: Meditation mode, Overlay
// ----------------------------------
function drawBreathingHalo() {
    const visual = breathingVisualState();
    if (!visual || visual.visibility <= 0) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const warm = visual.warm;
    const gradient = ctx.createRadialGradient(centerX, centerY, visual.radius * 0.08,
        centerX, centerY, visual.radius);
    if (warm) {
        gradient.addColorStop(0, 'rgba(255, 230, 187, 0.3)');
        gradient.addColorStop(0.55, 'rgba(255, 211, 142, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 211, 142, 0)');
    } else {
        gradient.addColorStop(0, 'rgba(205, 196, 255, 0.3)');
        gradient.addColorStop(0.55, 'rgba(156, 139, 236, 0.2)');
        gradient.addColorStop(1, 'rgba(126, 105, 214, 0)');
    }

    ctx.save();
    ctx.globalAlpha = visual.visibility;
    ctx.beginPath();
    ctx.arc(centerX, centerY, visual.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    const ringColor = warm ? '255, 222, 163' : '205, 196, 255';
    const ringBaseAlpha = 0.2;
    const lineWidth = Math.max(1, Math.min(canvas.width, canvas.height) * 0.0018);
    [0.72, 0.86, 1].forEach((scale, index) => {
        const staggeredPhase = visual.holdWavePhase - index * 0.75;
        const ringDrift = visual.isHold
            ? Math.sin(staggeredPhase) * visual.radius * 0.006 * visual.holdWaveStrength
            : 0;
        const waveAmplitude = visual.radius * 0.013 * visual.holdWaveStrength;
        const waveHighlight = visual.isHold
            ? (0.5 + 0.5 * Math.sin(staggeredPhase)) * 0.035 * visual.holdWaveStrength
            : 0;
        ctx.strokeStyle = `rgba(${ringColor}, ${ringBaseAlpha - index * 0.018 + waveHighlight})`;
        ctx.lineWidth = lineWidth * (visual.isHold ? 1.12 : 1);
        strokeBreathingRing(
            centerX,
            centerY,
            visual.radius * scale + ringDrift,
            waveAmplitude,
            staggeredPhase
        );
    });
    ctx.restore();
}

// Draw only the phase label above the target - the halo is behind it
function drawBreathingLabel() {
    const visual = breathingVisualState();
    if (!visual || visual.labelAlpha <= 0) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.save();
    ctx.globalAlpha = visual.labelAlpha * 0.92;
    ctx.font = `600 ${Math.max(20, Math.min(canvas.width, canvas.height) * 0.025)}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillStyle = '#fff8ed';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(17, 11, 48, 0.35)';
    ctx.shadowBlur = 10;
    ctx.fillText(visual.phase.label, centerX, centerY);
    ctx.restore();
}

function setMeditationCompletionVisible(visible) {
    const completion = $('meditationCompletion');
    if (!completion) return;
    completion.hidden = !visible;
    completion.setAttribute('aria-hidden', String(!visible));
}

// Restarts another meditation round at the currently selected duration
function restartMeditationSession() {
    if (!isMeditationMode) return;

    const durationInput = $('roundDuration');
    const requestedDuration = parseFloat(durationInput.value);
    if (Number.isFinite(requestedDuration) && requestedDuration > 0) {
        roundDuration = requestedDuration;
    } else {
        roundDuration = Number.isFinite(roundDuration) && roundDuration > 0 ? roundDuration : 300;
        durationInput.value = roundDuration;
    }

    roundTimeRemaining = roundDuration;
    meditationSessionState = 'running';
    meditationEndingElapsed = 0;
    meditationStartingElapsed = 0;
    breathPhaseIndex = 0;
    breathTimer = 0;
    flashTimeRemaining = 0;
    if (!meditationMotionState) {
        setupMeditationMotion();
    } else {
        meditationMotionState.targetHeading = meditationMotionState.heading;
        meditationMotionState.turnTimer = randomMeditationTurnDelay();
    }
    setMeditationCompletionVisible(false);
    $('roundTimeDisplay').innerText = formatTimeMS(roundTimeRemaining);
}

// ----------------------------------
// Update all effective speed values and UI when the active monitor changes
// Part of: Screen scaling, Level system
// ----------------------------------
function scaleReferenceSpeed(referenceSpeed) {
    return parseFloat((referenceSpeed * resolutionScale).toFixed(2));
}

function unscaleEffectiveSpeed(effectiveSpeed) {
    return parseFloat((effectiveSpeed / Math.max(resolutionScale, 0.0001)).toFixed(2));
}

function scaleReferenceSpeeds(referenceSpeeds) {
    return referenceSpeeds.map(scaleReferenceSpeed);
}

// The menu shows native resolution px/s
// Canvas movement is expressed in CSS pixels, 
// so convert the displayed speed before using it for motion
// This keeps the calibration correct when Windows display scaling makes
// one CSS pixel span multiple native display pixels
function effectiveSpeedToCanvasSpeed(effectiveSpeed) {
    return effectiveSpeed / Math.max(displayPixelRatio, 0.1);
}

function getAutomaticDisplayMetrics() {
    const pixelRatio = Math.max(0.1, window.devicePixelRatio || 1);
    const logicalWidth = Math.max(1, window.screen?.width || canvas.width);
    const logicalHeight = Math.max(1, window.screen?.height || canvas.height);
    const nativeWidth = Math.max(1, Math.round(logicalWidth * pixelRatio));
    const nativeHeight = Math.max(1, Math.round(logicalHeight * pixelRatio));
    const nativeShortSide = Math.min(nativeWidth, nativeHeight);

    return {
        pixelRatio,
        nativeWidth,
        nativeHeight,
        scale: Math.max(0.1, nativeShortSide / FHD_REFERENCE_SHORT_SIDE)
    };
}

function getDisplaySignature(metrics) {
    return `${metrics.nativeWidth}x${metrics.nativeHeight}@${metrics.pixelRatio}`;
}

function checkForDisplayChange() {
    const metrics = getAutomaticDisplayMetrics();
    const signature = getDisplaySignature(metrics);
    if (lastDisplaySignature && signature !== lastDisplaySignature) {
        handleViewportResize();
    }
}

function updateScreenScaleDisplay() {
    const display = document.getElementById('screenScaleDisplay');
    if (!display) return;
    display.textContent = `Auto ${detectedDisplayWidth} × ${detectedDisplayHeight} (${resolutionScale.toFixed(2)}×)`;
}

function updateScreenScaling() {
    const metrics = getAutomaticDisplayMetrics();
    resolutionScale = metrics.scale;
    displayPixelRatio = metrics.pixelRatio;
    detectedDisplayWidth = metrics.nativeWidth;
    detectedDisplayHeight = metrics.nativeHeight;
    lastDisplaySignature = getDisplaySignature(metrics);
    updateScreenScaleDisplay();

    let speeds;
    if (isMeditationMode) {
        meditationSpeedsScaled = scaleReferenceSpeeds(meditationSpeeds);
        speeds = [...meditationSpeedsScaled];
    } else {
        speeds = scaleReferenceSpeeds(referenceLevelSpeeds);
    }

    levelSpeeds = [...speeds];
    speedInputs.forEach((input, i) => input.value = speeds[i]);
    speedPercent = levelSpeeds[level - 1];
    document.getElementById('speedInput').value = speedPercent;

    if (isABCMode) {
        initABCMode();
    } else if (isMeditationMode) {
        // Meditation - preserve its position
        // and heading across ordinary window resizes and monitor moves
        pos.x = Math.max(ballRadius, Math.min(canvas.width - ballRadius, pos.x));
        pos.y = Math.max(ballRadius, Math.min(canvas.height - ballRadius, pos.y));
    } else {
        // Rebuild geometry for the new canvas without restarting the active round
        resetLevel(false);
    }
}
    
// ==============================
// Current Level Settings
// Part of: Level system, Ball speed/size
// ==============================
// Current speed percentage for the selected level
let speedPercent = levelSpeeds[0];
// Current size percentage (read from UI)
let sizePercent  = parseFloat(document.getElementById('sizeInput').value);
    
// ==============================
// Color Settings Event Listeners
// Part of: Color settings, UI interaction, Drawing/rendering logic
// ==============================
// Updates colors from pickers
document.getElementById('ballColor').addEventListener('change', e => ballColor = e.target.value);
document.getElementById('dotColor').addEventListener('change', e => dotColor = e.target.value);
// ==============================
// Background & Flash Color Listeners
// Part of: Color settings, UI interaction
// ==============================
document.getElementById('bgColor').addEventListener('change', e => {
    backgroundColor = e.target.value;
    document.body.style.backgroundColor = backgroundColor; // Update the actual page background
});
document.getElementById('flashColor').addEventListener('change', e => flashColor = e.target.value);

// ==============================
// Menu Preview Target
// Part of: UI shows current size + colors as a static dummy target
// ==============================
function drawPreview() {
    const pc = document.getElementById('previewCanvas');
    if (!pc) return;
    const pctx = pc.getContext('2d');
    const W = pc.width, H = pc.height;

    // Read current settings straight from the inputs so it reflects live edits
    const sp = Math.min(200, Math.max(15, parseFloat(document.getElementById('sizeInput').value) || 50));
    const bg = document.getElementById('bgColor').value;
    const ball = document.getElementById('ballColor').value;
    const dot = document.getElementById('dotColor').value;

    // Background
    pctx.clearRect(0, 0, W, H);
    pctx.fillStyle = bg;
    pctx.fillRect(0, 0, W, H);

    // Target radius: baseBallRadius(30) * size%, but capped so the largest size
    // (200% => 60px) still fits the 140px box with margin.
    const trueRadius = 30 * (sp / 100); // matches in game radius at this size
    const maxRadius = (Math.min(W, H) / 2) - 8;
    const r = Math.min(trueRadius, maxRadius);

    const cx = W / 2, cy = H / 2;
    pctx.beginPath();
    pctx.arc(cx, cy, r, 0, 2 * Math.PI);
    pctx.fillStyle = ball;
    pctx.fill();

    // Central dot (same 0.4 ratio as in game, min 2px)
    pctx.beginPath();
    pctx.arc(cx, cy, Math.max(r * 0.4, 2), 0, 2 * Math.PI);
    pctx.fillStyle = dot;
    pctx.fill();
}

function hexToRgb(hex) {
    const normalized = String(hex).replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16)
    };
}

function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const channels = [rgb.r, rgb.g, rgb.b].map(value => {
        const channel = value / 255;
        return channel <= 0.04045
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

function randomColorCycleDelay() {
    return COLOR_CYCLE_MIN_SECONDS +
        Math.random() * (COLOR_CYCLE_MAX_SECONDS - COLOR_CYCLE_MIN_SECONDS);
}

function compatibleTargetColorPairs(background = $('bgColor').value) {
    return TARGET_COLOR_PAIRS
        .map((pair, index) => {
            const targetBackgroundContrast = contrastRatio(pair.target, background);
            const dotTargetContrast = contrastRatio(pair.dot, pair.target);
            return { pair, index, targetBackgroundContrast, dotTargetContrast };
        })
        .filter(candidate =>
            candidate.targetBackgroundContrast >= MIN_TARGET_BACKGROUND_CONTRAST &&
            candidate.dotTargetContrast >= MIN_DOT_TARGET_CONTRAST &&
            candidate.dotTargetContrast >= Math.min(candidate.targetBackgroundContrast, 7)
        );
}

function setThemeColors(target, dot, background) {
    ballColor = target;
    dotColor = dot;
    backgroundColor = background;
    $('ballColor').value = target;
    $('dotColor').value = dot;
    $('bgColor').value = background;
    document.body.style.backgroundColor = background;
    drawPreview();
}

function applyNextColorTheme() {
    const currentBackground = $('bgColor').value.toLowerCase();
    let backgrounds = COLOR_CYCLE_BACKGROUNDS
        .map((background, index) => ({ background, index }))
        .filter(candidate =>
            candidate.index !== lastColorBackgroundIndex &&
            candidate.background !== currentBackground
        );
    if (!backgrounds.length) {
        backgrounds = COLOR_CYCLE_BACKGROUNDS.map((background, index) => ({ background, index }));
    }

    const selectedBackground = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    let candidates = compatibleTargetColorPairs(selectedBackground.background);
    const currentTarget = $('ballColor').value.toLowerCase();
    const currentDot = $('dotColor').value.toLowerCase();
    const nonRepeating = candidates.filter(candidate =>
        candidate.index !== lastColorPairIndex &&
        (candidate.pair.target !== currentTarget || candidate.pair.dot !== currentDot)
    );
    if (nonRepeating.length) candidates = nonRepeating;

    // high contrast fallback
    if (!candidates.length) {
        candidates = [7, 15]
            .map(index => ({
                pair: TARGET_COLOR_PAIRS[index],
                index,
                targetBackgroundContrast: contrastRatio(
                    TARGET_COLOR_PAIRS[index].target,
                    selectedBackground.background
                )
            }))
            .sort((first, second) => second.targetBackgroundContrast - first.targetBackgroundContrast)
            .slice(0, 1);
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    lastColorPairIndex = selected.index;
    lastColorBackgroundIndex = selectedBackground.index;
    setThemeColors(selected.pair.target, selected.pair.dot, selectedBackground.background);
    colorCycleTimeRemaining = randomColorCycleDelay();
}

function updateColorCycleControls() {
    const cycling = $('colorCycleToggle').checked && !isMeditationMode;
    $('colorCycleToggle').disabled = isMeditationMode;
    $('colorCycleToggle').title = isMeditationMode
        ? 'Color cycling is paused in Meditation Mode'
        : 'Switch background and target colors every 3 to 10 seconds';
    $('ballColor').disabled = cycling;
    $('dotColor').disabled = cycling;
    $('bgColor').disabled = cycling;
}

function initializeColorCycleFromCurrentSettings() {
    colorCycleTimeRemaining = 0;
    lastColorPairIndex = -1;
    lastColorBackgroundIndex = -1;
    colorCycleBaseColors = $('colorCycleToggle').checked
        ? {
            target: $('ballColor').value,
            dot: $('dotColor').value,
            background: $('bgColor').value
        }
        : null;
    updateColorCycleControls();
    if ($('colorCycleToggle').checked && !isMeditationMode) {
        colorCycleTimeRemaining = randomColorCycleDelay();
    }
}

function updateColorCycle(deltaTime) {
    if (!$('colorCycleToggle').checked || isMeditationMode) return;
    colorCycleTimeRemaining -= deltaTime;
    if (colorCycleTimeRemaining <= 0) applyNextColorTheme();
}

$('colorCycleToggle').addEventListener('change', () => {
    if ($('colorCycleToggle').checked) {
        colorCycleBaseColors = {
            target: $('ballColor').value,
            dot: $('dotColor').value,
            background: $('bgColor').value
        };
        updateColorCycleControls();
        if (!isMeditationMode) applyNextColorTheme();
        return;
    }

    updateColorCycleControls();
    colorCycleTimeRemaining = 0;
    lastColorPairIndex = -1;
    lastColorBackgroundIndex = -1;
    if (colorCycleBaseColors) {
        setThemeColors(
            colorCycleBaseColors.target,
            colorCycleBaseColors.dot,
            colorCycleBaseColors.background
        );
    }
    colorCycleBaseColors = null;
});

// Redraw the preview whenever size or any color changes
['sizeInput', 'ballColor', 'dotColor', 'bgColor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', drawPreview);
        el.addEventListener('change', drawPreview);
    }
});
// Initial draw
drawPreview();
    
// ==============================
// Speed Input Listener
// Part of: Level system, UI interaction
// ==============================
// Keeps the UI and logic in sync
document.getElementById('speedInput').addEventListener('input', e => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
        speedPercent = value;
        levelSpeeds[level - 1] = value;
        if (!isMeditationMode) {
            referenceLevelSpeeds[level - 1] = unscaleEffectiveSpeed(value);
        }
        speedInputs[level - 1].value = value;
    }
});
    
// ----------------------------------
// Changes speed by a selected increment from UI
// directionFactor 1 for increase & -1 for decrease
// Part of: Level system, Speed adjustment
// ----------------------------------
function changeSpeed(directionFactor) {
    let increment = parseFloat(document.getElementById('speedIncrement').value);
    speedPercent *= (1 + directionFactor * increment / 100);
    speedPercent = parseFloat(speedPercent.toFixed(2));
    levelSpeeds[level - 1] = speedPercent;
    if (!isMeditationMode) {
        referenceLevelSpeeds[level - 1] = unscaleEffectiveSpeed(speedPercent);
    }
    document.getElementById('speedInput').value = speedPercent;
    speedInputs[level - 1].value = speedPercent;
}
    
// ==============================
// Size Adjustment Logic
// Part of: Ball size, UI interaction
// ==============================
const sizeInput = document.getElementById('sizeInput');

// ----------------------------------
// Clamps and applies the size input value to be within allowed range
// & updates the sizePercent and ballRadius
// Part of: Ball size, Input validation
// ----------------------------------
function applyClampedSizeInput() {
    let value = parseFloat(sizeInput.value);
    if (isNaN(value)) return;

    // Clamp value between 15 and 200, mostly for peek level 6
    value = Math.min(200, Math.max(15, value));
    sizePercent = value;
    ballRadius = baseBallRadius * (sizePercent / 100);
    sizeInput.value = value; // clamp the field
    if (level === 2 && spiralArcLookup) rebuildSpiralArcLookup();
}

// When the input loses focus, or Enter is pressed, clamp and apply the value
sizeInput.addEventListener('blur', applyClampedSizeInput);
sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        applyClampedSizeInput();
        sizeInput.blur(); // field defocus
    }
    });

// ----------------------------------
// Increases or decreases the ball size by a delta and updates UI and radius
// Part of: Ball size, UI interaction
// ----------------------------------
function changeSize(delta) {
    sizePercent = Math.min(200, Math.max(15, sizePercent + delta));
    document.getElementById('sizeInput').value = sizePercent;
    ballRadius = baseBallRadius * (sizePercent / 100);
    if (level === 2 && spiralArcLookup) rebuildSpiralArcLookup();
    if (typeof drawPreview === 'function') drawPreview();
}
    
// ==============================
// Overlay Toggle Variables & Listeners
// Part of: Visual overlays, UI interaction
// ==============================
// Overlay toggle flags
let hashtagOverlay = false;
let verticalStripesOverlay = false;
let horizontalStripesOverlay = false;
let solidStripes = false;
// Listen for overlay toggle changes
document.getElementById('hashtagToggle').addEventListener('change', e => {
    hashtagOverlay = e.target.checked;
});
document.getElementById('verticalStripesToggle').addEventListener('change', e => {
    verticalStripesOverlay = e.target.checked;
});
document.getElementById('horizontalStripesToggle').addEventListener('change', e => {
    horizontalStripesOverlay = e.target.checked;
});
document.getElementById('solidStripesToggle').addEventListener('change', e => {
    solidStripes = e.target.checked;
});

// ==============================
// Reading UI Codes (simulate scanning game UI text)
// Part of: Overlays
// ==============================
// When enabled, a single 4char code (A-Z, 0-9) appears near a corner
// stays for 1-5s, then jumps to a different corner with a new code and size
// Color auto contrasts against the chosen background
let readingUIEnabled = false;
let readingUICode = null;   // { text, corner, fontSize, timeLeft }
const READING_UI_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Pick a fresh 4char code, a corner different from the last, and a size
function rollReadingUICode() {
    let text = '';
    for (let i = 0; i < 4; i++) {
        text += READING_UI_CHARS[Math.floor(Math.random() * READING_UI_CHARS.length)];
    }
    // 0=TL, 1=TR, 2=BL, 3=BR; avoid repeating the same corner
    let corner;
    do {
        corner = Math.floor(Math.random() * 4);
    } while (readingUICode && corner === readingUICode.corner);
    // Reasonable size that varies a bit each spawn (scaled to screen)
    const base = Math.min(canvas.width, canvas.height) * 0.045;
    const fontSize = base * (0.6 + Math.random() * 0.6); // +-~ variation
    readingUICode = {
        text,
        corner,
        fontSize,
        timeLeft: 1 + Math.random() * 4, // visibility 1-5 seconds
    };
}

// Returns a high contrast color (black or white) for the current background
function contrastColor(hex) {
    // Parse #rrggbb
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#000000');
    if (!m) return '#ffffff';
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    // Relative luminance, bright bg -> dark text, dark bg -> light text
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? '#111111' : '#f5f5f5';
}

const readingUIToggle = document.getElementById('readingUIToggle');
if (readingUIToggle) {
    readingUIToggle.addEventListener('change', e => {
        readingUIEnabled = e.target.checked;
        if (readingUIEnabled) {
            readingUICode = null;
            rollReadingUICode();
        } else {
            readingUICode = null;
        }
    });
}

// ==============================
// 3D Depth Simulation
// Part of: Drawing/rendering, depth illusion
// ==============================
// Fakes a z-axis by smoothly scaling the drawn target up (toward viewer) and down (away)
// Affects DRAWING ONLY ballRadius stays the true size so all movement, bouncing, and collision math is unaffected
// The player's chosen size is base and target breathes around it, drifting toward the viewer (grow) and away (shrink)
// Each side is independently capped to its room before the limits [SIZE_MIN, SIZE_MAX], so the drawn size never crosses them
let is3DMode = false;
let depthT = 0; // Phase of the depth oscillation
const depthGrowPoints = 25;   // Swing toward viewer (bigger), in size points
const depthShrinkPoints = 32; // Swing away (smaller); larger to feel even to the eye
const depthSpeed = 0.6; // Radians/sec - how fast the target approaches/recedes
const SIZE_MIN = 15;  // Min drawn size %
const SIZE_MAX = 200; // Max drawn size %
let depthScale = 1; // Current draw multiplier (1 = chosen size)
document.getElementById('depth3DToggle').addEventListener('change', e => {
    is3DMode = e.target.checked;
    if (is3DMode) {
        // Start from size 30, user can adjust after
        sizePercent = 30;
        ballRadius = baseBallRadius * (sizePercent / 100);
        const sizeInput = document.getElementById('sizeInput');
        if (sizeInput) sizeInput.value = 30;
        if (typeof drawPreview === 'function') drawPreview();
    } else {
        depthScale = 1; // Snap back to true size when disabled
    }
});

// ==============================
// Box Breathing Toggle
// Part of: Meditation mode, Overlay
// ==============================
// Switches the breathing overlay between relaxed 4-6 and box 4-4-4-4
// Resets the cycle so it starts on a fresh inhale
const boxBreathingToggle = document.getElementById('boxBreathingToggle');
if (boxBreathingToggle) {
    boxBreathingToggle.addEventListener('change', e => {
        breathPatternName = e.target.checked ? 'box' : 'relaxed';
        breathPhaseIndex = 0;
        breathTimer = 0;
    });
}
    
// ==============================
// Level Display UI
// Part of: Level system, UI interaction
// ==============================
document.getElementById('levelDisplay').innerText = "Level " + level;
    
// ==============================
// Base Properties & Game State Variables (main/global declarations)
// Part of: Ball movement, Game logic
// ==============================
const baseBallRadius = 30; // Standard ball radius
const baseSpeed = 250; // Normalized base speed (level 6)
let ballRadius = baseBallRadius * (sizePercent / 100); // Current ball radius
    
// Time tracking for animation/game loop
let lastTime = null;
let pos = { x: canvas.width / 2, y: canvas.height / 2 }; // Ball position
let vel = { x: baseSpeed, y: 0 }; // Ball velocity (level 6)
let direction = 1; // Ball movement direction (levels 1 and 2)
// Level 1 merged axis state: alternates horizontal/vertical after a random
// number of single crossings on the current axis
let axisMode = 'h';            // 'h' = horizontal, 'v' = vertical
let axisCrossingsLeft = 2;     // traversals remaining on this axis before switching
    
// ==============================
// Level 2 (Spiral) Variables (main/global declarations)
// Part of: Ball movement
// ==============================
const SPIRAL_INNER_RADIUS_FRACTION = 0.08;
const SPIRAL_MIN_TURNS = 1.25;
const SPIRAL_MAX_TURNS = 2;
let spiralProgress = 0; // Spiral animation progress
let spiralForward = true; // Spiral direction
let spiralScale = 1; // Spiral scaling factor
let spiralTurns = 1.5;
let spiralRotation = 0; // Spiral rotation angle
let spiralCW = true; // Spiral clockwise/counterclockwise
let spiralDistance = 0; // Arc length distance travelled on the current spiral
let spiralArcLookup = null;

function spiralPointAt(progress) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const outerRadius = (Math.min(canvas.width, canvas.height) / 3) * spiralScale;
    // Keep the center curve open and proportional to the generated spiral
    // ballRadius remains the floor for unusually large target sizes
    const innerRadius = Math.max(ballRadius, outerRadius * SPIRAL_INNER_RADIUS_FRACTION);
    const theta = (spiralCW ? 1 : -1) * 2 * Math.PI * spiralTurns * progress;
    const radius = innerRadius + progress * (outerRadius - innerRadius);
    const angle = theta + spiralRotation;
    return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
    };
}

function rebuildSpiralArcLookup() {
    spiralArcLookup = buildArcLengthLookup(spiralPointAt);
    spiralDistance = arcDistanceAtParameter(spiralArcLookup, spiralProgress);
}
    
// ==============================
// Level 3 (Figure Eight) Variables (main/global declarations)
// Part of: Ball movement
// ==============================
let fig8T = 0; // Progress along the loop, 0 -> 2*PI (one full figure 8)
let fig8Offset = 0; // Random spawn phase: where on the path the target starts/finishes
let fig8Scale = 1; // Scaling factor for figure eight (re rolls each loop for size variety)
let fig8Mirror = 1; // Traversal direction: +1 / -1 (clockwise vs counterclockwise), 50/50
let fig8Angle = 0; // Orientation of the whole figure 8 (one of 6 clock hand angles)
let lastFig8Angle = null; // Previous orientation, to avoid an immediate repeat
let fig8Center = { x: 0, y: 0 }; // Where the 8 is planted (jittered near screen center)
let fig8Distance = 0; // Arc- ength distance travelled around the current loop
let fig8ArcLookup = null;

// Six distinct orientations at 30° steps
// A figure 8 has 180° rotational symmetry so 0..150° already covers every visually distinct clock hand direction
// (e.g. 12 o'clock and 6 o'clock look identical)
const FIG8_ANGLES = [0, Math.PI/6, Math.PI/3, Math.PI/2, 2*Math.PI/3, 5*Math.PI/6];
// Plant jitter as a fraction of each screen dimension (box around center)
const FIG8_CENTER_JITTER_X = 0.08;
const FIG8_CENTER_JITTER_Y = 0.08;
const FIG8_LOBE_HEIGHT_RATIO = 0.5;
const FIG8_CENTER_PULL_RATIO = 0.55;
const FIG8_CLOSURE_HOLD = 0.06;
let fig8ClosurePause = 0;

function roundedFigureEightBasePoint(phase, amplitude) {
    const fullTurn = 2 * Math.PI;
    const wrapped = ((phase % fullTurn) + fullTurn) % fullTurn;
    const isRightLobe = wrapped < Math.PI;
    const lobePhase = isRightLobe ? wrapped : wrapped - Math.PI;
    const loopAngle = lobePhase * 2;
    const side = isRightLobe ? 1 : -1;

    const centerPull = amplitude * FIG8_CENTER_PULL_RATIO;
    const roundRadius = (amplitude - centerPull) / 2;
    return {
        x: side * (
            roundRadius * (1 - Math.cos(loopAngle)) +
            centerPull * Math.sin(loopAngle / 2)
        ),
        y: amplitude * FIG8_LOBE_HEIGHT_RATIO * Math.sin(loopAngle)
    };
}

function figureEightPointAt(pathParameter) {
    const amplitude = (Math.min(canvas.width, canvas.height) / 4) * fig8Scale;
    const phase = fig8Offset + pathParameter * fig8Mirror;
    const basePoint = roundedFigureEightBasePoint(phase, amplitude);
    const cosAngle = Math.cos(fig8Angle);
    const sinAngle = Math.sin(fig8Angle);
    return {
        x: fig8Center.x + basePoint.x * cosAngle - basePoint.y * sinAngle,
        y: fig8Center.y + basePoint.x * sinAngle + basePoint.y * cosAngle
    };
}

function rebuildFig8ArcLookup() {
    fig8ArcLookup = buildArcLengthLookup(figureEightPointAt, 2 * Math.PI);
}

let spawnDelay = 0; // Delay before respawning in figure eight levels

// Randomize figure eight parameters - called after each completed loop
// Every loop re rolls: plant center (near screen center), orientation (1 of 6, no immediate repeat),
// size, traversal direction (50/50), spawn phase (anywhere on the path)
function resetFig8() {
    fig8T = 0;
    fig8Distance = 0;
    fig8ClosurePause = 0;

    // Plant the 8 at a jittered point around screen center
    fig8Center = {
        x: canvas.width / 2 + (Math.random() * 2 - 1) * canvas.width * FIG8_CENTER_JITTER_X,
        y: canvas.height / 2 + (Math.random() * 2 - 1) * canvas.height * FIG8_CENTER_JITTER_Y,
    };

    // Orientation: pick one of 6 clock hand angles, avoiding an immediate repeat
    let angleChoices = FIG8_ANGLES;
    if (lastFig8Angle !== null) {
        angleChoices = FIG8_ANGLES.filter(a => a !== lastFig8Angle);
    }
    fig8Angle = angleChoices[Math.floor(Math.random() * angleChoices.length)];
    lastFig8Angle = fig8Angle;

    // Size re rolls every loop so the shape isn't predictable
    fig8Scale = 0.85 + Math.random() * 0.3;

    // Direction re rolls 50/50 (clockwise vs counterclockwise)
    fig8Mirror = (Math.random() < 0.5) ? 1 : -1;

    // Spawn phase: start anywhere on the path
    // The loop ends one full 2*PI later, i.e. when the target returns to the same point
    fig8Offset = Math.random() * 2 * Math.PI;

    rebuildFig8ArcLookup();
    const startPoint = figureEightPointAt(0);
    pos.x = startPoint.x;
    pos.y = startPoint.y;

    spawnDelay = 0.1; // brief pause to signal a new shape is incoming
}

// ==============================
// Level Navigation Functions
// Part of: Level system, Game logic, UI interaction
// ==============================
function prevLevel() {
    if (isMeditationMode) {
        meditationLevelIndex = (meditationLevelIndex - 1 + meditationLevels.length) % meditationLevels.length;
        level = meditationLevels[meditationLevelIndex];
        } else {
            level = (level - 2 + maxLevel) % maxLevel + 1;
        }
        resetLevel();
        $('levelDisplay').innerText = "Level " + level;
        // Update speed input for the new level
        speedPercent = levelSpeeds[level - 1];
        document.getElementById('speedInput').value = speedPercent;
}

function nextLevel() {
    if (isMeditationMode) {
        meditationLevelIndex = (meditationLevelIndex + 1) % meditationLevels.length;
        level = meditationLevels[meditationLevelIndex];
        } else {
            level = (level % maxLevel) + 1;
        }
        resetLevel();
        $('levelDisplay').innerText = "Level " + level;
        // Update speed input for the new level
        speedPercent = levelSpeeds[level - 1];
        document.getElementById('speedInput').value = speedPercent;
}
 
// ==============================
// Timer Variables
// Part of: Timer system, Game logic
// ==============================
let elapsedTime = 0; // Total elapsed time in seconds
let isPaused = false; // Whether the game is paused (freezes movement + timers)
let roundDuration = parseFloat(document.getElementById('roundDuration').value); // Duration of each round in seconds
let roundTimeRemaining = roundDuration; // Time left in the current round
let flashTimeRemaining = 0; // Time left for the flash overlay (after round ends)
const fpsDisplay = document.getElementById('fpsDisplay'); // Cached once; reused by the FPS monitor
let fpsSampleFrames = 0; // Frames collected for the current FPS sample
let fpsSampleTime = 0; // Seconds covered by the current FPS sample
const MAX_SIMULATION_DELTA = 0.05; // Never advance simulation by more than 50 ms in one frame
const INTERRUPTION_DELTA = 0.25; // Longer gaps are interruptions and are not simulated

// ==============================
// Round Duration Change Listener
// Part of: Timer system, UI interaction
// ==============================
// Keeps UI and logic in sync
// invalid/empty edits safely restore the last usable duration
const roundDurationInput = document.getElementById('roundDuration');
function applyRoundDurationInput() {
    const requestedDuration = parseFloat(roundDurationInput.value);
    if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) {
        roundDurationInput.value = roundDuration;
        return;
    }

    roundDuration = requestedDuration;
    roundTimeRemaining = roundDuration;
    if (isMeditationMode) {
        meditationSessionState = 'running';
        meditationEndingElapsed = 0;
        meditationStartingElapsed = 0;
        breathPhaseIndex = 0;
        breathTimer = 0;
        setMeditationCompletionVisible(false);
    }
}
roundDurationInput.addEventListener('change', applyRoundDurationInput);
roundDurationInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        applyRoundDurationInput();
        roundDurationInput.blur();
    }
});

// ==============================
// Local Training Profiles
// Part of: Settings persistence, Privacy controls
// ==============================
const GAZELAB_STORAGE_PREFIX = 'gazelab.';
const PROFILE_STORAGE_KEY = `${GAZELAB_STORAGE_PREFIX}profiles.v1`;
const PROFILE_SCHEMA_VERSION = 1;
const MAX_PROFILE_NAME_LENGTH = 40;
const MAX_PROFILE_COUNT = 50;
const PROFILE_CHECKBOX_IDS = [
    'disableFlashToggle',
    'autoNextToggle',
    'colorCycleToggle',
    'hashtagToggle',
    'verticalStripesToggle',
    'horizontalStripesToggle',
    'solidStripesToggle',
    'depth3DToggle',
    'readingUIToggle',
    'boxBreathingToggle'
];

function setProfileStatus(message, tone = '') {
    const status = $('profileStatus');
    if (!status) return;
    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
}

function normalizeProfileName(value) {
    return String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_PROFILE_NAME_LENGTH);
}

function createProfileId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readProfileRecords() {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PROFILE_SCHEMA_VERSION || !Array.isArray(parsed.profiles)) {
        throw new Error('The saved profile data has an unsupported format.');
    }

    return parsed.profiles
        .filter(profile => profile && typeof profile.id === 'string' && typeof profile.name === 'string')
        .slice(0, MAX_PROFILE_COUNT);
}

function writeProfileRecords(profiles) {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
        version: PROFILE_SCHEMA_VERSION,
        profiles
    }));
}

function selectedProfileRecord(profiles) {
    const selectedId = $('profileSelect').value;
    return profiles.find(profile => profile.id === selectedId) || null;
}

function updateProfileButtons() {
    const selected = Boolean($('profileSelect').value);
    const specialModeActive = isMeditationMode || isABCMode;
    const modeMessage = 'Exit Meditation or ABC Mode to save or load profiles.';
    $('profileSaveButton').disabled = specialModeActive;
    $('profileLoadButton').disabled = specialModeActive || !selected;
    $('profileDeleteButton').disabled = !selected;
    $('profileSaveButton').title = specialModeActive ? modeMessage : 'Save the current settings';
    $('profileLoadButton').title = specialModeActive ? modeMessage : 'Load the selected profile';
}

function setProfileManagerExpanded(expanded) {
    const collapseButton = $('profileCollapseButton');
    const content = $('profileManagerContent');
    collapseButton.setAttribute('aria-expanded', String(expanded));
    content.hidden = !expanded;
    $('profileManager').classList.toggle('is-collapsed', !expanded);
}

$('profileCollapseButton').addEventListener('click', () => {
    const expanded = $('profileCollapseButton').getAttribute('aria-expanded') === 'true';
    setProfileManagerExpanded(!expanded);
});

function refreshProfileSelect(selectedId = '') {
    const select = $('profileSelect');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a profile...';
    select.replaceChildren(placeholder);

    let profiles;
    try {
        profiles = readProfileRecords();
    } catch (error) {
        setProfileStatus(error.message || 'Saved profiles could not be read.', 'error');
        updateProfileButtons();
        return [];
    }

    profiles
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        .forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = normalizeProfileName(profile.name) || 'Unnamed profile';
            select.appendChild(option);
        });

    if (selectedId && profiles.some(profile => profile.id === selectedId)) {
        select.value = selectedId;
    }
    updateProfileButtons();
    return profiles;
}

function currentProfileSettings() {
    const displayedSpeeds = speedInputs.map(input => parseFloat(input.value));
    if (displayedSpeeds.some(speed => !Number.isFinite(speed) || speed < 0)) {
        throw new Error('Every advanced level speed must contain a valid non-negative number.');
    }
    const requestedSize = parseFloat($('sizeInput').value);
    if (!Number.isFinite(requestedSize)) {
        throw new Error('Target size must contain a valid number.');
    }

    applyClampedSizeInput();
    applyRoundDurationInput();

    const referenceSpeeds = referenceLevelSpeeds.map(speed => Number(speed));
    if (referenceSpeeds.length !== maxLevel || referenceSpeeds.some(speed => !Number.isFinite(speed) || speed < 0)) {
        throw new Error('Every advanced level speed must contain a valid non-negative number.');
    }

    const checkboxes = {};
    PROFILE_CHECKBOX_IDS.forEach(id => {
        checkboxes[id] = Boolean($(id).checked);
    });

    return {
        tier: $('tierSelect').value,
        sublevel: parseInt($('subLevelInput').value, 10),
        level,
        referenceSpeeds: referenceSpeeds.map(speed => parseFloat(speed.toFixed(6))),
        speedIncrement: $('speedIncrement').value,
        sizePercent: parseFloat($('sizeInput').value),
        roundDuration: parseFloat($('roundDuration').value),
        colors: {
            ball: $('ballColor').value,
            dot: $('dotColor').value,
            background: $('bgColor').value,
            flash: $('flashColor').value
        },
        checkboxes
    };
}

function validatedProfileSettings(settings) {
    if (!settings || typeof settings !== 'object') return null;

    const tier = String(settings.tier);
    const sublevel = Number(settings.sublevel);
    const savedLevel = Number(settings.level);
    const size = Number(settings.sizePercent);
    const duration = Number(settings.roundDuration);
    const speedIncrement = String(settings.speedIncrement);
    const speedIncrementValues = Array.from($('speedIncrement').options, option => option.value);
    const colorPattern = /^#[0-9a-f]{6}$/i;
    const colors = settings.colors;

    if (!tiers.includes(tier) || !Number.isInteger(sublevel) || sublevel < 1 || sublevel > levelsPerTier) return null;
    if (!Number.isInteger(savedLevel) || savedLevel < 1 || savedLevel > maxLevel) return null;
    if (!Array.isArray(settings.referenceSpeeds) || settings.referenceSpeeds.length !== maxLevel) return null;
    const referenceSpeeds = settings.referenceSpeeds.map(Number);
    if (referenceSpeeds.some(speed => !Number.isFinite(speed) || speed < 0 || speed > 1000000)) return null;
    if (!Number.isFinite(size) || size < 15 || size > 200) return null;
    if (!Number.isFinite(duration) || duration < 1 || duration > 86400) return null;
    if (!speedIncrementValues.includes(speedIncrement)) return null;
    if (!colors || !colorPattern.test(colors.ball) || !colorPattern.test(colors.dot) ||
        !colorPattern.test(colors.background) || !colorPattern.test(colors.flash)) return null;
    if (!settings.checkboxes || typeof settings.checkboxes !== 'object') return null;

    const checkboxes = {};
    for (const id of PROFILE_CHECKBOX_IDS) {
        if (typeof settings.checkboxes[id] === 'boolean') {
            checkboxes[id] = settings.checkboxes[id];
        } else if (id === 'colorCycleToggle') {
            checkboxes[id] = false;
        } else {
            return null;
        }
    }

    return {
        tier,
        sublevel,
        level: savedLevel,
        referenceSpeeds,
        speedIncrement,
        sizePercent: size,
        roundDuration: duration,
        colors: {
            ball: colors.ball,
            dot: colors.dot,
            background: colors.background,
            flash: colors.flash
        },
        checkboxes
    };
}

function saveCurrentProfile() {
    if (isMeditationMode || isABCMode) {
        setProfileStatus('Exit Meditation or ABC Mode before saving a profile.', 'error');
        return;
    }

    const nameInput = $('profileName');
    const name = normalizeProfileName(nameInput.value);
    nameInput.value = name;
    if (!name) {
        setProfileStatus('Enter a profile name first.', 'error');
        nameInput.focus();
        return;
    }

    try {
        const profiles = readProfileRecords();
        const existing = profiles.find(profile => profile.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0);
        if (!existing && profiles.length >= MAX_PROFILE_COUNT) {
            setProfileStatus(`The profile limit is ${MAX_PROFILE_COUNT}. Delete one before saving another.`, 'error');
            return;
        }

        const settings = currentProfileSettings();
        const timestamp = new Date().toISOString();
        let savedId;
        if (existing) {
            existing.name = name;
            existing.settings = settings;
            existing.updatedAt = timestamp;
            savedId = existing.id;
        } else {
            savedId = createProfileId();
            profiles.push({ id: savedId, name, settings, createdAt: timestamp, updatedAt: timestamp });
        }

        writeProfileRecords(profiles);
        refreshProfileSelect(savedId);
        setProfileStatus(existing ? `Updated “${name}”.` : `Saved “${name}”.`, 'success');
    } catch (error) {
        setProfileStatus(error.message || 'The profile could not be saved in this browser.', 'error');
    }
}

function applyProfileSettings(settings) {
    selectedTier = settings.tier;
    selectedSublevel = settings.sublevel;
    $('tierSelect').value = selectedTier;
    $('subLevelInput').value = String(selectedSublevel);
    allLevelSpeeds = generateAllSpeeds(baseSpeeds, tiers, levelsPerTier);

    referenceLevelSpeeds = [...settings.referenceSpeeds];
    levelSpeeds = scaleReferenceSpeeds(referenceLevelSpeeds);
    speedInputs.forEach((input, index) => {
        input.value = levelSpeeds[index];
    });

    level = settings.level;
    speedPercent = levelSpeeds[level - 1];
    $('speedInput').value = speedPercent;
    $('speedIncrement').value = settings.speedIncrement;

    sizePercent = settings.sizePercent;
    $('sizeInput').value = sizePercent;
    ballRadius = baseBallRadius * (sizePercent / 100);
    roundDuration = settings.roundDuration;
    $('roundDuration').value = roundDuration;
    roundTimeRemaining = roundDuration;
    flashTimeRemaining = 0;

    ballColor = settings.colors.ball;
    dotColor = settings.colors.dot;
    backgroundColor = settings.colors.background;
    flashColor = settings.colors.flash;
    $('ballColor').value = ballColor;
    $('dotColor').value = dotColor;
    $('bgColor').value = backgroundColor;
    $('flashColor').value = flashColor;
    document.body.style.backgroundColor = backgroundColor;

    PROFILE_CHECKBOX_IDS.forEach(id => {
        $(id).checked = settings.checkboxes[id];
    });
    initializeColorCycleFromCurrentSettings();
    hashtagOverlay = settings.checkboxes.hashtagToggle;
    verticalStripesOverlay = settings.checkboxes.verticalStripesToggle;
    horizontalStripesOverlay = settings.checkboxes.horizontalStripesToggle;
    solidStripes = settings.checkboxes.solidStripesToggle;
    readingUIEnabled = settings.checkboxes.readingUIToggle;
    readingUICode = null;
    if (readingUIEnabled) rollReadingUICode();
    is3DMode = settings.checkboxes.depth3DToggle;
    depthT = 0;
    depthScale = 1;
    breathPatternName = settings.checkboxes.boxBreathingToggle ? 'box' : 'relaxed';
    breathPhaseIndex = 0;
    breathTimer = 0;

    $('levelDisplay').innerText = `Level ${level}`;
    resetLevel();
    drawPreview();
}

function loadSelectedProfile() {
    if (isMeditationMode || isABCMode) {
        setProfileStatus('Exit Meditation or ABC Mode before loading a profile.', 'error');
        return;
    }

    try {
        const profiles = readProfileRecords();
        const profile = selectedProfileRecord(profiles);
        if (!profile) {
            setProfileStatus('Select a profile to load.', 'error');
            return;
        }

        const settings = validatedProfileSettings(profile.settings);
        if (!settings) {
            setProfileStatus('That profile is invalid or was created by an unsupported version.', 'error');
            return;
        }

        applyProfileSettings(settings);
        $('profileName').value = normalizeProfileName(profile.name);
        setProfileStatus(`Loaded “${normalizeProfileName(profile.name)}”.`, 'success');
    } catch (error) {
        setProfileStatus(error.message || 'The selected profile could not be loaded.', 'error');
    }
}

let appConfirmResolver = null;
let appConfirmPreviousFocus = null;

function closeAppConfirmation(confirmed) {
    if (!appConfirmResolver) return;
    const resolver = appConfirmResolver;
    appConfirmResolver = null;
    const overlay = $('appConfirmOverlay');
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');

    if (appConfirmPreviousFocus instanceof HTMLElement && appConfirmPreviousFocus.isConnected) {
        appConfirmPreviousFocus.focus();
    }
    appConfirmPreviousFocus = null;
    resolver(confirmed);
}

function requestAppConfirmation({ title, message, confirmLabel, danger = true }) {
    if (appConfirmResolver) return Promise.resolve(false);

    const overlay = $('appConfirmOverlay');
    const confirmButton = $('appConfirmAccept');
    $('appConfirmTitle').textContent = title;
    $('appConfirmMessage').textContent = message;
    confirmButton.textContent = confirmLabel;
    confirmButton.dataset.danger = String(danger);
    appConfirmPreviousFocus = document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');

    return new Promise(resolve => {
        appConfirmResolver = resolve;
        window.requestAnimationFrame(() => $('appConfirmCancel').focus());
    });
}

$('appConfirmCancel').addEventListener('click', () => closeAppConfirmation(false));
$('appConfirmAccept').addEventListener('click', () => closeAppConfirmation(true));
$('appConfirmOverlay').addEventListener('click', event => {
    if (event.target === $('appConfirmOverlay')) closeAppConfirmation(false);
});
$('appConfirmOverlay').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        event.preventDefault();
        closeAppConfirmation(false);
        return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [$('appConfirmCancel'), $('appConfirmAccept')];
    const currentIndex = focusable.indexOf(document.activeElement);
    if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
    }
});

async function deleteSelectedProfile() {
    try {
        const profiles = readProfileRecords();
        const profile = selectedProfileRecord(profiles);
        if (!profile) {
            setProfileStatus('Select a profile to delete.', 'error');
            return;
        }

        const safeName = normalizeProfileName(profile.name) || 'this profile';
        const confirmed = await requestAppConfirmation({
            title: 'Delete profile?',
            message: `Only the locally saved settings in “${safeName}” will be removed. Your current on-screen settings and every other profile will remain.`,
            confirmLabel: 'Delete Profile'
        });
        if (!confirmed) return;

        // Read again after the dialog so a change from another tab is not overwritten.
        const latestProfiles = readProfileRecords();
        writeProfileRecords(latestProfiles.filter(item => item.id !== profile.id));
        $('profileName').value = '';
        refreshProfileSelect();
        setProfileStatus(`Deleted “${safeName}”.`, 'success');
    } catch (error) {
        setProfileStatus(error.message || 'The selected profile could not be deleted.', 'error');
    }
}

function deleteIndexedDatabase(name) {
    return new Promise(resolve => {
        const request = window.indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
    });
}

async function clearAllGazeLabData() {
    const confirmed = await requestAppConfirmation({
        title: 'Clear all GazeLab data?',
        message: 'This removes every saved profile and any other GazeLab-owned local data for this site. It will not affect files, browser history, other websites, or unrelated browser data.',
        confirmLabel: 'Clear GazeLab Data'
    });
    if (!confirmed) return;

    let fullyCleared = true;
    try {
        for (let index = window.localStorage.length - 1; index >= 0; index--) {
            const key = window.localStorage.key(index);
            if (key && key.startsWith(GAZELAB_STORAGE_PREFIX)) window.localStorage.removeItem(key);
        }
        for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
            const key = window.sessionStorage.key(index);
            if (key && key.startsWith(GAZELAB_STORAGE_PREFIX)) window.sessionStorage.removeItem(key);
        }
    } catch (error) {
        fullyCleared = false;
    }

    if ('caches' in window) {
        try {
            const cacheNames = await window.caches.keys();
            const results = await Promise.all(cacheNames
                .filter(name => name.startsWith('gazelab-'))
                .map(name => window.caches.delete(name)));
            if (results.some(result => !result)) fullyCleared = false;
        } catch (error) {
            fullyCleared = false;
        }
    }

    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
        try {
            const databases = await window.indexedDB.databases();
            const names = databases
                .map(database => database.name)
                .filter(name => typeof name === 'string' && name.toLowerCase().startsWith('gazelab'));
            const results = await Promise.all(names.map(deleteIndexedDatabase));
            if (results.some(result => !result)) fullyCleared = false;
        } catch (error) {
            fullyCleared = false;
        }
    }

    $('profileName').value = '';
    refreshProfileSelect();
    setProfileStatus(
        fullyCleared ? 'All locally stored GazeLab data was cleared.' : 'Profiles were cleared, but some browser-managed data could not be removed.',
        fullyCleared ? 'success' : 'error'
    );
}

$('profileSaveButton').addEventListener('click', saveCurrentProfile);
$('profileLoadButton').addEventListener('click', loadSelectedProfile);
$('profileDeleteButton').addEventListener('click', deleteSelectedProfile);
$('profileClearButton').addEventListener('click', clearAllGazeLabData);
$('profileSelect').addEventListener('change', () => {
    try {
        const profile = selectedProfileRecord(readProfileRecords());
        if (profile) $('profileName').value = normalizeProfileName(profile.name);
    } catch (error) {
        setProfileStatus(error.message || 'Saved profiles could not be read.', 'error');
    }
    updateProfileButtons();
});
$('profileName').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveCurrentProfile();
    }
});
window.addEventListener('storage', event => {
    if (event.key === PROFILE_STORAGE_KEY) {
        refreshProfileSelect();
        setProfileStatus('The saved profile list changed in another tab.');
    }
});
refreshProfileSelect();
    
// ==============================
// Time Formatting Utility Functions
// Part of: Timer system, Display helpers
// ==============================
// Converts seconds to HH:MM:SS format (elapsed time)
function formatTimeHMS(seconds) {
    let hrs = Math.floor(seconds / 3600);
    let mins = Math.floor((seconds % 3600) / 60);
    let secs = Math.floor(seconds % 60);
    return (hrs < 10 ? "0" : "") + hrs + ":" +
             (mins < 10 ? "0" : "") + mins + ":" +
             (secs < 10 ? "0" : "") + secs;
}

// Converts seconds to MM:SS format (round timer)
function formatTimeMS(seconds) {
    let total = Math.max(0, Math.ceil(seconds));
    let mins = Math.floor(total / 60);
    let secs = total % 60;
    return (mins < 10 ? "0" : "") + mins + ":" +
             (secs < 10 ? "0" : "") + secs;
}

// Measures the actual requestAnimationFrame cadence over one second samples
// Long gaps are discarded
function updateFPS(deltaTime) {
    if (!fpsDisplay) return;

    if (deltaTime <= 0 || deltaTime > 0.25) {
        fpsSampleFrames = 0;
        fpsSampleTime = 0;
        fpsDisplay.innerText = '--';
        return;
    }

    fpsSampleFrames += 1;
    fpsSampleTime += deltaTime;
    if (fpsSampleTime >= 1) {
        fpsDisplay.innerText = Math.round(fpsSampleFrames / fpsSampleTime);
        checkForDisplayChange();
        fpsSampleFrames = 0;
        fpsSampleTime = 0;
    }
}

// Pause only when this document is no longer visible (another tab or minimized)
document.addEventListener('visibilitychange', () => {
    lastTime = null;
    fpsSampleFrames = 0;
    fpsSampleTime = 0;
    if (document.hidden && fpsDisplay) {
        fpsDisplay.innerText = '--';
    }
});
    
// ==============================
// Timer Update Logic
// Part of: Timer system, Game logic
// ==============================
// Updates round and flash timers, handles round transitions, and updates UI
function updateTimers(deltaTime) {
    if (!(isMeditationMode && meditationSessionState === 'complete')) {
        elapsedTime += deltaTime;
    }
    // ABC mode is a continuous free session  no round countdown / auto-advance
    if (isABCMode) {
        document.getElementById('elapsedTimeDisplay').innerText = formatTimeHMS(elapsedTime);
        return;
    }

    // Meditation ends and movement performs its own ease out
    if (isMeditationMode) {
        if (meditationSessionState === 'running') {
            roundTimeRemaining = Math.max(0, roundTimeRemaining - deltaTime);
            if (roundTimeRemaining <= 0) {
                meditationSessionState = 'ending';
                meditationEndingElapsed = 0;
                flashTimeRemaining = 0;
            }
        } else {
            roundTimeRemaining = 0;
        }

        document.body.style.backgroundColor = backgroundColor;
        document.getElementById('elapsedTimeDisplay').innerText = formatTimeHMS(elapsedTime);
        document.getElementById('roundTimeDisplay').innerText = formatTimeMS(roundTimeRemaining);
        return;
    }

    roundTimeRemaining -= deltaTime;

    // End of round handling
    if (roundTimeRemaining <= 0) {
        // flash overlay if not disabled
        if (!document.getElementById('disableFlashToggle').checked) {
            flashTimeRemaining = 1.0;
        }
        // Reset round timer
        roundTimeRemaining = roundDuration;
        // Auto advance to next level if enabled
        if (document.getElementById('autoNextToggle').checked) {
            nextLevel();
        }
    }

    // Flash overlay display
    const flashDisabled = document.getElementById('disableFlashToggle').checked;
    if (flashTimeRemaining > 0 && !flashDisabled) {
        flashTimeRemaining -= deltaTime;
        document.body.style.backgroundColor = flashColor;
    } else {
        document.body.style.backgroundColor = backgroundColor;
    }

    // Update timer displays in UI
    document.getElementById('elapsedTimeDisplay').innerText = formatTimeHMS(elapsedTime);
    document.getElementById('roundTimeDisplay').innerText = formatTimeMS(roundTimeRemaining);
}
    
// ==============================
// Level Setup Functions
// Part of: Level system, Ball movement patterns
// ==============================
// Sets up level 1
function setupLevel1() {
    axisMode = (Math.random() < 0.5) ? 'h' : 'v'; // random starting axis
    axisCrossingsLeft = 2 + Math.floor(Math.random() * 5); // 2-6 traversals before switching
    if (axisMode === 'h') {
        direction = 1; // moving right
        pos.x = ballRadius;
        pos.y = Math.random() * (canvas.height - 2 * ballRadius) + ballRadius;
    } else {
        direction = 1; // moving down
        pos.y = ballRadius;
        pos.x = Math.random() * (canvas.width - 2 * ballRadius) + ballRadius;
    }
}

// Sets up level 2 (spiral movement)
function setupLevel2() {
    spiralScale = 0.85 + Math.random() * 0.3; // Randomize spiral size
    spiralTurns = SPIRAL_MIN_TURNS + Math.random() * (SPIRAL_MAX_TURNS - SPIRAL_MIN_TURNS);
    spiralProgress = 0; // Reset spiral progress
    spiralDistance = 0;
    spiralForward = true; // Start spiral forward

    spiralRotation = Math.random() * 2 * Math.PI;
    rebuildSpiralArcLookup();
    spawnDelay = 0.2;
    }

// Sets up level 3 (figure eight movement)
// Calls resetFig8 for randomization
function setupLevel3() {
    resetFig8(); // re rolls center, orientation, size, direction, spawn phase
}

function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function turnAngleToward(current, target, maxStep) {
    const difference = normalizeAngle(target - current);
    return current + Math.max(-maxStep, Math.min(maxStep, difference));
}

function randomMeditationTurnDelay() {
    return 5 + Math.random() * 4;
}

function setupMeditationMotion() {
    const marginX = Math.max(ballRadius + 20, canvas.width * 0.2);
    const marginY = Math.max(ballRadius + 20, canvas.height * 0.2);
    const usableWidth = Math.max(0, canvas.width - marginX * 2);
    const usableHeight = Math.max(0, canvas.height - marginY * 2);

    pos.x = marginX + Math.random() * usableWidth;
    pos.y = marginY + Math.random() * usableHeight;
    const heading = Math.random() * Math.PI * 2;
    meditationMotionState = {
        heading,
        targetHeading: heading + (Math.random() * 2 - 1) * 0.45,
        turnTimer: randomMeditationTurnDelay()
    };
}

function updateMeditationMotion(currentSpeed, deltaTime) {
    if (meditationSessionState === 'complete') return;
    if (!meditationMotionState) setupMeditationMotion();

    let speedMultiplier = 1;
    if (meditationSessionState === 'ending') {
        meditationEndingElapsed += deltaTime;
        const progress = Math.min(1, meditationEndingElapsed / MEDITATION_END_DURATION);
        const smoothProgress = progress * progress * (3 - 2 * progress);
        speedMultiplier = 1 - smoothProgress;
        if (progress >= 1) {
            meditationSessionState = 'complete';
            setMeditationCompletionVisible(true);
            return;
        }
    } else if (meditationSessionState === 'running' && meditationStartingElapsed < MEDITATION_START_DURATION) {
        meditationStartingElapsed = Math.min(MEDITATION_START_DURATION, meditationStartingElapsed + deltaTime);
        speedMultiplier = smoothstep01(meditationStartingElapsed / MEDITATION_START_DURATION);
    }

    const state = meditationMotionState;
    state.turnTimer -= deltaTime;
    if (state.turnTimer <= 0 && meditationSessionState === 'running') {
        state.targetHeading = state.heading + (Math.random() * 2 - 1) * 0.7;
        state.turnTimer = randomMeditationTurnDelay();
    }

    const minDimension = Math.min(canvas.width, canvas.height);
    const margin = Math.max(ballRadius + 20, minDimension * 0.12);
    const minX = margin;
    const maxX = Math.max(minX, canvas.width - margin);
    const minY = margin;
    const maxY = Math.max(minY, canvas.height - margin);
    const lookAheadDistance = Math.max(minDimension * 0.16, currentSpeed * 4);
    const predictedX = pos.x + Math.cos(state.heading) * lookAheadDistance;
    const predictedY = pos.y + Math.sin(state.heading) * lookAheadDistance;
    const approachingBoundary = predictedX < minX || predictedX > maxX ||
        predictedY < minY || predictedY > maxY;

    if (approachingBoundary) {
        state.targetHeading = Math.atan2(canvas.height / 2 - pos.y, canvas.width / 2 - pos.x);
        state.turnTimer = Math.min(state.turnTimer, 1.5);
    }

    const turnRate = approachingBoundary
        ? MEDITATION_BOUNDARY_TURN_RATE
        : MEDITATION_NORMAL_TURN_RATE;
    state.heading = turnAngleToward(state.heading, state.targetHeading, turnRate * deltaTime);

    const distance = Math.max(0, currentSpeed) * speedMultiplier * deltaTime;
    pos.x += Math.cos(state.heading) * distance;
    pos.y += Math.sin(state.heading) * distance;

    // Safety clamp for unusually or suspiciously small windows or a resize during the session
    pos.x = Math.max(ballRadius, Math.min(canvas.width - ballRadius, pos.x));
    pos.y = Math.max(ballRadius, Math.min(canvas.height - ballRadius, pos.y));
}

// Sets up level 4 (advanced bounce)
// Randomizes position and velocity for bouncing movement
function setupLevel4() {
    if (isMeditationMode) {
        setupMeditationMotion();
        return;
    }

    pos.x = Math.random() * canvas.width;
    pos.y = Math.random() * canvas.height;
    let angle = Math.random() * 2 * Math.PI;
    vel.x = baseSpeed * Math.cos(angle);
    vel.y = baseSpeed * Math.sin(angle);
    lastDirectionChangeTime = Date.now(); // timer for movement reversal chance
    distanceSinceDirectionChange = 0; // reset distance gate for reversal
}

// Sets up level 5 (clock movement)
// Ball starts at the center and sets a random clock hand target
// Tracks last hour and repeat count
let lastHour7 = null;
let repeatHour7Count = 0;

function setupLevel5() {
    let center = { x: canvas.width / 2, y: canvas.height / 2 };
    let maxDistance = Math.min(center.x, center.y) - ballRadius;
    pos.x = canvas.width / 2;
    pos.y = canvas.height / 2;
    let hour;
    // Limit repeats to at most 2, so 3 occurrences in total
    do {
        hour = Math.floor(Math.random() * 12);
    } while (lastHour7 !== null && hour === lastHour7 && repeatHour7Count >= 2);
    if (hour === lastHour7) {
        repeatHour7Count++;
    } else {
        repeatHour7Count = 1;
        lastHour7 = hour;
    }
    let angle = (hour * Math.PI / 6) - Math.PI / 2;
    // Weighted random for distance: diff chance for each range
    let r = Math.random();
    let factor;
    if (r < 0.45) {
        factor = 0.25 + Math.random() * 0.10; // 25% - 35%
    } else if (r < 0.80) {
        factor = 0.35 + Math.random() * 0.15;  // 35% - 50%
    } else {
        factor = 0.5 + Math.random() * 0.25; // 50% - 75%
    }
    let distance = factor * maxDistance;
    clockState = {
        phase: "outgoing",
        targetAngle: angle,
        targetDistance: distance
    };
}

// Sets up level 6 (peek movement)
// Initializes the peek state with random direction, distance, and vertical offset
function setupLevel6() {
    // Clamp size (for invalid input)
    sizePercent = Math.min(200, Math.max(15, sizePercent));
    ballRadius = baseBallRadius * (sizePercent / 100);

    // Calculate random peek distance
    const minDistance = ballRadius + 25;
    const maxDistance = ballRadius + 100;
    const peekDistance = minDistance + Math.random() * (maxDistance - minDistance);

    // Initialize peek state with random properties
    peekState = {
        phase: "outgoing",  // Current animation phase
        progress: 0,  // Animation progress
        side: Math.random() < 0.5 ? 'left' : 'right', // Random side
        heightOffset: (Math.random() < 0.5 ? -1 : 1) * 50, // Random vertical offset
        maxOffset: peekDistance  // Maximum peek distance
    };

    // Start position at the wandering pillar anchor with vertical offset
    const anchor = peekAnchor();
    pos.x = anchor.x;
    pos.y = anchor.y + peekState.heightOffset;
}

// ==============================
// Level 7: Circular Orbit
// Part of: Level system, Initialization logic
// ==============================
const circleSizeTiers = [0.12, 0.22, 0.34]; // small / medium / large, as fraction of min screen dim

// Picks a fresh center, radius, and direction for the orbit
// Keeps the target's current angle so it transitions onto the new circle (a small position jump)
function rollCircle() {
    const minDim = Math.min(canvas.width, canvas.height);
    // Center wander box: +- 1/6 of each dimension => spans 1/3 of the screen.
    const cx = canvas.width / 2 + (Math.random() * 2 - 1) * (canvas.width / 6);
    const cy = canvas.height / 2 + (Math.random() * 2 - 1) * (canvas.height / 6);
    // Pick a size tier with slight random variation (+- 15% of the tier).
    const tier = circleSizeTiers[Math.floor(Math.random() * circleSizeTiers.length)];
    let radius = minDim * tier * (0.9 + Math.random() * 0.2);
    // Cap radius so the whole orbit (plus ball) stays on screen from this center
    const maxR = Math.min(cx, cy, canvas.width - cx, canvas.height - cy) - ballRadius - 4;
    radius = Math.max(20, Math.min(radius, maxR));
    return {
        cx, cy, radius,
        cw: Math.random() < 0.5 ? 1 : -1, // 1 = clockwise, -1 = counterclockwise
    };
}

function setupLevel7() {
    sizePercent = Math.min(200, Math.max(15, sizePercent));
    ballRadius = baseBallRadius * (sizePercent / 100);

    const c = rollCircle();
    const startAngle = Math.random() * 2 * Math.PI; // random spawn point on the circle
    circleState = {
        cx: c.cx, cy: c.cy, radius: c.radius, cw: c.cw,
        angle: startAngle,
        startAngle: startAngle,        // where this loop began
        angleTraveled: 0,              // radians covered this loop
        loopsLeft: 1 + Math.floor(Math.random() * 3), // 1-3 loops until size/center change
    };
    // Place target on the circle at the start angle
    pos.x = c.cx + c.radius * Math.cos(startAngle);
    pos.y = c.cy + c.radius * Math.sin(startAngle);
}

// ==============================
// Level 8: Door Peek
// Part of: Level system
// ==============================
const DOOR_PILLAR_HEIGHT_FRAC = 0.6; // pillar height as fraction of screen height
const DOOR_GAP_MIN_FRAC = 0.05;      // min gap as fraction of screen width
const DOOR_GAP_MAX_FRAC = 0.35;      // max gap as fraction of screen width
const DOOR_DRIFT_SPEED = 0.75;       // radians/sec of the gap oscillation

// Largest radius the target can be DRAWN at, used to size pillars and clamp
// the hidden Y so the target never pokes out the top/bottom or sides
// In 3D depth mode the drawn radius swings up to (1 + depthGrowPoints/sizePercent) x the true ballRadius
// the concealment sized to that worst case
function doorConcealRadius() {
    const depthMax = is3DMode ? (1 + depthGrowPoints / sizePercent) : 1;
    return ballRadius * depthMax;
}

// Returns current pillar rectangles based on the oscillating gap
function doorPillars() {
    const w = canvas.width, h = canvas.height;
    const t = doorsState ? doorsState.driftT : 0;
    // Gap oscillates smoothly between min and max
    const gapFrac = DOOR_GAP_MIN_FRAC + (DOOR_GAP_MAX_FRAC - DOOR_GAP_MIN_FRAC) * (0.5 + 0.5 * Math.sin(t));
    const gap = w * gapFrac;
    // Use the depth aware drawn radius so the pillar still hides the target
    // when 3D depth mode inflates the drawn size beyond the true ballRadius
    const concealR = doorConcealRadius();
    const pillarW = Math.max(concealR * 2 + 40, 90); // wide enough to fully hide target
    const pillarH = h * DOOR_PILLAR_HEIGHT_FRAC;
    const top = (h - pillarH) / 2;
    const cx = w / 2;
    // Inner edges of the gap
    const leftInner = cx - gap / 2;
    const rightInner = cx + gap / 2;
    return {
        gap, pillarW, pillarH, top,
        left:  { x: leftInner - pillarW, w: pillarW, centerX: leftInner - pillarW / 2 },
        right: { x: rightInner,          w: pillarW, centerX: rightInner + pillarW / 2 },
    };
}

function setupLevel8() {
    sizePercent = Math.min(200, Math.max(15, sizePercent));
    ballRadius = baseBallRadius * (sizePercent / 100);

    const h = canvas.height;
    const pillarH = h * DOOR_PILLAR_HEIGHT_FRAC;
    const top = (h - pillarH) / 2;
    // Random height within the pillar's vertical span (depth aware margin)
    const margin = doorConcealRadius() + 10;
    const spawnY = top + margin + Math.random() * (pillarH - 2 * margin);

    doorsState = {
        driftT: Math.random() * Math.PI * 2, // phase of the gap oscillation
        side: Math.random() < 0.5 ? 'left' : 'right', // which pillar the target hides behind now
        progress: 0,        // 0 = fully hidden at current side, 1 = hidden at other side
        moving: false,      // whether currently crossing the gap
        fromY: spawnY,      // y at the start pillar
        toY: spawnY,        // y at the destination pillar (set when a crossing begins)
        hideTimer: 0.4,     // brief pause while hidden before deciding
    };
    // Place target hidden behind its current pillar
    const p = doorPillars();
    pos.x = (doorsState.side === 'left' ? p.left.centerX : p.right.centerX);
    pos.y = spawnY;
}

// ==============================
// Level 9: Recursive Star setup
// ==============================
function starArmVector(armIndex, radius) {
    // Clock angle: arm 0 points up (-90deg), increasing clockwise
    const angle = (armIndex / STAR_ARMS) * 2 * Math.PI - Math.PI / 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function buildStarJourney() {
    const minDim = Math.min(canvas.width, canvas.height);
    const radii = [minDim * STAR_R1_FRAC, minDim * STAR_R2_FRAC, minDim * STAR_R3_FRAC];

    let prevArm = -1;
    const offsets = [{ x: 0, y: 0 }]; // start at center (relative)
    let acc = { x: 0, y: 0 };
    for (let leg = 0; leg < 3; leg++) {
        let arm;
        // Pick an arm, avoid repeating the exact previous arm and its reverse
        do {
            arm = Math.floor(Math.random() * STAR_ARMS);
        } while (
            prevArm >= 0 &&
            (arm === prevArm || arm === (prevArm + STAR_ARMS / 2) % STAR_ARMS)
        );
        prevArm = arm;
        const v = starArmVector(arm, radii[leg]);
        acc = { x: acc.x + v.x, y: acc.y + v.y };
        offsets.push({ x: acc.x, y: acc.y });
    }
    return offsets; // 4 waypoints: center, tip1, tip2, tip3 (relative to center)
}

function setupLevel9() {
    sizePercent = Math.min(200, Math.max(15, sizePercent));
    ballRadius = baseBallRadius * (sizePercent / 100);

    starState = {
        offsets: buildStarJourney(), // waypoints relative to drifting center
        leg: 0,        // current segment index (0..2 outward, then reverses)
        dir: 1,        // 1 = outward through waypoints, -1 = back to center
        segProgress: 0, // 0..1 progress along the current segment
        pauseRemaining: 0 // rhythmic pause at each waypoint
    };
    const c = starCenter();
    pos.x = c.x + starState.offsets[0].x;
    pos.y = c.y + starState.offsets[0].y;
}

// glyph: scales the 0..1 box to a centered square on screen, flips x if mirrored
function buildGlyphStrokes(name, mirrored) {
    const strokes = ABC_GLYPHS[name];
    const box = Math.min(canvas.width, canvas.height) * 0.7;
    const ox = (canvas.width - box) / 2;
    const oy = (canvas.height - box) / 2;
    return strokes.map(stroke => stroke.map(([x, y]) => {
        const fx = mirrored ? (1 - x) : x;
        return { x: ox + fx * box, y: oy + y * box };
    }));
}

// Initializes ABC mode tracer state at the start of the sequence
function initABCMode() {
    sizePercent = Math.min(200, Math.max(15, sizePercent));
    ballRadius = baseBallRadius * (sizePercent / 100);

    abcState = {
        seqIndex: 0,        // index into ABC_SEQUENCE
        mirrored: false,    // current orientation
        strokeIndex: 0,     // which stroke of the current glyph
        dir: 1,             // 1 = tracing forward, -1 = reversing back
        dist: 0,            // arc length distance along current stroke
        strokes: null,      // on screen strokes for current glyph
    };
    abcState.strokes = buildGlyphStrokes(ABC_SEQUENCE[0], false);
    const first = abcState.strokes[0][0];
    pos.x = first.x;
    pos.y = first.y;
}

// ==============================
// Level Setup Lookup Map
// Part of: Level system, Initialization logic
// ==============================
// resetLevel and other logic
const levelSetups = {
    1: setupLevel1,
    2: setupLevel2,
    3: setupLevel3,
    4: setupLevel4,
    5: setupLevel5,
    6: setupLevel6,
    7: setupLevel7,
    8: setupLevel8,
    9: setupLevel9
};

// ==============================
// Level Reset Logic
// Part of: Level system, UI sync
// ==============================
// Resets the current level state, timer, and UI to match the selected level
function resetLevel(syncFromUI = true) {
    // Sync all relevant state variables from the UI
    if (syncFromUI) {
        ballColor = $('ballColor').value;
        dotColor = $('dotColor').value;
        backgroundColor = $('bgColor').value;
        flashColor = $('flashColor').value;
        document.body.style.backgroundColor = backgroundColor;
        sizePercent = parseFloat($('sizeInput').value);
        ballRadius = baseBallRadius * (sizePercent / 100);
        roundDuration = parseFloat($('roundDuration').value);
        speedPercent = levelSpeeds[level - 1];
        document.getElementById('speedInput').value = speedPercent;
        roundTimeRemaining = roundDuration; // Reset round timer
    }
    if (levelSetups[level]) {
        levelSetups[level](); // Calls setup function for the level
    }
}

// ==============================
// Pause Toggle
// Part of: Game engine, state management
// ==============================
// Freezes movement and timers, the current frame stays visible
function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('pauseToggle');
    if (btn) {
        btn.textContent = isPaused ? "Resume '␣'" : "Pause '␣'";
        btn.classList.toggle('active', isPaused);
    }
}

// ==============================
// Meditation Mode Toggle
// Part of: Meditation mode, State management
// ==============================
// on/off, saving and restoring key state
// Updates UI, breathing timer, and restores previous settings when exiting
function toggleMeditationMode() {

    // ABC mode and meditation mode are mutually exclusive
    if (!isMeditationMode && isABCMode) { toggleABCMode(); }

    // Reset breathing overlay state when toggling meditation mode
    breathPhaseIndex = 0;
    breathTimer = 0;
    setMeditationCompletionVisible(false);
    const btn = $('meditationToggle');
    isMeditationMode = !isMeditationMode;
    updateColorCycleControls();

    // Show/hide advanced level rows for meditation mode (bounce only -> level 4, it's not bouncing anymore tho)
    const allLevelRows = document.querySelectorAll('.level-speed-row');
    allLevelRows.forEach((row, idx) => {
      if (isMeditationMode) {
        row.style.display = (idx === 3) ? '' : 'none';
      } else {
        row.style.display = '';
      }
    });

    // Hide Previous/Next level buttons in meditation mode (single fixed level)
    document.querySelectorAll('.level-change-group .level-btn').forEach(b => {
        b.style.display = isMeditationMode ? 'none' : '';
    });

    // Scale meditation speeds for the current display
    if (isMeditationMode) {
      meditationSpeedsScaled = scaleReferenceSpeeds(meditationSpeeds);
    }

    const tierSelect = document.getElementById('tierSelect');
    const subLevelInput = document.getElementById('subLevelInput');
    tierSelect.disabled = isMeditationMode;
    subLevelInput.disabled = isMeditationMode;

    if (isMeditationMode) {
        // ENTERING -> highlight button and update label
        btn.classList.add('active');
        btn.textContent = "Exit Meditation Mode";
        // Save all current user settings for exit phase
        savedReferenceSpeeds = [...referenceLevelSpeeds];
        savedColors = {
            bg: $('bgColor').value,
            ball: $('ballColor').value,
            dot: $('dotColor').value,
            flash: $('flashColor').value
        };
        savedAutoSwitch = $('autoNextToggle').checked;
        savedSizePercent = parseFloat($('sizeInput').value);
        savedRoundDuration = parseFloat($('roundDuration').value);
        savedFlashDisabled = $('disableFlashToggle').checked;

        // Save Reading UI / 3D / stripe overlay state, then force them off for the session
        // Toggles stay clickable so they can be re enabled mid session if wanted
        // Track flags directly (not just checkboxes) so exit restores cleanly
        savedReadingUIEnabled = readingUIEnabled;
        saved3DEnabled = is3DMode;
        savedOverlays = {
            hashtag: hashtagOverlay,
            vertical: verticalStripesOverlay,
            horizontal: horizontalStripesOverlay,
            solid: solidStripes
        };
        readingUIEnabled = false;
        readingUICode = null;
        $('readingUIToggle').checked = false;
        is3DMode = false;
        depthScale = 1; // snap drawn size back to true size
        $('depth3DToggle').checked = false;
        hashtagOverlay = verticalStripesOverlay = horizontalStripesOverlay = solidStripes = false;
        $('hashtagToggle').checked = false;
        $('verticalStripesToggle').checked = false;
        $('horizontalStripesToggle').checked = false;
        $('solidStripesToggle').checked = false;

        // Apply meditation specific settings: fixed speed/colors/size and a
        // five minute round that ends gently instead of flashing or restarting
        levelSpeeds = [...meditationSpeedsScaled];
        speedInputs.forEach((input, i) => {
            input.value = meditationSpeedsScaled[i];
            input.disabled = true;
        });

        $('ballColor').value = '#d3a047';
        $('dotColor').value = '#ffdea3';
        $('bgColor').value = '#4b3d92';
        $('flashColor').value = '#aa7839';
        $('autoNextToggle').checked = false;
        $('sizeInput').value = 100;
        $('roundDuration').value = 300; // 5 min default, user can rewrite
        $('disableFlashToggle').checked = true;

        // Update internal state variables to match meditation settings
        ballColor = $('ballColor').value;
        dotColor = $('dotColor').value;
        backgroundColor = $('bgColor').value;
        flashColor = $('flashColor').value;
        document.body.style.backgroundColor = backgroundColor;
        sizePercent = 100;
        ballRadius = baseBallRadius * (sizePercent / 100);
        roundDuration = 300;
        meditationSessionState = 'running';
        meditationEndingElapsed = 0;
        meditationStartingElapsed = MEDITATION_START_DURATION;
        meditationMotionState = null;

        // Refresh the menu preview so it shows the meditation target (gold, size 100)
        if (typeof drawPreview === 'function') drawPreview();
        
        // Check current level if its valid for meditation mode
        if (!meditationLevels.includes(level)) {
            level = meditationLevels[0];
            meditationLevelIndex = 0;
            document.getElementById('levelDisplay').innerText = "Level " + level;
        }

        // Starts meditation round
        resetLevel(); // sets timer, speed, etc.
    } else {
        // Exiting -> unhighlight button and restore label
        btn.classList.remove('active');
        btn.textContent = "Meditation Mode";
        meditationSessionState = 'idle';
        meditationEndingElapsed = 0;
        meditationStartingElapsed = MEDITATION_START_DURATION;
        meditationMotionState = null;

        // Restore all previously saved user settings
        referenceLevelSpeeds = [...savedReferenceSpeeds];
        levelSpeeds = scaleReferenceSpeeds(referenceLevelSpeeds);
        speedInputs.forEach((input, i) => {
        input.value = levelSpeeds[i];
        input.disabled = false;
        });
        
        $('ballColor').value = savedColors.ball;
        $('dotColor').value = savedColors.dot;
        $('bgColor').value = savedColors.bg;
        $('flashColor').value = savedColors.flash;
        $('autoNextToggle').checked = savedAutoSwitch;
        $('sizeInput').value = savedSizePercent;
        $('roundDuration').value = savedRoundDuration;
        $('disableFlashToggle').checked = savedFlashDisabled;

        // Restore Reading UI / 3D / stripe overlays to the pre meditation state
        readingUIEnabled = savedReadingUIEnabled;
        $('readingUIToggle').checked = savedReadingUIEnabled;
        if (savedReadingUIEnabled) {
            readingUICode = null;
            rollReadingUICode();
        }
        is3DMode = saved3DEnabled;
        $('depth3DToggle').checked = saved3DEnabled;
        if (!saved3DEnabled) depthScale = 1;
        hashtagOverlay = !!savedOverlays.hashtag;
        verticalStripesOverlay = !!savedOverlays.vertical;
        horizontalStripesOverlay = !!savedOverlays.horizontal;
        solidStripes = !!savedOverlays.solid;
        $('hashtagToggle').checked = hashtagOverlay;
        $('verticalStripesToggle').checked = verticalStripesOverlay;
        $('horizontalStripesToggle').checked = horizontalStripesOverlay;
        $('solidStripesToggle').checked = solidStripes;

        // Update internal state variables to match restored settings
        ballColor = $('ballColor').value;
        dotColor = $('dotColor').value;
        backgroundColor = $('bgColor').value;
        flashColor = $('flashColor').value;
        document.body.style.backgroundColor = backgroundColor;
        sizePercent = savedSizePercent;
        ballRadius = baseBallRadius * (sizePercent / 100);
        roundDuration = savedRoundDuration;

        // Refresh the menu preview so it shows the restored target
        if (typeof drawPreview === 'function') drawPreview();

        // Start normal round with restored settings
        resetLevel();
    }

    // Sync speed and UI with current level
    speedPercent = levelSpeeds[level - 1];
    $('speedInput').value = speedPercent;
    updateProfileButtons();
}

// ==============================
// ABC Mode Toggle
// Part of: ABC Mode
// ==============================
// Enters/exits ABC mode, continuous free session
function toggleABCMode() {
    const btn = $('abcToggle');
    isABCMode = !isABCMode;

    if (isABCMode) {
        // If meditation mode is on, turn it off first
        if (isMeditationMode) { toggleMeditationMode(); }
        btn.classList.add('active');
        btn.textContent = "Exit ABC Mode";
        // Disable level/tier controls that don't apply while tracing
        const tierSelect = $('tierSelect');
        const subLevelInput = $('subLevelInput');
        if (tierSelect) tierSelect.disabled = true;
        if (subLevelInput) subLevelInput.disabled = true;
        $('levelDisplay').innerText = "ABC Mode";
        initABCMode();
    } else {
        btn.classList.remove('active');
        btn.textContent = "ABC Mode";
        const tierSelect = $('tierSelect');
        const subLevelInput = $('subLevelInput');
        if (tierSelect) tierSelect.disabled = false;
        if (subLevelInput) subLevelInput.disabled = false;
        abcState = null;
        $('levelDisplay').innerText = "Level " + level;
        resetLevel(); // return to normal level movement
    }
    updateProfileButtons();
}

// ==============================
// Update & Draw Functions
// Part of: Main game loop, movement logic
// ==============================
// Updates the position and state of the ball based on the current level and game state
function update(deltaTime) {
    // Keep ball radius in sync with sizePercent (UI)
    ballRadius = baseBallRadius * (sizePercent / 100);

    // Color timing follows active simulation time, so pause/hidden-tab behavior
    // stays consistent with target movement and the session timers
    updateColorCycle(deltaTime);

    // Advance reading UI code timer (independent of level), respawns on expiry
    if (readingUIEnabled) {
        if (!readingUICode) rollReadingUICode();
        readingUICode.timeLeft -= deltaTime;
        if (readingUICode.timeLeft <= 0) rollReadingUICode();
    }

    // Advance 3D depth oscillation (draw only effect)
    // placed before any early returns so the depth keeps easing smoothly during spawn delays etc
    if (is3DMode) {
        depthT += depthSpeed * deltaTime;
        // Each direction capped by its room to the limit (so it never crosses)
        const up = Math.min(depthGrowPoints, SIZE_MAX - sizePercent);    // grow room
        const down = Math.min(depthShrinkPoints, sizePercent - SIZE_MIN); // shrink room
        // Sine's positive half grows (toward viewer), negative half shrinks (away)
        const s = Math.sin(depthT);
        const pts = (s >= 0 ? s * up : s * down); // size points offset from home
        depthScale = 1 + pts / sizePercent;
    }

    // ABC Mode - runs instead of normal level movement
    if (isABCMode) {
        if (!abcState) initABCMode();
        const stroke = abcState.strokes[abcState.strokeIndex];

        // Arc length of the current stroke
        let strokeLen = 0;
        for (let i = 1; i < stroke.length; i++) {
            strokeLen += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
        }

        // Advance at the native resolution equivalent speed, converted to the
        // CSS pixel coordinate system used by the canvas
        const abcSpeed = effectiveSpeedToCanvasSpeed(ABC_SPEED * resolutionScale);
        abcState.dist += abcSpeed * deltaTime * abcState.dir;

        if (abcState.dir === 1 && abcState.dist >= strokeLen) {
            // Reached stroke end -> reverse back to its start
            abcState.dist = strokeLen;
            abcState.dir = -1;
        } else if (abcState.dir === -1 && abcState.dist <= 0) {
            // Back at stroke start -> next stroke or next orientation, glyph
            abcState.dist = 0;
            abcState.dir = 1;
            if (abcState.strokeIndex < abcState.strokes.length - 1) {
                abcState.strokeIndex += 1; // teleport to next stroke
            } else {
                abcState.strokeIndex = 0;
                if (!abcState.mirrored) {
                    abcState.mirrored = true; // mirror the same glyph next
                } else {
                    abcState.mirrored = false;
                    abcState.seqIndex = (abcState.seqIndex + 1) % ABC_SEQUENCE.length;
                }
                abcState.strokes = buildGlyphStrokes(ABC_SEQUENCE[abcState.seqIndex], abcState.mirrored);
            }
        }

        // Place target at the arc length distance along the current stroke
        const pts = abcState.strokes[abcState.strokeIndex];
        let d = Math.max(0, abcState.dist);
        let placed = false;
        for (let i = 1; i < pts.length; i++) {
            const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (d <= segLen || i === pts.length - 1) {
                const t = segLen > 0 ? Math.min(d / segLen, 1) : 0;
                pos.x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
                pos.y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t;
                placed = true;
                break;
            }
            d -= segLen;
        }
        if (!placed) { pos.x = pts[0].x; pos.y = pts[0].y; }
        return; // ABC mode handles its own movement, skip normal level logic
    }

    // Handle the brief spawn delay between spiral and figure eight patterns
    if ((level === 2 || level === 3) && spawnDelay > 0) {
        spawnDelay -= deltaTime;
        return; // Waits for spawn delay before updating position
    }
    
    // The UI reports native display px/s, movement uses canvas/CSS pixels
    const currentSpeed = effectiveSpeedToCanvasSpeed(speedPercent);
    
    // ==============================
    // Level 1: Axis Movement (merged horizontal/vertical)
    // Part of: Movement logic
    // ==============================
    // Moves along one axis, bouncing wall to wall with a random shift each bounce 
    // After 2-6 single traversals it switches to the other axis and re rolls the count
    if (level === 1) {
        const margin = 30;
        // Helper to handle a completed traversal (count it and maybe switch axis)
        const countTraversal = () => {
            axisCrossingsLeft -= 1;
            if (axisCrossingsLeft <= 0) {
                axisMode = (axisMode === 'h') ? 'v' : 'h';
                axisCrossingsLeft = 2 + Math.floor(Math.random() * 5); // 2-6
                // Replace onto the new axis at a random perpendicular position
                if (axisMode === 'h') {
                    direction = (Math.random() < 0.5) ? 1 : -1;
                    pos.x = (direction === 1) ? ballRadius : canvas.width - ballRadius;
                    pos.y = Math.random() * (canvas.height - 2 * ballRadius) + ballRadius;
                } else {
                    direction = (Math.random() < 0.5) ? 1 : -1;
                    pos.y = (direction === 1) ? ballRadius : canvas.height - ballRadius;
                    pos.x = Math.random() * (canvas.width - 2 * ballRadius) + ballRadius;
                }
                return true; // axis switched (position already set)
            }
            return false;
        };

        if (axisMode === 'h') {
            pos.x += currentSpeed * deltaTime * direction;
            if (direction === 1 && pos.x + ballRadius >= canvas.width) {
                pos.x = canvas.width - ballRadius;
                if (!countTraversal()) {
                    direction = -1;
                    let sign = (pos.y <= ballRadius + margin) ? 1 : (pos.y >= canvas.height - ballRadius - margin) ? -1 : (Math.random() < 0.5 ? -1 : 1);
                    pos.y += ((Math.random() * 0.15 + 0.10) * canvas.height) * sign;
                    pos.y = Math.max(ballRadius, Math.min(canvas.height - ballRadius, pos.y));
                }
            } else if (direction === -1 && pos.x - ballRadius <= 0) {
                pos.x = ballRadius;
                if (!countTraversal()) {
                    direction = 1;
                    let sign = (pos.y <= ballRadius + margin) ? 1 : (pos.y >= canvas.height - ballRadius - margin) ? -1 : (Math.random() < 0.5 ? -1 : 1);
                    pos.y += ((Math.random() * 0.15 + 0.10) * canvas.height) * sign;
                    pos.y = Math.max(ballRadius, Math.min(canvas.height - ballRadius, pos.y));
                }
            }
        } else {
            pos.y += currentSpeed * deltaTime * direction;
            if (direction === 1 && pos.y + ballRadius >= canvas.height) {
                pos.y = canvas.height - ballRadius;
                if (!countTraversal()) {
                    direction = -1;
                    let sign = (pos.x <= ballRadius + margin) ? 1 : (pos.x >= canvas.width - ballRadius - margin) ? -1 : (Math.random() < 0.5 ? -1 : 1);
                    pos.x += ((Math.random() * 0.15 + 0.10) * canvas.width) * sign;
                    pos.x = Math.max(ballRadius, Math.min(canvas.width - ballRadius, pos.x));
                }
            } else if (direction === -1 && pos.y - ballRadius <= 0) {
                pos.y = ballRadius;
                if (!countTraversal()) {
                    direction = 1;
                    let sign = (pos.x <= ballRadius + margin) ? 1 : (pos.x >= canvas.width - ballRadius - margin) ? -1 : (Math.random() < 0.5 ? -1 : 1);
                    pos.x += ((Math.random() * 0.15 + 0.10) * canvas.width) * sign;
                    pos.x = Math.max(ballRadius, Math.min(canvas.width - ballRadius, pos.x));
                }
            }
        }
    }
    // ==============================
    // Level 2: Spiral Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 2) {
        if (!spiralArcLookup) rebuildSpiralArcLookup();
        const travelDistance = Math.max(0, currentSpeed) * deltaTime;

        if (spiralForward) {
            spiralDistance += travelDistance;
            if (spiralDistance >= spiralArcLookup.totalLength) {
                const overshoot = spiralDistance - spiralArcLookup.totalLength;
                spiralDistance = Math.max(0, spiralArcLookup.totalLength - overshoot);
                spiralForward = false;
            }
        } else {
            spiralDistance -= travelDistance;
            if (spiralDistance <= 0) {
                // Keep the same starting angle so generating the next spiral
                // cannot teleport the target across the inner circle
                spiralScale = 0.85 + Math.random() * 0.3;
                spiralTurns = SPIRAL_MIN_TURNS + Math.random() * (SPIRAL_MAX_TURNS - SPIRAL_MIN_TURNS);
                spiralForward = true;
                spiralCW = !spiralCW;
                spiralDistance = 0;
                spiralProgress = 0;
                rebuildSpiralArcLookup();
                const start = spiralPointAt(0);
                pos.x = start.x;
                pos.y = start.y;
                spawnDelay = 0.2; // Small pause between spirals
                return;
            }
        }

        spiralProgress = parameterAtArcDistance(spiralArcLookup, spiralDistance);
        const spiralPoint = spiralPointAt(spiralProgress);
        pos.x = spiralPoint.x;
        pos.y = spiralPoint.y;
    }
    // ==============================
    // Level 3: Figure-8 Movement (any angle)
    // Part of: Movement logic
    // ==============================
    else if (level === 3) {
        if (!fig8ArcLookup) rebuildFig8ArcLookup();

        if (fig8ClosurePause > 0) {
            fig8ClosurePause -= deltaTime;
            if (fig8ClosurePause <= 0) resetFig8();
            return;
        }

        fig8Distance += Math.max(0, currentSpeed) * deltaTime;

        if (fig8Distance >= fig8ArcLookup.totalLength) {
            fig8Distance = fig8ArcLookup.totalLength;
            fig8T = 2 * Math.PI;
            const closurePoint = figureEightPointAt(fig8T);
            pos.x = closurePoint.x;
            pos.y = closurePoint.y;
            fig8ClosurePause = FIG8_CLOSURE_HOLD;
            return;
        }

        fig8T = parameterAtArcDistance(fig8ArcLookup, fig8Distance);
        const fig8Point = figureEightPointAt(fig8T);
        pos.x = fig8Point.x;
        pos.y = fig8Point.y;
    }
    // ==============================
    // Level 4: Advanced Bounce
    // Part of: Movement logic
    // ==============================
    else if (level === 4) {
        if (isMeditationMode) {
            updateMeditationMotion(currentSpeed, deltaTime);
            return;
        }

        // Random direction reversal but only when it's meaningful
        // Otherwise: target must have traveled a minimum distance (speed independent)
        // AND the time cooldown must have elapsed
        // Distance is the hard gate so low speeds don't trigger flips after only a tiny move
        const currentTime = Date.now();
        const minDist = Math.min(canvas.width, canvas.height) * directionChangeMinDistFraction;
        if (distanceSinceDirectionChange >= minDist &&
            currentTime - lastDirectionChangeTime >= directionChangeCooldown) {
            if (Math.random() < directionChangeChance) {
                vel.x = -vel.x;
                vel.y = -vel.y;
            }
            // Reset both gates after a check, whether or not it flipped,
            // so the next opportunity again requires fresh distance + time
            lastDirectionChangeTime = currentTime;
            distanceSinceDirectionChange = 0;
        }
        
        // Move according to velocity vector (bouncing logic)
        const stepX = (vel.x / baseSpeed) * currentSpeed * deltaTime;
        const stepY = (vel.y / baseSpeed) * currentSpeed * deltaTime;
        pos.x += stepX;
        pos.y += stepY;
        // Accumulate distance traveled this frame for the reversal gate
        distanceSinceDirectionChange += Math.sqrt(stepX * stepX + stepY * stepY);
        
        // Bounce off left wall
        if (pos.x - ballRadius < 0) {
            pos.x = ballRadius;
            if (Math.random() < 0.2) {
                vel.x = -vel.x; // Simple horizontal bounce
            } else {
                // Add random angle for dynamic bounces
                let speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                let currentAngle = Math.atan2(vel.y, vel.x);
                let idealAngle = Math.PI - currentAngle;
                let offset = (Math.random() * 0.66 - 0.33); // Randomize angle
                let newAngle = idealAngle + offset;
                vel.x = speed * Math.cos(newAngle);
                vel.y = speed * Math.sin(newAngle);
            }
        } else if (pos.x + ballRadius > canvas.width) {
            // Bounce off right wall
            pos.x = canvas.width - ballRadius;
            if (Math.random() < 0.2) {
                vel.x = -vel.x; // Simple horizontal bounce
            } else {
                // Add random angle for dynamic bounces
                let speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                let currentAngle = Math.atan2(vel.y, vel.x);
                let idealAngle = Math.PI - currentAngle;
                let offset = (Math.random() * 0.66 - 0.33); // Randomize angle
                let newAngle = idealAngle + offset;
                vel.x = speed * Math.cos(newAngle);
                vel.y = speed * Math.sin(newAngle);
            }
        }
        // Bounce off top wall
        if (pos.y - ballRadius < 0) {
            pos.y = ballRadius;
            if (Math.random() < 0.2) {
                vel.y = -vel.y; // Simple vertical bounce
            } else {
                // Add random angle for dynamic bounces
                let speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                let currentAngle = Math.atan2(vel.y, vel.x);
                let idealAngle = -currentAngle;
                let offset = (Math.random() * 0.66 - 0.33); // Randomize angle
                let newAngle = idealAngle + offset;
                vel.x = speed * Math.cos(newAngle);
                vel.y = speed * Math.sin(newAngle);
            }
        } else if (pos.y + ballRadius > canvas.height) {
            // Bounce off bottom wall
            pos.y = canvas.height - ballRadius;
            if (Math.random() < 0.2) {
                vel.y = -vel.y; // Simple vertical bounce
            } else {
                // Add random angle for dynamic bounces
                let speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                let currentAngle = Math.atan2(vel.y, vel.x);
                let idealAngle = -currentAngle;
                let offset = (Math.random() * 0.66 - 0.33); // Randomize angle
                let newAngle = idealAngle + offset;
                vel.x = speed * Math.cos(newAngle);
                vel.y = speed * Math.sin(newAngle);
            }
        }
    }
    // ==============================
    // Level 5: Clock Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 5) {
        // Calculate center and max distance for clock hand
        let center = { x: canvas.width / 2, y: canvas.height / 2 };
        let maxDistance = Math.min(center.x, center.y) - ballRadius;
        // Initialize clock state if not set
        if (!clockState) {
            let hour = Math.floor(Math.random() * 12); // Pick a random hour
            let angle = (hour * Math.PI / 6) - Math.PI/2; // Convert to angle
            let r = Math.random();
            let factor;
            // Randomize hand length
            if (r < 0.45) {
                factor = 0.25 + Math.random() * 0.10; // 25% - 35%
            } else if (r < 0.80) {
                factor = 0.35 + Math.random() * 0.15;  // 35% - 50%
            } else {
                factor = 0.5 + Math.random() * 0.25; // 50% - 75%
            }
            let distance = factor * maxDistance;
            clockState = { phase: "outgoing", targetAngle: angle, targetDistance: distance };
        }
    
        // Animate outgoing phase: move from center to clock hand target position
        if (clockState.phase === "outgoing") {
            let destX = center.x + clockState.targetDistance * Math.cos(clockState.targetAngle); // Target X (on clock hand)
            let destY = center.y + clockState.targetDistance * Math.sin(clockState.targetAngle); // Target Y (on clock hand)
            let dx = destX - pos.x;
            let dy = destY - pos.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let step = currentSpeed * deltaTime;
            if (dist <= step) {
                // Snap to destination, switch to incoming phase
                pos.x = destX;
                pos.y = destY;
                clockState.phase = "incoming";
            } else {
                // Move a step toward the destination
                pos.x += (dx / dist) * step;
                pos.y += (dy / dist) * step;
            }
        }
        // Animate incoming phase: move from hand back to center
        else if (clockState.phase === "incoming") {
            let dx = center.x - pos.x;
            let dy = center.y - pos.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let step = currentSpeed * deltaTime;
            if (dist <= step) {
                // Snap to center, randomize next clock hand target
                pos.x = center.x;
                pos.y = center.y;
                let newAngle, newDistance;
                if (Math.random() < 0.25) {
                    // Sometimes repeat the same angle (simulate ADAD spam)
                    newAngle = clockState.targetAngle;
                    if (Math.random() < 0.25) {
                        newDistance = clockState.targetDistance;
                    } else {
                        let r = Math.random();
                        if (r < 0.45) {
                            newDistance = (0.25 + Math.random() * 0.10) * maxDistance; // 25% - 35%
                        } else if (r < 0.80) {
                            newDistance = (0.35 + Math.random() * 0.15) * maxDistance; // 35% - 50%
                        } else {
                            newDistance = (0.5 + Math.random() * 0.25) * maxDistance; // 50% - 75%
                        }
                    }
                } else {
                    // Pick a new hour/angle different from previous
                    let currentHour = Math.round((clockState.targetAngle + Math.PI/2) / (Math.PI/6));
                    currentHour = (currentHour + 12) % 12;
                    let newHour;
                    do {
                        newHour = Math.floor(Math.random() * 12);
                    } while (newHour === currentHour);
                    newAngle = (newHour * Math.PI/6) - Math.PI/2;
                    let r = Math.random();
                    if (r < 0.45) {
                        newDistance = (0.25 + Math.random() * 0.10) * maxDistance; // 25% - 35%
                    } else if (r < 0.80) {
                        newDistance = (0.35 + Math.random() * 0.15) * maxDistance; // 35% - 50%
                    } else {
                        newDistance = (0.5 + Math.random() * 0.25) * maxDistance; // 50% - 75%
                    }
                }
                clockState.targetAngle = newAngle; // Set new angle
                clockState.targetDistance = newDistance; // Set new hand length
                clockState.phase = "outgoing"; // Start next outgoing phase
            } else {
                // Move a step toward the center
                pos.x += (dx / dist) * step;
                pos.y += (dy / dist) * step;
            }
        }
    }
    // ==============================
    // Level 6: Peek Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 6) {
        // Ensuring peek state is initialized
        if (!peekState) return;

        // Advance the pillar wander so it drifts slowly around screen center
        peekWanderT += PEEK_WANDER_SPEED * deltaTime;
        const anchor = peekAnchor();

        // Determine movement direction based on phase
        const direction = peekState.phase === "outgoing" ? 1 : -1;

        // Move peek target by updating progress
        // Movement in pixels per frame
        const movementPx = currentSpeed * deltaTime;
        peekState.progress += direction * movementPx / peekState.maxOffset;

        // Clamp progress between 0 and 1
        peekState.progress = Math.max(0, Math.min(1, peekState.progress));

        // Calculate the actual position relative to the wandering pillar anchor
        const sideFactor = peekState.side === "left" ? -1 : 1;
        const offsetX = peekState.maxOffset * peekState.progress * sideFactor;
        pos.x = anchor.x + offsetX;
        pos.y = anchor.y + peekState.heightOffset;

        // Handle direction change or reset for next peek
        if (peekState.phase === "outgoing" && peekState.progress >= 1) {
            peekState.phase = "returning"; // Start returning to center
        } else if (peekState.phase === "returning" && peekState.progress <= 0) {
            setupLevel6(); // Randomize next peek (side, offset, etc.)
        }
    }
    // ==============================
    // Level 7: Circular Orbit
    // Part of: Movement logic
    // ==============================
    else if (level === 7) {
        if (!circleState) return; // Ensure state is initialized

        // Advance the orbit angle, angular speed = linear speed / radius so the
        // on screen travel speed stays consistent regardless of circle size
        const angularSpeed = currentSpeed / circleState.radius; // radians/sec
        const dAngle = angularSpeed * deltaTime;
        circleState.angle += circleState.cw * dAngle;
        circleState.angleTraveled += dAngle;

        // Position on the circle
        pos.x = circleState.cx + circleState.radius * Math.cos(circleState.angle);
        pos.y = circleState.cy + circleState.radius * Math.sin(circleState.angle);

        // Completed a full loop?
        if (circleState.angleTraveled >= 2 * Math.PI) {
            circleState.angleTraveled -= 2 * Math.PI; // carry remainder for smoothness
            circleState.loopsLeft -= 1;

            // Direction re rolls 50/50 every loop
            circleState.cw = Math.random() < 0.5 ? 1 : -1;

            // After 1-3 loops, re roll radius + center too
            if (circleState.loopsLeft <= 0) {
                const c = rollCircle();
                circleState.cx = c.cx;
                circleState.cy = c.cy;
                circleState.radius = c.radius;
                circleState.cw = c.cw; // fresh direction with the new circle
                circleState.loopsLeft = 1 + Math.floor(Math.random() * 3);
                // Keep current angle so the target slides onto the new circle
                pos.x = circleState.cx + circleState.radius * Math.cos(circleState.angle);
                pos.y = circleState.cy + circleState.radius * Math.sin(circleState.angle);
            }
        }
    }
    // ==============================
    // Level 8: Door Peek
    // Part of: Movement logic
    // ==============================
    else if (level === 8) {
        if (!doorsState) return;

        // Pillars drift continuously (gap oscillates)
        doorsState.driftT += DOOR_DRIFT_SPEED * deltaTime;

        const p = doorPillars();
        const fromCenter = doorsState.side === 'left' ? p.left.centerX : p.right.centerX;
        const toCenter   = doorsState.side === 'left' ? p.right.centerX : p.left.centerX;

        if (!doorsState.moving) {
            // Hidden behind a pillar: brief pause, then start a crossing
            // Clamp fromY against the current pillar span first, so a stale Y
            // (e.g. after a window resize shrank the pillar) can't leave the
            // target poking past the top/bottom edge while "hidden"
            const margin = doorConcealRadius() + 10;
            doorsState.fromY = Math.max(p.top + margin, Math.min(p.top + p.pillarH - margin, doorsState.fromY));
            doorsState.hideTimer -= deltaTime;
            // Stay pinned to the pillar center while hidden
            pos.x = fromCenter;
            pos.y = doorsState.fromY;
            if (doorsState.hideTimer <= 0) {
                // Begin crossing: pick a destination height with a slight drift
                const h = canvas.height;
                const pillarH = h * DOOR_PILLAR_HEIGHT_FRAC;
                const top = (h - pillarH) / 2;
                const driftMargin = doorConcealRadius() + 10;
                const drift = (Math.random() * 2 - 1) * Math.min(80, pillarH * 0.25);
                doorsState.toY = Math.max(top + driftMargin, Math.min(top + pillarH - driftMargin, doorsState.fromY + drift));
                doorsState.moving = true;
                doorsState.progress = 0;
            }
        } else {
            // Measure the full curved crossing, including its eased vertical component
            // The lookup is refreshed because the pillars continue
            // drifting while the target crosses between them
            const doorPointAt = progress => {
                const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);
                return {
                    x: fromCenter + (toCenter - fromCenter) * progress,
                    y: doorsState.fromY + (doorsState.toY - doorsState.fromY) * ease
                };
            };
            const doorArcLookup = buildArcLengthLookup(doorPointAt, 1, DOOR_ARC_SAMPLES);
            const currentDistance = arcDistanceAtParameter(doorArcLookup, doorsState.progress);
            const nextDistance = currentDistance + Math.max(0, currentSpeed) * deltaTime;

            if (nextDistance >= doorArcLookup.totalLength) {
                // Arrived fully hidden behind the far pillar
                doorsState.progress = 1;
                doorsState.moving = false;
                doorsState.hideTimer = 0.4;
                doorsState.fromY = doorsState.toY;
                pos.x = toCenter;
                pos.y = doorsState.toY;
                // 50% chance to return the same way, otherwise new height
                if (Math.random() < 0.5) {
                    doorsState.side = (doorsState.side === 'left') ? 'right' : 'left';
                } else {
                    // Respawn at a new random height behind the far pillar
                    const h = canvas.height;
                    const pillarH = h * DOOR_PILLAR_HEIGHT_FRAC;
                    const top = (h - pillarH) / 2;
                    const margin = doorConcealRadius() + 10;
                    doorsState.side = (doorsState.side === 'left') ? 'right' : 'left';
                    doorsState.fromY = top + margin + Math.random() * (pillarH - 2 * margin);
                }
            } else {
                doorsState.progress = parameterAtArcDistance(doorArcLookup, nextDistance);
                const point = doorPointAt(doorsState.progress);
                pos.x = point.x;
                pos.y = point.y;
            }
        }
    }
    // ==============================
    // Level 9: Recursive Star
    // Part of: Movement logic
    // ==============================
    else if (level === 9) {
        if (!starState) return;

        // Drift the whole structure slowly around screen center
        starDriftT += STAR_DRIFT_SPEED * deltaTime;
        const c = starCenter();
        // The selected speed is the outer leg reference speed
        // Shorter inner legs intentionally use lower multipliers so they remain visible
        // instead of seeming to accelerate and pauses are derived from the outer leg travel time,
        // so manual/tier speed changes affect the entire rhythm proportionally
        let remainingTime = deltaTime;
        let safety = 0;
        while (remainingTime > 0 && safety++ < 64) {
            if (starState.pauseRemaining > 0) {
                const pauseStep = Math.min(remainingTime, starState.pauseRemaining);
                starState.pauseRemaining -= pauseStep;
                remainingTime -= pauseStep;
                if (remainingTime <= 0) break;
            }

            const activeOffsets = starState.offsets;
            const a = activeOffsets[starState.leg];
            const b = activeOffsets[starState.leg + 1];
            const segLen = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1);
            const legMultiplier = STAR_LEG_SPEED_MULTIPLIERS[starState.leg] || 1;
            const segmentSpeed = Math.max(currentSpeed, 0) * legMultiplier;
            if (segmentSpeed <= 0) break;

            const distanceLeft = segLen * (1 - starState.segProgress);
            const timeToEnd = distanceLeft / segmentSpeed;
            if (remainingTime < timeToEnd) {
                starState.segProgress += (segmentSpeed * remainingTime) / segLen;
                remainingTime = 0;
                break;
            }

            // Finish this leg, move the state to the next leg, then pause there
            remainingTime -= timeToEnd;
            starState.segProgress = 0;
            let isTurnaround = false;
            if (starState.dir === 1) {
                if (starState.leg < activeOffsets.length - 2) {
                    starState.leg += 1;
                } else {
                    starState.dir = -1;
                    isTurnaround = true;
                }
            } else if (starState.leg > 0) {
                starState.leg -= 1;
            } else {
                starState.offsets = buildStarJourney();
                starState.leg = 0;
                starState.dir = 1;
                isTurnaround = true;
            }

            const outerOffsets = starState.offsets;
            const outerLegLen = Math.max(Math.hypot(
                outerOffsets[1].x - outerOffsets[0].x,
                outerOffsets[1].y - outerOffsets[0].y
            ), 1);
            const outerLegTime = outerLegLen / Math.max(currentSpeed, 1);
            const pauseRatio = isTurnaround ? STAR_TURN_PAUSE_RATIO : STAR_INTER_LEG_PAUSE_RATIO;
            starState.pauseRemaining = outerLegTime * pauseRatio;
        }

        // recalculate current segment endpoints (leg/dir may have changed) and place
        const a2 = starState.offsets[starState.leg];
        const b2 = starState.offsets[starState.leg + 1];
        const f2 = (starState.dir === 1) ? a2 : b2;
        const t2 = (starState.dir === 1) ? b2 : a2;
        const fX = c.x + f2.x, fY = c.y + f2.y;
        const tX = c.x + t2.x, tY = c.y + t2.y;
        const tt = Math.min(starState.segProgress, 1);
        pos.x = fX + (tX - fX) * tt;
        pos.y = fY + (tY - fY) * tt;
    }
}

// ==============================
// Draw Function
// Part of: Main game loop, canvas rendering
// ==============================
// Draws the main target (ball and dot) and overlays (stripes, hashtags, etc.)
function draw() {
    // Clear the entire canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Keep the breathing guide visually behind the target so tracking remains clear
    drawBreathingHalo();
    
    // Draw main target (ball)
    // depthScale fakes z-axis distance (draw only; true ballRadius unchanged)
    const drawRadius = ballRadius * depthScale;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, drawRadius, 0, 2 * Math.PI);
    ctx.fillStyle = ballColor;
    ctx.fill();

    // Draw central dot inside the ball (scales with depth to reinforce illusion)
    let dotRadius = Math.max(drawRadius * 0.4, 2); // never smaller than 2px
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, dotRadius, 0, 2 * Math.PI);
    ctx.fillStyle = dotColor;
    ctx.fill();
      
    // Draw overlays (stripes, hashtags, etc.)
    let stripeAlpha = solidStripes ? 1 : 0.7;
    let fillStyle = "rgba(255,255,255," + stripeAlpha + ")";
      
    // Draw hashtag overlay
    if (hashtagOverlay) {
        ctx.fillStyle = fillStyle;
        let stripeWidth = 25;
        for (let i = 1; i <= 4; i++) {
            let x = (i / 5) * canvas.width - stripeWidth / 2;
            ctx.fillRect(x, 0, stripeWidth, canvas.height);
        }
        for (let i = 1; i <= 4; i++) {
            let y = (i / 5) * canvas.height - stripeWidth / 2;
            ctx.fillRect(0, y, canvas.width, stripeWidth);
        }
    }
      
    // Draw vertical stripes overlay
    if (verticalStripesOverlay) {
        ctx.fillStyle = fillStyle;
        let stripeW = 10, gap = 25;
        for (let x = 0; x < canvas.width; x += stripeW + gap) {
          ctx.fillRect(x, 0, stripeW, canvas.height);
        }
    }
      
    // Draw horizontal stripes overlay
    if (horizontalStripesOverlay) {
        ctx.fillStyle = fillStyle;
        let stripeH = 10, gap = 25;
        for (let y = 0; y < canvas.height; y += stripeH + gap) {
          ctx.fillRect(0, y, canvas.width, stripeH);
        }
    }

    // Draw pillar for level 6 (peek movement)
    if (level === 6) {
        const targetDiameter = ballRadius * 2;

        // Constrain the pillar based on target size
        const pillarWidth = Math.max(targetDiameter + 30, 80);  // ensure minimum width
        const pillarHeight = Math.max(targetDiameter + 30, 300); // ensure minimum height

        // Pillar sits at the wandering anchor (matches the target's drift)
        const anchor = peekAnchor();
        ctx.fillStyle = '#222';
        ctx.fillRect(
          anchor.x - pillarWidth / 2,
          anchor.y - pillarHeight / 2,
          pillarWidth,
          pillarHeight
        );
    }

    // Draw the two door pillars for level 8 (drawn after the target -> occlusion)
    if (level === 8 && doorsState) {
        const p = doorPillars();
        ctx.fillStyle = '#222';
        ctx.fillRect(p.left.x, p.top, p.left.w, p.pillarH);
        ctx.fillRect(p.right.x, p.top, p.right.w, p.pillarH);
    }

    // Draw the reading UI code (on top of everything), auto contrast color
    if (readingUIEnabled && readingUICode) {
        const margin = Math.min(canvas.width, canvas.height) * 0.05;
        ctx.save();
        ctx.font = `bold ${readingUICode.fontSize}px monospace`;
        ctx.fillStyle = contrastColor(backgroundColor);
        ctx.textBaseline = 'middle';
        const th = readingUICode.fontSize;
        let x, y;
        switch (readingUICode.corner) {
            case 0: x = margin; y = margin + th / 2; ctx.textAlign = 'left'; break;            // TL
            case 1: x = canvas.width - margin; y = margin + th / 2; ctx.textAlign = 'right'; break;  // TR
            case 2: x = margin; y = canvas.height - margin - th / 2; ctx.textAlign = 'left'; break;  // BL
            default: x = canvas.width - margin; y = canvas.height - margin - th / 2; ctx.textAlign = 'right'; break; // BR
        }
        ctx.fillText(readingUICode.text, x, y);
        ctx.restore();
    }
}

// ==============================
// Main Animation Loop
// Part of: Game engine, frame update
// ==============================
// Handles timing, updates game state, draws frame, and schedules next frame
function loop(timestamp) {
    // Initialize lastTime on first call
    if (!lastTime) lastTime = timestamp;
    // Keep raw frame time for an honest FPS measurement
    // Movement and timers use a protected value so stalls cannot teleport the target through its path
    const rawDeltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp; // always advance, so unpausing doesn't cause a time jump
    updateFPS(rawDeltaTime); // stays active while the movement itself is paused

    const simulationDelta = rawDeltaTime > INTERRUPTION_DELTA
        ? 0
        : Math.min(rawDeltaTime, MAX_SIMULATION_DELTA);

    if (!isPaused && !document.hidden) {
        // Update all timers (round, overlays, etc.)
        updateTimers(simulationDelta);
        // Update game state (positions, logic, etc.)
        update(simulationDelta);
        // Update breathing overlay timer (if enabled)
        updateBreathTimer(simulationDelta);
    }
    // Always draw so the frame stays visible (frozen while paused)
    draw();
    drawBreathingLabel();
    // Schedule the next animation frame
    requestAnimationFrame(loop);
}

// Detect and apply the initial display scale before the first frame.
updateScreenScaling();

// Start the game loop
requestAnimationFrame(loop);
