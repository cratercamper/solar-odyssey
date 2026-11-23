---
name: d-upstream-fixes
description: "Bugs found in the game, while playing it or while working with its code. Each entry gives what a player sees, where it is in the code, why it happens, a suggested change or a branch of this fork with a fix where there is one, how to check it, and where it works a console snippet that shows it. Kept current: an entry is removed once the original game fixes the bug, and newly found bugs are added. A suggestion, a player's or ours, is marked as one, and so is a to-do: a part that looks unfinished."
type: reference
---

# Bugs found in the game

Bugs we found in the game, while playing it or while working with its code. Each entry says what a player sees, where
it is in the code, why it happens, a change that would fix it where we have one, how to check it, and how much it
matters. The list is kept current: when the original game fixes one of these bugs, its entry is removed, and bugs
found later are added. Some entries are not bugs, and say so in their title: **a suggestion**, an idea for the
game, from a player or from Claude Code, and **a to-do**, a part that looks unfinished, listed in case it helps.

**How these bugs were found.** Most entries were seen by cratercamper while playing the game. Claude Code then found
the cause in the code, and for some of them measured it in the game, in headless Chromium. A few were found by Claude
Code alone, while measuring other bugs. Each entry says who found the bug, whether a person has seen it in play, and
its severity. The severities are our estimates, on this scale: **high**, makes normal play worse for most players;
**medium**, makes one part of the game worse on common machines; **low**, rare or cosmetic.

