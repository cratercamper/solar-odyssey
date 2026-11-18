# Park people (MakeHuman / MPFB 2, CC0)

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
