import { bodiesEn } from './bodies.en'
import { cubeEn } from './cube.en'
import { flightEn } from './flight.en'
import { sfEn } from './sf.en'
import { sfEngineEn } from './sfEngine.en'
import { sfHourglassEn } from './sfHourglass.en'
import { sfJapanEn } from './sfJapan.en'
import { sfSpaceEn } from './sfSpace.en'
import { telescopesEn } from './telescopes.en'

// 英語の文の中で行き先の名前を呼ぶ形：the をつける名前（the Moon、the Space Elevator）と、そのままの名前（Mars、
// Colony Group 1 (L5)）。分け方は state/flight.ts のワープの掛け声（SPOKEN と data/sf.ts の spoken）と同じ：
// 太陽・月・宇宙望遠鏡 2 つ・SF の 25 か所に the。コロニー群と天の湊ドック（Amano-Minato dock）はそのまま。
// 着陸地点つきの名前（"Moon · Taurus-Littrow valley"、区切りは surfaceView.en.ts の siteSuffix）にも the をつける。
// SF の場所を data/sf.ts に足して spoken が 'the …' なら、その英語の名前をここにも足す
const WITH_THE = [
  bodiesEn.sun?.name,
  bodiesEn.moon?.name,
  flightEn.sun,
  telescopesEn.hubbleSpaceTelescope,
  telescopesEn.webbSpaceTelescope,
  sfEn.torusColony,
  sfHourglassEn.hourglassColonies,
  sfEn.lunarShipyard,
  sfEn.spaceElevator,
  sfEn.crossAsteroidPort,
  sfEn.umbrellaAsteroidBase,
  sfEn.migrantFleet,
  sfEn.solarMirrorStation,
  sfEn.lightSailLauncher,
  sfSpaceEn.radioTelescopeMoon,
  sfSpaceEn.wedgeOreCarrier,
  sfSpaceEn.discFreighter,
  sfEn.dysonSwarm,
  sfEn.generationShip,
  sfEn.europaBeacon,
  sfEn.debrisCollector,
  sfJapanEn.galacticRailway,
  sfJapanEn.moonCapital,
  sfEngineEn.engineAsteroid,
  cubeEn.mysteriousCubeShip,
  sfEn.spaceTimeGate,
  sfEn.blackHole,
  sfEn.silverSwarm,
  sfEn.desertPlanet,
  sfEn.icePlanet,
].filter((n): n is string => typeof n === 'string')
const takesThe = (name: string) => WITH_THE.some((n) => name === n || name.startsWith(`${n} · `))

/** 文の途中で：the Moon / Mars */
export const theEn = (name: string) => (takesThe(name) ? `the ${name}` : name)
/** 文の頭で：The Moon / Mars */
export const TheEn = (name: string) => (takesThe(name) ? `The ${name}` : name)