**Checked against** the original game's `main` at commit `642a0ec` (#213). File and line numbers are at that commit,
except in the section on scene 9/9 of the Moon mission, which gives them at `936d242` (#219). Where an entry gives a
measurement made on another commit, it names the commit, and the code involved is the same at the commit of its line
numbers. Paths: `FlightView.tsx`, `FlightPanel.tsx` and `flightControl.ts` are in `src/components/flight/`;
`ReturnWorld.tsx` and `returnSea.ts` in `src/components/moonMission/`; `WalkActors.tsx`, `WalkAxis.tsx`,
`WalkWorld.tsx`, `WalkChunks.tsx`, `park.ts` and `cylinder.ts` in `src/components/walk/`; `ColonyModel.tsx`,
`ColonyInterior.tsx` and `colonyCity.ts` in `src/components/sf/`; `BridgeInterior.tsx` in `src/components/bridge/`;
`ShipModel.tsx` in `src/components/ship/`; `ProbeCamCanvas.tsx` in `src/components/probeCam/`; `SaturnRing.tsx` in
`src/components/`; `SizeCompare.tsx`, `sizeCompare.css`, `Hud.tsx`, `TouchBar.tsx`, `GalleryPanel.tsx` and
`ProbePanel.tsx` in `src/ui/`; the texts (`*.en.ts`, `*.ja.ts`) in `src/i18n/`.

**Fixes on branches of this fork.** Some entries name a branch `pr/<name>` of this fork with a fix, and its head
commit. The original game's `main` at `a923a3d` (#216) is merged into these branches. Where cratercamper has
played the fix, the entry says so.

**Show it.** Most entries have a snippet for the browser's console. Where an entry has none, or only steps to follow
by hand, we can write one when asked, unless the entry says why a snippet cannot show it. Open the game with `#debug`
at the end of the address (for example `…/?lang=en#debug`), open the browser's console, paste the snippet and press
Enter. A snippet uses only the game's `window.__sv` (`src/debugHooks.ts`) and the page's own elements (buttons, name
tags). It waits only for a limited time, and it returns a short message: what it did, what it measured, or why it
stopped. Each snippet here was run in headless Chromium with software rendering: the colony walk and bridge snippets
on `642a0ec`, the probe journey snippet on `a923a3d` (#216), the scene 9/9 snippet on `936d242` (#219), the others on
`25508aa` (#210), whose files for those parts are the same at `642a0ec`. Some move you or change a setting: reload the
page afterwards.

## Moon flight (✈ Fly over the Moon)

### A player's suggestion (not a bug): show the lander's pitch in the Moon flight

From cratercamper, after playing: show which way the lander is pointing, either as a horizon indicator or as a small 3D
picture of the lander at the edge of the screen. The pitch is what makes the lander climb or sink. Today the panel
shows the height, the speed, the lap and which way to turn (`FlightPanel.tsx`), but not the pitch. High up (40 km and
more) the camera is far behind the lander (about 1.8 km at 40 km), and the lander is less than a degree across on the
screen, so the player can only guess the pitch from how the height changes. The value is at hand: `ctl.pitch`, the
angle from the horizon (up to ±1.1 rad, `flightControl.ts:31`), and `Pilot` already sends the panel its numbers four
times a second (`FlightView.tsx:488-495`).

### A player's suggestion (not a bug): show the names of places on the Moon during the flight

From cratercamper, after playing: during the flight, show the names of mountains, craters, plains and other features
below, either in the main view or in a panel at the side of the screen with more about each. A combination cratercamper
finds interesting, in the style of System Shock 1: the description at the side, with a line leading from it to where the
place is in the 3D view. The game has no list of the Moon's named places yet. The IAU's Gazetteer of Planetary
Nomenclature, kept by the USGS (planetarynames.wr.usgs.gov), lists the Moon's named features with their positions and
sizes. A name tag in the 3D view has a precedent in the game: `src/components/moonMission/SaturnHotspots.tsx` places
labels with drei's `Html`.

## Moon mission ("Apollo 17: Journey to the Moon"), scene 9/9: the return to Earth

The last scene, 9/9 in the menu "Choose a scene", is "Lift-off, rendezvous and the return to Earth". The snippet
below starts it with `chapter(8)`, because the code counts the scenes from 0 (the launch pad is 0). The game's own
texts count chapters from 1, so their "chapter 8" is a different scene, Exploring the Moon.
Re-checked on `936d242` (#219), whose sea and sky are new: the line numbers in this section are at that commit, and
the snippet was run there. At `2d4c89d` (#221) every line this section cites is still there, word for word (read, not
run): in `ReturnWorld.tsx` at other line numbers, in `returnSea.ts` at the same ones.

### Moon mission: the glowing plasma does not follow the tilt of the heat shield

Seen in play by cratercamper; cause found by Claude Code. Severity: **low** (our estimate): cosmetic.

- **What a player sees:** during the entry, the glowing "lens" of plasma in front of the capsule stays in line with
  the flight path. The capsule flies tilted, so the lens does not sit on its heat shield: there is a gap between them.
- **Why:** the fireball, its bowl included, is aimed along the flight path (`ReturnWorld.tsx:622`), while the heat
  shield is tilted 22° (`TRIM`, :37) off it (:610-613). Measured on `936d242`: 22.00° between the fireball's aim and
  the capsule's axis, at 74 km and at 71 km.
- **Show it:** this snippet starts scene 9/9 (if it is not running), jumps to the entry and runs on to 75 km up. The
  other entries of this section use the same snippet, with other values in its line `const STEP = …`:

```js
(async () => {
  // STEP: 'corridor', 'entry' or 'chutes'. KM: in 'entry', run on
  // to this height in km (0 = stay at its start). CAM: null, or
  // 'chase', 'window', 'wide' (as the camera buttons do).
  const STEP = 'entry', KM = 75, CAM = null
  const sv = window.__sv
  if (!sv) return 'No window.__sv: load the page with #debug.'
  const mm = sv.moonMission.state, rs = sv.moonReturn
  const until = async (ok, ms) => {
    const end = performance.now() + ms
    while (performance.now() < end) {
      if (ok()) return true
      await new Promise((r) => setTimeout(r, 250))
    }
    return ok()
  }
  const home = () => mm.getState().phase === 'home'
  if (!home()) sv.moonMission.chapter(8)
  if (!(await until(home, 60000))) {
    return 'Gave up after 60 s: scene 9/9 did not start.'
  }
  if (!(await until(() => rs.sim.t > 0, 180000))) {
    return 'Gave up after 180 s: scene 9/9 is still loading.'
  }
  rs.start()
  rs.skip(STEP)
  for (let n = 0; n < 40000 && KM > 0; n++) {
    const e = rs.sim.e
    if (rs.state.getState().step !== 'entry') break
    if (!e || e.h <= KM * 1000) break
    rs.tick(0.05)
  }
  if (CAM) mm.setState({ cam: CAM, camLocked: true })
  const step = rs.state.getState().step, e = rs.sim.e
  const up = step === 'entry' && e
  const km = up ? ', ' + (e.h / 1000).toFixed(1) + ' km up' : ''
  return 'Scene 9/9, step ' + step + km
})()
```

### Moon mission: below 30 km the sea stands still while the clouds move on

Found by Claude Code in the code and measured in headless Chromium on `936d242`; not seen in play. An earlier form
of it, the clouds and the sea moving opposite ways, was seen in play by cratercamper and is fixed by #219. Severity:
**low** (our estimate): cosmetic.

- **What a player sees** (from the numbers below, not looked at frame by frame): the sea's pattern (its waves, glints,
  and calm and windy patches, `returnSea.ts:93`, :116-118) jumps once at 30 km and then stands still, while the clouds
  and their shadows keep moving with the ground the capsule covers.
- **Why:** the sea is moved by `range` (`uOffset`, `ReturnWorld.tsx:509`), and `range` is set only while the Earth's
  sphere is drawn (:415-417, :432), which ends below 30 km. The clouds follow the flight's own `e.range`
  (`cloudRun.range`, :518-519, :523, :528), with the same sign as the sea.
- **Measured** (separate runs): the sea's offset was −2,201,898 m at 30.0 km and 0 at 28.8 km; between 19.7 and
    18.5 km the clouds' offset went from −2,245,037 to −2,246,355 m while the sea's stayed 0. About 31 km of ground is
  still covered between 30 km and the drogue chutes at 7.3 km, in about 12 s of play (computed from the flight model,
  `src/data/reentry.ts`, with the autopilot that the snippet turns on).
- **Change** (not tried): move the sea by the same distance as the clouds, `cloudRun.range`; it is set at :518-519,
  after the sea's offset at :509, so it would have to be set first. At the splash that offset is about 2,230 km, where
  the shader's 32-bit floats step by 0.25 m, while the shortest waves are about 0.36 m long (`returnSea.ts:44`): seen
  from close, the small waves would break up, so the offset needs a nearer starting point.
- **Show it:** the snippet above with `STEP = 'entry', KM = 20`.

### Moon mission: the Earth turns about a tilted axis, so the ground moves 6.7° off the flight direction

Found by Claude Code in the code and measured in headless Chromium on `936d242`; not seen in play. Severity: **low**
(our estimate): cosmetic.

- **What a player sees** (not looked at in a frame): during the entry, until the sea takes over at 30 km, the ground
  under the capsule moves 6.7° sideways off the direction of flight; by 30 km the capsule is about 250 km to the side
  of the track the code aims for (computed). Before the entry, the Earth's swing on the approach (:444) turns about
  the same wrong axis.
- **Why:** in the code run each frame (`useFrame`, :371), `up` and `fwd` are the shared scratch vectors `_a` and `_b`
  (`ReturnWorld.tsx:436-437`). `earthOrient` writes into `_a` and `_b` for its own work (:76-77), so after the call at
  :438 both hold other values. The turn by the ground covered (:439) and the swing before the entry (:444) take their
  axis from them, and it comes out as `P_EI`, the entry point's direction in the Earth model (:68), used as if it were
  a direction in the scene: (−0.993, 0.001, 0.116) instead of (−1, 0, 0). The same reuse is in `642a0ec` (:365-366,
  :73-82).
- **Measured:** 0.22 s into "Hold the entry angle", the point under the capsule was at 73.52°N 113.47°E. A turn about
  the axis above gives the same point within 0.05°; the intended axis would give 68.43°N 107.59°E.
- **Change** (not tried): give `up` and `fwd` vectors of their own at :436-437 (for example `new THREE.Vector3()`
  held outside the frame), or compute the axis before calling `earthOrient`.
- **Show it:** the snippet above with `STEP = 'corridor'`.

## Colony walk

The walk inside the colony. To reach it, first set the World switch to SF (the button "SF FICTION"), then Play → "To the colony
axis (elevator)".

### Colony walk: your feet float a few cm over the elevator car's floor and the paving

Seen in play by cratercamper; cause found by Claude Code. Severity: **low** (our estimate): cosmetic.

- **What a player sees:** standing in the elevator car, your feet float about 6 cm above its floor. On the paving near
  the tower they float a few cm too.
- **Where and why:** every person is placed 0.06 m above the ground (`placePerson`, `WalkActors.tsx:35-39`;
  `GROUND_LIFT`, `park.ts:18`), to match the park's ground patch, which is lifted by the same amount
  (`WalkWorld.tsx:326`). Other surfaces are lower. The top of the car's floor plate is exactly at the ride's height
  (`WalkAxis.tsx:39`, :70, :99), so the feet float 6 cm there. The town's ground is drawn at half the lift, 0.03 m
  (`WalkChunks.tsx:242`), on flat pieces up to 20 m long (:231). The middle of such a piece lies about 1.25 cm inside the
  curve of the ground (its radius is about 3995 m), so the feet float 3.0-4.3 cm there (computed, not measured). The
  axis station's floor is probably the same as the car (6 cm); we have not checked it.
- **Measured** (on `642a0ec`, software rendering): with the snippet below, your feet were 0.06 m above the car's
  floor in every frame of the ride up (103 frames; the snippet stops after 60 s).
- **Change:** for the car: lift it by `GROUND_LIFT` (`WalkAxis.tsx:70`). For the rest, the feet would have to follow
  the surface under them: the park patch, the town, the bridges, the car, the station. Not done.
- **How to check:** rides up and measures, in every frame, how high your feet are drawn above the car's floor. By hand:
  stand in the car and look at your feet from the side, close up (mouse wheel).

```js
(async () => {
  // Rides the axis elevator up and measures, each frame, how high
  // your feet are drawn above the car's floor (minus = below it).
  const LIFT = 0.06 // GROUND_LIFT, park.ts
  const TY = 126 // TOWER.y, axis.ts
  const v = __sv.walk, w = v.walker, S = v.state.getState
  const z = (t) => new Promise((r) => setTimeout(r, t))
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  if (S().phase !== 'walk') {
    v.state.setState({ startAtTower: true })
    v.start()
  }
  for (let i = 0; i < 600; i++) {
    if (S().phase === 'walk' && !S().startAtTower) break
    await z(100)
  }
  if (S().phase !== 'walk') return 'The walk did not start in 60 s.'
  if (S().riding || S().inElev || S().wings) {
    return 'Get off the scooter, out of the lift, take wings off.'
  }
  Object.assign(w, { s: 0, y: TY + 5, h: 0 })
  await z(500)
  let plate = null
  v.debug.scene?.traverse((o) => {
    const p = o.geometry?.parameters
    if (p && p.width === 4.6 && p.height === 0.2) plate = o
  })
  if (!plate) return 'The car was not found in the scene.'
  const c = new __sv.THREE.Vector3()
  const r = (p) => Math.hypot(p.x, p.z)
  const gap = () => {
    plate.parent.getWorldPosition(c)
    return r(c) - r(w.pos) + LIFT
  }
  v.input.sit = true
  for (let i = 0; i < 30 && !S().inElev; i++) await z(100)
  if (!S().inElev) return 'Could not get into the car.'
  const t0 = performance.now()
  let lo = Infinity, hi = -Infinity, n = 0, first = null
  while (S().inElev && performance.now() - t0 < 60000) {
    await frame()
    const g = gap()
    if (first === null) first = g
    lo = Math.min(lo, g)
    hi = Math.max(hi, g)
    n++
  }
  const m = (x) => x.toFixed(2) + ' m'
  const end = S().inElev ? ' (stopped after 60 s; still riding)' : ''
  return 'Feet above the car floor, ' + n + ' frames: first '
    + m(first) + ', lowest ' + m(lo) + ', highest ' + m(hi) + end
})()
```

### Colony walk: a darker square around the player

Seen in play by cratercamper; cause read in the code by Claude Code, not measured. Severity: **low** (our estimate):
cosmetic.

- **What a player sees:** around the player there is a square, by eye about 0.5 km across (the code below gives
  1 km; the estimate by eye may be low). In it the houses are darker
  (bluer at night), and the park's grass is a darker yellow-green than the brighter green outside it.
- **Where and why** (our reading of the code): the square is the area that `WalkChunks.tsx` draws in detail: pieces
  of 200 m (`CH`, :18), 2 on each side of yours (`ringN()`, :22; 3 at quality High when memory is not low), so 1 km across (1.4 km at High),
  switched once all are built (:500-526). Inside it: the photo-textured ground (lawn colour `LAWN`, #4f8a38, :28) and
  3D houses, lit by the walk's lights. Outside: the space scene's coarse colony, its ground picture and box buildings
  (`colonyCity.ts`, with its own night value `uNight`, :282), whose far detail inside the square is hidden
  (`farHide`, `WalkChunks.tsx:526`; `colonyCity.ts:268`, :350). The file's header (:13-15) says that the coarse
  picture should turn into the fine one without a seam. The two do not match in colour or in their night look. The 60 m
  fade (`FADE`, :20) blends only the ground, not the houses.
- **Measured:** not yet (the colours on both sides of the edge, by day and by night, at each quality).
- **Change:** none suggested: matching the two pictures is a choice of look.
- **How to check:** this snippet puts you 1000 m above the town with wings, looking down: the houses in the middle of
  the picture are darker than those around them. By hand: in the park, look along a street at the houses.

```js
(async () => {
  // With wings, H m above the town near the port end, looking
  // down: the detailed area around you shows as a darker square.
  const H = 1000
  const v = __sv.walk, w = v.walker, S = v.state.getState
  const z = (t) => new Promise((r) => setTimeout(r, t))
  if (S().phase !== 'walk') {
    v.state.setState({ startAtTower: true })
    v.start()
  }
  for (let i = 0; i < 600; i++) {
    if (S().phase === 'walk' && !S().startAtTower) break
    await z(100)
  }
  if (S().phase !== 'walk') return 'The walk did not start in 60 s.'
  if (S().riding || S().inElev) {
    return 'Get off the scooter or out of the lift first.'
  }
  Object.assign(w, { s: 0, y: 140, h: 3969.95 })
  await z(500)
  if (!S().wings) v.input.wings = true
  for (let i = 0; i < 30 && !S().wings; i++) await z(100)
  if (!S().wings) return 'The wings did not go on.'
  Object.assign(w, { s: 0, y: 1200, h: H, turnTo: Math.PI })
  v.input.lookY = 1.1
  return 'With wings, ' + H + ' m above the town, looking down.'
})()
```

### Colony walk: the white viaduct and the rings around the cylinder are not solid

Seen in play by cratercamper; cause found by Claude Code in the code, with numbers computed, not measured. Severity:
**low** (our estimate).

- **What a player sees:** you pass through the white viaduct above the avenue, and through the rings that cross it
  and go around the whole cylinder.
- **Where and why:** both come from the space scene's colony model, drawn in the walk at full size
  (`WalkWorld.tsx:796-805`, `<ColonyModel interior>` scaled by 1/M). The walk's collision does not know them
  (`collide()`, `WalkActors.tsx:97-127`; `pushWorld`, `cylinder.ts:202`). The viaduct (`ColonyInterior.tsx:71-84`)
  runs in the middle of each land strip, from 1.2 % to 95 % of the colony's length: a deck 14 m wide and 3 m thick,
  about 9.5-12.5 m above the walk's ground, on pillars 4 × 4 m every 200 m. The rings (`ColonyModel.tsx:116`, :178,
  :194-196): 13 of them, every 2.67 km, each a torus of radius R × 1.01 = 4,040 m whose tube has a radius of 57.6 m.
  They look meant as hoops outside the hull, but the tube reaches in to 3,982 m from the axis, 12.6 m above the walk's
  ground. So from inside they are bands around the whole cylinder, at about the height of the viaduct.
- **Change:** none simple. Give the walk's collision the viaduct (deck and pillars) and the rings. For the rings, they
  could also stay outside the ground: a thinner tube or a larger radius, which changes the view from space, or hide
  them in the walk.
- **How to check:** by hand: walk to one of the viaduct's pillars and on into it.

### Colony walk: with wings, nothing stops you at the colony's end walls

Found by Claude Code while measuring the wings; not seen in play. Severity: **low** (our estimate): rare.

- **What a player sees:** flying with wings, more than 40 m below the axis station and more than 200 m above the
  ground, you can fly out through the end wall of the colony.
- **Where and why:** in wing flight only the station's end holds you back (`WalkActors.tsx:655`:
  `if (walker.h > STATION_H - 40) walker.y = Math.max(STATION.y0 + 0.5, walker.y)`), and the buildings' collision, which
  also keeps you inside the ground's ends, works only below 200 m (:657). Nothing else limits `walker.y`. The port end
  wall is the dome in `ColonyModel.tsx:111-114`; its deepest point is 960 m out from the ground's end (`CAP`, :19, =
  0.03 of the length).
- **Measured** (on `642a0ec`, software rendering, so the game ran slowly): with the snippet below, the flier passed
  the port end wall, to y = −1029 m and y = −970 m in two runs, about 1.9 km above the ground. At that height the wall
  stands at about y = −910 m (computed from `ColonyModel.tsx:111-114`).
- **Change:** none tried. The flier would need to be held inside the end walls at every height.
- **How to check:** with wings, 2 km above the ground and about 20 m inside the port end wall, flies at it with
  Shift+W. It stops once you are beyond y = −1000 m (the wall reaches out at most to y = −960 m), or after 120 s, and
  says where you are:

```js
(async () => {
  // With wings, 2 km above the ground, 20 m inside the port end wall,
  // flying at it (Shift+W). Stops beyond y = -1000 m, or after
  // 120 s. The wall reaches out at most to y = -960 m (CAP).
  const v = __sv.walk, w = v.walker, inp = v.input
  const S = v.state.getState
  const z = (t) => new Promise((r) => setTimeout(r, t))
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  if (S().phase !== 'walk') {
    v.state.setState({ startAtTower: true })
    v.start()
  }
  for (let i = 0; i < 600; i++) {
    if (S().phase === 'walk' && !S().startAtTower) break
    await z(100)
  }
  if (S().phase !== 'walk') return 'The walk did not start in 60 s.'
  if (S().riding || S().inElev) {
    return 'Get off the scooter or out of the lift first.'
  }
  Object.assign(w, { s: 0, y: 140, h: 3969.95 })
  await z(500)
  if (!S().wings) inp.wings = true
  for (let i = 0; i < 30 && !S().wings; i++) await z(100)
  if (!S().wings) return 'The wings did not go on.'
  Object.assign(w, { y: -900, h: 2000, turnTo: 0 })
  inp.fwd = 1
  inp.shift = true
  const t0 = performance.now()
  while (w.y > -1000 && performance.now() - t0 < 120000) {
    await frame()
  }
  inp.fwd = 0
  inp.shift = false
  const out = w.y <= -1000 ? '' : ' (stopped after 120 s)'
  return 'Now at y = ' + w.y.toFixed(0) + ' m, '
    + w.h.toFixed(0) + ' m above the ground' + out + '.'
})()
```

## Bridge

On the bridge of the default ship, the Solar Voyager ("Enter the bridge").

### Bridge: a part of the hull at the bottom of the front window has no texture

Seen in play by cratercamper; cause found by Claude Code by measuring. Severity: **low** (our estimate): cosmetic.

- **What a player sees:** on the bridge with plain glass ("Zoom ahead" off), the bottom of the front window shows a
  part of our own ship below us, in one flat colour, without texture.
- **Where and why:** it is the top of the saucer (`ShipModel.tsx:305`, profile `SAUCER` :44-48), seen 7.6-10.3 m away
  at a grazing 3-7.5°. There the texture's v is 0.98-1.0: the top of the lathe, where all rows of the map meet, so it
  reads as one flat colour. The room is sunk 0.44 m into this top: the top is 0.004 model units (2.44 m) above
  `BRIDGE_BASE` (:61, :277), and the room's floor is 2 m above it (`FLOOR_ABOVE_BASE`, `src/data/bridge.ts:24`). From
  outside, this part of the saucer lies under the bridge's raised structure, which covers it.
- **Measured** (on `7c276d7`): the distances and angles above, where the view from the bridge hits the hull.
- **Change:** not done, because it changes the look: in the bridge view, hide the part of the hull under the bridge's
  footprint, which is covered from outside anyway.
- **How to check:** captain's chair, plain glass, HUD hidden. The hull shows below the horizon line of the window:

```js
(() => {
  // The bridge, captain's chair, plain glass, HUD hidden. Look at
  // the bottom of the front window: a part of our own hull.
  const v = __sv, s = v.store.getState()
  v.race.getState().stop()
  v.setCamera(null)
  if (s.mode !== 'flight') s.setMode('flight')
  v.bridge.setState({
    viewpoint: 'captain', looking: false, viewscreen: false,
    labels: false, part: null,
  })
  s.setCameraMode('bridge')
  const html = document.documentElement
  if (!html.classList.contains('clean-screen')) {
    document.querySelector('button.clean-screen-button')?.click()
  }
  return "Captain's chair, plain glass. Shift+F12 brings the HUD back"
})()
```

### Bridge: at quality Light, space is cut off in a part of the windows

Found by Claude Code while measuring the bridge; not seen in play. Severity: **low** (our estimate): only at quality
Light, and only from some posts. Seen only with software rendering so far; not checked on a graphics card.

- **What a player sees:** at quality Light, on the bridge, space is drawn only in a lower-left part of the windows'
  area; the rest of the windows is black. Seen from the aft rail (the right part of the front window) and when looking
  up at the skylight. From the captain's chair, looking ahead, it does not show.
- **Where and why:** without post-processing, which is always so at Light (`usePostFxActive`,
  `src/components/SpaceLighting.tsx:98-102`), the bridge draws space only inside the windows' rectangle
  (`BridgeInterior.tsx:50-60`). `openingRect` computes that rectangle in pixels of the drawing buffer
  (`getDrawingBufferSize`, :101, :122-125), and `gl.setScissor` (:56) multiplies it by the pixel ratio again (three.js
  0.186.1, `WebGLRenderer.js:857`). Light uses a pixel ratio of 0.85 (`QUALITY.low`, `src/state/quality.ts:21`). With
  quality Auto, the scale for slow frames (`SCALE_STEPS`, :32) can lower it further. Below 1 the rectangle shrinks
  toward the lower left. Above 1 it is only too large, which does no harm. When a window's edge is behind the eye,
  `openingRect` returns `'all'` (:108) and the whole picture is drawn: that is why the captain's chair looking ahead is
  not affected.
- **Change** (not tried): give `setScissor` CSS pixels: `gl.getSize(opSize)` instead of `gl.getDrawingBufferSize(opSize)`
  at :101. `openingRect` has no other caller.
- **How to check:** sets quality Light and goes to the aft rail. It saves the setting: set Quality back in the settings
  afterwards.

```js
(() => {
  // Quality Light (pixel ratio 0.85, no post-processing), then the
  // bridge at the aft rail, plain glass. Watch the right part of the
  // front window and the top of the picture. This saves the
  // setting: set Quality back in the settings afterwards.
  const v = __sv, s = v.store.getState()
  s.updateSettings({ quality: 'low' })
  v.race.getState().stop()
  v.setCamera(null)
  if (s.mode !== 'flight') s.setMode('flight')
  v.bridge.setState({
    viewpoint: 'rail', looking: false, viewscreen: false,
    labels: false, part: null,
  })
  s.setCameraMode('bridge')
  return 'Quality Light; bridge, aft rail, plain glass'
})()
```

## Size comparison

"Size comparison" (Compare sizes). Fixes for the first two entries are on the branch `pr/size-compare-marker` of this
fork (head `5ad599d`). The branch also gives the body the view opens for its own button, on at first, so it can be
taken off: a change of behaviour, not a bug fix.

### Size comparison: a small body shows twice, and its ring sits below the line

Seen in play by cratercamper; cause found by Claude Code. Severity: **low** (our estimate): cosmetic.

- **What a player sees:** choose Pluto, Charon and Uranus (Uranus last, so the view zooms out). Charon shows twice: as
  the textured body and as a ring. The ring sits lower than the line the bodies stand on.
- **Why:** below 14 px on screen the name tag gets `.tiny` (`SizeCompare.tsx:91-98`). The name then lifts by 60 px, and
  an 18 px ring (`sizeCompare.css:144-158`) stays at the tag's anchor, the body's bottom point
  (`Html position={[0, 0, 0]}`, :113). So the ring is centred on the line, half below it. The textured body (:105-111)
  is still drawn, and at 9-13 px it can be seen.
- **Fix:** on the branch `pr/size-compare-marker` of this fork (head `5ad599d`). cratercamper has played it: the bug
  is gone.
- **Known flaw of this fix** (seen by cratercamper on the branch; cosmetic): only a body under 3 px gets the ring
  (`DOT_PX`), and the ring is 18 px wide. Bodies of 3-18 px are drawn without a ring, so beside them the ring looks
  bigger than they are. Example: Earth with Pluto, Charon, Uranus, Phobos and Jupiter, in a view 713 px high: Phobos'
  ring is 18 px, while Charon is 3 px and Pluto 6 px (measured in headless Chromium). On `642a0ec` every body under
  14 px gets a ring of the same size, so this does not show there. Show it: the snippet of the next entry, then
  `__sv.sizeCompare.pick('jupiter')`.
- **A player's suggestions** (cratercamper's, not tried): mark a body too small to see with something other than a
  ring, for example a dot with an arrow pointing to it; or leave the tiniest bodies out, with no mark.
