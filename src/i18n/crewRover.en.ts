import type { crewRoverJa } from './crewRover.ja'
import type { Translation } from './translation'

// The texts of the crewed pressurized rover (components/surface/CrewRover.tsx, SurfaceView.tsx, RoverHud.tsx). Same keys as crewRover.ja.ts

export const crewRoverEn: Translation<typeof crewRoverJa> = {
  button: '🚐 Ride the pressurized rover',
  buttonTip: 'A Moon car you ride without a spacesuit. It was delivered ahead of you and is parked by the lander',
  boarding: 'Boarding through the airlock, matching the pressure…',
  keysHint: 'W/↑ drive · S/↓ reverse · A D/← → steer · C cruise · V cockpit / outside',
  toCockpit: '◉ View from the driver’s seat',
  toChase: '◎ View from outside',
  getOff: 'Get off',
  name: 'PR-2 Michikake',
  badge: 'PR-2',
  pressure: 'Cabin',
  pressureValue: '101 kPa',
  crew: 'Crew',
  crewValue: '2',
  battery: 'Battery',
  batteryEmpty: 'Battery empty: you can only crawl (solar panels recharge it slowly in daylight)',
  info: 'ℹ About this rover',
  cardTitle: 'A crewed Moon car: the pressurized rover',
  cardLines: [
    'Japan (JAXA with Japanese companies) is developing this Moon vehicle for the Artemis program. Inside is an air-filled room, so astronauts can take off their spacesuits to drive, eat and sleep.',
    'The plan: about 6 m long, 5 m wide and 3.8 m tall. Two people ride inside (four in an emergency) and explore the Moon for about a month at a time.',
    'Power comes from solar panels and from fuel cells, which make electricity from hydrogen and oxygen (the only by-product is water).',
    'Japan and the United States signed an agreement in 2024: the rover is to reach the Moon in the early 2030s, and Japanese astronauts get chances to land on the Moon.',
  ],
  cardNote: 'The “PR-2 Michikake” in this game is an original design inspired by the real plan. Its top speed here is 20 km/h.',
}
