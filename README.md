# GazeLab

GazeLab is a visual tracking trainer for FPS players who want their eyes to stop abandoning the target at the exact moment things become interesting.

Follow the target through nine movement levels using only your eyes. No clicking, scoring, graphs, ranking system, battle pass, or suspiciously expensive cosmetic target skins.

The goal is simple: keep your gaze on the center dot and remain aware of exactly how the target is moving, even when it becomes fast, unpredictable or mildly disrespectful.

You've probably said it before:

> “That was a headshot.”

The game disagreed.

Maybe the server was wrong. Maybe the hitbox was wrong. Maybe your gaze was three pixels away from where you thought it was. GazeLab cannot fix the server, but it can help with the third possibility.

## Before You Start

Do not force your eyes.

Let them follow the target naturally and use as little effort as possible. The center dot should remain sharp and clearly visible, especially at slower speeds.

Your useful training speed is around the point where:

- You can still track the center dot accurately
- Your vision remains relaxed
- The next faster speed begins to challenge that clarity

Higher speed practice can produce some blur, but the target should not become an unidentified flying smudge.

Also, do not lie to yourself. Are you actually looking at the center dot for the entire movement or are you admiring the general area around it?

## What GazeLab Trains

### Smooth pursuit

Following continuous movement trains your eyes to remain attached to a moving target instead of repeatedly losing it and catching up.

### Movement awareness

The nine levels represent common movement ideas found in FPS games: strafing, bouncing, peeking, curved crossings, orbiting, direction changes, short adjustments and some complex paths.

The levels provide the movement. You decide how fast the suffering should be.

### Fast visual tracking

At higher speeds the goal is not to stare harder. It is to remain relaxed while still understanding the target's direction, path and changes.

### Slow visual tracking

Slow speeds are equally useful. They expose tiny losses of focus that fast movement can conveniently hide.

### Meditation

Meditation Mode combines slow movement with a breathing guide for winding down after training, gaming, work or reading patch notes written by someone who clearly hates making them.

## Controls

- Press **M** to open or close the menu
- Press **Space** to pause or resume
- Press **←** or **→** to change levels

## The Menu

The menu is divided into three sections:

### Display & Effects

- **Automatic display scaling:** Uses Full HD as the reference and scales movement speeds for FHD, QHD, 4K, ultrawide and other display resolutions
- **Monitor switching:** Moving the browser to a display with a different native resolution updates the effective and displayed speeds
- **Window resizing:** Changes the available movement area but does not change the calibrated speed
- **Color customization:** Target, center dot, background, and level change flash colors
- **Adaptive color cycling:** Optionally switches between 20 muted dark backgrounds and 20 curated target/dot pairs every 3-10 seconds - cycling pauses during Meditation Mode
- **Live preview:** Shows the current target size and colors before you commit to something visually criminal
- **Flash control:** Enable or disable the flash between levels
- **Automatic level switching:** Move to the next level when round ends
- **Overlays:** Hashtag, vertical stripes, horizontal stripes and solid stripes
- **3D Depth Simulation:** Changes the apparent target depth. It is still a flat screen, but we can pretend
- **Reading UI Codes:** Displays short codes in changing screen positions for practicing quick visual shifts away from and back to the target, like checking ammo, minimap, chat, etc. 
- **Meditation Box Breathing:** Enables the alternate box breathing pattern (4-4-4-4) and hold animations

### Training Speeds & Profiles

- **Tier and sublevel selection:** 16 tiers with 10 sublevels each
- **Advanced Level Speeds:** Direct control over the speed of every level
- **Individual resets:** Restore any level to its default speed
- **Collapsible profile manager:** Save complete training configurations locally

### Session & Level

- **Speed adjustment increment:** Choose 0.5%, 1%, 2.5%, or 5% changes
- **Current level speed:** Enter a speed directly or use the minus and plus buttons
- **Target size:** Adjustable from 15% to 200%
- **Level navigation:** Previous and Next controls with the current level displayed above them
- **Round duration:** Set the duration in seconds and confirm it with Enter
- **Elapsed Time:** Total active session time
- **Round Time:** Time remaining in the current round
- **FPS:** A lightweight estimate of the browser's current animation rate

## Display Speed and FPS

GazeLab does not limit animation to 60 FPS. Movement uses the browser's native animation timing, allowing high refresh displays to update more frequently when the browser and system permit it.

The FPS monitor samples frames in small batches instead of aggressively updating the menu every frame. It therefore provides useful information without starting a second career as a benchmark utility.

Speeds are calibrated against a 1920 x 1080 reference:

- A reference speed of 1000 px/s remains 1000 px/s on Full HD
- The equivalent displayed speed becomes approximately 2000 px/s on a 4K display
- Full screen travel therefore takes roughly the same amount of time on both displays
- Resizing the browser does not recalculate the speed

GazeLab only cares about display resolution here. It does not attempt to estimate monitor size, viewing distance, posture, chair quality or whether you are sitting like a shrimp.

## Timing and Hidden Tabs

GazeLab continues running when its window is visible but not focused, which is useful on multi monitor setups.