- **Show it:**

```js
(() => {
  const sc = window.__sv.sizeCompare
  sc.open('earth')
  for (const p of [...sc.state.getState().picks]) {
    if (p !== 'earth') sc.pick(p)
  }
  sc.pick('pluto')
  sc.pick('charon')
  setTimeout(() => sc.pick('uranus'), 1500)
  return 'Earth + Pluto + Charon; Uranus joins in 1.5 s'
})()
```

### Size comparison: the ring of a very small body covers its neighbour

Seen in play by cratercamper; cause found by Claude Code. Severity: **low** (our estimate): cosmetic.

- **What a player sees:** add Phobos to Earth, Pluto, Charon and Uranus: its ring covers a part of Charon.
- **Why:** the bodies are spaced by a quarter of the bigger neighbour's width, in km (`lineup`,
  `src/data/sizeCompare.ts:39-53`), while a ring has a fixed size on screen, 18 px. So a ring covers any neighbour
  narrower than about 36 px on screen.
- **Fix:** on the branch `pr/size-compare-marker` of this fork (head `5ad599d`): a ring gets room beside its
  neighbours.
- **Show it:**

```js
(() => {
  const sc = window.__sv.sizeCompare
  sc.open('earth')
  for (const p of [...sc.state.getState().picks]) {
    if (p !== 'earth') sc.pick(p)
  }
  sc.pick('pluto')
  sc.pick('charon')
  sc.pick('phobos')
  setTimeout(() => sc.pick('uranus'), 1500)
  return 'Earth, Pluto, Charon, Phobos; Uranus joins in 1.5 s'
})()
```

