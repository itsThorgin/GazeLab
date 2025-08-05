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
let baseSpeeds = [1000, 1400, 350, 600, 600, 1800, 400, 200];

// Currently selected tier and sublevel (user selection state)
let selectedTier = "12";
let selectedSublevel = 1;

// Stores all calculated speeds for all levels/tiers
let allLevelSpeeds = [];


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

    // Update speedPercent for the current level (1-based)
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
// Re-size canvas whenever window size changes
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==============================
// Level and Meditation Initialization
// Part of: Level system, Meditation mode
// ==============================

// Current level, max level, and meditation levels
let level = 1;
const maxLevel = 8;
const meditationLevels = [1, 2, 6]; // 3 meditation mode specific levels
let meditationLevelIndex = 0;
$('levelDisplay').innerText = "Level " + level;

// Meditation mode configuration
const meditationSpeeds = [75, 75, 0, 0, 0, 75, 0, 0];
let meditationSpeedsScaled = [...meditationSpeeds]; // Holds scaled values for current resolution
let isMeditationMode = false;
let savedSpeeds = [];
let savedColors = {};
let savedAutoSwitch = false;
let savedSizePercent = 50;
let savedRoundDuration = 30;

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
    // Only blocks 'm' keyif a text field or textarea is focused
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

  // Normal behavior (non-meditation mode)
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
let breathPhase = 'inhale'; // Current breathing phase
let breathTimer = 0;        // Timer for current phase
const inhaleDuration = 4;   // Duration of inhale phase
const exhaleDuration = 6;   // Duration of exhale phase

