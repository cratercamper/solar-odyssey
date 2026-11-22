import { useMoonMission } from '../../state/moonMission'
import { useMoonReturn } from '../../state/moonReturn'
import './cabinFrame.css'

/** 司令船の窓の枠（宇宙に出てからの「船長の窓」）。着陸船の窓は LunarHud の WindowFrame */
export function CabinFrame() {
  const cam = useMoonMission((s) => s.cam)
  const phase = useMoonMission((s) => s.phase)
  const step = useMoonReturn((s) => s.step)
  // 章8：ランデブーのあいだは照準の窓（枠なし）。それ以外は司令船の窓
  const home = phase === 'home' && step !== 'rdv' && step !== 'docked' && step !== 'lmGone'
  // 地球を回るあいだ（orbit・tli）は、司令船の中を 3D で描く（cmCabin.ts）ので枠はいらない
  const on = cam === 'window' && (phase === 'outbound' || phase === 'coast' || phase === 'loi' || home)
  if (!on) return null
  return (
    <div className="cabin-frame" aria-hidden="true">
      <div className="cabin-glass" />
      <div className="cabin-bolt a" />
      <div className="cabin-bolt b" />
      <div className="cabin-bolt c" />
      <div className="cabin-bolt d" />
    </div>
  )
}
