import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PLANETS } from './data/bodies'
import { useStore } from './state/store'
import { Sun } from './components/Sun'
import { PlanetBody } from './components/PlanetBody'
import { Sky } from './components/Sky'
import { SpaceLighting } from './components/SpaceLighting'
import { PostFx } from './components/PostFx'
import { StructureLook } from './components/StructureLook'
import { SimClock } from './components/SimClock'
import { Ship } from './components/Ship'
import { SpaceDust } from './components/SpaceDust'
import { SizeCompare } from './components/SizeCompare'
import { CloudWake } from './components/CloudWake'
import { AsteroidBelt } from './components/AsteroidBelt'
import { WarpStreaks } from './components/WarpStreaks'
import { TargetMarker } from './components/TargetMarker'
import { Phaser } from './components/Phaser'
import { ChargeBeam } from './components/ChargeBeam'
import { BeamGauge } from './ui/BeamGauge'
import { SFWorld } from './components/sf/SFWorld'
import { SFBoundary } from './components/sf/SFBoundary'
import { useSF } from './data/sf'
import { SFBadge } from './ui/SFBadge'
import { ScaleBadge } from './ui/ScaleToggle'
import { ContextLost } from './ui/ContextLost'
import { LabelDeclutter } from './ui/LabelDeclutter'
import { CleanScreenButton } from './ui/CleanScreen'
import { Telescopes } from './components/telescope/Telescopes'
import { Race } from './components/race/Race'
import { RacePanel } from './ui/RacePanel'
import { Hud, useGlobalKeys } from './ui/Hud'
import { NavPanel } from './ui/NavPanel'
import { LogPanel } from './ui/LogPanel'
import { TelescopeView } from './ui/TelescopeView'
import { useLayout } from './state/useLayout'
import { dprFor, useLevel } from './state/quality'
import { QualityGovernor } from './components/QualityGovernor'
import { GalleryCamera } from './components/ship/GalleryCamera'
import { GalleryPanel } from './ui/GalleryPanel'
import { GalleryLabels } from './ui/GalleryLabels'
import { TouchControls, TouchWarp } from './ui/TouchControls'
import { useThrottleWheel } from './ui/Throttle'
import { TouchBar } from './ui/TouchBar'
import { BootFrames, BootScreen } from './ui/Boot'
import { News } from './ui/News'
import { QuizPanel } from './ui/QuizPanel'
import { ProbeScene } from './components/ProbeScene'
import { ProbePanel } from './ui/ProbePanel'
import { MissionRunner } from './components/mission/MissionRunner'
import { MissionPanel } from './ui/MissionPanel'
import { LanguagePicker } from './ui/LanguagePicker'
import { Campaign } from './ui/Campaign'
import { EclipseScene } from './components/EclipseScene'
import { EclipsePanel } from './ui/EclipsePanel'
import { ObservePanel } from './ui/ObservePanel'
import { useEclipse } from './state/eclipse'
import { StampBook } from './ui/StampBook'
import { RockBook } from './ui/RockBook'
import { HistoricBook } from './ui/HistoricBook'
import { BridgeInterior } from './components/bridge/BridgeInterior'
import { SurfaceView } from './components/surface/SurfaceView'
import { SurfaceMemory } from './components/SurfaceMemory'
import { useLanding } from './state/landing'
import { BridgePanel } from './ui/BridgePanel'
import { BridgeLabels } from './ui/BridgeLabels'
import { PhotoNote } from './ui/PhotoNote'
import { EvaView } from './components/eva/EvaView'
import { evaScene, useEva } from './state/eva'
import { WalkView } from './components/walk/WalkView'
import { useWalk, walkScene } from './state/walk'

/** 全体マップの視点。距離のスライダーで太陽系を広げたら、そのぶん遠くまで引ける */
function MapControls() {
  const layout = useLayout()
  return <OrbitControls enablePan maxDistance={Math.max(1200, Math.max(...layout.orbit.values()) * 3)} />
}

