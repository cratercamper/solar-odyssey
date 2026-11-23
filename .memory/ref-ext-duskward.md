---
name: ref-ext-duskward
description: How "Duskward - An Interactive World", a WebGPU world inside a cylinder habitat published on agnt.gg by another author, is built, read from its page source and described in our words; methods only, no code taken from it.
type: reference
---

# Duskward: how a small WebGPU world is built, read from its page source

"Duskward - An Interactive World" is a browser world by nathan (the creator name agnt.gg gives), published on agnt.gg:
a garden with fields, woods and houses inside a cylinder, lit by a sun at one end. We read its page source to learn
how it gets so much out of one 1.1 MB HTML file, and wrote down what we found. No code from it is used or copied here:
the page has no licence of its own, so this is a description of ideas and methods only. Its methods (section 4) may be
useful to other browser 3D projects. Every claim is READ from the page's code unless it is marked MEASURED (run in a
browser), COMPUTED or INFERRED.

Cite form: `D:<name>` = an identifier in the minified main script (the third `<script>`, whose tag starts at byte
981,795) of the creation's single HTML file, sha256
`19016ec3da9bc7b4f461a923f889c49134807bdf42c67a49ab40ca94f7ff0d8e`, 1,108,492 B. The names are minifier output: they
hold for this file only. Source: `GET https://agnt.gg/api/previews/DmDSpPYm/raw` (the page
https://agnt.gg/creation?id=DmDSpPYm, "View source" there). The API said `updated_at` 2026-11-23 16:23:48,
`created_at` 2026-11-16, creator "nathan", `source` "desktop-app", 5,667 views at the time.

## 1. In short
- **No licence of its own, so ideas and methods only, never copied code.** Neither the page nor its API entry states a
  licence. The licence of the AGNT software it was made with (AGNT Community Core License 2.0, §7 "Your Outputs") says
  "Licensor claims no ownership of your Outputs": the rights stay with the author, and it grants no one else any.
  READ.
- One self-contained WebGPU page: a garden inside a drum 140 m in radius and 480 m long, with the sun at one end, so
  the time of day is how far you stand from it. Everything is procedural (noise); no real data.
- Worth keeping for its methods in a small budget: a buffer-less grass system, masks made from physical quantities
  (slope, height above water), rule-built houses in metres, and hex-tiled detail maps.

## 2. What it is (READ unless noted)
- **Size:** 80 KB of inline fonts (League Spartan, woff2 as base64); 740 KB of audio as JSON (8 WebM/Opus clips:
  meadow, wind, stream, dusk, two birds, frog, owl; the page credits ElevenLabs for nature sounds); about 127 KB of
  minified JS with WGSL in template strings; a 145 KB WebP poster image in the CSS. The engine is the 127 KB.
- **WebGPU only:** it throws "needs WebGPU" when `navigator.gpu` is missing or `requestAdapter()` returns null (the
  page asks for Chrome or Edge on a desktop computer). On our Linux test machine that is what both browsers do by
  default. With Firefox's `dom.webgpu.enabled` it runs (Firefox 160 on an NVIDIA GTX 1660, MEASURED). Chromium 156
  returns no adapter by default, and with `--enable-unsafe-webgpu --enable-features=Vulkan` only the software adapter
  (SwiftShader); measured headless, a headed window not tested.
- **Startup:** about 2.5 s to the menu in headless Firefox 160 on that GPU (MEASURED). Phases are labelled
  ("Spinning up the drum…", "Raising the hills…", "Laying out the fields…", "Raising the aqueduct…", "Letting the
  sun in…"), with `performance.now()` stamps per phase (`D:G0`).
- **Quality tiers** 0-2 in `localStorage.duskward`. A lost device raises the tier by one and asks for a reload
  (`D:Z.lost`). Settings go into the URL hash as a shareable link.
- **Physics:** walking is a plain 9.8 m/s² fall outward with a ground clamp (`D:dc` area). The page calls it "a garden
  inside a turning drum", and the stars seen past the night end turn round the axis (0.028 rad/s, READ). The walking
  code leaves the turn out (no Coriolis). For scale, 1 g from spin at 140 m takes one turn every 23.7 s (2π√(140/9.8),
  COMPUTED).

## 3. How it works (READ, from the minified code)
### 3a. Terrain
- A WGSL compute pass fills a 1,024 × 641 grid over (angle, axial z) with `vec4(height, waterLevel-height, terrace,
  rockiness)` (shader `terrain()`): domain-warped fBm hills, a carved river (`rivTh(z)`) that widens down the drum,
  a lake, and a hill whose top is quantised into 1.3 m terraces (`tz`). The far end cap curls up as walls.
- Up is radial: `upAt(p) = -p.xy/|p.xy|`. Heights are measured inward from R = 140 m.

### 3b. One mask drives everything (`D:Jc`, CPU, once at load)
Per grid point, 4 channels: R grass, G flowers, B rock, A tree shade.
- slope = 1 − n·up. Rock = max(smoothstep(.26,.44,slope), rockiness·smoothstep(.03,.15,slope), paving near a
  landmark).
- Grass = (1 − rock) · smoothstep over 0.1-0.6 m above the water line · less on terrace faces.
- Flowers = grass · two fBm patch fields, the stronger near the sunny end (z < −60).
- Later passes edit it: fields thin the flowers (`D:ra`), trees write shade into A and thin the grass by 30 %
  under their crowns (`D:la`), houses clear a ring around themselves and draw paths (`D:ya`).

### 3c. Grass (shader `D:Fc`, "grass")
- **No vertex buffer:** one instanced draw of GN² instances, 7 vertices each (a strip of 3 segments + a tip), built
  in the vertex shader from `vertex_index` and `instance_index`.
- **World-anchored grid around the camera:** cell size `D:h0` = 0.20 / 0.26 / 0.38 m and GN = `D:Hn` = 340 / 260 /
  180 by tier, so the radius is about 34 m in every tier (GN·cell/2) and the blade count is 115,600 / 67,600 /
  32,400. The cell id comes from floor(camera / cell) + the instance offset, and it wraps exactly round the drum
  (`GNA = round(2πR/cell)`). A PCG hash of the cell id gives jitter, height, yaw and flower, so blades do not swim
  when the camera moves.
- A blade exists where hash < grass mask. Its height is (0.30 + 0.55·r²) m · (0.55 + 0.45·mask), taller toward the
  dusk end and ×1.6 in crop fields. It fades out over the last 30 % of the radius, and near the eye it is capped when
  walking.
- **Wind:** a value-noise gust field scrolling along the drum. The bend is quadratic in height along a per-blade
  direction.
- **Light:** the baked ground-light texture (shadow, ambient occlusion, lamp light, open sky) at the blade's root;
  a back-light term pow(view·sun, 3) that lights the tips against the sun; darker roots.
- **The trick that makes it read well:** a blade's colour is `grassCol()`, the same function the ground uses (two
  rotated value-noise octaves, dry patches, a dusk tint). Sparse blades and the bare ground beyond 34 m read as one
  meadow.

### 3d. Fields (`D:ra`, CPU)
- A jittered grid of about 22 m (round the drum) × 34 m (along it). Anisotropic Voronoi (along-axis distance ×0.55):
  F1 and F2 per texel; interior = smoothstep(.35, 1.2, (F2 − F1)/2), so each field fades out toward its border,
  which reads as a verge.
- Per cell: one of 8 crop colours (weighted random), a row direction in 45° steps, and a sinusoidal row pattern with
  a wobble (shader `cropCol()`). Rows fade out by distance and by pixel footprint, so they do not alias.
- Allowed only in two axial bands, on gentle slopes, away from the river, the lake and landmarks, where the noise
  allows.

### 3e. Mud, wet ground, terraces, detail (ground shader `groundAlb()`)
- Mud is height above the water: ground 0.25-0.75 m above the water line goes mud-brown, and darker toward the line.
- On the terraced hill, flatness (`tread` = smoothstep on 1 − n·up) splits it: flat tops count as flooded paddies
  (the distant-ground bake draws them as water; the near shader computes `pad` = terrace · flatness), steep faces
  are dark earth, and the lip between them is wet mud.
- **Detail maps:** at load, shaders bake a texture array of tileable patterns (height + tone per layer; a second
  pass turns height into normals, "detail relief"). The ground samples them with **hex tiling** (`detailHex`):
  three samples per hex cell at hash offsets, blended with cubic barycentric weights, so the repetition never shows.
  Rock uses triplanar sampling of the same maps.

### 3f. Trees (`D:la` places, `D:na`/`D:sa`/`D:oa`/`D:ca`/`D:aa` build)
- Five types built at load from tubes (trunk, branches) and leaf cards, each in a high and a low version. The shader
  names type 3 the willow (strands). An orchard-like grid on the sunny side, noise-thinned woods in the middle, rows
  of one tall type along both river banks, a ring round the hill, willows by the lake and the river. Which type is
  which tree, apart from the willow, is INFERRED from its shape.
- Leaves are alpha-tested cards; the shadow pass discards on a procedural leaf field.

### 3g. Houses (`D:ya` places, `D:za` builds)
- **In metres:** 5.2-7.6 × 3.8-4.6 m footprint, walls 2.3-2.7 m, roof rise 1.3-1.8 m, 0.45 m overhang, stone plinth,
  two windows per long side and small gable windows (frame + glass + sill), door and step, chimney, ridge, a
  lean-to on 45 %, and a lamp post at a fixed offset.
- **Placement:** random tries, each checked against rules: more than 0.7 m above water, slope < 0.09, no rock, no tree
  shade, the footprint level within 0.8 m, at least 24-27 m apart (10 m in the hamlet), away from landmarks. Up to 46
  + 34 scattered, plus a hamlet of 13 facing its centre. Paths from each hamlet door to the centre are drawn into the
  mask (they clear grass and flowers).
- **Shading:** one "struct" shader by material id: two plasters, red tile with moss patches or slate (a per-tile hash
  tone, stains, streaks), coursed stone (0.55 m courses, staggered, moss on upward faces), wood. Windows glow toward
  the dusk end. A dirt band near the ground, and ambient occlusion from the baked ground-light texture.

### 3h. Light and sound (READ in part)
- The sun is a point light on the axis near one end, with a 6-layer `depth32float` cube shadow map; the shadow stores
  distance/far. Light falls off with distance, so the far end is dusk.
- Sound: the 8 clips loop as beds, and their gains follow time of day and place (`D:Mr` area). Birds, frogs, owls
  and chimes are scheduled events with random pitch and pan.

### 3i. How the work is split: GPU and CPU (READ)
**The design key: the sun never moves.** It is fixed on the axis, so a place's light never changes. Almost all
lighting is baked once at load and only looked up per frame.

At load (the phase labels in quotes):
1. **GPU compute, "Spinning up the drum"** (module "gen"): `terrain()` runs once per grid point, 1,024 × 641, in
   8 × 8 workgroups. It writes a storage buffer and an info texture, both holding (height, depth below the water
   line, terrace, rockiness).
2. **One readback:** `copyBufferToBuffer` into a `MAP_READ` buffer, then `mapAsync`: 10.5 MB to the CPU (16 B per
   point). This is the only startup round trip.
3. **CPU, "Raising the hills" … "Raising the aqueduct"** (`D:Jc`, `D:ra`, `D:la`, `D:ya`, …):
   - the cylinder mesh (positions, normals by central differences of the 3D points, int8-packed normals);
   - an index buffer in chunks of 32 × 40 cells, each with a bounding sphere for culling;
   - the slope array and the masks (§3b), fields, tree instances (sorted by chunk), houses and the aqueduct
     geometry.
   Each stage draws from its own seeded random stream (§3j), so the world is the same at every load.
4. **Uploads:** `writeTexture` for the masks, an occupancy texture of trees and houses with mips, and the vertex and
   index buffers.
5. **GPU bakes, "Letting the sun in"**, each a full-screen fragment pass into a texture:
   - **detail maps:** each layer drawn by its own shader, turned into normals ("detail relief"), then a mip chain
     by repeated downsampling;
   - **ground shadow** (per terrain texel, for each cube face of the sun): visibility toward the sun against the
     land (`landVis`) and against trees and houses (`objectVis`, with an IGN-rotated kernel), at the ground and
     again a little above it. The grass blends the two along its height;
   - **ground open:** sky openness by horizon search, 8 directions × 8 radii (1 to 26 texels), each giving
     1/(1 + tan²) of its horizon angle, less under tree crowns. This is the ambient occlusion;
   - **bake:** the lit ground at twice the grid resolution (`tWorld`), used far away and as the light source for
     the next pass;
   - **bounce:** one bounce of light inside the drum. For each texel it sums the baked radiance of a coarse grid
     over the whole drum surface. The helper takes both points, both normals and a patch area, so a form factor is
     INFERRED (its body was not read). It also stores a dominant direction for directional ambient. Inside a
     cylinder the far wall is overhead, so this light matters.
6. "Opening the window": the first frame.

Per frame (`D:Fi`):
- **CPU:** camera matrices (state in a `Float64Array`), sphere culling of the terrain chunks, near/far choice per
  chunk, and ordering from the camera's row outward. Runs of neighbouring visible chunks are merged into one
  `drawIndexed`, so draw calls stay at dozens.
- **One main pass** into `rgba16float` with 4× MSAA at the upper two tiers: terrain chunks; all houses and the
  aqueduct in one indexed draw; trees (5 types × near/far); grass (`draw(7, GN²)`, no buffers); birds; sprites;
  water quads.
- **Then full-screen passes:** atmosphere at half resolution (below), an upsample, a bloom chain (down, down …, up),
  auto exposure ping-ponged between two textures on the GPU (no readback), and the final post: ACES tonemap, vignette,
  gamma, IGN dither, straight to the canvas.
- **Two extra jobs** (`D:hn`, `D:Ui`) run only when flagged and time-gated, not every frame. What they render was
  not traced; that they redraw the sun's shadow cube and rebake the ground light is INFERRED.
- **GPU timing:** timestamp queries resolved into a small pool of buffers and mapped asynchronously, so the
  stats overlay (H) never stalls the frame.
- **Atmosphere** (shader "atmo"): a ray march per half-res pixel up to 1,200 m, the steps smoothstep-spaced and
  jittered per pixel (IGN + hash). Each step tests the sun's cube shadow map, which gives the light shafts. The
  phase is Rayleigh plus two Henyey-Greenstein lobes (g = 0.96 and 0.8). The far land seen through the haze comes
  from the baked `tWorld`.

### 3j. Noise and hashes (READ; origins recognised from the constants, NOT stated in the page)
- **Value noise** `vn(p)`: hash the 8 corners of the unit cell around `p`, blend trilinearly with the smoothstep
  fade `u = f²(3 − 2f)` (smooth slope, C1).
- **fBm** `fbm(p, n)`: n octaves, each at half the amplitude. The frequency rises ×2.03 per octave, not ×2, so the
  octaves' grids never line up, and each octave is shifted by (17.1, 31.7, 5.3). The sum is divided by the total
  amplitude (1 − 2a), so the result stays in 0..1. The CPU copy (`D:b0`, `D:pr`) is the same algorithm with a
  different corner hash: the CPU masks and the GPU shading use different noise fields.
- **No seam round the drum:** the noise is sampled at the 3D point on the cylinder (R cos θ, R sin θ, z), not at
  (θ, z), so the angle never wraps.
- **Domain warping** for the hills: two low-frequency fBm values (frequency 0.005 per m) shift the sample point by
  up to ±27 m before the hill fBm is read, which bends the hills into organic shapes. Hills = 12 m · (fBm at
  0.007/m, 4 octaves) + 3.4 m · (fBm at 0.028/m, 3 octaves), with a floor from one more value noise.
- **`ROT`:** an exact rotation (columns (.6,−.64,.48), (.8,.48,−.36), (0,.6,.8), orthonormal: COMPUTED), applied to
  the input of the colour noises so the noise grid is not aligned with the world axes.
- **Hashes:**
  - `h31`, `h33`, `h21`, `h22`: float hashes with the constants (.1031, .1030, .0973) and 33.33, those of Dave
    Hoskins' "Hash without Sine" (Shadertoy). Cheap, with no `sin`, so they behave the same on every GPU.
  - `pcg3`: an integer 3D hash with the LCG constants 1664525 / 1013904223 and the cross-mixing of "pcg3d"
    (Jarzynski & Olano, "Hash Functions for GPU Rendering", JCGT 2020). Used for per-blade randomness from integer
    cell ids, where float hashes would band.
  - `ign`: Interleaved Gradient Noise (52.9829189, 0.06711056, 0.00583715; Jimenez, SIGGRAPH 2014 course, Call of
    Duty: Advanced Warfare). Used for per-pixel jitter in ray marches and the bake kernels, and as the output dither
    before 8 bits, two samples summed for a triangular distribution.
  - CPU lattice hash `D:wt`: multiply-xor of the three coordinates, then a finaliser with MurmurHash3 `fmix32`'s
    multipliers (0x85ebca6b, 0xc2b2ae35); its first shift is 15, fmix32's is 16.
  - CPU random `D:V`: Mulberry32 (0x6D2B79F5), reseeded per build stage by `D:je(n)` = 625341585 + n × 2654435761
    (Knuth's multiplicative hash). Each stage has its own stream, so changing one stage does not reshuffle the others.

### 3k. Mouse: pointer lock without the system's acceleration (READ; web facts from web.dev, fetched 2026-11-23)
- **The problem:** desktop systems scale mouse motion by its speed (pointer acceleration; on by default in Windows
  and macOS). Under Pointer Lock, `movementX/Y` arrive already accelerated. A camera or steering that adds them up
  then turns further for a quick flick than for the same hand distance moved slowly.
- **The option:** `element.requestPointerLock({ unadjustedMovement: true })` asks for the raw counts. It returns a
  Promise that rejects with `NotSupportedError` where the browser or the system cannot give them. web.dev's
  article "Disable mouse acceleration to provide a better FPS gaming experience" (2020) shows the same fallback:
  catch `NotSupportedError`, then call `requestPointerLock()` again. MDN's compatibility data (read 2026-11-23)
  lists the option in Chrome 88 (Windows, macOS 10.15.1 and later, ChromeOS; not yet Linux), Firefox 152 and
  Safari 18.4.
- **Measured 2026-11-23, headless:** Chromium 156 and Firefox 160 both read the option (a getter on the options
  object was hit once) and return a Promise. Without a user gesture both reject (NotAllowedError /
  WrongDocumentError), so what each does with a real click on Linux is NOT TESTED.
- **What Duskward does** (`D:s0` and the listeners after it): on a left click while not locked, it asks for the
  raw lock. If that rejects, it asks for a plain lock. It counts `pointerlockerror` events: after the first it
  shows "Drag to look around", and after two it stops asking, so a drag with the button held turns the view
  instead. `movementX/Y` add into two totals that the frame reads.
- **The other route:** the player turns acceleration off in the system (Windows: "Enhance pointer precision";
  Linux libinput: the flat acceleration profile).

## 4. Methods worth knowing (methods only; we use none of its code, §1)
1. **Masks from physical quantities** (slope, height above water, tree cover), with every later system (grass, fields,
   houses, paths) reading and editing one mask. On a real elevation model (DEM) they are measured instead of
   generated.
2. **Buffer-less, world-anchored grass** in a vertex shader, coloured by the ground's own function.
3. **Hex-tiled detail maps** against visible tiling on large terrain.
4. **Rule-built houses in metres** placed by the rules in §3g.
5. **Startup phases with timestamps**, shown to the player: a cheap habit for any long load.
6. **Bake what does not change.** The baked ground shadow, sky openness and bounce carry over only where the sun
   holds still. A moving sun needs a rebake per sun position, or the per-frame route.
7. **Raw mouse counts** (§3k) for any mouse-steered vehicle or mouse-look camera in a browser build.

## 5. Open doubts
- The numbers above come from reading minified code; none was measured in the running page except the startup time.
- The page can be updated: a newer file may differ. Check the sha256 before citing.

Written by cratercamper and Claude Code, 2026-11-23, from the page as fetched that day (sha256 above).
