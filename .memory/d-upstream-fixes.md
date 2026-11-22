---
name: d-upstream-fixes
description: "Bugs found in the game, while playing it or while working with its code. Each entry gives what a player sees, where it is in the code, why it happens, a suggested change and how to check it. Kept current: an entry is removed once the original game fixes the bug, and newly found bugs are added. A player's suggestion is marked as one."
type: reference
---

# Bugs found in the game

Bugs we found in the game, while playing it or while working with its code. Each entry says what a player sees, where
it is in the code, why it happens, a change that would fix it, how to check it, and how much it matters. The list is
kept current: when the original game fixes one of these bugs, its entry is removed, and bugs found later are added.

**How this bug was found.** The open entry, in the Moon flight (✈ Fly over the Moon), was seen by cratercamper while
playing the game; Claude Code then found its cause in the code and measured it in the game, in headless Chromium on a
GPU, as it is and with the suggested change: the bug shows as it is and is gone with the change, with no new console
errors. The severities are our estimates, on this scale: **high**, spoils normal play for most players; **medium**,
spoils one part of the game on common machines; **low**, rare or cosmetic. Each entry says who found the bug, whether a
person has seen it in play, and its estimated severity.

The suggested change is also on the branch `pr/moon-ground-flash` of this fork, one commit on top of the original
game's `main` at `553ea7d` (#207), in `src/components/flight/FlightView.tsx`.

Open entries, checked against the original game's `main` at commit `553ea7d` (#207). File and line numbers are at that
commit; `FlightView.tsx`, `FlightPanel.tsx`, `flightControl.ts` and `moonGlobe.ts` are in `src/components/flight/`.

### Moon flight: the ground flashes flat for a frame, or black inside a crater

Seen in play by cratercamper; cause found by Claude Code. Severity: **medium**. Close to the ground it comes back every
30 frames (twice a second at 60 fps), slow or fast, and spoils the low flight.

- **What a player sees:** flying low, the ground changes for a single frame: the hills and craters vanish, a smooth,
  almost flat ground shows with the horizon lower, and then the detail is back. Inside a crater the whole frame goes
  black but for a few vertical walls. Climbing, cratercamper then saw it only at the horizon, and higher up not at all.
- **Where and why:** `MoonGlobe` (`FlightView.tsx:146-203`) draws the Moon as pieces at many levels of detail. A piece
  that is near enough is drawn as its four children instead, but only once all four exist (`ready`, :167); until then
  the piece itself is drawn (:175-178) and the missing children are queued. A piece beyond the horizon is skipped:
  `visit` returns at :161 without marking it as used. The 24 pieces of level 1, 1364 km across, are never skipped, and
  those near the camera are drawn as their children, so a child of theirs that lies beyond the horizon is never marked.
  While the Moon holds more than 900 pieces, every 30 frames the clean-up (:194-202) deletes each piece unused for 240
  frames, and these children with them. In the next frame `ready` fails for their parent, and the level-1 piece is drawn
  in place of everything below it. It has one height point every 43 km and none of the added hills and craters
  (`minWave`, `moonGlobe.ts:208`), so it is almost flat. The deleted child is built again at once, with `used: 0`
  (:128), so the next clean-up deletes it again: the flash comes back every 30 frames. Inside a crater the camera is
  below that smooth surface and sees it from behind, where its faces are not drawn; only the skirts are seen, the strips
  each piece hangs down from its edges (`moonGlobe.ts:259`), which are drawn from both sides (:283-291). How often it
  shows depends on the height and the graphics quality: the clean-up runs only while more than 900 pieces exist, and
  fewer are needed higher up or at lower quality.
- **Measured** (graphics quality high): as it is, flying at 22-28 m at the slowest speed, 14 single-frame flashes in 494
  frames, one every 30 frames. In each, a point of the ground near the bottom of the 1600 × 813 picture was drawn 78-86
  m lower, which moved it 569-688 px down, out of the picture. Flying at 3 km at 2.5 km/s for 60 s, the ground under the
  lander flashed 116 times. In a crater about 5 km from the start, whose floor lies 966 m below the average ground in
  the 8 × 8 km around it, the flash frame was black but for the skirts. At 20 and 50 km, 8 frames each had a flash, all
  of pieces beyond the horizon; at 90 km, one, which our probes did not see. With the change, measured on `19c1f53` with
  this change alone (`MoonGlobe` is the same at `553ea7d`): no flash in any of these runs. In the low flight the Moon
  then holds about 1150 pieces once settled, the top of the range it swings through as it is (about 1030-1160), and
  builds 16 pieces in 565 frames instead of about 120 every 30 frames.
- **Change:** at :161, mark the skipped piece as used before returning, so the clean-up keeps it while its parent is
  drawn as children:
  `if (k.level > 1 && ang - (size / MOON_R) * 0.8 > horizon) { const s = chunks.get(keyOf(k)); if (s) s.used = f; return }`.
  The clean-up still deletes the pieces that are no longer visited.
- **How to check:** fly at the lowest speed close to the ground near the start: as it is, the ground flashes about twice
  a second; with the change it does not. In code: log the keys the clean-up deletes; as it is, the same level-2 pieces
  are deleted at every clean-up.
- **Elsewhere:** the Moon mission's terrain has the same early return (`src/components/moonMission/LunarWorld.tsx:353`)
  and the same clean-up (:384-386). We have not checked whether it flashes there.

### A player's suggestion (not a bug): show the lander's pitch in the Moon flight

From cratercamper, after playing: show which way the lander is pointing, either as a horizon indicator or as a small 3D
picture of the lander at the edge of the screen. The pitch is what makes the lander climb or sink. Today the panel
shows the height, the speed, the lap and which way to turn (`FlightPanel.tsx`), but not the pitch. High up (40 km and
more) the camera is far behind the lander (about 1.8 km at 40 km), and the lander is less than a degree across on the
screen, so the player can only guess the pitch from how the height changes. The value is at hand: `ctl.pitch`, the
angle from the horizon (up to ±1.1 rad, `flightControl.ts:31`), and `Pilot` already sends the panel its numbers four
times a second (`FlightView.tsx:484-490`).

### A player's suggestion (not a bug): show the names of places on the Moon during the flight

From cratercamper, after playing: during the flight, show the names of mountains, craters, plains and other features
below, either in the main view or in a panel at the side of the screen with more about each. A combination cratercamper
finds interesting, in the style of System Shock 1: the description at the side, with a line leading from it to where the
place is in the 3D view. The game has no list of the Moon's named places yet. The IAU's Gazetteer of Planetary
Nomenclature, kept by the USGS (planetarynames.wr.usgs.gov), lists the Moon's named features with their positions and
sizes. A name tag in the 3D view has a precedent in the game: `src/components/moonMission/SaturnHotspots.tsx` places
labels with drei's `Html`.