Movement and timers pause when the page becomes hidden, such as when:

- The browser is minimized
- You switch to another tab in the same browser window

When the page becomes visible again, the session continues from where it stopped.

Large time jumps are limited so the target does not teleport across the screen after temporary browser or system delay.

## The Nine Levels

The default round duration is 30 seconds, making one complete cycle approximately 4.5 minutes.

Three cycles take roughly 14 minutes - that's what I do. This is a suggestion, not a legally binding eye contract.

### 1. Axis

Horizontal and vertical movement combined into one level. The target bounces several times along one axis before switching to the other, with randomized offsets and starting positions.

### 2. Spiral

Randomized spirals ranging from approximately 1.25 to 2 rotations.

The target moves inward and outward at a constant path speed. The center is shaped to avoid tight snapping and each new spiral can change its size, rotation and direction.

### 3. Figure Eight

A figure eight path with constant movement speed.

Each figure eight can use a different size, rotation, direction and starting position.

### 4. Bounce

The target bounces around the screen at changing angles.

It can reverse unexpectedly, bounce directly backward or choose a new direction.

### 5. Clock Hands

The target moves outward and back along randomized clock hand directions.

Lengths, directions and occasional repeated movements simulate short strafes and rapid direction changes.

### 6. Peek

The target appears from behind cover at different heights and from different sides.

Peeks can be wide or extremely small fake peeks where only part of the target becomes visible before it hides again. The cover position also wanders gradually so you cannot stare at one fixed location forever.

### 7. Orbit

The target follows a circular path whose center moves around the screen.

Orbit size, direction and duration are randomized before the next version appears.

### 8. Door Peek

Two moving pillars create a changing doorway.

The target hides behind one side, crosses to the other along a curved path at a constant speed and disappears behind cover again.

Dust2 sends its regards.

### 9. Recursive Star

The target moves through three part nested swings and then reverses.

The whole structure also drifts around the screen.

## Meditation Mode

Meditation Mode replaces the normal levels with a dedicated calm movement pattern.

- Continuous wandering motion
- Constant, deliberately slow travel speed
- Five minute default duration, which can still be edited
- Pastel night color theme
- A feathered breathing guide behind the target
- 4 second inhale and 6 second exhale rhythm
- Optional box breathing (4-4-4-4 seconds)
- **Restart** and **Exit** controls on the completion screen

The purpose is simply to settle down and follow something calm for a while.

## ABC Mode

ABC Mode is a separate visual exercise and playground.

The target traces a plus sign and complete alphabet from A to Z.

Each symbol is traced forward and backward before continuing to its mirrored version.

ABC Mode runs continuously without a round timer.

The letters are slightly scuffed. They are legible-ish. It is what it is.

## Local Profiles

Profiles can store:

- All nine reference speeds
- Selected tier and sublevel
- Current level
- Speed adjustment increment
- Target size
- Round duration
- Target, dot, background, and flash colors
- Every menu checkbox

Profile speeds are stored as Full HD reference values. Loading the same profile on a different resolution monitor preserves the intended calibrated behavior.

Profiles can be:

- Created
- Updated by saving with the same name
- Loaded
- Deleted individually
- Cleared together with other GazeLab local data

Save and Load are disabled inside Meditation and ABC modes so temporary mode settings do not accidentally overwrite a normal training profile.

## Privacy

Profiles are local and remain inside the current browser.

**Delete Profile** removes only the selected saved profile. It does not change the settings currently active on screen or remove other profiles.

**Clear All Local Data** removes GazeLab local storage.

Destructive actions pops a confirmation dialog.

## Does It Work?

- It works for me.
- It works for some other people.
- It may work for you if you practice consistently and do not bullshit yourself... I have to repeat this, do not bullshit yourself about the accuracy of your eyes.

GazeLab is supplementary training.

Actual gameplay, positioning, communication, decision making, reviewing mistakes, learning maps and understanding the current meta still matter more. Unfortunately, there is no checkbox for game sense..

## Medical Disclaimer

GazeLab is not medical advice, diagnosis or treatment.

I am not a doctor, optometrist, therapist or other licensed healthcare professional.

- Do not strain your eyes.
- Stop if you experience discomfort, dizziness, nausea, headaches or eye pain.
- Speak with a qualified healthcare professional if you have concerns about your eyesight or whether this kind of exercise is suitable for you.
- If an eye care professional gave you specific exercises, follow their instructions rather than a sarcastic README on GitHub.

Use GazeLab at your own risk.

Enjoy.

## 1 Minute Mug Brownie

### Ingredients

- 2 tbsp butter
- 2 tbsp sugar
- 1 tbsp cocoa powder
- 2 tbsp flour
- 1 tbsp milk
- Pinch of salt
- Small handful of chocolate chips

### Instructions

1. Melt the butter in a mug for approximately 20 seconds.
2. Stir in the sugar, cocoa powder, flour, salt and milk until smooth.
3. Mix in the chocolate chips.
4. Microwave for 45-60 seconds.
5. Stop when the top looks set but remains slightly soft.
6. Let it sit for approximately one minute.

Add vanilla ice cream if available.

git gud
