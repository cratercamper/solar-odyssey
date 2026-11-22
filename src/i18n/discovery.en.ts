import type { Translation } from './translation'
import type { discoveryJa } from './discovery.ja'

// Discovery scan texts (ui/ScannerHud.tsx, ui/DiscoveryNote.tsx), English

export const discoveryEn: Translation<typeof discoveryJa> = {
  navButton: 'Discovery scan',
  saveLabel: 'Asteroids you discovered',
  scanner: 'Scanner',
  goBelt: 'Fly to the asteroid belt between Mars and Jupiter to scan its rocks.',
  noRock: 'No rock close enough to scan. Get a little closer.',
  rockInRange: 'You can scan the rock marked ◇',
  scan: 'Scan',
  scanning: 'Scanning…',
  stop: 'Turn the scanner off',
  note: 'Discovery notebook',
  newFind: 'New asteroid discovered!',
  known: 'You have already discovered this rock',
  code: 'Provisional designation',
  codeNote: 'Real asteroids also first get a provisional name made of the year, a half-month letter and an order letter.',
  kind: {
    0: 'Carbon-rich (C-type)',
    1: 'Stony (S-type)',
    2: 'Metal (M-type)',
  },
  kindNote: {
    0: 'About three quarters of asteroids are this type. They still hold the raw material the solar system was made from.',
    1: 'A mix of rock and metal. Many meteorites that fall to Earth are this kind.',
    2: 'Rich in iron and nickel. Thought to be pieces of the cores of small, early planets.',
  },
  size: (km: number) => `About ${km} km across (estimate)`,
  namePrompt: 'Give it a name (optional)',
  namePlaceholder: 'e.g. Stardust',
  save: 'Save',
  later: 'Later',
  realNaming: 'More than 1.4 million real asteroids have been found. Once an orbit is known well enough to get a number, the discoverer may propose a name.',
  noteTitle: 'Discovery notebook',
  noteCount: (n: number) => `${n}`,
  noteEmpty: 'No discoveries yet. Turn on the discovery scan from Learn in the nav panel, then fly close to a rock in the asteroid belt and scan it.',
  rename: 'Rename',
  foundOn: (d: Date) => `Discovered ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
  close: 'Close',
  sizeVs: (km: number, times: number) =>
    times >= 1.15 ? `About ${km} km: ${times.toFixed(1)} times the height of Everest` : times >= 0.85 ? `About ${km} km: about as tall as Everest` : `About ${km} km: ${Math.round(times * 100)}% of Everest's height`,
  more: 'Learn more',
  less: 'Hide',
  photo: 'Photo taken at discovery',
  noPhoto: 'No photo',
  label: (name: string, code: string) => (name ? `${name} (${code})` : code),
}