export default function App() {
  const mode = useStore((s) => s.mode)
  // SF モードのときだけ、架空の船や構造物を出す
  const sf = useSF()
  const bridge = useStore((s) => s.mode === 'flight' && s.cameraMode === 'bridge')
  // 日食・月食を見ているあいだは、EclipseScene のカメラ操作を使う
  const eclipseView = useEclipse((e) => e.open && e.eclipseId !== null)
  useGlobalKeys()
  useThrottleWheel()
  const level = useLevel()
  // 地表にいるあいだは、宇宙の場面を止める（暗転している最中は動かしておく）
  const onLand = useLanding((l) => l.phase === 'descent' || l.phase === 'surface' || l.phase === 'ascent')
  // 船外活動のあいだも同じく止める
  const onEva = useEva((e) => evaScene(e.phase))
  // コロニーの中を歩くあいだも
  const onWalk = useWalk((w) => walkScene(w.phase))
  const onSurface = onLand || onEva || onWalk

  // 地表にいるあいだは、止めた宇宙の場面の最後の1枚を見えなくしておく。
  // 地表の Canvas が一瞬描けなかったフレーム（画面サイズの変化・画質の切り替え・GPU の都合）に、
  // 下に残った宇宙の絵が透けて「チラッ」と映ってしまうため。
  return (
    <>
      <Canvas frameloop={onSurface ? 'never' : 'always'} style={{ visibility: onSurface ? 'hidden' : 'visible' }} shadows="percentage" dpr={dprFor(level)} camera={{ position: [0, 120, 220], fov: 50, near: 0.01, far: 200_000 }} gl={{ logarithmicDepthBuffer: true }}>
        <SimClock />
        <QualityGovernor />
        <SpaceLighting />
        {/* 宇宙には回り込む光がほとんど無いので、環境光はごく弱く（影の側が暗く締まる） */}
        <ambientLight intensity={0.04} />
        <Sky />
        <Sun />
        {PLANETS.map((planet) => (
          <PlanetBody key={planet.id} planet={planet} />
        ))}
        <AsteroidBelt />
        {sf && (
          <SFBoundary>
            <StructureLook>
              <SFWorld />
            </StructureLook>
          </SFBoundary>
        )}
        <StructureLook detail={false}>
          <Telescopes />
        </StructureLook>
        <Race />
        <MissionRunner />
        <Ship />
        {mode === 'gallery' && <GalleryCamera />}
        <CloudWake />
        <SpaceDust />
        <SizeCompare />
        <WarpStreaks />
        <TargetMarker />
        <ProbeScene />
        <EclipseScene />
        <Phaser />
        <ChargeBeam />
        {mode === 'map' && !eclipseView && <MapControls />}
        <PostFx />
        {bridge && <BridgeInterior />}
        <BootFrames />
        <SurfaceMemory />
      </Canvas>
      <BootScreen />
      <News />
      <GalleryLabels />
      <BridgeLabels />
      <Hud />
      <NavPanel />
      <GalleryPanel />
      <BeamGauge />
      <TouchControls />
      <TouchWarp />
      <ObservePanel />
      <TouchBar />
      <BridgePanel />
      <RacePanel />
      <MissionPanel />
      <LogPanel />
      <QuizPanel />
      <ProbePanel />
      <EclipsePanel />
      <StampBook />
      <TelescopeView />
      <Campaign />
      <LanguagePicker />
      <SFBadge />
      <ScaleBadge />
      <PhotoNote />
      <ContextLost />
      <SurfaceView />
      <EvaView />
      <WalkView />
      <RockBook />
      <HistoricBook />
      <LabelDeclutter />
      <CleanScreenButton />
      <div className="credit">
        Planet textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a> (CC BY 4.0) · Hubble 3D model:{' '}
        <a href="https://science.nasa.gov/resource/hubble-space-telescope-3d-model/" target="_blank" rel="noreferrer">NASA VTAD</a> · Stars:{' '}
        <a href="http://tdc-www.harvard.edu/catalogs/bsc5.html" target="_blank" rel="noreferrer">Yale Bright Star Catalog</a> · Terrain:{' '}
        <a href="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m" target="_blank" rel="noreferrer">USGS/NASA Gale DEM</a>,{' '}
        <a href="https://www.usgs.gov/3d-elevation-program" target="_blank" rel="noreferrer">USGS 3DEP</a>
      </div>
    </>
  )
}
