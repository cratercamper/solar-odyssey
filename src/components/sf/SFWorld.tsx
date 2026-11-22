import { useState, type ReactNode } from 'react'
import { CubeShip } from '../cube/CubeShip'
import { Gate } from './Gate'
import { BlackHole } from './BlackHole'
import { Swarm } from './Swarm'
import { SolarPlant } from './SolarPlant'
import { SailLauncher } from './SailLauncher'
import { ColonyCluster } from './ColonyCluster'
import { ColonyGroups } from './ColonyGroups'
import { AsteroidBase } from './AsteroidBase'
import { Fleet } from './Fleet'
import { Shipyard } from './Shipyard'
import { SpaceDock } from './SpaceDock'
import { SpaceElevator } from './SpaceElevator'
import { CROSS_ID, UMBRELLA_ID } from '../../data/sf'
import { RadioMoon } from './RadioMoon'
import { OreCarrier } from './OreCarrier'
import { DiscFreighter } from './DiscFreighter'
import { DysonSwarm } from './DysonSwarm'
import { GenerationShip } from './GenerationShip'
import { EuropaBeacon } from './EuropaBeacon'
import { DebrisCollector } from './DebrisCollector'
import { DesertPlanet, IcePlanet } from './Exoplanet'
import { HourglassColonies } from './HourglassColonies'
import { EngineAsteroid } from './EngineAsteroid'
import { GalacticRailway } from './GalacticRailway'
import { MoonCity } from './MoonCity'

import { Staged } from './Staged'

/**
 * SF の構造物。地球のまわり（SF の出発点は天の湊の前）から遠くへの順に、1 つずつ作って見せる（Staged）。
 * 全部を一度に作ると、SF をオンにした瞬間や SF で起動したときに何秒も固まるため
 */
const PARTS: [string, ReactNode][] = [
  ['dock', <SpaceDock />],
  ['elevator', <SpaceElevator />],
  ['cluster', <ColonyCluster />],
  ['groups', <ColonyGroups />],
  ['shipyard', <Shipyard />],
  ['mooncity', <MoonCity />],
  ['hourglass', <HourglassColonies />],
  ['cross', <AsteroidBase id={CROSS_ID} shape="cross" point="L4" />],
  ['umbrella', <AsteroidBase id={UMBRELLA_ID} shape="umbrella" point="L2" />],
  ['solar', <SolarPlant />],
  ['sail', <SailLauncher />],
  ['fleet', <Fleet />],
  ['radiomoon', <RadioMoon />],
  ['debris', <DebrisCollector />],
  ['cube', <CubeShip />],
  ['swarm', <Swarm />],
  ['ore', <OreCarrier />],
  ['disc', <DiscFreighter />],
  ['dyson', <DysonSwarm />],
  ['generation', <GenerationShip />],
  ['europa', <EuropaBeacon />],
  ['engine', <EngineAsteroid />],
  ['railway', <GalacticRailway />],
  ['gate', <Gate />],
  ['blackhole', <BlackHole />],
  ['desert', <DesertPlanet />],
  ['ice', <IcePlanet />],
]

/** SF モードだけに出す、架空の船や構造物（data/sf.ts の SF_OBJECTS と対になる） */
export function SFWorld() {
  const [shown, setShown] = useState(1)
  const next = () => setShown((n) => Math.min(PARTS.length, n + 1))
  return (
    <>
      {PARTS.slice(0, shown).map(([key, node]) => (
        <Staged key={key} onReady={next}>
          {node}
        </Staged>
      ))}
    </>
  )
}