### Size comparison: tapping a small body or its name never zooms to it

Found by Claude Code while measuring the entries above; not seen in play. Severity: **medium** (our estimate): "Tap one
to zoom in" does not work for the small bodies, which need it most.

- **What a player sees:** the hint says "Tap one to zoom in". Tapping a body's name tag, its ring or a small body
  never flies the camera to it. Tapping a large body works.
- **Where and why:** a tap on the name tag sets the zoom target (`focusOn(id)`, `SizeCompare.tsx:114`). The same click
  then reaches the canvas's own event handling, whose ray hits nothing, so the canvas's `onPointerMissed` (:197)
  clears the target again at once. On a small body the tap lands on the tag's wrapper element, not on the canvas, and
  sets no target at all.
- **Measured** (on `7c276d7` with clicks in the page): as described; a click on Uranus's centre (a hit in the canvas)
  set the target, and it stayed. On `25508aa`, the snippet below returned "Zoom target during the tap: charon then
  null; 300 ms later: null".
- **Change** (not tried): keep the tag's pointer events from reaching the canvas's handling, for example with
  `e.stopPropagation()` in the tag's handlers, and let a tap on a small body count as a tap on it.
- **How to check:** taps Charon's name tag and lists each change of the zoom target:

```js
(async () => {
  // Size comparison with Pluto, Charon and Uranus. Taps Charon's
  // name tag (pointer down, up, click at its centre). Lists each
  // change of the zoom target, and the target 300 ms later.
  const sc = window.__sv.sizeCompare, st = sc.state.getState
  const z = (t) => new Promise((r) => setTimeout(r, t))
  sc.open('earth')
  for (const p of [...st().picks]) if (p !== 'earth') sc.pick(p)
  for (const p of ['pluto', 'charon', 'uranus']) sc.pick(p)
  const find = () => [...document.querySelectorAll('.sc-label')]
    .find((b) => b.querySelector('b')?.textContent === 'Charon')
  let tag = null
  for (let i = 0; i < 50 && !tag; i++) {
    await z(100)
    tag = find()
  }
  if (!tag) return 'No name tag for Charon after 5 s.'
  await z(2000)
  const b = tag.getBoundingClientRect()
  const at = {
    bubbles: true, cancelable: true, isPrimary: true,
    pointerId: 1, button: 0,
    clientX: b.x + b.width / 2, clientY: b.y + b.height / 2,
  }
  const seen = []
  let last = st().focus
  const off = sc.state.subscribe((s) => {
    if (s.focus !== last) seen.push(String((last = s.focus)))
  })
  tag.dispatchEvent(new PointerEvent('pointerdown', at))
  tag.dispatchEvent(new PointerEvent('pointerup', at))
  tag.dispatchEvent(new MouseEvent('click', at))
  await z(300)
  off()
  return 'Zoom target during the tap: '
    + (seen.length ? seen.join(' then ') : 'no change')
    + '; 300 ms later: ' + st().focus
})()
```

