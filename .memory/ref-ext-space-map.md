---
name: ref-ext-space-map
description: What space-map (spacemap.co, github.com/julie-dujardin/space-map) and its npm SDK `spacemap` hold, what there is to see in it, and how it compares with this game's own terrain, light, atmospheres and content, judged against the game's source. Read from the two repositories; nothing installed or run from space-map.
type: reference
---

# space-map and its SDK, seen from this game

space-map (https://spacemap.co, source https://github.com/julie-dujardin/space-map) is a browser map of the Solar
System and the Milky Way at real scale, by another author. We read its source and its npm package to see two things:
what there is to see and read in it, and which of its techniques and data meet what this game does. Nothing from it is
copied here, nothing was installed, and nothing of it was run. This is a description, not a list of proposals: where a
line says what the game "would gain", it changes nothing by itself, and anything that changes the game's look is its
author's call.

Tags: **READ** = seen in the file named, 2026-11-25. **COMPUTED** = arithmetic on READ numbers. **MEASURED** = run by
us, as stated. **INFERRED** = our reasoning. **RECALLED** = from memory, not read that day. **DOUBT** = unsure.

Cite forms:
- `S:path#Lline` = space-map at commit fcc615c5 (2026-11-25), as on GitHub:
  https://github.com/julie-dujardin/space-map/blob/fcc615c5/<path>#L<line>.
- `path:line` = this game's repository, the original game's `main` at commit 7bbcdb5 (2026-11-25).

## 1. In short
- **What there is to see (§2b).** 181 million stars, 987 moons, 1.6 million asteroids, 29 thousand spacecraft and
  16 thousand named surface features, in 12 languages, Japanese among them. Sharp sites at 25 cm on Mars (Gale among them)
  and 0.4-1.4 m on the Moon (Taurus-Littrow among them); rover and lander panoramas; cited atmosphere and interior
  facts. It has colour maps for 30 of the game's 31 planets, dwarf planets and moons; §2b links the game's places and
  probes there and puts the facts side by side.
- **Its Mars is a map; the game's Mars is a race track.** space-map streams the whole planet. You fly over it and
  look; there is no vehicle. The game drives on a 6.4 km real height map per Mars site, with synthetic detail on top.
- **The SDK cannot go inside the game's scene, and an embed does not get the sharp Mars.**
  - It owns its renderer and canvas.
  - Its three.js peer is `^0.183.0`; the game has 0.186.1.
  - A bare embed gets Mars's whole-globe maps only. The surface tiles come from the author's own server and are off
    by default (§4).
- **The most useful facts for the game are about data, not code:**
  - space-map treats the same Gale terrain model that the game's Gale site uses as having 20 m fill blocks (§3c).
  - HiRISE terrain models can sit 0.1 to 1.7 km off space-map's CTX mosaic, and Pathfinder's 1.5 km off the HRSC-MOLA
    map the game also uses (§3c). The game's Coprates join measures a
    120.67 m vertical offset; the horizontal one has not been measured.
  - NASA publishes a starless Milky Way, which is what the game's glow builds by hand (§6).
- **Light:** the game has no terrain self-shadow on Mars. The canyon walls at Coprates cast no shadow on the race floor
  (§3d). space-map's per-fragment shadow march would give one, but that changes the look.
- **Atmospheres:** space-map's Mars numbers come with citations. The game's dust column is about 2.3 times their
  clear-season value; both are plausible (§5). Reference only.
- **Licences:**
  - The app and its pipeline are AGPL-3.0. The game's repository has no licence file, so none of space-map's app or
    pipeline code can go into it.
  - The SDK is MPL-2.0: it is usable unmodified as a dependency.
  - Data keeps its sources' terms.

## 2. space-map in brief (READ unless tagged)
- A real-time, real-scale map of the Solar System and the Milky Way: "182m objects and 16k surface features"
  (S:README.md#L3).
- Mars detail per the README: "Mars: 5m per pixel … Lander areas: up to 0.25m per pixel" (S:README.md#L44).
- Stack:
  - SvelteKit + three.js (WebGL) on Cloudflare Workers (S:README.md#L76);
  - camera-relative rendering with a reverse-z logarithmic depth buffer (S:README.md#L78);
  - a Python pipeline that exports static files (S:README.md#L82).
- **Licences:**
  - The repo is AGPL-3.0 (S:LICENSE#L1).
  - The npm SDK is MPL-2.0 (S:frontend/src/sdk/npm/package.template.json#L15).
- Localisation: "12 languages, with content from Wikipedia" (S:README.md#L60). Japanese is one of them
  (S:data/src/space_map_data/constants/providers.py#L124: `"ja"`).
- Created 2026-03-08, last pushed 2026-11-25, 3 stars, 0 forks; one author made 3,130 of its commits (GitHub API, read
  2026-11-25).

## 2b. What there is to see in space-map, and where it meets the game

space-map as a source of **information**: what a visitor can see and read there, and where that meets the game.
`S:` cites are space-map at fcc615c5; `path:line` cites are the game at 7bbcdb5. No link below was opened.

### What a visitor meets in space-map
- **Objects** (READ S:README.md#L17-28): 181m stars, 1.7m star systems, 7.5k planets (most of them exoplanets),
  11 dwarf planets, 987 moons, 1.6m asteroids, 4k comets, 29k spacecraft, 43k pieces of debris, 16k surface
  features. So the "182m objects" (#L3) are almost all stars; the rows without star systems add up to 182.7m
  (COMPUTED). The counts are written at export time (S:docs/export-format/about-data.md#L3): not checkable here (DOUBT).
- **Maps and relief.** The colour manifest has maps for 50 Solar System bodies: 8 planets, 28 moons, Ceres, Pluto
  and 12 small bodies (COMPUTED from S:data/src/space_map_data/constants/manifests/textures/download-metadata.yaml).
  The README says 13 minor bodies (#L44); we count 14. Relief exists for 10 bodies, not Earth or Europa: Mercury,
  Venus, Moon, Mars, Io, Enceladus, Ceres, Vesta, Pluto, Charon (READ: folders of S:.../manifests/textures/displacement/).
- **Sharp sites** (READ).
  - Moon: mosaics of 14 sites at 0.4-1.4 m/px: Apollo 11, 12, 14, 15, 16, 17, Lunokhod 1 and 2, Luna 20, Chang'e 4 and 5,
    Surveyor 1, and the peaks of Tycho and Copernicus (S:.../textures/download-metadata.yaml#L203-368). Eleven of
    them have terrain models at 2-5 m (S:.../displacement/moon/download-metadata.yaml#L41-174).
  - Mars: 9 mosaics at 25 cm/px: Jezero, Gale, Meridiani Planum, Viking 1 and 2, Pathfinder, Spirit, Phoenix,
    Zhurong (#L426-578), with 1 m terrain models there and at InSight (S:.../displacement/mars/download-metadata.yaml#L25-165).
  - Elsewhere: 5 m pictures over 200 m relief on Mars (#L403-425); 100 m pictures over SLDEM2015 relief on the Moon
    (#L168; S:.../displacement/moon/download-metadata.yaml#L24).
- **Surface features** (IAU Gazetteer, S:README.md#L28): position, type, size; the page adds the IAU approval date,
  what the name honours, Wikidata, Commons photos and a Wikipedia extract (READ S:docs/export-format/nomenclature.md#L8-78).
  12 languages, Japanese among them (S:data/src/space_map_data/constants/providers.py#L124); a Japanese name is the
  Wikidata label in Japanese, else the IAU name (nomenclature.md#L16-21). Lists by IAU quadrangle (#L87-91).
- **Object pages** have tabs: overview, images, features, structure, rings, probes, traverse and more (READ
  S:frontend/src/lib/state/view.ts#L127-140). Structure holds atmospheres and interiors, "21 planets and moons from
  100+ papers" (S:README.md#L47): 31 interiors with the Sun and Vesta, 24 atmosphere-fact sets (COMPUTED from
  S:.../constants/interior/bodies.py, with #L2111, #L2180, #L2226, .../atmosphere/facts.py), each number cited (facts.py#L1-13; .../temperature/bodies.py#L1-12).
- **Probes.** Positions from 1959 (S:README.md#L51). The README claims attitude for 26 probes and 5 landers (#L52);
  the attitude recipes name 25 craft (COMPUTED from
  S:data/src/space_map_data/download/providers/spice/probes/attitude/patterns.py#L65-292). The "over 290" models
  (#L53) come from NASA 3D Resources and ESA SciFleet (S:docs/export-format/models.md#L5); no list in the repo (DOUBT).
- **Panoramas.** The README claims 14k, on Mars, the Moon, Titan and Venus (#L36), from 21 missions (READ
  S:data/src/space_map_data/panoramas/missions.py#L16-64): 10 on Mars, Yutu, Yutu-2 and five Surveyors on the Moon,
  Venera 13 and 14, Huygens, Philae. The six Apollo landings add 7 Hasselblad panoramas (S:docs/other-world-panoramas.md#L75-85).
- **Live data and time.** When each spacecraft last talked to NASA's or ESA's ground stations (READ
  S:frontend/src/lib/fetch/activity.ts#L1-12); Earth satellites by SGP4 on weekly element sets (S:README.md#L92).
  Any date, faster or backwards (#L34); asteroids and comets are less exact far from today (#L94).
- **Other pages.** A trip planner `/nav/<from>/<to>` with real and fictional craft (#L35;
  S:.../constants/spacecraft/fiction.py#L1-10), a to-scale `/compare` (#L57), launch sites with their pads
  (S:data/src/space_map_data/export/groups/launch_site.py#L1-13). No quizzes: "quiz" is in no file of S:frontend/src
  (the control S:frontend/src/lib/compare/ is found).

### Where it meets the game
The game shows the Sun, 8 planets, Pluto and 22 moons (READ `src/data/bodies.ts:49-108`), lands on 27 of them
(COMPUTED from `src/data/surfaces.ts:93-150`), and has facts and quizzes in Japanese and English (`src/i18n/lang.ts:6`).
space-map has colour maps for 30 of the game's 31 planets, dwarf planets and moons; Proteus has none (COMPUTED:
`naif-808` is missing, the control `naif-801` is there). It has no structure page for 3 of the game's 32 bodies:
Phobos, Deimos, Proteus (COMPUTED; eight moons get their interiors at S:.../interior/bodies.py#L2111-2226).

| The game | What space-map has there (READ unless tagged) |
|---|---|
| Coprates Chasma race, Mars (`public/terrain/mars_coprates.json:2`, `:17-18`) | Only the global 5 m pictures and 200 m relief. No site mosaic; the game's HiRISE model is not in its lists (§3c). Features under quadrangle mc18 "Coprates" (S:.../constants/nomenclature/quadrangles.py#L53). Links 1-2. |
| Gale, near Bradbury Landing (`public/terrain/mars.json:2`, `:17-18`) | The same MSL Gale merged DEM at 1 m (S:.../displacement/mars/download-metadata.yaml#L38-50), a 25 cm orthophoto (#L446-455), Curiosity's page, traverse and placed panoramas (missions.py#L17; S:.../panoramas/msl_localize.py#L1-7). Quadrangle mc23 "Aeolis" (quadrangles.py#L58). Links 3-4. |
| Taurus-Littrow: Apollo 17 race and mission (`public/terrain/moon_taurus.json:2`, `:17-18`; `src/data/apollo17.ts:1-4`) | A de-shaded 0.8 m mosaic (#L265-272) and 2 m terrain models (S:.../displacement/moon/download-metadata.yaml#L103-111). The same SLDEM2015 base relief as the game's far map (#L24; `public/terrain/moon_taurus.json:21`). Four Apollo 17 craft entries (S:.../constants/promoted.py#L134-137; which is the lunar module: DOUBT). The EVA-1 panorama, 14 m north-north-east of the module (other-world-panoramas.md#L85, #L202). Quadrangle LAC-43 (COMPUTED from S:.../nomenclature/quadrangle_grid.py#L82-97, #L113). Links 5-6. |
| Apollo 17 launch, pad 39A (`src/data/siteSky.ts:7-9`) | The "cape-canaveral" launch-site page, LC39A among its pads (S:.../constants/earth_sats/launch_sites.py#L9, #L29; launch_site.py#L12-13). Link 8. |
| Monument Valley, Earth (`public/terrain/earth.json:2`, `:17-18`) | Blue Marble Next Generation at 500 m, one picture per month (S:.../textures/download-metadata.yaml#L112-140). No Earth relief. Link 7. |
| Conamara ice race, Europa (`public/terrain/europa_conamara.json:2`, `:17`) | A colour map and named features; no relief, as the game's own note says of Europa (`src/i18n/surfaceSites.en.ts:17`). The game's file has no coordinates. Link 10. |
| Titan landing (`src/data/surfaces.ts:130-135`), Huygens (`src/i18n/probes.en.ts:44`) | The Huygens surface panorama and three descent views, at 10.25°S 167.68°E (other-world-panoramas.md#L22, #L208; S:.../panoramas/other_worlds.py#L208, #L256); Huygens attitude (patterns.py#L191); Titan's atmosphere facts (S:.../atmosphere/facts.py#L413-423). Link 9. |
| Venus landing (`src/data/surfaces.ts:95-100`) | Venera 13 and 14 panoramas (missions.py#L34-35, #L60-61). |
| Ryugu (`src/data/probes.ts:146`, `:165`) | One map, by Askaniy (CC BY 3.0); a JAXA mosaic is listed but skipped (S:.../textures/download-metadata.yaml#L691-710). Link 15. |
| Hubble, Webb (`src/data/telescopes.ts:4-5`); the 2027-08-02 eclipse (`src/data/eclipses.ts:53-56`); size comparison (`src/data/sizeCompare.ts:3-5`) | HST and JWST pages with models (S:README.md#L53; promoted.py#L44, #L142); the same eclipse in the README (#L46); `/compare` (#L57). Link 16. |
| The five probes: Voyager 2 and 1, Cassini with Huygens, New Horizons, Hayabusa2 (`src/data/probes.ts:49-161`) | Pages probe-49000448, probe-49065984, probe-88592384 and probe-89915392, probe-104804352, probe-112156672 (S:.../constants/promoted.py#L40, #L39, #L97, #L99, #L43, #L59). Attitude for both Voyagers, Cassini and Huygens (patterns.py#L133, #L191, #L260-273); none yet for New Horizons and Hayabusa2 (#L22-24). Models "cassini" and "cassini-with-huygens" (models.md#L22). Arrokoth is spkid-20486958 (#L209). Links 11-15. |

### Deep links: how the parser reads them (READ)
- **The path picks the subject**: `/<type>/<id>/<name>`. `b` is a NAIF body, `s` a small body, `e` an Earth
  satellite, `p` a probe (S:frontend/src/lib/state/view.ts#L23-43, #L91-103). The name is not read
  (S:frontend/src/lib/state/url.ts#L157-158).
- **`?at=<date>,<lat>,<lon>,<zoom>`** (url.ts#L308-333). `date` is ISO 8601; `now` or empty is the present
  (#L320-322). `lat`, `lon` are the camera's position in degrees, in the frame fixed to the subject's body
  (S:frontend/src/lib/scene/renderer.ts#L771): latitude planetocentric, longitude east of the prime meridian
  (S:frontend/src/lib/math/spherical.ts#L45-47). `zoom` is the camera's distance from the body's **centre**
  (url.ts#L631-632) in scene units of 0.1 AU (S:frontend/src/lib/math/units.ts#L2-4). So zoom = (radius + height
  in km) / 14,959,787.07 (COMPUTED). It is not a height above the ground. With fewer than four fields only the
  date is used (url.ts#L323; view.ts#L160-162). On a landed probe's page the view is read off the body it stands
  on, and a zoom under half that body's radius is a height over the probe (S:.../scene/focus/controller.ts#L84-88, #L803-808).
- **`&angle=<pitch>,<bearing>`**: degrees; pitch from the vertical, bearing clockwise from north; without it the
  camera looks straight down (view.ts#L228-232; url.ts#L335-343). **`&tab=features&quad=<code>`** lists one
  quadrangle's features (url.ts#L299-301, #L649-651). A feature page (`/b/499/f/<id>/<name>`) needs the IAU
  Gazetteer id; the ids are not in the repository, and we did not look them up.
- **Our choices** (INFERRED): heights of 25 km at Coprates, 15 km at Gale and Taurus-Littrow, 30 km over Earth's WGS84 ellipsoid (not its mean radius),
  above the mean radius (Mars 3,389.5, Moon 1,737.4 km: S:.../interior/bodies.py#L564, #L735). The game's files do
  not say if its Mars coordinates are planetocentric and east-positive; we took them so (RECALLED USGS convention;
  DOUBT). Earth is an ellipsoid (controller.ts#L60-62), so the game's geodetic latitudes became geocentric (WGS84, COMPUTED).

Links (built from the parser, not opened):
1. Coprates race: `https://spacemap.co/b/499/Mars?at=now,-13.82635,-59.03406,0.000228245227`; add `&angle=70.0,180.0` to face the canyon wall to the south (`src/data/surfaces.ts:242`).
2. Coprates features: `https://spacemap.co/b/499/Mars?tab=features&quad=mc18`
3. Gale site: `https://spacemap.co/b/499/Mars?at=now,-4.58900,137.43660,0.000227576769`
4. Curiosity (the README's link, without its view): `https://spacemap.co/p/100265984/Curiosity`
5. Taurus-Littrow at the game's landing time (COMPUTED from `src/data/apolloTimeline.ts:7-10`, `:33`): `https://spacemap.co/b/301/Moon?at=1972-12-11T19:54:58.000Z,20.18629,30.76622,0.000117140705`
6. Apollo 17 EVA-1 panorama: `https://spacemap.co/view/b/301?at=apollo17-landing` (other_worlds.py#L93, #L367-370; S:frontend/src/lib/state/panorama-link.ts#L6-11)
7. Monument Valley: `https://spacemap.co/b/399/Earth?at=now,36.80111,-110.10361,0.000427842877`
8. Pad 39A: `https://spacemap.co/g/site-cape-canaveral`
9. Huygens on Titan: `https://spacemap.co/view/b/606?at=huygens-pia08113`
10. Europa: `https://spacemap.co/b/502/Europa`
11. Voyager 2 at Neptune (COMPUTED from `src/data/trajectories/voyager2.ts:18`): `https://spacemap.co/p/49000448/Voyager%202?at=1989-08-25T03:57:00.000Z`
12. Voyager 1 at Jupiter (noon UTC, as the game reads a bare date, `src/data/probes.ts:168`): `https://spacemap.co/p/49065984/Voyager%201?at=1979-03-05T12:00:00.000Z`
13. Cassini arriving at Saturn: `https://spacemap.co/p/88592384/Cassini?at=2004-07-01T12:00:00.000Z`
14. New Horizons at Pluto: `https://spacemap.co/p/104804352/New%20Horizons?at=2015-07-14T12:00:00.000Z`
15. Hayabusa2 at Ryugu: `https://spacemap.co/p/112156672/Hayabusa2?at=2018-06-27T12:00:00.000Z`; Ryugu: `https://spacemap.co/s/20162173/Ryugu`
16. The 2027 eclipse at the game's time: `https://spacemap.co/b/399/Earth?at=2027-08-02T10:07:00.000Z`

### Facts side by side
The game's numbers are rounded NASA Planetary Fact Sheet values (READ `src/data/bodies.ts:1`).
- **They agree** (READ; conversions COMPUTED). The radii of the planets but Jupiter, the Moon, Io, Europa, Titan, Pluto
  and Charon are within 0.5 km of space-map's interior models (`src/data/bodies.ts:52-106`; interior/bodies.py).
  Venus 460 °C and 737 K, Mars −63 °C and 210 K, Titan −180 °C and 93.65 K, Triton −235 °C and 38 K, Pluto −230 °C
  and 44 K (`src/i18n/facts.en.ts:556`, `:576`, `:738`, `:825`, `:833`; S:.../temperature/bodies.py#L63, #L98,
  #L112, #L116, #L128). The surface pressures of Venus, Titan and Earth (facts.py#L162, #L423, #L182).
- **They differ** (READ both sides):
  - Jupiter: 69,911 km in the game (`src/data/bodies.ts:66`), 71,492 km in space-map (interior/bodies.py#L1933),
    which is Jupiter's equatorial radius (RECALLED NASA fact sheet). For Saturn, Uranus and Neptune both use the
    mean radius (#L2024, #L1657, #L1687): two definitions, not two measurements (INFERRED).
  - Sun radius: 696,340 km (`src/data/bodies.ts:49`) against the IAU's 695,700 km (S:.../math/units.ts#L7-8).
  - Giant planets: −110, −140, −195, −200 °C in the game (`facts.en.ts:586`, `:596`, `:606`, `:616`); 125, 110,
    58, 55 K (−148, −163, −215, −218 °C, COMPUTED) at the deck near 0.3 bar in space-map (temperature/bodies.py#L104-109).
    The game's values are close to the 1-bar temperatures (RECALLED NSSDCA 165, 134, 76, 72 K): two levels, not
    two measurements (INFERRED).
  - Charon: about −220 °C, which is 53 K (`facts.en.ts:849`), against 45 K (temperature/bodies.py#L137).
  - Mars surface pressure: 0.6 kPa (`src/data/water.ts:11`), below the 0.611 kPa triple point that the game's water
    cup uses (`:20`). space-map: 636 Pa at the mean radius, "variable", with the datum at 610.5 Pa and ±25 % over
    the seasons (facts.py#L184-186, #L204).
  - Ganymede 2,634 against 2,632.7 km; Dione 561 against 564.1 km (`bodies.ts:70`, `:81`; interior/bodies.py#L1149,
    #L1602). These are interior-model radii; whether space-map's pages show them as the size: DOUBT.
  - Voyager 2 at Saturn: 1981-08-25 in the game's log (`src/data/probes.ts:55`, `:67`), though its own trajectory
    has closest approach at 1981-08-26 03:25 UTC (COMPUTED from `src/data/trajectories/voyager2.ts:16`). A space-map
    developer test, not page content, uses 1981-08-26T03:24 UTC from NASA's timeline
    (S:data/scripts/horizons_synth_e2e_validate.py#L10, #L86-89). RECALLED: in US time it was still 25 August (DOUBT).
  - Apollo 17 lunar module: 155.4 m east and 140.1 m north of the game's origin, after Haase et al. 2018
    (`src/data/apollo17.ts:1-4`, `:39-42`), so 20.19091 N 30.77168 E (COMPUTED). space-map's EVA-1 camera is at
    20.191529 N 30.772517 E, "14 m north-northeast of the LM", after LROC's 2016 list (other_worlds.py#L93-98;
    other-world-panoramas.md#L202). So the two module positions are about 20 m apart (COMPUTED, rounded; DOUBT).

### Text and licences
- Wikipedia extracts are CC BY-SA (READ S:docs/export-format/sitemap.md#L91); images carry their own terms
  (S:docs/export-format/images.md#L42). space-map's own text and code are AGPL-3.0 (S:LICENSE#L1).
- The Huygens views are under the ESA Standard Licence, not public domain (other-world-panoramas.md#L48).
- Ryugu: Askaniy's map is CC BY 3.0. The JAXA mosaic, listed but skipped, has no licence set; its terms bar modification, and commercial
  use without permission (S:.../textures/download-metadata.yaml#L695, #L704-706).
- Numbers, names and dates are facts; quoting them with citations copies no text (DOUBT: not legal advice).

## 3. The game's terrain and light today, against space-map

### 3a. The 200 m HRSC-MOLA blend everywhere, as a tile pyramid
- **space-map:**
  - It uses the USGS MOLA-HRSC blended DEM, 200 m/px, for the whole planet
    (S:data/src/space_map_data/constants/manifests/textures/displacement/mars/download-metadata.yaml#L1-18).
  - It is streamed as tiles; at draw time, bilinear filtering is all it does to them
    (S:frontend/src/lib/scene/objects/surface/displacement.ts#L205, #L294).
- **The game:** the same product, but only locally.
  - The game's packer reads it remotely at pack time (`tools/terrain/pack_coprates.py:42`, the USGS VRT). It keeps one
    100 km square around each Mars site at 512 px, about 195 m/px (`:46`; COMPUTED 100,000/512).
  - That square is the horizon ("遠くの地図（100 km 四方）は地平線の山並みに使う", `src/components/surface/dem.ts:5`).
    It is drawn as rings, shrunk ×6 toward the eye (`src/components/surface/farTerrain.ts:12`).
  - In space, Mars is a Solar System Scope texture (CC BY 4.0) on a sphere (`src/data/textures.ts:1`, `:13`). Its
    relief there is the texture's brightness read as height (`src/components/planetMaterial.ts:278-279`), plus
    procedural craters.
  - The landing is a separate scene (its own `<Canvas>`, `src/components/surface/SurfaceView.tsx:1874`), so nothing
    zooms from orbit to the ground.
- **What the game would gain:** a real-relief Mars globe in the flight view. For the drive, the game's local square
  already carries the same data.

### 3b. 5 m CTX imagery
- **space-map:**
  - The 925 m Viking colour map, with the 3,960 quads of the Murray Lab 5 m CTX mosaic as a brightness layer
    (S:docs/export-format/tiles.md#L120; colour manifest
    S:data/src/space_map_data/constants/manifests/textures/download-metadata.yaml#L400-425).
  - The manifest's licence: "Free use for all purposes" (#L407).
  - CTX keeps its own Sun's shading ("CTX holds real shading up to kilometres", #L413). Only site mosaics under a
    terrain model are de-shaded (S:data/src/space_map_data/ingest/providers/textures/deshade.py#L1-8).
- **The game:** no orbital imagery on the ground at all. A search for CTX, Murray, ortho* found nothing; the positive
  control, "HiRISE", matched `src/data/rallyCourse.ts:2`.
  - Near the rover, the shader picks one of 4 seamless material tiles baked in Blender per pixel (dust, gravel, dark
    sand, bedrock) and adds small craters of 0.3-3 m (`src/components/surface/marsGround.ts:5-11`).
  - The far rings are vertex colours set by slope (`farTerrain.ts:62-71`).
- **The game's own rule on baked shading.** For the Moon mission the game takes the photometrically normalised Kaguya
  albedo and leaves out the LROC WAC mosaic, because the WAC was taken under another Sun ("is not used for that
  reason", `tools/terrain/pack_moon_track.py:7-10`). The game's Mars Sun moves through the day
  (`src/components/surface/skyClock.ts`, `SurfaceView.tsx` per frame). CTX as it comes would put a second, fixed Sun
  into the ground (INFERRED).
- **What the game would gain:** real albedo patterns on the canyon floor and walls from about 0.5 km out, where the game now
  paints colour by slope.
  - Cost: de-shading it against the game's own height map, as space-map does for its sites.
  - Size: one CTX quad would cover the whole 100 km Coprates square (COMPUTED from the site centre in
    `public/terrain/mars_coprates.json`; DOUBT: assumes quads start at multiples of 4°).
  - It would change the look.
- **At Gale:** space-map also lists the USGS Gale 25 cm orthophoto, public domain (colour manifest #L445-455). It is
  the image twin of the terrain model the game's Gale site uses. But the game adds invented hills, plateaus and channels at Gale
  (`src/components/surface/terrain.ts:249`, `:495-516`), so a real photo would not match the ground it is drawn on
  (INFERRED).

### 3c. Laying a site DTM into the global map, and the horizontal shifts
**the game's rule (READ):**
- **Coprates.**
  1. The HiRISE strip is resampled into the 6.4 km near map (6.25 m/px).
  2. The far map is moved up or down by one constant: the mean of (HiRISE − HRSC) over a ring 1.5-2.8 km out
     (`tools/terrain/pack_coprates.py:136-138`). That constant is **120.67 m** (`public/terrain/mars_coprates.json:15`).
  3. Holes in the strip are dilated by 10 px, about 62 m, for "the outer ~60 m of the strip is noisy" (`:141-143`).
     They are filled from the far map with a smoothstep fade over 300 m (`:146`). The comment above says 150 m
     (`:140`); the code fades over 300 m. A comment slip, harmless.
  4. A 3.2 km detail map at 1.5625 m stores the residual against the decoded near map, ±1.27 m in 8 bits, faded out
     where the near map is fill (`:156-169`).
  5. In the app the residual fades to 0 over the outer 60 m (`src/components/surface/dem.ts:168`).
- **Gale** (the plain `mars` site). The same constant-shift rule, on a ring 2.6-3.1 km out (`tools/terrain/pack_dem.py:63`),
  with a shift of −23.87 m (`public/terrain/mars.json:15`).
  - The detail map is the MSL Gale merged DEM 1 m v3, averaged to 1.5625 m (`tools/terrain/pack_detail.py:9`, `:57`).
  - The near and far inputs come from fetch scripts outside the repo (`pack_dem.py:1-2`, `/mnt/project-files/...`).

**space-map's rule (READ, S:docs/export-format/tiles.md#L88, #L252):**
- The global map keeps the large scales; the DTM gives the relief below a set scale. Their offset is measured at that
  scale and removed.
- A later DTM replaces an earlier one across 16 px from each edge.
- Coarse-block fills inside a DTM are detected and turned into a smooth surface.

**Where the two differ, for the game:**
- **The Gale fill blocks (READ).** space-map flags the very file the game's Gale site uses: "Around the HiRISE models, the
  file holds a 20 m model as blocks of one height" (`fill_block: 20`, displacement manifest #L48-50).
  - The game's `pack_detail.py` averages that file with no such handling. It asserts only that there are no gaps (`:36`).
  - Where a fill region falls inside the game's 6.4 km near map or 3.2 km detail map, the ground would carry 20 m terraces.
  - DOUBT: whether any fill lies inside the game's windows around Bradbury Landing was not checked against the data.
- **Horizontal offsets (READ).** space-map moves each HiRISE terrain model onto CTX with a `shift_m [north, east]`
  (tiles.md#L248).
  - The displacement manifest holds 12 of them, 105 m to 1.7 km in size (COMPUTED from the 12 values).
    Pathfinder's is `[1662, 391]` (#L120): "The file puts the ground 1.4 km south and 0.6 km west of where the
    MOLA-HRSC map has it".
  - The colour manifest says such shifts were "measured by correlation" (#L457-459).
  - The game's Coprates file, DTEEC_018347_1660_026417_1660, is not in space-map's lists (search: no match).
  - The game's packer assumes the strip sits where its label says, and joins it to HRSC by height only.
  - A 120.67 m mean vertical offset is large for a DTM tied to MOLA (RECALLED: HiRISE DTMs are controlled to MOLA;
    DOUBT). A horizontal offset could be part of it. We have not measured it.
- **Scale split vs constant shift (INFERRED).** space-map's rule lets the global map set the long slopes, even inside
  the DTM. For a race track that is a loss: HiRISE is the better measurement at every scale inside the strip, and the
  course is driven on it. The game's constant shift fits a single-DTM site. Nothing to take here.

### 3d. Per-fragment gradient normals and the self-shadow march
- **space-map (READ, S:frontend/src/lib/scene/objects/surface/self-shadow.ts#L1-14, #L36):**
  - The normal is the height field's gradient, per fragment: "a normal map we never bake".
  - Each fragment marches the height texture toward the Sun in 32 steps for its shadow.
  - Relief detail is bound by the height texture, not the mesh, and the Sun may move.
- **The game, normals (READ):** computed per vertex, on the CPU, from neighbouring heights.
  - Near the rover: 64 m tiles, 5 × 5 at a 1 m step, 3 × 3 at 2 m on light devices (`SurfaceView.tsx:582`;
    `src/components/surface/wideGround.ts:12`; normals at `terrain.ts:729-734`). That is finer than the 1.56 m detail
    data, so per-fragment normals add nothing within about 160 m of the rover (INFERRED).
  - Further out, the ground is a ring mesh to 3.2 km (`terrain.ts:12`, `:577`, `:617`). Its vertex spacing is about
    20 m at 1 km and 39-56 m at 3.2 km (COMPUTED from those lines). The near map under it holds 6.25 m relief there.
  - The far rings carry vertex normals from the 195 m far map (`farTerrain.ts`).
- **The game, shadows (READ):**
  - The ground meshes only receive shadows (`SurfaceView.tsx:669`, `:698`, `:701`).
  - The Sun's shadow map covers ±70 m for rocks, the rover and the lander (`:1384-1389`).
  - The far terrain is lit by its normals only, with no shadow (`:475`).
  - So at Coprates the canyon wall, "南へ 15 km、高さ 8 km" (`src/data/surfaces.ts:242`), casts nothing on the race
    floor when the Sun is low.
  - The Moon mission is different: it bakes "前もって計算した山の影" (pre-computed mountain shadows) for its fixed
    landing-day Sun (`src/components/moonMission/LunarWorld.tsx:20`; `tools/terrain/pack_moon_track.py:21`, B channel).
- **What the game would gain:**
  - (a) Per-fragment normals from the near map on the ring mesh would show 6.25 m relief from 0.3 to 3.2 km out,
    without more vertices.
  - (b) A march, or a baked horizon map, over the near and far maps would put the canyon wall's shadow on the floor at
    dawn and dusk, and move it with the game's Sun.
  - Both change the look, (b) strongly.
  - Cost of (b), INFERRED, not measured: one extra texture per ground material, and up to 32 height taps per ground
    fragment. That is about 66 M taps a frame if the ground filled a 1920 × 1080 screen (COMPUTED). The game has a
    `lowMemory()` tier (`dem.ts:86`) where it could stay off.
  - Licence: the method only; space-map's shader is AGPL-3.0.

### 3e. Detail synthesis
- **space-map: none found.**
  - No fBm, simplex or Perlin anywhere in its frontend `.ts` or `.svelte` files. No noise function either: the word
    "noise" is found, as graphics only in dither and ray-march jitter code (`S:frontend/src/lib/scene/setup/output-dither.ts#L14`).
  - Its panorama pipeline states "No sky or ground is synthesized" (S:docs/surface-panoramas.md#L5).
- **the game: at every scale, by design (READ):**
  - fBm bumps on the real DEM, ±0.25 m at a 22 m wavelength and ±0.075 m at 5 m (`terrain.ts:243`, `:251`);
  - at Gale, invented gentle hills, stepped plateaus and dry channel trenches (`:495-516`), because the real floor is a
    flat plain (comment at `:491-493`);
  - shader-drawn craters of 0.3-3 m on Mars (`marsGround.ts:11`), and material tiles on every body
    (`src/components/surface/groundMaterial.ts:5-8`);
  - globes: brightness read as height, plus procedural craters (`planetMaterial.ts:278-303`);
  - the Moon globe adds noise below 5 km (`src/components/flight/moonGlobe.ts:6`).
- This is the game's look, its author's choice. Nothing is proposed here. It is noted so that nobody reads
  "space-map is real data only" as a list of defects in the game.

## 4. The SDK `spacemap` beside the game (Vite + TS + React Three Fiber)
- **The package (READ, npm registry metadata and tarball listing, fetched 2026-11-25):** `spacemap` 0.1.26, MPL-2.0,
  8 files, 5.09 MB unpacked.
  - `index.js` (npm, three.js kept outside): 1.62 MB, about 445 kB gzipped.
  - `dist/spacemap.js` (CDN): 1.65 MB, about 501 kB gzipped. It bundles three 0.183.2, svelte 5.56.1 and
    satellite.js 7.0.0 (`THIRD_PARTY_NOTICES.txt`).
  - The gzip sizes are COMPUTED with `gzip -9` on the files as text; nothing was run.
  - For scale: the game's own main bundle, built from 7bbcdb5, is 2.83 MB, 925 kB with `gzip -9` (MEASURED: `npm ci`,
    then `npx vite build`; the file `dist/assets/index-*.js`). The npm build would add about 57 % to that (COMPUTED).
- **three.js does not match.**
  - The peer is `three ^0.183.0` (npm metadata; S:frontend/src/sdk/npm/package.template.json#L25-27).
  - The game has `"three": "^0.186.1"` (`package.json:23`), 0.186.1 in its lockfile (`package-lock.json:3987`).
  - A caret on 0.x pins the minor, so 0.186 is outside the range (RECALLED semver rule). npm would refuse it as a peer
    conflict without `--legacy-peer-deps` or an override (RECALLED). Whether the SDK works on r186 is untested.
  - The CDN build sidesteps this with its own private three, at the cost of a second copy of three on the page.
- **Beside, not inside:**
  - `createMap({ container })` builds the map in an element (S:frontend/src/sdk/index.ts#L44).
  - The map makes its own `WebGLRenderer` on its own canvas (S:frontend/src/lib/scene/setup/three-boot.ts#L107).
  - R3F's `<Canvas>` owns its renderer too. So the map can only sit beside the game's canvas, as a second WebGL context.
  - It can take the game's things into its own scene: `map.objects.add({ model: { object3d } })`, with the game's own loader
    (S:frontend/src/sdk/npm/README.md#L307-330).
- **The data host:**
  - The defaults are `static.spacemap.co`, `images.spacemap.co` and `live.spacemap.co`, with `tilesUrl: ''`
    (S:frontend/src/lib/host.ts#L89-92).
  - The code says of the tile host: "The production CDN serves neither: without it a body draws its whole-globe maps
    alone, and the map has no stars" (S:frontend/src/sdk/index.ts#L56-58).
  - The tiles are served from the author's own machines through a Cloudflare tunnel
    (S:infrastructure/tiles/compose/README.md#L12-17). The site switches them on with `PUBLIC_TILES_URL`
    (S:frontend/src/lib/state/kit-host.ts#L20).
  - The SDK's README says "No key or quota for now" (S:frontend/src/sdk/npm/README.md#L11). `configureHost` can
    point everything at a mirror (S:frontend/etc/spacemap.api.md#L206), but a mirror means serving the tile tree
    yourself.
- **Failure:** `createMap` rejects when WebGL or the first data fails (S:frontend/src/sdk/index.ts#L113). An embed
  would have to catch that, so that the game carries on without the map (INFERRED).
- **Licences:**
  - The SDK's MPL-2.0 copyleft works file by file. Using it unmodified as a dependency leaves the game's own files
    under its author's terms (RECALLED MPL-2.0 §3.3; DOUBT, not legal advice).
  - The app and pipeline code are AGPL-3.0. Copying any of it into the game's repository (no licence) would need the whole work under
    AGPL (DOUBT, not legal advice).
  - The data keeps its sources' terms, and the credit line the map draws cannot be removed
    (S:frontend/src/sdk/npm/README.md#L13-35).
  - The licence note in space-map's own manifest applies to the game's far maps too: the HRSC-MOLA blend "incorporates ESA
    Mars Express HRSC data (CC BY-SA 3.0 IGO); the ShareAlike term could arguably attach" (displacement manifest
    #L12-14).
  - The game's site files state the USGS and HiRISE terms but not HRSC's CC BY-SA (`public/terrain/mars_coprates.json`,
    `licence`). DOUBT: low risk per
    space-map's own reading; the author's call.
- **In sum:** it does not fit inside the game's scene. It could serve a separate developer page, such as a reference
  panorama (§6).

## 5. Atmospheres
- **space-map (READ):**
  - Rendered scattering shells for 10 bodies (S:data/src/space_map_data/constants/atmosphere/bodies.py: 10
    `BodyAtmosphere` entries). Every value is derived from cited constants and checked by tests against published
    values (S:docs/export-format/atmospheres.md#L13).
  - The "21 planets and moons from 100+ papers" in the README are its atmosphere-and-interior fact pages
    (S:README.md#L47), not 21 rendered skies.
  - Mars:
    - 636 Pa, g = 3.73 m/s², and an isothermal 214 K chosen to reproduce the 11.1 km scale height (bodies.py#L130-138);
    - clear-season dust with τ ≈ 0.15, "low end of the 0.15-0.4 clear-conditions range"
      (S:data/src/space_map_data/constants/atmosphere/aerosols.py#L115-116);
    - scatter (0.0133, 0.0115, 0.0103)/km and absorption (3.4e-4, 2.1e-3, 3.4e-3)/km at 680/550/440 nm, scale
      height 11 km (#L131-133);
    - a double Henyey-Greenstein phase fitted to MSL camera data (Chen-Chen et al. 2019), with overall g = 0.687 red,
      0.730 green, 0.777 blue (#L53-60);
    - a seasonal L_s climatology for dust τ, dust scale height and pressure (atmospheres.md#L138).
- **the game (READ):**
  - Surface skies for 6 bodies: Earth, Mars, Venus, Titan, Pluto, Triton (`src/components/surface/atmosphere.ts:31-78`).
    The table carries no citations.
  - Mars: Rayleigh scale height 11.1 km (`:41`); Mie extinction (0.030, 0.029, 0.0285)/km over 11 km (`:42`); a low
    haze layer 1.6 km thick (`:44`) scaled by the site's haze, 0.35 for Mars (`src/data/surfaces.ts:113`) and ×0.6 at
    Coprates so the walls do not vanish (`:242-243`).
  - The phase is Cornette-Shanks per channel with g = (0.6, 0.72, 0.9) (`atmosphere.ts:43`, `:179`).
  - There are dust storms and dust devils (`src/components/surface/weather.ts:4`).
  - The globes seen from space have an artistic rim glow (`src/components/Atmosphere.tsx`).
- **Side by side (COMPUTED from the lines above):**

  | Mars, vertical τ (R, G, B) | value |
  |---|---|
  | the game at Gale | 0.364, 0.350, 0.344 |
  | the game at Coprates | 0.350, 0.338, 0.332 |
  | space-map, clear season | 0.150, 0.150, 0.151 |

  - So the game's dust column is about 2.3 times space-map's baseline, and still inside the 0.15-0.4 range their own source
    quotes.
  - The game's blue-forward phase (g 0.9 blue against 0.6 red) is steeper than the measured fit (0.777 against 0.687).
  - What either does to the sky's look was not rendered or compared.
- **What the game would gain:** a cited reference set, to check the game's numbers or to build a version to present. The sky
  colour is part of the feel, so any change is the author's call. Numbers taken from papers, cited to the papers, are
  facts; the AGPL code is not taken (DOUBT: general copyright reading).

## 6. The rest
- **Travel math (READ).**
  - space-map has Lambert, low-thrust, brachistochrone, flyby/assist, radiation, shield and dust models
    (`S:frontend/src/lib/math/travel/`).
  - It has the Δv "subway map", where every body is a line of stops (surface, low orbit, escape) joined by Hohmann
    transfers (S:frontend/src/lib/math/travel/subway.ts#L1-12).
  - It has a vehicle catalogue "built from cited constants", which answers "cannot judge" rather than guess
    (vehicles.ts#L1-9).
  - The game has no transfer math: a search for Hohmann, porkchop, Δv found nothing. The positive control, "Lambert",
    matched only material names.
  - The game's ship travels a log-compressed layout (`src/data/scale.ts:2`) with real planet directions from JPL Standish
    elements on circular orbits (`src/data/ephemeris.ts:6-8`).
  - Possible content for the ship's log or the quizzes, if the author ever wants it.
- **Probes (READ).**
  - space-map: the README claims historical attitude for 26 probes and 5 landers, and over 290 spacecraft models
    (S:README.md#L52-53); its attitude recipes name 25 craft (§2b).
  - The game already has its own: real trajectories from JPL Horizons (`src/data/trajectory.ts:1`). Cassini's was
    fetched on 2026-11-21 (`src/data/trajectories/cassini.ts:1`); Voyager 2 and Hayabusa2 are beside it. The probe
    journeys have real dates and bodies (`src/data/probes.ts:1`).
  - These overlap with what the game has.
- **IAU names with Wikipedia extracts (READ).**
  - Per-feature `wikipedia: { extract, description, url }` (S:docs/export-format/nomenclature.md#L78), in up to 12
    languages, Japanese included.
  - The game shows no IAU feature names (search for IAU, Wikipedia: only a pole-orientation comment and one Commons photo
    URL).
  - The extracts are CC BY-SA (S:docs/export-format/sitemap.md#L91), so they would bring ShareAlike terms with them.
- **Deep links (READ).**
  - space-map's links carry the view: `?at=<date>,<lat>,<lon>,<zoom>`, where the zoom is the camera's distance from
    the body's centre, plus `&angle=` (S:README.md#L7-9; S:frontend/src/lib/state/url.ts#L308-333; §2b).
  - The game's URL holds flags only: `sf|real`, `look=`, `ship=` and others (`src/state/store.ts:99-105`).
- **SVS star maps (READ).**
  - space-map uses NASA SVS Deep Star Maps 2020, public domain: a 64k star map and a 16k starless Milky Way
    (S:data/src/space_map_data/constants/manifests/textures/star-map/download-metadata.yaml#L9-30).
  - The game draws the stars from the Yale Bright Star Catalog (`src/components/Sky.tsx:49`). Its Milky Way glow is
    Solar System Scope's 2K map (CC BY 4.0) with the star dots median-filtered away (`scripts/build-milkyway-glow.py:3`).
  - That glow is also in the race's night sky (`src/components/surface/SurfaceView.tsx:136`).
  - SVS publishes the starless map directly, at higher resolution, and public domain. It is the smallest step on this
    page, but it would change the game's sky.
- **Rover panoramas (READ).**
  - space-map places Curiosity's colour panoramas at the rover's real stops, joining each caption's sol to the PLACES
    traverse file (S:data/src/space_map_data/panoramas/msl_localize.py#L1-7). The SDK opens them with
    `createPanorama` (S:frontend/etc/spacemap.api.md#L313).
  - The game's Gale site is near Bradbury Landing (`public/terrain/mars.json`, centre −4.589, 137.4366).
  - The game's terrain lab (`#terrain-lab`) already compares ground styles against NASA Curiosity photos, PIA17931,
    PIA19912 and PIA19839 (`src/components/terrainLab/TerrainLab.tsx:12`, `:48-50`).
  - A placed panorama near Bradbury would be the same kind of reference, with a known position.

## 7. Open questions and doubts
1. Does any 20 m fill of the Gale merged DEM fall inside the game's Gale windows (6.4 km near, 3.2 km detail)?
2. Is DTEEC_018347_1660 offset horizontally from the HRSC-MOLA blend, and does that explain part of the 120.67 m join
   offset?
3. Does `spacemap` 0.1.26 (the newest on npm, 2026-11-14) run on three r186? Untested; nothing was installed.
4. The licence readings (MPL, AGPL, CC BY-SA in HRSC) are general readings, not legal advice.
5. space-map is updated daily. A newer commit than fcc615c5 may differ from what is cited here.

Written by cratercamper and Claude Code, 2026-11-25, from space-map at fcc615c5, its npm package 0.1.26 and the
original game at 7bbcdb5.
