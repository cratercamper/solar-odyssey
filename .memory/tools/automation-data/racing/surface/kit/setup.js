// Adds a race track (and, if given, a built-in record) to the running game, then takes the rover there.
// TRACK and RECORD are put in front of this code by make_route.py. Works on the game's dev server (`npm run dev`),
// which serves each source file as its own module: the step imports the very modules the page uses and changes their
// tables (TRACKS, SITES, RALLY_RECORDS) in place. Nothing in the game's source changes.
// Also starts a record of the page's console errors (window.__autoErrors), read by check.js.
(async () => {
  window.__autoErrors = []
  const keep = console.error.bind(console)
  console.error = (...a) => { window.__autoErrors.push(a.map(String).join(' ')); keep(...a) }
  window.addEventListener('error', (e) => window.__autoErrors.push('uncaught: ' + e.message))
  window.addEventListener('unhandledrejection', (e) => window.__autoErrors.push('unhandled rejection: ' + e.reason))

  // The dev server adds ?t=<time> to a module changed since it started, and an import of the bare path would load a
  // second copy. So read the exact address from the code of a module that imports it.
  const addressIn = async (importer, path) => {
    const text = await (await fetch(importer)).text()
    const m = text.match(new RegExp('"(' + path.replace(/[.]/g, '\\.') + '(?:\\?[^"]*)?)"'))
    if (!m) throw new Error(`${path} is not imported by ${importer}: the game's files have moved`)
    return m[1]
  }
  const rallyAt = await addressIn('/src/debugHooks.ts', '/src/state/rally.ts')
  const rally = await import(rallyAt)
  if (rally.useRally !== window.__sv.rally.state) throw new Error(`${rallyAt} is not the page's own module`)
  const tracks = await import(await addressIn(rallyAt, '/src/data/rallyTracks.ts'))
  const surfaces = await import(await addressIn(await addressIn(rallyAt, '/src/state/landing.ts'), '/src/data/surfaces.ts'))
  const records = await import(await addressIn('/src/state/rallyHiscore.ts', '/src/data/rallyRecords.ts'))

  const id = TRACK.id
  if (tracks.TRACKS[id] || surfaces.SITES[id]) throw new Error(`the game already has a track or site named ${id}`)
  surfaces.SITES[id] = TRACK.site
  tracks.TRACKS[id] = TRACK.track
  if (RECORD) {
    if (RECORD.track !== id) throw new Error(`the record is for track ${RECORD.track}, not ${id}`)
    records.RALLY_RECORDS.push(RECORD) // before the table of this track is first read: the game reads it once
  }
  window.__autoTrack = TRACK.track
  rally.goToRally(id)
  return `track ${id} added (${TRACK.track.line.length} points, ${TRACK.track.gates.length} gates)` +
    (RECORD ? `, record of ${RECORD.name} ${RECORD.time} s` : ', no record')
})()