### Size comparison: after a much bigger body goes, the camera loses the small ones for about a second

Seen in play by cratercamper; cause found by Claude Code. Severity: **low** (our estimate): cosmetic.

- **What a player sees:** with Earth shown, add the Sun and take it off again. For about a second Earth is not on the
  screen: the view zooms in on empty space, then finds Earth. It happens whenever the bodies shown change from much
  bigger to much smaller, in any order, for example adding a big body and taking it off, then a small one.
- **Where and why** (our reading of the code): every frame, `Rig` eases the camera toward the new view
  (`src/ui/SizeCompare.tsx:123-157`). It eases the distance in log scale (`c.logD`, :146), but the centre in km
  (`c.x`, `c.y`, :149-150), both at the same rate (`k = 1 - Math.exp(-dt * 3.2)`, :145). After the Sun goes, the
  distance shrinks about 100 times in a second, while the centre still lies hundreds of thousands of km away, where
  the Sun was. The zoom outruns the pan, and Earth leaves the picture at the lower left.
- **Computed, not measured on screen:** these formulas, run at 60 frames per second, put Earth's centre off the
  screen from 0.12 s to 1.10 s after the Sun is taken off, at 1600 × 900 and at 1920 × 1080; on a 390 × 844 phone
  from 0.03 s to 1.45 s. Headless Chromium on our side draws too few frames to show the path.
