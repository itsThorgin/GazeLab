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
// Total number of levels
const totalLevels = tiers.length * levelsPerTier;

// Base speeds for each level (unscaled, for full HD)
let baseSpeeds = [1000, 350, 600, 1200, 400, 200, 500, 700, 550];

// Currently selected tier and sublevel (user selection state)
let selectedTier = "12";
let selectedSublevel = 1;

// Stores all calculated speeds for all levels/tiers
let allLevelSpeeds = [];

// Level 6 direction change
let lastDirectionChangeTime = 0;
const directionChangeCooldown = 3000; // 3 sec
const directionChangeChance = 0.33; // % chance
// Minimum distance (as fraction of smaller screen dimension)
// the target must travel since the last reversal before another reversal can be considered
// This keeps the behavior speed independent: at low speeds the target won't flip after only a tiny move
const directionChangeMinDistFraction = 0.25; // 25% of min(width, height)
let distanceSinceDirectionChange = 0; // Accumulated travel since last reversal

// Listen for screen type changes to update scaling
// Part of: Screen scaling - updateScreenScaling function
document.getElementById('screenTypeSelect').addEventListener('change', updateScreenScaling);

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
// Returns the current level index based on user selection
// Part of: Level system
// ----------------------------------
function getCurrentLevelIndex() {
    const tier = document.getElementById('tierSelect').value;
    const subLevel = parseInt(document.getElementById('subLevelInput').value);
    const tierIndex = tiers.indexOf(tier);
    return (tierIndex * levelsPerTier) + (subLevel - 1);
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
    const speeds = allLevelSpeeds[levelIndex].map(s => parseFloat((s * resolutionScale).toFixed(2)));
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
// Resize canvas whenever window size changes
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

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
let savedSpeeds = [];
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
    controls.style.display = (controls.style.display === 'none') ? 'block' : 'none';
}

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
let clockState = null; // Used for clock level 7
let resolutionScale = 1; // Used for scaling speeds
let peekState = null; // Used for peek level 8
// Level 8 pillar wander: the pillar (and the target's peek) drift slowly around screen center
// Persistent across peeks so the motion is continuous
// Uses two slow sine waves of different frequencies for the wander
let peekWanderT = 0;                 // time accumulator for the wander
const PEEK_WANDER_SPEED = 0.5;       // base radians/sec of the drift
const PEEK_WANDER_AMP_X = 0.10;      // x amplitude as fraction of screen width
const PEEK_WANDER_AMP_Y = 0.10;      // y amplitude as fraction of screen height
// Current wandering pillar center (updated each frame in level 8)
function peekAnchor() {
    const cx = canvas.width / 2 + Math.sin(peekWanderT) * canvas.width * PEEK_WANDER_AMP_X;
    const cy = canvas.height / 2 + Math.sin(peekWanderT * 1.3 + 0.7) * canvas.height * PEEK_WANDER_AMP_Y;
    return { x: cx, y: cy };
}
let doorsState = null; // Used for door peek level 10

// ==============================
// Level 11: Recursive Star (nested 12 spoke clock stars)
// ==============================
// A 12 spoke hub at a drifting center
// The target goes center -> tip of a random spoke -> tip of a random spoke on a smaller star there -> tip of a random spoke
// on an even smaller star -> then reverses the whole path back to center and starts a new random journey
// The whole structure drifts a bit around center
const STAR_ARMS = 12;                 // spokes per star (clock positions)
const STAR_R1_FRAC = 0.20;            // first arm length, fraction of min screen dim
const STAR_R2_FRAC = 0.11;            // second (smaller) star arm length
const STAR_R3_FRAC = 0.06;            // third (smallest) star arm length
const STAR_DRIFT_SPEED = 0.4;         // radians/sec of center drift
const STAR_MIN_LEG_TIME = 0.5;        // min seconds per leg (keeps inner legs readable)
const STAR_DRIFT_AMP_X = 0.05;        // drift amplitude, fraction of width
const STAR_DRIFT_AMP_Y = 0.05;        // drift amplitude, fraction of height
let starDriftT = 0;                   // persistent drift accumulator
let starState = null;                 // tracer state for level 11

// Current drifting center of the whole star structure.
function starCenter() {
    return {
        x: canvas.width / 2 + Math.sin(starDriftT) * canvas.width * STAR_DRIFT_AMP_X,
        y: canvas.height / 2 + Math.sin(starDriftT * 1.3 + 0.5) * canvas.height * STAR_DRIFT_AMP_Y,
    };
}
let circleState = null; // Used for circular orbit level 9

