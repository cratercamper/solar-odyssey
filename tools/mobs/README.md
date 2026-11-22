# Park people

Since 2026-11-18 the park uses **Microsoft Rocketbox** avatars (MIT, `public/walk/mobs/rocketbox/`). The MakeHuman people below are kept for comparison with `?mobset=makehuman`, and the Quaternius trial with `?mobset=quaternius`.

## Rocketbox (default)

1. Get the avatars from https://github.com/microsoft/Microsoft-Rocketbox (`Assets/Avatars/<Adults|Children>/<Name>/Export/<Name>_facial.fbx` and the `Textures/*.tga` it names; `raw.githubusercontent.com` works when github.com is blocked). Put each in `tools/mobs/.rocketbox_stage/<Name>/` (git-ignored) and shrink the textures to 1024 px: colour and normal maps as `.jpg`, `*_opacity_color` as `.png`.
2. Run vite on 127.0.0.1:5173, then `node tools/mobs/rocketbox/export.cjs <Name> ...`. It loads each FBX in a browser page (`export.html` / `export.ts`), keeps only the blink morphs (`EyeBlinkLeft/Right`), merges vertices and writes `public/walk/mobs/rocketbox/<Name>.glb`.
3. `python3 -I tools/mobs/rocketbox/pack_images.py public/walk/mobs/rocketbox/*.glb` re-encodes the images (jpg q82, png 256 colours): about 1 MB per person.
4. Add the person to `LIST.rocketbox` in `src/components/walk/trialPeople.ts` (age, height in m, `phone: true` for the 7 people phones load).

In the app the rig (`Bip01_*`) is mapped to the VRM bone names, raised to a T-pose, and the same Mixamo clips are baked onto it (`bakeClips` in `vrmPeople.ts`). `VrmPerson` blinks with the morphs.

The Rocketbox base bodies are one size per group (men 1.8 m, women 1.74 m, children 1.43 m), so heights come from the list.

## MakeHuman / MPFB 2 (CC0, `?mobset=makehuman`)

How the colony park people in `public/walk/mobs/` are made. Everything is reproducible from the style sheet.

1. **Blender 5.2 + MPFB 2 + VRM add-on**, MakeHuman system assets pack loaded.
2. In Blender's Python (or through Blender MCP):
   ```python
   STYLE = json.load(open(r'...\mpfb_style.json')); G = {}
   exec(open(r'...\mpfb_gen.py').read(), G)
   G['run'](STYLE, r'...\out')          # or only=['child_1', ...]
   ```
   Each person: MPFB human with a Mixamo rig, face parts nudged within the style's limits,
   simple textured materials, the body under the clothes deleted (no see-through when walking),
   decimated (~16-25k tris), exported as VRM 1.0 (auto T-pose). `out/manifest.json` lists who is who.
3. In the repo:
   ```
   python3 -I tools/mobs/finish_mpfb.py <out> public/walk/mobs tools/mobs/mpfb_style.json tools/mobs/mpfb_manifest.json
   ```
   Shrinks textures (1.4-1.9 MB per person), recolours hair to the person's hair colour,
   softens the skin tone, and recolours clothes from the colony palette (removes the MakeHuman logo print).
4. Update `MOB_MODELS` in `src/components/walk/vrmPeople.ts` (heights from the manifest).

`mpfb_style.json` is the place to change the look: age ranges, race mix, clothes and hair lists,
hair colours, shirt palette, how much the face parts may vary, the triangle budget.

## Look trials (2026-11-18)

The app has two opt-in looks for comparison (default is the plain look):

- `?mobstyle=semi` — soft two-step toon shading with tinted shadows, thin reddish/violet outlines
  (`src/components/walk/semiReal.ts`).
- `?mobstyle=paint` — the same shading plus painted textures from `public/walk/mobs/paint/`
  (flat skin that keeps lips and eyelid lines, clothes without fabric grain and fine creases,
  simple clear eyes). Rebuild them after regenerating people:
  ```
  pip install opencv-python-headless
  python3 -I tools/mobs/paint_textures.py public/walk/mobs public/walk/mobs/paint
  ```
  Why: photo textures under toon shading mix two levels of realism in one face, which reads as a
  mask (Chattopadhyay & MacDorman 2016); the paint pass puts the whole person at one level.