- **Change:** none tried. One way: limit how far the centre may lag behind, in screen terms, so the new view stays
  inside the picture while the camera zooms; or ease the centre in the same log terms as the distance.
- **Show it:**

```js
(async () => {
  // Earth alone; the Sun is added and, 3 s later, taken off
  // again. Watch the first seconds after it goes.
  const sc = window.__sv && window.__sv.sizeCompare
  if (!sc) return 'No __sv.sizeCompare: open the page with #debug.'
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  sc.close()
  await wait(300)
  sc.open('earth')
  for (const p of [...sc.state.getState().picks]) {
    if (p !== 'earth') sc.pick(p)
  }
  await wait(2500)
  sc.pick('sun')
  await wait(3000)
  sc.pick('sun')
  return 'The Sun is off again: is Earth on the screen?'
})()
```

## Probe journeys (Learn → Probe journeys)

Voyager 2, Hayabusa2 and Cassini follow their real paths, from NASA JPL Horizons, with a view of the probe beside the
map (`ProbePanel.tsx:79`). Voyager 1 and New Horizons follow rough arcs and have no such view (the comment on
`trajectory`, `src/data/probes.ts:30`). This part of the game is new and still growing, so besides a bug, this section
lists a player's suggestion and a to-do. Checked on `a923a3d` (#216), in headless Chromium, in a page 1280 × 713 px;
the files involved are the same at `642a0ec`.

### Probe journeys: Saturn's rings do not show in Cassini's view

Seen in play by cratercamper; cause found by Claude Code and measured in headless Chromium. Severity: **low** (our
estimate): cosmetic.

- **What a player sees:** in Cassini's journey, the view of the probe on the right shows Saturn without its rings,
  at every date we tried (2004-07-31, 2008-06-01, 2013-01-01, 2017-03-29, 2017-04-20, 2017-08-01); at 2017-03-29
  only a faint patch of straight streaks shows where they should be. In a test with the ring drawn plain red
  (2004-07-31, 2008-06-01, 2013-01-01, 2017-04-20), it is there, in the right place, and wide open at the last three.
