// The player's rover driven along the race line on the app's own frames (requestAnimationFrame), for the length of
// one race. Pure pursuit on the course line: look-ahead 5 m + 0.45 s x speed; speed from the bends ahead and the
// rover's turning radius R = 2.6 + 0.32 v (src/components/surface/Rover.tsx).
// Reads the line from window.__autoTrack (set by the step that adds the track). Drives only while the race runs;
// window.__pilot says what it did. An error stops it and goes to console.error.
(() => {
  const line = window.__autoTrack?.line
  if (!line) throw new Error('pilot: window.__autoTrack.line is not set (add the track first)')
  const pts = line.map(([x, z]) => ({ x, z }))
  const len = [0]
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  const total = len[len.length - 1]
  const at = (s) => {
    const ss = Math.min(Math.max(s, 0), total)
    let i = 0
    while (i < pts.length - 2 && len[i + 1] < ss) i++
    const a = pts[i], b = pts[i + 1], seg = len[i + 1] - len[i] || 1, t = (ss - len[i]) / seg
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg }
  }
  const nearest = (x, z, hint) => {
    let best = hint, bestD = Infinity
    for (let i = 0; i < pts.length - 1; i++) {
      if (Math.abs(len[i] - hint) > 40) continue // a lap may pass near its own start: stay near the last place
      const a = pts[i], b = pts[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1
      const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / l2))
      const d = (a.x + ex * t - x) ** 2 + (a.z + ez * t - z) ** 2
      if (d < bestD) { bestD = d; best = len[i] + (len[i + 1] - len[i]) * t }
    }
    return best
  }
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
  const s = window.__sv, inp = s.rover.input
  const P = (window.__pilot = { frames: 0, resets: 0, vmax: 0, done: false, error: null })
  let hint = null
  const tick = () => {
    try {
      const st = s.rally.state.getState()
      if (st.phase === 'done' || st.phase === 'off') {
        Object.assign(inp, { throttle: 0, steer: 0 })
        P.done = true
        return
      }
      if (st.phase === 'run') {
        const p = s.rover.pose
        if (hint === null) hint = nearest(p.x, p.z, 45) // the grid stands 45 m down the line (Rally.tsx GRID_S)
        hint = nearest(p.x, p.z, hint)
        const v = Math.abs(p.speed)
        P.vmax = Math.max(P.vmax, v)
        const T = at(hint + 5 + 0.45 * v)
        const err = wrap(Math.atan2(-(T.x - p.x), -(T.z - p.z)) - p.heading)
        let target = 60 / 3.6
        for (let a = 0; a <= 60; a += 5) {
          const d0 = at(hint + a), d1 = at(hint + a + 10)
          const k = Math.abs(wrap(Math.atan2(d1.dz, d1.dx) - Math.atan2(d0.dz, d0.dx))) / 10
          if (k < 1e-4) continue
          const vk = Math.max(2, (0.8 / k - 2.6) / 0.32)
          target = Math.min(target, Math.sqrt(vk * vk + 2 * 8 * a))
        }
        inp.throttle = v < target - 0.3 ? 1 : v > target + 0.6 ? -1 : 0
        inp.steer = Math.max(-1, Math.min(1, -err * 4))
        if (st.lost) { inp.reset = true; P.resets++ }
        P.frames++
      }
      requestAnimationFrame(tick)
    } catch (e) {
      Object.assign(inp, { throttle: 0, steer: 0 })
      P.error = String(e)
      console.error('ERROR pilot: ' + e)
    }
  }
  requestAnimationFrame(tick)
  return 'pilot on'
})()