// ==============================
// ABC Mode (letter/shape tracing) a separate mode, not a level
// ==============================
// A toggleable mode (like meditation) where the target traces letters and shapes
// Each glyph is a list of STROKES; each stroke a polyline in a 0..1 box (y down)
// The target traces a stroke forward, reverses back to its start, then moves to the next stroke
// after all strokes, the MIRRORED glyph does the same, then the next glyph in the sequence
// Multi-stroke means every segment is covered exactly twice (once each direction) even coverage
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
// Sequence order: shapes first, then the alphabet
const ABC_SEQUENCE = ['PLUS','X',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
const ABC_SPEED = 450; // on screen tracing speed (px/sec, scaled by resolution)
let isABCMode = false;  // whether ABC mode is active
let abcState = null;    // tracer state for ABC mode

// Level speed input fields and their values
const speedInputs = [];
let levelSpeeds = [];
for (let i = 1; i <= maxLevel; i++) {
    const input = $(`speedLevel${i}`);
    speedInputs.push(input);
    levelSpeeds.push(parseFloat(input.value));
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
  let correctSpeed = allLevelSpeeds[levelIndex][levelIdx];
  // Apply resolution scaling for current screen type
  correctSpeed = parseFloat((correctSpeed * resolutionScale).toFixed(2));
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
// Draws the breathing overlay animation and text
// Part of: Meditation mode, Overlay
// ----------------------------------
function drawBreathingOverlay() {
    if (!isMeditationMode) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const phase = currentBreathPhase();
    const progress = Math.min(1, breathTimer / phase.duration); // 0..1 within the phase

    // fullness maps the phase to circle size: 0 = smallest (empty), 1 = largest (full)
    // holds pin to their endpoint so the circle visibly pauses during box breathing
    const RADIUS_MIN = 200, RADIUS_MAX = 425;
    let fullness;
    switch (phase.kind) {
        case 'inhale':     fullness = progress;     break; // grow
        case 'exhale':     fullness = 1 - progress; break; // shrink
        case 'hold-full':  fullness = 1;            break; // stay big
        case 'hold-empty': fullness = 0;            break; // stay small
        default:           fullness = progress;     break;
    }
    const radius = RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * fullness;

    // Opacity + color per phase, inhale/hold full use the warm tone, exhale/hold empty the dark one
    // holds at a steady opacity so they read as a pause
    let opacity, color;
    if (phase.kind === 'exhale') {
        // Exhale: lightens in the last 25%
        opacity = (progress < 0.75) ? 0.3 : 0.3 - 0.175 * ((progress - 0.75) / 0.25);
        color = '#552f00';
    } else if (phase.kind === 'inhale') {
        // Inhale: lightens in the last 25%
        opacity = (progress > 0.75) ? 0.2 + 0.15 * ((progress - 0.75) / 0.25) : 0.2;
        color = '#ffd9aa';
    } else if (phase.kind === 'hold-full') {
        opacity = 0.32;
        color = '#ffd9aa';
    } else { // hold-empty
        opacity = 0.22;
        color = '#552f00';
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(phase.label, centerX, centerY + 8);
    ctx.restore();
}

// ----------------------------------
// Update for all speed values and UI when screen scaling changes
// Part of: Screen scaling, Level system
// ----------------------------------
function updateScreenScaling() {
    resolutionScale = parseFloat(document.getElementById('screenTypeSelect').value);
    allLevelSpeeds = generateAllSpeeds(baseSpeeds, tiers, levelsPerTier);
    const levelIndex = tiers.indexOf(selectedTier) * levelsPerTier + (selectedSublevel - 1);
    const speeds = allLevelSpeeds[levelIndex].map(s => parseFloat((s * resolutionScale).toFixed(2)));
    levelSpeeds = [...speeds];
    speedInputs.forEach((input, i) => input.value = speeds[i]);
    speedPercent = levelSpeeds[level - 1];
    document.getElementById('speedInput').value = speedPercent;
    resetLevel();
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
document.getElementById('bgColor').addEventListener('change', e => {
    backgroundColor = e.target.value;
});


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

    // Clamp value between 15 and 200, mostly for peek level 8
    value = Math.min(200, Math.max(15, value));
    sizePercent = value;
    ballRadius = baseBallRadius * (sizePercent / 100);
    sizeInput.value = value; // clamp the field
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

// Pick a fresh 4char code, a corner different from the last, and a size.
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
    const fontSize = base * (0.6 + Math.random() * 0.6); // ±~ variation
    readingUICode = {
        text,
        corner,
        fontSize,
        timeLeft: 1 + Math.random() * 4, // visible 1-5 seconds
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
// Affects DRAWING ONLY ballRadius stays the true size so all movement, bouncing, and collision math is unaffected.
// The player's chosen size is HOME (rest position)
// The target breathes around it, drifting toward the viewer (grow) and away (shrink)
// Each side is independently capped to its room before the limits [SIZE_MIN, SIZE_MAX], so the drawn size never crosses them.
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
// number of single traversals (crossings) on the current axis.
let axisMode = 'h';            // 'h' = horizontal, 'v' = vertical
let axisCrossingsLeft = 2;     // traversals remaining on this axis before switching
    
// ==============================
// Level 3 (Spiral) Variables (main/global declarations)
// Part of: Ball movement
// ==============================
let spiralProgress = 0; // Spiral animation progress
let spiralForward = true; // Spiral direction
let spiralScale = 1; // Spiral scaling factor
let spiralRotation = 0; // Spiral rotation angle
let spiralCW = true; // Spiral clockwise/counterclockwise
    
// ==============================
// Levels 4 & 5 (Figure Eight) Variables (main/global declarations)
// Part of: Ball movement
// ==============================
let fig8T = 0; // Progress along the loop, 0 -> 2*PI (one full figure 8)
let fig8Offset = 0; // Random spawn phase: where on the path the target starts/finishes
let fig8Scale = 1; // Scaling factor for figure eight (re rolls each loop for size variety)
let fig8Mirror = 1; // Traversal direction: +1 / -1 (clockwise vs counterclockwise), 50/50
let fig8Angle = 0; // Orientation of the whole figure 8 (one of 6 clock hand angles)
let lastFig8Angle = null; // Previous orientation, to avoid an immediate repeat
let fig8Center = { x: 0, y: 0 }; // Where the 8 is planted (jittered near screen center)

// Six distinct orientations at 30° steps
// A figure 8 has 180° rotational symmetry so 0..150° already covers every visually distinct clock hand direction
// (e.g. 12 o'clock and 6 o'clock look identical)
const FIG8_ANGLES = [0, Math.PI/6, Math.PI/3, Math.PI/2, 2*Math.PI/3, 5*Math.PI/6];
// Plant jitter as a fraction of each screen dimension (tight box around center)
const FIG8_CENTER_JITTER_X = 0.08;
const FIG8_CENTER_JITTER_Y = 0.08;

let spawnDelay = 0; // Delay before respawning in figure eight levels

// Randomize figure eight parameters - called after each completed loop
// Every loop re rolls: plant center (near screen center), orientation (1 of 6, no immediate repeat),
// size, traversal direction (50/50), spawn phase (anywhere on the path)
function resetFig8() {
    fig8T = 0;

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

// ==============================
// Round Duration Change Listener
// Part of: Timer system, UI interaction
// ==============================
// Keeps UI and logic in sync
document.getElementById('roundDuration').addEventListener('change', e => {
    roundDuration = parseFloat(e.target.value);
    roundTimeRemaining = roundDuration;
});
    
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
// Uses ceil so a countdown shows the full duration at the start (e.g. 30, not 29)
// and only ticks down when the remaining whole second actually elapses
function formatTimeMS(seconds) {
    let total = Math.max(0, Math.ceil(seconds));
    let mins = Math.floor(total / 60);
    let secs = total % 60;
    return (mins < 10 ? "0" : "") + mins + ":" +
             (secs < 10 ? "0" : "") + secs;
}
    
// ==============================
// Timer Update Logic
// Part of: Timer system, Game logic
// ==============================
// Updates round and flash timers, handles round transitions, and updates UI
function updateTimers(deltaTime) {
    elapsedTime += deltaTime;
    // ABC mode is a continuous free session  no round countdown / auto-advance
    if (isABCMode) {
        document.getElementById('elapsedTimeDisplay').innerText = formatTimeHMS(elapsedTime);
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
    spiralProgress = 0; // Reset spiral progress
    spiralForward = true; // Start spiral forward

    spiralRotation = Math.random() * 2 * Math.PI;
    spawnDelay = 0.2;
    }

// Sets up level 3 (figure eight movement)
// Calls resetFig8 for randomization
function setupLevel3() {
    resetFig8(); // re rolls center, orientation, size, direction, spawn phase
}

// Sets up level 4 (advanced bounce)
// Randomizes position and velocity for bouncing movement
function setupLevel4() {
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
defaultLastHour7 = 0; // fallback for first run
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
        isFake: Math.random() < 0.2, // 20% chance to be a fake peek
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
// Level 9: Circular Orbit
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
// Level 10: Door Peek
// Part of: Level system
// ==============================
const DOOR_PILLAR_HEIGHT_FRAC = 0.6; // pillar height as fraction of screen height
const DOOR_GAP_MIN_FRAC = 0.05;      // min gap as fraction of screen width
const DOOR_GAP_MAX_FRAC = 0.35;      // max gap as fraction of screen width
const DOOR_DRIFT_SPEED = 0.75;       // radians/sec of the gap oscillation

// Largest radius the target can be DRAWN at, used to size pillars and clamp
// the hidden Y so the target never pokes out the top/bottom or sides.
// In 3D depth mode the drawn radius swings up to (1 + depthGrowPoints/sizePercent)x
// the true ballRadius; we size the concealment to that worst case.
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
    // Use the depth-aware drawn radius so the pillar still hides the target
    // when 3D depth mode inflates the drawn size beyond the true ballRadius.
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
    // Random height within the pillar's vertical span (depth-aware margin)
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
// Level 11: Recursive Star setup
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
        segProgress: 0 // 0..1 progress along the current segment
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
    const btn = $('meditationToggle');
    isMeditationMode = !isMeditationMode;

    // Show/hide advanced level rows for meditation mode (bounce only -> level 4, idx 3)
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

    // Scale meditation speeds for current screen type
    if (isMeditationMode) {
      meditationSpeedsScaled = meditationSpeeds.map(s => parseFloat((s * resolutionScale).toFixed(2)));
    }

    const screenTypeSelect = document.getElementById('screenTypeSelect');
    const tierSelect = document.getElementById('tierSelect');
    const subLevelInput = document.getElementById('subLevelInput');
    screenTypeSelect.disabled = isMeditationMode;
    tierSelect.disabled = isMeditationMode;
    subLevelInput.disabled = isMeditationMode;

    if (isMeditationMode) {
        // ENTERING -> highlight button and update label
        btn.classList.add('active');
        btn.textContent = "Exit Meditation Mode";
        // Save all current user settings for exit phase
        savedSpeeds = [...levelSpeeds];
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

        // Apply meditation specific settings:
        // fixed speeds & colors, fixed size, 5 min round (editable), flash cue on
        levelSpeeds = [...meditationSpeedsScaled];
        speedInputs.forEach((input, i) => {
            input.value = meditationSpeedsScaled[i];
            input.disabled = true;
        });

        $('ballColor').value = '#d3a047';
        $('dotColor').value = '#ffdea3';
        $('bgColor').value = '#4b3d92';
        $('flashColor').value = '#aa7839';
        $('autoNextToggle').checked = true;
        $('sizeInput').value = 100;
        $('roundDuration').value = 300; // 5 min default, user can rewrite
        // Turn the flash cue ON so the round end is noticeable (toggle is "disable", so uncheck :)))
        $('disableFlashToggle').checked = false;

        // Update internal state variables to match meditation settings
        ballColor = $('ballColor').value;
        dotColor = $('dotColor').value;
        backgroundColor = $('bgColor').value;
        flashColor = $('flashColor').value;
        document.body.style.backgroundColor = backgroundColor;
        sizePercent = 100;
        ballRadius = baseBallRadius * (sizePercent / 100);
        roundDuration = 300;

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

        // Restore all previously saved user settings
        levelSpeeds = [...savedSpeeds];
        speedInputs.forEach((input, i) => {
        input.value = savedSpeeds[i];
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
}

// ==============================
// Update & Draw Functions
// Part of: Main game loop, movement logic
// ==============================
// Updates the position and state of the ball based on the current level and game state
function update(deltaTime) {
    // Keep ball radius in sync with sizePercent (UI)
    ballRadius = baseBallRadius * (sizePercent / 100);

    // Advance reading UI code timer (independent of level), respawns on expiry
    if (readingUIEnabled) {
        if (!readingUICode) rollReadingUICode();
        readingUICode.timeLeft -= deltaTime;
        if (readingUICode.timeLeft <= 0) rollReadingUICode();
    }

    // Advance 3D depth oscillation (draw only effect), placed before any early
    // returns so the depth keeps easing smoothly during spawn delays etc.
    if (is3DMode) {
        depthT += depthSpeed * deltaTime;
        // Each direction capped by its room to the limit (so it never crosses)
        const up = Math.min(depthGrowPoints, SIZE_MAX - sizePercent);    // grow room
        const down = Math.min(depthShrinkPoints, sizePercent - SIZE_MIN); // shrink room
        // Sine's positive half grows (toward viewer), negative half shrinks (away).
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

        // Advance along the stroke at constant on screen speed (resolution scaled)
        const abcSpeed = ABC_SPEED * resolutionScale;
        abcState.dist += abcSpeed * deltaTime * abcState.dir;

        if (abcState.dir === 1 && abcState.dist >= strokeLen) {
            // Reached stroke end -> reverse back to its start
            abcState.dist = strokeLen;
            abcState.dir = -1;
        } else if (abcState.dir === -1 && abcState.dist <= 0) {
            // Back at stroke start -> next stroke, or next orientation,glyph
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
        return; // ABC mode handles its own movement; skip normal level logic
    }

    // Handle spawn delay for spiral and advanced levels
    // level 3/4/5 spawn logic
    if ((level === 2 || level === 3) && spawnDelay > 0) {
        spawnDelay -= deltaTime;
        return; // Waits for spawn delay before updating position
    }
    
    // Get the current movement speed (can be affected by level or mode)
    let currentSpeed = speedPercent;
    
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
        // Calculate spiral center and radii
        let centerX = canvas.width / 2;
        let centerY = canvas.height / 2;
        let outerRadius = (Math.min(canvas.width, canvas.height) / 3) * spiralScale;
        let innerRadius = ballRadius;
        // Calculate spiral angle and position
        let theta = (spiralCW ? 2 * Math.PI * spiralProgress : -2 * Math.PI * spiralProgress);
        let totalAngle = theta + spiralRotation;
        let radius = innerRadius + spiralProgress * (outerRadius - innerRadius);
        pos.x = centerX + radius * Math.cos(totalAngle);
        pos.y = centerY + radius * Math.sin(totalAngle);
        
        // Advance spiral progress based on speed and direction
        let progressDelta = (currentSpeed / outerRadius) * deltaTime;
        if (spiralForward) {
            spiralProgress += progressDelta;
            if (spiralProgress >= 1) {
                spiralProgress = 1;
                spiralForward = false;
            }
        } else {
            spiralProgress -= progressDelta;
            if (spiralProgress <= 0) {
                spiralProgress = 0;
                // Randomize spiral for next run
                spiralRotation = Math.random() * 2 * Math.PI;
                spiralScale = 0.85 + Math.random() * 0.3;
                spiralForward = true;
                spiralCW = !spiralCW;
                spawnDelay = 0.2; // Small pause between spirals
            }
        }
    }
    // ==============================
    // Level 3: Figure-8 Movement (any angle)
    // Part of: Movement logic
    // ==============================
    else if (level === 3) {
        // Base figure-8 amplitude
        let A = (Math.min(canvas.width, canvas.height) / 4) * fig8Scale;
        // The 8 is planted at fig8Center (jittered near screen center)
        let centerX = fig8Center.x;
        let centerY = fig8Center.y;
        // Phase = spawn offset + progress*direction. At fig8T = 0 the target is at the spawn point
        // at fig8T = 2*PI it returns to it (loop complete)
        let t = fig8Offset + (fig8T * fig8Mirror);
        // Base (horizontal) figure-8 point, centered at origin
        let bx = A * Math.sin(t);
        let by = (A / 2) * Math.sin(2 * t);
        // Rotate the whole 8 by fig8Angle (one of 6 clock hand orientations)
        const ca = Math.cos(fig8Angle), sa = Math.sin(fig8Angle);
        pos.x = centerX + bx * ca - by * sa;
        pos.y = centerY + bx * sa + by * ca;
        // Advance along the path
        let tDelta = (currentSpeed / A) * deltaTime;
        fig8T += tDelta;
        // Completed a full loop (returned to the spawn phase)? 
        // Carry the overshoot so the last frame's segment isn't skipped, then re roll
        if (fig8T >= 2 * Math.PI) {
            const carry = fig8T - 2 * Math.PI;
            resetFig8();       // new center, angle, size, direction, spawn phase; sets fig8T = 0
            fig8T = carry;     // re apply carry so no segment of the new 8 is lost
            spawnDelay = 0.1;  // brief pause signaling the new shape
        }
    }
    // ==============================
    // Level 4: Advanced Bounce
    // Part of: Movement logic
    // ==============================
    else if (level === 4) {
        // Random direction reversal but only when it's meaningful
        // Disabled entirely in meditation mode (slow, effortless glide)
        // Otherwise: target must have traveled a minimum distance (speed independent)
        // AND the time cooldown must have elapsed.
        // Distance is the hard gate so low speeds don't trigger flips after only a tiny move
        if (!isMeditationMode) {
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
            let step = speedPercent * deltaTime;
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
            let step = speedPercent * deltaTime;
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
        const movementPx = speedPercent * deltaTime;
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
            // Hidden behind a pillar: brief pause, then start a crossing.
            // Clamp fromY against the current pillar span first, so a stale Y
            // (e.g. after a window resize shrank the pillar) can't leave the
            // target poking past the top/bottom edge while "hidden".
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
            // Crossing the gap from one pillar center to the other
            const spanPx = Math.abs(toCenter - fromCenter);
            const step = (currentSpeed * deltaTime) / Math.max(spanPx, 1);
            doorsState.progress += step;
            if (doorsState.progress >= 1) {
                // Arrived fully hidden behind the far pillar
                doorsState.progress = 1;
                doorsState.moving = false;
                doorsState.hideTimer = 0.4;
                doorsState.fromY = doorsState.toY;
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
                // Interpolate position across the gap with a smooth vertical drift
                // Horizontal: linear, vertical: ease so the path gently arcs
                const tt = doorsState.progress;
                const ease = 0.5 - 0.5 * Math.cos(tt * Math.PI); // smooth-ish
                pos.x = fromCenter + (toCenter - fromCenter) * tt;
                pos.y = doorsState.fromY + (doorsState.toY - doorsState.fromY) * ease;
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
        const offs = starState.offsets;

        // Advance progress, to stop the small inner legs from whipping past in a few frames,
        // each leg advances at a rate that makes shorter legs tak proportionally less time
        // blend speed with per leg minimum duration so inner legs stay readable
        const a = offs[starState.leg];
        const b = offs[starState.leg + 1];
        const from = (starState.dir === 1) ? a : b;
        const to   = (starState.dir === 1) ? b : a;
        const fromX = c.x + from.x, fromY = c.y + from.y;
        const toX = c.x + to.x, toY = c.y + to.y;
        const segLen = Math.hypot(toX - fromX, toY - fromY);

        // Effective traversal time: constant speed time, but clamped to a minimum
        // so short legs don't flash by, rate = 1 / time.
        const constSpeedTime = segLen / Math.max(currentSpeed, 1);
        const legTime = Math.max(constSpeedTime, STAR_MIN_LEG_TIME);
        starState.segProgress += deltaTime / legTime;

        // Carry leftover progress across boundaries so position never jumps
        while (starState.segProgress >= 1) {
            const overshoot = starState.segProgress - 1;
            starState.segProgress = overshoot;
            if (starState.dir === 1) {
                if (starState.leg < offs.length - 2) {
                    starState.leg += 1;
                } else {
                    starState.dir = -1;
                }
            } else {
                if (starState.leg > 0) {
                    starState.leg -= 1;
                } else {
                    starState.offsets = buildStarJourney();
                    starState.leg = 0;
                    starState.dir = 1;
                }
            }
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
        const metrics = ctx.measureText(readingUICode.text);
        const tw = metrics.width;
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
    // Calculate time since last frame (in seconds)
    let deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp; // always advance, so unpausing doesn't cause a time jump

    if (!isPaused) {
        // Update all timers (round, overlays, etc.)
        updateTimers(deltaTime);
        // Update game state (positions, logic, etc.)
        update(deltaTime);
        // Update breathing overlay timer (if enabled)
        updateBreathTimer(deltaTime);
    }
    // Always draw so the frame stays visible (frozen while paused)
    draw();
    drawBreathingOverlay();
    // Schedule the next animation frame
    requestAnimationFrame(loop);
}

// Start the game loop
requestAnimationFrame(loop);