- **Where and why** (our reading of the code, and the tests below): `PlanetSphere` draws the ring with
  `<ringGeometry>` (`ProbeCamCanvas.tsx:311`) and `<meshStandardMaterial map={ringMap} alphaMap={ringMap} …>` (:312).
  Three things go wrong:
  1. The ring geometry keeps three.js's default UVs, laid flat across the disc, while the texture is a single strip
     from the inner edge to the outer one, so its bands come out as straight stripes across the disc instead of
     circles. The game's own Saturn re-lays the UVs radially (`SaturnRing.tsx:76-89`).
  2. three.js reads an `alphaMap` from its green channel, so the opacity is the texture's alpha times its green.
     React Three Fiber marks a texture given as `map` as sRGB, so that green is decoded first: the opacity is at
     most 0.26 with this texture, 0.07 on average, against 0.60 for its alpha alone (computed from the texture, not
     measured on screen).
  3. Seen from the face away from the Sun, a `meshStandardMaterial` gets only the ambient light (0.12,
     `ProbeCamCanvas.tsx:576`). `SaturnRing.tsx:52-54` lets some sunlight through the ring on that side.
- **Tests** (a copy of `a923a3d` changed only in `ProbeCamCanvas.tsx:311-312`): with the UVs re-laid as
  `SaturnRing.tsx` does and without the `alphaMap`, the rings show from the sunlit face (2017-03-29, Cassini 63° above
  them, the Sun 27°), Cassini Division included, and faintly from the other face (2008-06-01, 2013-01-01, 2017-04-20:
  the Sun on one side of the rings, Cassini on the other; computed with the game's own `probeNow` and
  `poleOf('saturn')`, `src/data/probeView.ts`). cratercamper looked at that copy in play: the rings show.
- **Change:** none tried beyond these tests. One way: re-lay the UVs as `SaturnRing.tsx:76-89` does, drop the
  `alphaMap` (the texture's own alpha is enough), and on the face away from the Sun let light through as
  `SaturnRing.tsx:52-54` does. `SaturnRing` itself takes the Sun to be at the world's origin (:49), which the
  probe's view does not; there the Sun's direction is set in `SunLight` (`ProbeCamCanvas.tsx:225`).
- **Show it:**

```js
(async () => {
  // Cassini's journey, paused on 2017-03-29: Cassini sees the
  // sunlit face of the rings from 63 degrees above them.
  // 2017-04-20 shows the face away from the Sun.
  const date = '2017-03-29'
  const sv = window.__sv
  if (!sv || !sv.probes) {
    return 'No __sv.probes: open the page with #debug.'
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  sv.probes.open()
  sv.probes.play('cassini')
  for (let i = 0; i < 300; i++) {
    if (document.querySelector('.probe-cam canvas')) break
    await wait(100)
  }
  if (!document.querySelector('.probe-cam canvas')) {
    return 'The probe view did not open within 30 s.'
  }
  sv.probes.state.setState({ playing: false })
  sv.probes.clock.ms = Date.parse(date + 'T00:00:00Z')
  return 'Paused on ' + date + ': are Saturn\'s rings there?'
})()
```

### A player's suggestion (not a bug): Cassini's journey could end inside Saturn's clouds

From cratercamper, after playing.

- **Now:** Cassini's journey stops at `2017-09-15T10:30:50Z` (`src/data/probes.ts:104`). The view on the right then
  reads "61,813 km to Saturn", from Saturn's centre (`src/ui/ProbeCamPane.tsx:123`). The game's Saturn has a radius
  of 58,232 km (`src/data/bodies.ts:75`; the real equator is at 60,268 km), so the journey stops about 3,600 km
  above it: Saturn fills the view as a flat beige frame, with the caption "Before its fuel ran out, it dove into
  Saturn, sending data to Earth until the very last moment." (`src/i18n/probeCam.en.ts:117`).
- **The suggestion:** as the last step, take the view on down into the clouds. The game already flies the player's
  ship into the clouds of a giant planet: `CloudInterior` (`src/components/PlanetBody.tsx:144`), with the depth, the
  pressure and the temperature during the dive (`src/state/proximity.ts:108-112`).

### To-do (not a bug): the probe's view covers the buttons in the middle of the screen

Seen in play by cratercamper; measured by Claude Code in headless Chromium. Severity: **low** (our estimate):
cosmetic.

- **What a player sees:** while the view of the probe is open, it covers the right part of the buttons centred on
  the screen: on a page 1280 px wide, 76 of the 100 px of "SF" (in "Real / SF" at the top), the Scale row below
  it after "Easy", and 62 of the 132 px of "Cockpit M" at the bottom. From 1320 px wide the Scale row sits beside
  "Real / SF" (`src/styles/sf-scale.css:92-99`, :102-107 below that width) and is covered whole.
- **Where:** the view is placed over them on purpose: `src/styles/probeCam.css:8-9` (its z-index 6 is above the
  z-index 5 of "Real / SF" and the Scale row). It fills the right half of the screen (`right: 12px`,
  `width: calc(50vw - 18px)`, :6, :10), while the buttons are centred on the middle: `.sf-badge`
  (`src/styles/sf-scale.css:33-37`) and `.mode-button`
  (`src/styles/core.css:93-97`, `--dock-center` is 50% on a screen wider than 1180 px, `sf-scale.css:5`, :10-14).
- **A player's suggestion** (cratercamper's): "Real / SF" may not be needed during a journey at all; a button that
  closes the journey could stand there instead. Today the journey closes with the × of its panel
  (`ProbePanel.tsx:86`), and leaving the map closes it too (`ProbePanel.tsx:67`), so "Cockpit M" also ends it.
- **How to check:** by hand: on a computer screen, open Learn → Probe journeys → Voyager 2.

## Other

### Moon mission: the Moon's terrain may flash flat, as the Moon flight did (not checked)

Found by Claude Code in the code; not seen in play, not measured. Severity: unknown. The Moon flight's flat flash was
fixed in #209, in `FlightView.tsx` only. The Moon mission's terrain has the same early return for a piece beyond the
horizon (`src/components/moonMission/LunarWorld.tsx:354`) and the same clean-up of unused pieces (:385-391). We have
not checked whether it flashes there; we can check it and write a snippet when asked.

