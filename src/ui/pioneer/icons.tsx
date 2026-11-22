// 開拓の画面で使う小さな絵（SVG）。色は CSS の currentColor と --pio-* に合わせる

type P = { size?: number }

/** 岩を砕く */
export const IconMine = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M5 14l3-6 6-2 5 4-1 6-6 3-5-1z" fill="var(--pio-metal)" opacity="0.85" />
    <path d="M8 8l2 4 4-1M10 12l-2 5M14 11l4 5" stroke="#1a1420" strokeWidth="1.2" fill="none" />
    <path d="M1 4l5 3" stroke="#9fd0ff" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/** 木星でガス */
export const IconGas = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="13" r="9" fill="#d9a877" />
    <path d="M3.5 10h17M3.2 14h17.6M4.5 17.5h15" stroke="#a5734c" strokeWidth="1.3" />
    <path d="M2 5c4 2 8 2 12 0s6-2 8 0" stroke="var(--pio-gas)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
)

/** 天の湊へ納める */
export const IconDock = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="8" stroke="#c9d6ee" strokeWidth="2.2" fill="none" />
    <path d="M12 4v16M4 12h16" stroke="#c9d6ee" strokeWidth="1.4" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="var(--pio-ice)" />
  </svg>
)

/** 建設する */
export const IconBuild = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <rect x="3" y="9" width="18" height="6" rx="3" fill="none" stroke="#c9d6ee" strokeWidth="2" />
    <path d="M7 9v6M11 9v6M15 9v6" stroke="#c9d6ee" strokeWidth="1.2" />
    <path d="M17 2l1.2 2.6L21 5l-2.2 1.8.6 2.8L17 8.2l-2.4 1.4.6-2.8L13 5l2.8-.4z" fill="#ffd86b" />
  </svg>
)

/** 完成 */
export const IconDone = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3 1.2-6.5L2.5 8.9 9.1 8z" fill="#ffd86b" />
  </svg>
)

/** 配達：氷の試料（試験管） */
export const IconSamples = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M9 2h6M10 2v13a2 2 0 004 0V2" stroke="#c9d6ee" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M10.4 9h3.2v6a1.6 1.6 0 01-3.2 0z" fill="var(--pio-ice)" />
    <path d="M17 13l3 3M20 13l-3 3M18.5 12v5" stroke="var(--pio-ice)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

/** 配達：苗 */
export const IconSeedlings = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M6 16h12l-1.5 6h-9z" fill="#b5835a" />
    <path d="M12 16V9" stroke="#7ed18a" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 10c0-4 3-6 7-6 0 4-3 6-7 6zM12 12c0-3-2.4-5-6-5 0 3 2.4 5 6 5z" fill="#7ed18a" />
  </svg>
)

/** 配達：精密部品（歯車） */
export const IconParts = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 3l1.4 2.2 2.6-.6.6 2.6L19 8.6l-.9 2.4L20 13l-2.2 1.4.6 2.6-2.6.6L14.4 20 12 18.6 9.6 20l-1.4-2.4-2.6-.6.6-2.6L4 13l1.9-2-.9-2.4 2.4-1.4.6-2.6 2.6.6z"
      fill="var(--pio-metal)"
    />
    <circle cx="12" cy="11.5" r="3" fill="#1a1420" />
  </svg>
)

/** 配達：薬 */
export const IconMedicine = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <rect x="3" y="6" width="18" height="13" rx="2.5" fill="#e9eef8" />
    <path d="M12 9v7M8.5 12.5h7" stroke="#e0566a" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M9 6V4h6v2" stroke="#e9eef8" strokeWidth="1.6" fill="none" />
  </svg>
)

/** 配達：燃料（タンク） */
export const IconFuel = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <rect x="6" y="3" width="12" height="18" rx="6" fill="none" stroke="#c9d6ee" strokeWidth="1.8" />
    <path d="M7.5 13h9v2a4.5 4.5 0 01-9 0z" fill="var(--pio-gas)" />
    <path d="M12 6.5c1.5 2 2 3 2 3.8a2 2 0 01-4 0c0-.8.5-1.8 2-3.8z" fill="#ffd27a" />
  </svg>
)

/** 星（評価）。on でなければ輪郭だけ */
export const IconStar = ({ size = 16, on = true }: P & { on?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={on ? 'pio-star on' : 'pio-star'}>
    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
  </svg>
)