// ----------------------------------
// Updates the breathing timer and switches phases
// Part of: Meditation mode, Overlay
// ----------------------------------
function updateBreathTimer(deltaTime) {
    breathTimer += deltaTime;
    if (breathPhase === 'inhale' && breathTimer >= inhaleDuration) {
        breathPhase = 'exhale';
        breathTimer = 0;
    } else if (breathPhase === 'exhale' && breathTimer >= exhaleDuration) {
        breathPhase = 'inhale';
        breathTimer = 0;
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
    let progress;
    if (breathPhase === 'inhale') {
        progress = breathTimer / inhaleDuration;
    } else {
        progress = breathTimer / exhaleDuration;
    }

    let radius;
    if (breathPhase === 'inhale') {
        // Inhale: grows from small to large
        radius = 200 + 225 * progress;
    } else {
        // Exhale: shrinks from large to small
        radius = 200 + 225 * (1 - progress);
    }
    // Handle opacity for inhale and exhale
    let opacity;
    if (breathPhase === 'inhale') {
        // Inhale: lightens in the last 25%
        if (progress > 0.75) {
            opacity = 0.2 + 0.15 * ((progress - 0.75) / 0.25);
        } else {
            opacity = 0.2;
        }
    } else {
        // Exhale: lightens in the last 25%
        if (progress < 0.75) {
            opacity = 0.3;
        } else {
            opacity = 0.3 - 0.175 * ((progress - 0.75) / 0.25);
        }
    }
    const color = breathPhase === 'inhale' ? '#ffd9aa' : '#552f00';

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
    ctx.fillText(breathPhase === 'inhale' ? 'Inhale...' : 'Exhale...', centerX, centerY + 8);
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
let fig8T = 0; // Figure eight animation parameter
let fig8Offset = 0; // Offset for figure eight phase
const fig8Offsets = [ -Math.PI/4, Math.PI/4, 3*Math.PI/4, -3*Math.PI/4 ]; // Possible offsets
let fig8Scale = 1; // Scaling factor for figure eight
let fig8Mirror = 1; // Mirror direction for figure eight
    
let spawnDelay = 0; // Delay before respawning in figure eight levels

// Randomize figure eight parameters
function resetFig8() {
    fig8T = 0;
    fig8Offset = fig8Offsets[Math.floor(Math.random() * fig8Offsets.length)];
    fig8Scale = 0.85 + Math.random() * 0.3;
    fig8Mirror = (Math.random() < 0.5) ? 1 : -1;
    spawnDelay = 0.2;
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
function formatTimeMS(seconds) {
    let mins = Math.floor(seconds / 60);
    let secs = Math.floor(seconds % 60);
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
    roundTimeRemaining -= deltaTime;

    // End of round handling
    if (roundTimeRemaining <= 0) {
        // flash overlay if not disabled
        if (!document.getElementById('disableFlashToggle').checked) {
            flashTimeRemaining = 1.0;
        }
        // Reset round timer
        roundTimeRemaining = roundDuration;
        // Auto-advance to next level if enabled
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
// Sets up level 1 (horizontal movement)
function setupLevel1() {
    direction = 1; // Start moving right
    pos.x = ballRadius; // Start at the left edge
    pos.y = Math.random() * (canvas.height - 2 * ballRadius) + ballRadius; // Random vertical position
}

// Sets up level 2 (vertical movement)
function setupLevel2() {
    direction = 1; // Start moving down
    pos.y = ballRadius; // Start at the top edge
    pos.x = Math.random() * (canvas.width - 2 * ballRadius) + ballRadius; // Random horizontal position
}

// Sets up level 3 (spiral movement)
function setupLevel3() {
    spiralScale = 0.85 + Math.random() * 0.3; // Randomize spiral size
    spiralProgress = 0; // Reset spiral progress
    spiralForward = true; // Start spiral forward

    spiralRotation = Math.random() * 2 * Math.PI;
    spawnDelay = 0.2;
    }

// Sets up level 4 (figure eight movement)
// Calls resetFig8 for randomization
function setupLevel4() {
    resetFig8();
}

// Sets up level 5 (figure eight movement, alternate)
// Calls resetFig8 for randomization
function setupLevel5() {
    resetFig8();
}

// Sets up level 6 (bouncing ball)
// Randomizes position and velocity for bouncing movement
function setupLevel6() {
    pos.x = Math.random() * canvas.width;
    pos.y = Math.random() * canvas.height;
    let angle = Math.random() * 2 * Math.PI;
    vel.x = baseSpeed * Math.cos(angle);
    vel.y = baseSpeed * Math.sin(angle);
}

// Sets up level 7 (clock movement)
// Ball starts at the center and sets a random clock hand target
// Tracks last hour and repeat count
defaultLastHour7 = 0; // fallback for first run
let lastHour7 = null;
let repeatHour7Count = 0;

function setupLevel7() {
    let center = { x: canvas.width / 2, y: canvas.height / 2 };
    let maxDistance = Math.min(center.x, center.y) - ballRadius;
    pos.x = canvas.width / 2;
    pos.y = canvas.height / 2;
    let hour;
    // Limit repeats to at most 2
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

// Sets up level 8 (peek movement)
// Initializes the peek state with random direction, distance, and vertical offset
function setupLevel8() {
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

    // Start position in the center with vertical offset
    pos.x = canvas.width / 2;
    pos.y = canvas.height / 2 + peekState.heightOffset;
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
    8: setupLevel8
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
// Meditation Mode Toggle
// Part of: Meditation mode, State management
// ==============================
// on/off, saving and restoring key state
// Updates UI, breathing timer, and restores previous settings when exiting
function toggleMeditationMode() {

    // Reset breathing overlay state when toggling meditation mode
    breathPhase = 'inhale';
    breathTimer = 0;
    const btn = $('meditationToggle');
    isMeditationMode = !isMeditationMode;

    // Show/hide advanced level rows for meditation mode
    const allLevelRows = document.querySelectorAll('.level-speed-row');
    allLevelRows.forEach((row, idx) => {
      // Only show rows for levels 1, 2, 6 in meditation mode
      if (isMeditationMode) {
        if ([0, 1, 5].includes(idx)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      } else {
        row.style.display = '';
      }
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

        // Apply meditation specific settings:
        // fixed speeds & colors, fixed size and duration
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
        $('roundDuration').value = 60;

        // Update internal state variables to match meditation settings
        ballColor = $('ballColor').value;
        dotColor = $('dotColor').value;
        backgroundColor = $('bgColor').value;
        flashColor = $('flashColor').value;
        document.body.style.backgroundColor = backgroundColor;
        sizePercent = 100;
        ballRadius = baseBallRadius * (sizePercent / 100);
        roundDuration = 60;
        
        // Check current level if its valid for meditation mode
        if (!meditationLevels.includes(level)) {
            level = meditationLevels[0];
            meditationLevelIndex = 0;
            document.getElementById('levelDisplay').innerText = "Level " + level;
        }

        // Starts meditation round
        resetLevel(); // sets timer, speed, etc.
    } else {
        // Exiting -> un-highlight button and restore label
        btn.classList.remove('active');
        btn.textContent = "Enter Meditation Mode";

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

        // Update internal state variables to match restored settings
        ballColor = $('ballColor').value;
        dotColor = $('dotColor').value;
        backgroundColor = $('bgColor').value;
        flashColor = $('flashColor').value;
        document.body.style.backgroundColor = backgroundColor;
        sizePercent = savedSizePercent;
        ballRadius = baseBallRadius * (sizePercent / 100);
        roundDuration = savedRoundDuration;

        // Start normal round with restored settings
        resetLevel();
    }

    // Sync speed and UI with current level
    speedPercent = levelSpeeds[level - 1];
    $('speedInput').value = speedPercent;
}

// ==============================
// Update & Draw Functions
// Part of: Main game loop, movement logic
// ==============================
// Updates the position and state of the ball based on the current level and game state
function update(deltaTime) {
    // Keep ball radius in sync with sizePercent (UI)
    ballRadius = baseBallRadius * (sizePercent / 100);

    // Handle spawn delay for spiral and advanced levels
    // level 3/4/5 spawn logic
    if ((level === 3 || level === 4 || level === 5) && spawnDelay > 0) {
        spawnDelay -= deltaTime;
        return; // Waits for spawn delay before updating position
    }
    
    // Get the current movement speed (can be affected by level or mode)
    let currentSpeed = speedPercent;
    
    // ==============================
    // Level 1: Horizontal Movement
    // Part of: Movement logic
    // ==============================
    if (level === 1) {
        // Move horizontally based on direction
        pos.x += currentSpeed * deltaTime * direction;
        // Check for collision with right edge
        if (direction === 1 && pos.x + ballRadius >= canvas.width) {
            pos.x = canvas.width - ballRadius; // Clamp to right edge
            direction = -1; // Reverse direction
            // Randomly shift Y position to make movement less predictable
            let margin = 30;
            let sign = (pos.y <= ballRadius + margin)
                ? 1
                : (pos.y >= canvas.height - ballRadius - margin)
                ? -1
                : (Math.random() < 0.5 ? -1 : 1);
            let shift = ((Math.random() * (0.25 - 0.10) + 0.10) * canvas.height) * sign;
            pos.y += shift;
            pos.y = Math.max(ballRadius, Math.min(canvas.height - ballRadius, pos.y));
        } else if (direction === -1 && pos.x - ballRadius <= 0) {
            // Check for collision with left edge
            pos.x = ballRadius; // Clamp to left edge
            direction = 1; // Reverse direction
            // Randomly shift Y position to make movement less predictable
            let margin = 30;
            let sign = (pos.y <= ballRadius + margin)
                ? 1
                : (pos.y >= canvas.height - ballRadius - margin)
                ? -1
                : (Math.random() < 0.5 ? -1 : 1);
            let shift = ((Math.random() * (0.25 - 0.10) + 0.10) * canvas.height) * sign;
            pos.y += shift;
            pos.y = Math.max(ballRadius, Math.min(canvas.height - ballRadius, pos.y));
        }
    }
    // ==============================
    // Level 2: Vertical Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 2) {
        // Move vertically based on direction
        pos.y += currentSpeed * deltaTime * direction;
        // Check for collision with bottom edge
        if (direction === 1 && pos.y + ballRadius >= canvas.height) {
            pos.y = canvas.height - ballRadius; // Clamp to bottom edge
            direction = -1; // Reverse direction
            // Randomly shift X position to make movement less predictable
            let margin = 30;
            let sign = (pos.x <= ballRadius + margin)
                ? 1
                : (pos.x >= canvas.width - ballRadius - margin)
                ? -1
                : (Math.random() < 0.5 ? -1 : 1);
            let shift = ((Math.random() * (0.25 - 0.10) + 0.10) * canvas.width) * sign;
            pos.x += shift;
            pos.x = Math.max(ballRadius, Math.min(canvas.width - ballRadius, pos.x));
        } else if (direction === -1 && pos.y - ballRadius <= 0) {
            // Check for collision with top
            pos.y = ballRadius; // Clamp to top
            direction = 1; // Reverse direction
            // Randomly shift X position to make movement less predictable
            let margin = 30;
            let sign = (pos.x <= ballRadius + margin)
                ? 1
                : (pos.x >= canvas.width - ballRadius - margin)
                ? -1
                : (Math.random() < 0.5 ? -1 : 1);
            let shift = ((Math.random() * (0.25 - 0.10) + 0.10) * canvas.width) * sign;
            pos.x += shift;
            pos.x = Math.max(ballRadius, Math.min(canvas.width - ballRadius, pos.x));
        }
    }
    // ==============================
    // Level 3: Spiral Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 3) {
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
    // Level 4: Figure-8 Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 4) {
        // Calculate figure-8 parameters
        let A = (Math.min(canvas.width, canvas.height) / 4) * fig8Scale; // Amplitude
        let centerX = canvas.width / 2;
        let centerY = canvas.height / 2;
        let t = fig8T + fig8Offset; // Time offset for smooth looping
        // Figure-8 path (horizontal orientation)
        pos.x = centerX + A * Math.sin(t) * fig8Mirror;
        pos.y = centerY + (A / 2) * Math.sin(2 * t);
        // Advance along the path
        let tDelta = (currentSpeed / A) * deltaTime;
        fig8T += tDelta;
        // Loop and randomize after each full figure-8
        if (fig8T >= 2 * Math.PI) {
            resetFig8(); // Randomizes direction, offset, and scaling
            spawnDelay = 0.2; // Small pause between loops
        }
    }
    // ==============================
    // Level 5: Figure-8 Movement (vertical)
    // Part of: Movement logic
    // ==============================
    else if (level === 5) {
        // Calculate figure-8 parameters
        let A = (Math.min(canvas.width, canvas.height) / 4) * fig8Scale; // Amplitude
        let centerX = canvas.width / 2;
        let centerY = canvas.height / 2;
        let t = fig8T + fig8Offset; // Time offset for smooth looping
        // Figure-8 path (vertical orientation)
        pos.x = centerX + (A / 2) * Math.sin(2 * t) * fig8Mirror;
        pos.y = centerY + A * Math.sin(t);
        // Advance along the path
        let tDelta = (currentSpeed / A) * deltaTime;
        fig8T += tDelta;
        // Loop and randomize after each full figure-8
        if (fig8T >= 2 * Math.PI) {
            resetFig8(); // Randomizes direction, offset, and scaling
            spawnDelay = 0.2; // Small pause between loops
        }
    }
    // ==============================
    // Level 6: Advanced Bounce
    // Part of: Movement logic
    // ==============================
    else if (level === 6) {
        // Move according to velocity vector (bouncing logic)
        pos.x += (vel.x / baseSpeed) * currentSpeed * deltaTime;
        pos.y += (vel.y / baseSpeed) * currentSpeed * deltaTime;
        
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
    // Level 7: Clock Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 7) {
        // Calculate center and max distance for clock hand
        let center = { x: canvas.width / 2, y: canvas.height / 2 };
        let maxDistance = Math.min(center.x, center.y) - ballRadius;
        // Initialize clock state if not set
        if (!clockState) {
            let hour = Math.floor(Math.random() * 12); // Pick a random hour
            let angle = (hour * Math.PI / 6) - Math.PI/2; // Convert to angle
            let factor = 0.25 + Math.random() * 0.75; // Randomize hand length
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
                        newDistance = (0.25 + Math.random() * 0.75) * maxDistance;
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
                    newDistance = (0.25 + Math.random() * 0.75) * maxDistance;
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
    // Level 8: Peek Movement
    // Part of: Movement logic
    // ==============================
    else if (level === 8) {
        // Ensuring peek state is initialized
        if (!peekState) return;

        // Determine movement direction based on phase
        const direction = peekState.phase === "outgoing" ? 1 : -1;

        // Move peek target by updating progress
        // Movement in pixels per frame
        const movementPx = speedPercent * deltaTime;
        peekState.progress += direction * movementPx / peekState.maxOffset;

        // Clamp progress between 0 and 1
        peekState.progress = Math.max(0, Math.min(1, peekState.progress));

        // Calculate the actual X position based on progress and side
        const baseX = canvas.width / 2;
        const sideFactor = peekState.side === "left" ? -1 : 1;
        const offsetX = peekState.maxOffset * peekState.progress * sideFactor;
        pos.x = baseX + offsetX;
        pos.y = canvas.height / 2 + peekState.heightOffset;

        // Handle direction change or reset for next peek
        if (peekState.phase === "outgoing" && peekState.progress >= 1) {
            peekState.phase = "returning"; // Start returning to center
        } else if (peekState.phase === "returning" && peekState.progress <= 0) {
            setupLevel8(); // Randomize next peek (side, offset, etc.)
        }
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
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ballRadius, 0, 2 * Math.PI);
    ctx.fillStyle = ballColor;
    ctx.fill();

    // Draw central dot inside the ball
    let dotRadius = Math.max(ballRadius * 0.4, 2); // never smaller than 2px
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

    // Draw pillar for level 8 (peek movement)
    if (level === 8) {
        const targetDiameter = ballRadius * 2;

        // Constrain the pillar based on target size
        const pillarWidth = Math.max(targetDiameter + 30, 80);  // ensure minimum width
        const pillarHeight = Math.max(targetDiameter + 30, 300); // ensure minimum height

        ctx.fillStyle = '#222';
        ctx.fillRect(
          canvas.width / 2 - pillarWidth / 2,
          canvas.height / 2 - pillarHeight / 2,
          pillarWidth,
          pillarHeight
        );
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
    lastTime = timestamp;
    // Update all timers (round, overlays, etc.)
    updateTimers(deltaTime);
    // Update game state (positions, logic, etc.)
    update(deltaTime);
    // Draw the current frame
    draw();
    // Update and draw breathing overlay (if enabled)
    updateBreathTimer(deltaTime);
    drawBreathingOverlay();
    // Schedule the next animation frame
    requestAnimationFrame(loop);
}

// Start the game loop
requestAnimationFrame(loop);