### "Cockpit V" and "Cockpit M" name a view the game does not have

Seen in play by cratercamper; cause found by Claude Code. Severity: **low** (our estimate): a label.

- **What a player sees:** after the start, press V to look at the ship: the button reads "Cockpit V". Pressing it
  shows the ship from behind (the chase camera). The map's button reads "Cockpit M" the same way. Only when you came
  from the bridge does it go back inside.
- **Where and why:** these buttons call `closeGallery` (`src/state/gallery.ts:52-54`, `setMode('flight')`) or switch
  between the map and flight (`Hud.tsx:297`). They go back to flying with the camera you had (`cameraMode`,
  `src/state/store.ts:13`: chase, hero or bridge; chase at the start, :144). The Japanese 操縦席へ (`hud.ja.ts:29`,
  `touchBar.ja.ts:5`) and 操縦席へもどる (`galleryPanel.ja.ts:20`) mean "to the pilot's seat", that is, flight mode,
  as in the type `Mode` (`store.ts:10-11`).
- **Change** (English only): `hud.en.ts:33` 'Cockpit' → 'Fly' (shown at `Hud.tsx:292` and :297); `touchBar.en.ts:8`
  'Cockpit' → 'Fly' (`TouchBar.tsx:137`, :142); `galleryPanel.en.ts:23` 'Back to the cockpit' → 'Back to flying'
  (`GalleryPanel.tsx:90`), the words the bridge panel already uses (`bridgePanel.en.ts:16`); and `README.md:62`
  "Toggle overview map / cockpit" → "Toggle overview map / flight". Do not change the rover's "View from the
  driver's seat" (`crewRover.en.ts:11`): the rover has a real driver's seat.
- **How to check:** by hand: start the game and press V. No snippet: one key shows it.

### A suggestion (not a bug): lock the mouse without the system's pointer acceleration

From Claude Code, reading the code; not tried in play.

- **Now:** driving the rover with the mouse adds up the mouse's movement while it is locked: `roverMouse.steer +
  e.movementX * MOUSE_STEER` (`src/state/rover.ts:268`; `MOUSE_STEER = 0.0045`, :149). The lock is a plain
  `el.requestPointerLock?.()` (:243). The ship's mouse look (`src/components/Ship.tsx:156-157`, lock at :212), the
  space walk's (`src/state/eva.ts:323-324`, lock at `src/components/eva/EvaView.tsx:524`) and the colony walk's
  (`src/state/walk.ts:279-280`, lock at `src/components/walk/WalkView.tsx:306`) work the same way. A plain lock gives
  `movementX` after the system's pointer acceleration, which is on by default in Windows and macOS: a quick flick
  counts for more than the same distance moved slowly, so how far the rover steers depends on how fast the hand moves,
  not only how far.
- **The suggestion:** ask for raw mouse counts with the Pointer Lock option `unadjustedMovement: true`, and where the
  browser or the system refuses it (`NotSupportedError`), lock as now. This follows web.dev's article "Disable mouse
  acceleration to provide a better FPS gaming experience" (2020), which asks again for a plain lock on
  `NotSupportedError`. MDN's compatibility data lists the option in Chrome 88 (Windows, macOS 10.15.1 and later,
  ChromeOS; not yet Linux), Firefox 152 and Safari 18.4. In headless Chromium 156 and Firefox 160, without a click,
  `requestPointerLock` reads the option and returns a Promise. Not checked: which browser and system then refuse it,
  whether raw counts then arrive, and whether the second, plain request still counts as the player's click (the
  change also remembers a refusal, so the next click asks for a plain lock straight away).
- **It changes the feel:** the mouse values were set with the counts the system gives today, after its pointer speed
  and acceleration: `MOUSE_STEER` (`rover.ts:149`), `MOUSE_SENSITIVITY`, `HEAD_SENSITIVITY` and `OBSERVE_DRAG`
  (`Ship.tsx:30`, :41, :611), and the 0.0022 of the two walks (`eva.ts:323-324`, `walk.ts:279-280`). Raw counts skip
  both. A fast movement turns less than now and a slow one may turn more, and the whole scale follows the mouse's own
  resolution (DPI). A player who slowed a high-resolution mouse in the system would turn faster, and the game has no
  mouse setting of its own. So the values may need tuning again. That is the author's choice.
- **Change** (one new file and one line in each of the four places; `tsc --noEmit` passes on `642a0ec`, and a planted
  type error fails it; not run in the game):

```ts
// src/state/pointerLock.ts (new)
// Lock the mouse to the 3D view. Asks for raw mouse counts (no
// pointer acceleration from the system) where the browser offers
// them, so the same hand movement always steers or turns the same
// amount; a plain lock where it does not.
let rawMouse = true

const refused = (err: unknown) =>
  console.error('ERROR: pointer lock refused; click again', err)

export function lockPointer(el: Element) {
  if (!rawMouse) {
    void el.requestPointerLock?.()?.catch(refused)
    return
  }
  const p = el.requestPointerLock?.({ unadjustedMovement: true })
  void p?.catch((err: unknown) => {
    if ((err as Error | undefined)?.name !== 'NotSupportedError') {
      refused(err)
      return
    }
    rawMouse = false // remembered for the next click
    void el.requestPointerLock()?.catch(refused)
  })
}
```

```ts
// src/state/rover.ts:243
// (import { lockPointer } from './pointerLock')
if (e.button === 0) lockPointer(el)

// src/components/Ship.tsx:212
// (import { lockPointer } from '../state/pointerLock')
const lock = () => lockPointer(gl.domElement)

// src/components/eva/EvaView.tsx:524
// (import { lockPointer } from '../../state/pointerLock')
lockPointer(e.target)

// src/components/walk/WalkView.tsx:306
// (import { lockPointer } from '../../state/pointerLock')
lockPointer(e.target)
```

- **How to check:** by hand, on Windows or macOS with pointer acceleration on: while driving the rover, click the 3D
  view to lock the mouse, then move the mouse the same short distance (a few millimetres: the steering is full at
  about 220 counts) once slowly and once quickly, and watch the steering mark on the rover's panel
  (`src/components/surface/RoverHud.tsx:199-202`). Today the quick move steers further; with the change both should
  steer the same. No snippet: it needs a real mouse.
