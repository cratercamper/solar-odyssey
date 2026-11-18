---
name: d-upstream-fixes
description: "Bugs found in the game's code while working with it. Each entry gives what a player sees, where it is in the code, why it happens, a suggested change and how to check it. Kept current: an entry is removed once the original game fixes the bug (a short record names the fixed ones), and newly found bugs are added."
type: reference
---

# Bugs found in the game

Bugs we found in the game's code while working with it. Each entry says what a player sees, where it is in the code,
why it happens, a change that would fix it, how to check it, and how much it matters. The list is kept current: when
the original game fixes one of these bugs, its entry is removed (a short record below names the fixed ones), and
bugs found later are added.

**How these bugs were found.** Every bug on this list so far was found by Claude Code while working with the game's
code, and checked with scripts: in headless Chromium, or by calling the function directly. None of them was tried by a
person playing the game. The severities below are our estimates, on this scale: **high**, spoils normal play for most
players; **medium**, spoils one part of the game on common machines; **low**, rare or cosmetic. New entries will say
the same: who found the bug, whether a person has seen it in play, and its estimated severity.

There are no open entries now. The original game's `main` at commit `737030b` (#135) has fixed every bug listed here
so far (the numbers are the original game's pull requests):

- **The rival rovers jumped back to the start when the quality level changed during a rover race** (fixed in #106,
  `a41f635`). Severity: **medium**. With the quality on Auto, a drop in frame rate during a race steps the level
  down, and the three rivals started again from the start line at standstill, so the race against them was spoiled
  for that run.
- **"Best so far: 1 stars"** on the English mission result screen when the best is one star (fixed in #106,
  `a41f635`). Severity: **low**: a wrong word.
- **On a slow machine, race times came out longer than the drive** (fixed in #119, `2752a2b`). Severity: **low**.
  Only below 20 frames per second: at about 8 fps, in a 10-second test, the race clock moved on by 10.4 s while the race
  itself moved on by only 4.2 s, so the result, the best time and the hiscore entry came out too long, and a gold ghost
  recorded at full speed pulled ahead. We had asked whether this was intended; #119 gave the race its own clock.
- **Without Web Audio, missions and the ship race got stuck at their first sound** (fixed in #119, `2752a2b`).
  Severity: **low** overall: it happens only in a browser with Web Audio turned off, but it is severe there: a mission
  did not move past the first step the player completed, the ship race stayed on READY, and the 3D view stopped
  drawing.

---
Written by cratercamper and Claude Code.
