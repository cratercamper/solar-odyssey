---
name: d-upstream-fixes
description: "Bugs found in the game's code while working with it. Each entry gives what a player sees, where it is in the code, why it happens, a suggested change and how to check it. Kept current: an entry is removed once the original game fixes the bug, and newly found bugs are added."
type: reference
---

# Bugs found in the game

Bugs we found in the game's code while working with it. Each entry says what a player sees, where it is in the code,
why it happens, a change that would fix it, how to check it, and how much it matters. The list is kept current: when
the original game fixes one of these bugs, its entry is removed, and bugs found later are added.

Already fixed in the original game, and so not listed: the rival rovers that jumped back when the quality level
changed, and "Best so far: 1 stars" (both in #106, `a41f635`).

Checked against the original game's `main` at commit `a41f635` (#106). File and line references are to that commit.
The diff below applies to it with `git apply`, and with it applied `tsc --noEmit` passes. Comments in the suggested
code are in Japanese, like the rest of the game's code.

The checks were run in Chromium (on the GPU) at `d0ef578`, the commit before #106, and showed what their entries say;
the change in the sound entry did what it says there. #106 changed `Rally.tsx` only where the rivals are rebuilt. The
race clock check runs in the browser's console with `#debug` in the address, for example `http://localhost:5173/#debug`
on the dev server (`npm run dev`): when the page loads with it, `src/main.tsx:10` loads `src/debugHooks.ts`, which puts
the game's stores on `window.__sv` (adding `#debug` to a page already open does nothing until it is reloaded). The
sound check imports a module from `/src/…`, so it needs the dev server.

## On a slow machine, race times are longer than the drive (intended?)

This one may be intended, so it is a question rather than a bug report.

**What a player sees.** Below 20 frames per second a rover race runs in slow motion, while its clock runs in real time.
At 10 fps each frame moves the race on by 0.05 s and the clock by 0.1 s, so the same drive shows twice its time. That
time is the result, the best time and the hiscore entry, next to the records that come with the game
(`src/data/rallyRecords.ts`). The gold ghost replays by the same clock, so a ghost recorded at full speed
pulls ahead.

**Where.** Each frame's step is capped at 0.05 s: `const dt = Math.min(rawDt, 0.05)`
(`src/components/surface/Rally.tsx:730`; the player's rover the same, `src/components/surface/Rover.tsx:797`). The race
time is wall time: `const now = rallyNow()` (`Rally.tsx:743`), `r.start = now` when the race starts (:750),
`t = now - r.start` (:755), with `rallyNow = () => performance.now() / 1000` (`src/state/rally.ts:88`). `t` is the
split at each gate (:774), the time at which a rival finishes (:571, in `stepBots`, called at :789), the race panel's
time (:817), and in
`finish` (:822-838) the result, the best time and the hiscore entry. The ghost reads the race time from the same clock
(`src/components/surface/RallyGhost.tsx:130`, :144).

**Why.** The cap keeps each step small when frames are long; the clock does not follow the cap.

**Is it intended?** It may be: the clock then shows how long the player spent. If the shown time should be the time
driven, the race could keep its own clock: add the capped `dt` to it on each frame while `t` runs (in the race and,
as now, after the finish: :755), and use it for `t` in place of `now - r.start`. Everything listed above that takes
`t` then follows it. The ghost would read the same clock. The countdown can stay on the wall clock.

**How to check.** Open or reload the page with `#debug`; during a rover race, paste into the console. For 10 s it adds
up the time the game stepped (each frame's time, capped at 0.05 s as in `Rally.tsx:730`) and compares it with the race
clock:

```js
const rs = __sv.rally.state, t0 = rs.getState().time
let sim = 0, last = performance.now()
const end = last + 10000
requestAnimationFrame(function tick(now) {
  sim += Math.min(Math.max(0, now - last) / 1000, 0.05)
  last = now
  if (now < end) requestAnimationFrame(tick)
  else console.log('race clock', (rs.getState().time - t0).toFixed(1), 's; stepped', sim.toFixed(1), 's; fps', __sv.quality.getState().fps)
})
```

At 60 fps the two agree to within a few tenths of a second (the race panel's time is updated about every 0.1 s). To
see it below 20 fps, first set the quality to a fixed level in the settings (with Auto, slow frames also make it step
down), then slow the page down, for example with the CPU throttling in the Performance panel of Chrome's DevTools (on
a fast machine ×20 may be needed). Measured at `d0ef578`: at 60 fps, race clock 10.0 s, stepped 10.0 s; at about
8 fps, race clock 10.4 s, stepped 4.2 s (the snippet printed 7: its `fps` lags behind the real frame rate).

**How much it matters.** Only below 20 fps, and not at all if it is intended.

## Without Web Audio, missions and the ship race get stuck at their first sound

**What a player sees.** In a browser that has no `AudioContext`, each sound effect and the music throw an error instead
of staying silent (spoken lines use `speechSynthesis` and still work). Where a sound comes before a change of state,
the change does not happen: a mission does not move past the first step the player completes, and the ship race's
countdown stays on READY. The ship race and most kinds of mission step call the sound from a frame callback (beam and
deflect steps from a timer), so while they are stuck the 3D view stops drawing; the panels around it still update.
Shooting throws too (`src/components/Phaser.tsx:137`), and holding the button to charge throws on every frame
(`src/components/ChargeBeam.tsx:608`), so the view also stops drawing while it is held. Entering the bridge plays its
sound from an effect (`src/components/bridge/BridgeInterior.tsx:30`) outside the game's only error boundary
(`SFBoundary`, around `SFWorld`, `src/App.tsx:110`); R3F's own boundary in its `Canvas` passes the error on to the page,
so by our reading of the code the whole page may go blank there; we have not tried that one. A new stamp is still kept:
it is saved before its sound.

**Where.** `src/audio/sfx.ts:17-21`: `audio()` creates the context with `ctx ??= new AudioContext()` (:18), with no
check. Every sound calls `audio()`: `src/audio/sfx.ts` :90, :169, :189, :207, :230, :283, :302, :331;
`src/audio/bridge.ts:32`, :91; `src/audio/music.ts:22`, :58.
- Missions: `completeStep` beeps (`src/state/mission.ts:217`) before it changes the step (:219-231).
- The ship race: the countdown beeps (`src/components/race/Race.tsx:161`) before it counts down (:162-167).
- Stamps: `collectStamp` saves the stamp (`src/state/stamps.ts:87-88`), then `announce` (:94) beeps (:64-65).

**Why.** Where `AudioContext` is not defined, `new AudioContext()` throws a `ReferenceError`, and again at every call,
since `ctx` stays `null`. For several kinds of step `completeStep` is called from a `useFrame` callback
(`src/components/mission/MissionRunner.tsx:78`), as is the countdown (`Race.tsx:117`), so they throw again on every
frame. R3F 8 calls a canvas's frame callbacks before it draws it (`render$1` in `@react-three/fiber`), so on each such
frame the callbacks after the failing one and the drawing are skipped as well.

**Suggested change.** `audio()` returns `null` when there is no `AudioContext`, and says so once with
`console.error('ERROR: …')`; each caller returns early on `null`, and the two that return a handle (`startChargeHum`,
`beamHum`) return one that does nothing. The game then goes on without sound. Where `AudioContext` exists, nothing
changes.

<details><summary>The whole change (3 files, +27 −3)</summary>

```diff
diff --git a/src/audio/bridge.ts b/src/audio/bridge.ts
--- a/src/audio/bridge.ts
+++ b/src/audio/bridge.ts
@@ -30,6 +30,7 @@ function loopNoise(c: AudioContext) {
 export function setBridgeAmbience(on: boolean) {
   if (on === !!nodes) return
   const c = audio()
+  if (!c) return
   if (!on && nodes) {
     nodes.gain.gain.setTargetAtTime(0, c.currentTime, 0.4)
     const n = nodes
@@ -89,6 +90,7 @@ export function chirp(count = 2 + Math.floor(Math.random() * 3), loud = 1) {
   const v = volume() * CHIRP * loud
   if (v === 0) return
   const c = audio()
+  if (!c) return
   let at = c.currentTime + 0.02
   for (let i = 0; i < count; i++) {
     const o = c.createOscillator()
diff --git a/src/audio/music.ts b/src/audio/music.ts
--- a/src/audio/music.ts
+++ b/src/audio/music.ts
@@ -20,6 +20,7 @@ async function start() {
   if (started) return
   started = true
   const c = audio()
+  if (!c) return
   const ogg = new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== ''
   const url = `${import.meta.env.BASE_URL}music/bgm-loop.${ogg ? 'ogg' : 'mp3'}`
   try {
@@ -55,6 +56,8 @@ export function setupMusic() {
   useStore.subscribe((s, prev) => {
     if (s.settings === prev.settings) return
     if (s.settings.music && !started) void start()
-    if (gain) gain.gain.setTargetAtTime(level(), audio().currentTime, 0.2)
+    if (!gain) return
+    const c = audio()
+    if (c) gain.gain.setTargetAtTime(level(), c.currentTime, 0.2)
   })
 }
diff --git a/src/audio/sfx.ts b/src/audio/sfx.ts
--- a/src/audio/sfx.ts
+++ b/src/audio/sfx.ts
@@ -3,6 +3,8 @@
 import { useStore } from '../state/store'
 
 let ctx: AudioContext | null = null
+/** AudioContext が使えない（エラーは一度だけ出す） */
+let noAudio = false
 let master: GainNode | null = null
 /** すべての音（BGM・効果音・艦橋の音）が最後に通る出口。裏に回ったときはここで絞る */
 let bus: GainNode | null = null
@@ -14,8 +16,17 @@ let suspendTimer = 0
 const FADE_OUT = 0.4
 const FADE_IN = 0.8
 
-export function audio() {
-  ctx ??= new AudioContext()
+/** 音を鳴らす AudioContext。ないブラウザ（Web Audio を切ってあるなど）では null を返し、音なしで遊べるようにする */
+export function audio(): AudioContext | null {
+  if (!ctx) {
+    if (noAudio) return null
+    if (typeof AudioContext === 'undefined') {
+      noAudio = true
+      console.error('ERROR: AudioContext is not available; the game runs without sound')
+      return null
+    }
+    ctx = new AudioContext()
+  }
   if (ctx.state === 'suspended' && !away) void ctx.resume()
   return ctx
 }
@@ -88,6 +99,7 @@ function noiseBuffer(c: AudioContext, seconds: number) {
 /** ワープ：低いうなりが高まり、風切り音が抜けていく。seconds はワープ中の長さ */
 export function playWarp(chargeSeconds: number, seconds: number) {
   const c = audio()
+  if (!c) return
   const now = c.currentTime
   const jump = now + chargeSeconds
   const end = jump + seconds + 1
@@ -167,6 +179,7 @@ export function speak(text: string, opts: { rate?: number; pitch?: number } = {}
 /** ビーム：高めの音がすっと下がる */
 export function playBeam() {
   const c = audio()
+  if (!c) return
   const now = c.currentTime
   const osc = c.createOscillator()
   osc.type = 'sawtooth'
@@ -187,6 +200,7 @@ export function playBeam() {
 /** 爆発：低いノイズが広がって消える */
 export function playBlast() {
   const c = audio()
+  if (!c) return
   const now = c.currentTime
   const src = c.createBufferSource()
   src.buffer = noiseBuffer(c, 1.2)
@@ -205,6 +219,7 @@ export function playBlast() {
 /** 短い電子音（カウントダウンや輪の通過） */
 export function playBeep(freq: number, seconds = 0.18) {
   const c = audio()
+  if (!c) return
   const now = c.currentTime
   const osc = c.createOscillator()
   osc.type = 'sine'
@@ -228,6 +243,7 @@ export type ChargeHum = { setLevel: (level: number) => void; stop: () => void }
 /** 溜めのうなり：段階が上がるたびに音程が上がる。stop で短く消える */
 export function startChargeHum(): ChargeHum {
   const c = audio()
+  if (!c) return { setLevel: () => {}, stop: () => {} }
   const now = c.currentTime
   const low = c.createOscillator()
   low.type = 'sawtooth'
@@ -281,6 +297,7 @@ export function startChargeHum(): ChargeHum {
 /** 段階が上がった瞬間の、きらっとした短い音 */
 export function playChargeStep(level: number) {
   const c = audio()
+  if (!c) return
   const now = c.currentTime
   const base = 660 * 2 ** ((level - 1) * 4 / 12)
   ;[1, 1.5].forEach((ratio, i) => {
@@ -300,6 +317,7 @@ export function playChargeStep(level: number) {
 /** 発射：低い「ドン」。段階が高いほど低く重い */
 export function playChargeFire(level: number) {
   const c = audio()
+  if (!c) return
   const now = c.currentTime
   const osc = c.createOscillator()
   osc.type = 'sine'
@@ -329,6 +347,7 @@ export function playChargeFire(level: number) {
 /** ビームが出ているあいだのうなり。seconds たったらフェードアウトする。戻り値で途中でも止められる */
 export function beamHum(seconds: number, level: number) {
   const c = audio()
+  if (!c) return () => {}
   const now = c.currentTime
   const end = now + seconds + 0.45
   const a = c.createOscillator()
```

</details>

**How to check.** On the dev server, reload the page, and before the first click or key press in it (with music on,
the first one starts the music, and with it the audio context), in the console:

```js
delete window.AudioContext
const { playBeep } = await import('/src/audio/sfx.ts')
playBeep(880)
```

Now: `ReferenceError: AudioContext is not defined`. With the change: one `ERROR` line and no exception. If a sound has
already played, the context exists and nothing throws.

Measured at `d0ef578` in Chromium with `AudioContext` removed before the page's own scripts ran: about 60 uncaught
`ReferenceError`s per second while stuck; the ship race's countdown value stayed just above 3, so the panel kept showing
READY (`src/ui/RacePanel.tsx:11-12`); mission 0 stayed at its first
step; the 3D view's draw calls fell from 1440 to 0 per second while frames still ran; the Moon stamp was saved. With the
change: no exception, the countdown ran, the mission went on to its debrief, and the 3D view kept drawing.

**How much it matters.** Little: only in a browser without `AudioContext`, such as one with Web Audio turned off. An
old Safari lacks it too (it had only `webkitAudioContext` before 14.1, 14.5 on iOS), but cannot run the game anyway:
WebGL 2 came in Safari 15, and the game's three.js (0.186) draws only with WebGL 2, so its 3D view cannot start there.

---
Written by cratercamper and Claude Code.
