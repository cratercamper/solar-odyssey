import type { telescopeViewJa } from './telescopeView.ja'
import type { Translation } from './translation'
import { theEn } from './article'

// The texts of ui/TelescopeView.tsx (English). Same keys as telescopeView.ja.ts

export const telescopeViewEn: Translation<typeof telescopeViewJa> = {
  receiving: 'Receiving from the telescope…',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit',
  zoomHint: 'Scroll to zoom · drag to move',
  webbNote: 'Near the Webb Space Telescope (on the far side of Earth from the Sun) you can see infrared pictures.',
  hubbleNote: 'Near the Hubble Space Telescope (around Earth) you can see pictures in visible light.',
  throughEyesOf: (scope: string) => `Through the eyes of ${theEn(scope)}`,
  seeing: 'Seeing',
  scopePicture: (scope: string) => `${scope} picture`,
  separator: ': ',
  close: 'Close',
  compareSamePlace: 'Compare the same place',
  scopeAndLight: (scope: string, scope2: string) => `${scope} (${scope2})`,
  imageCredit: 'Image: ',
  ccLicense: ' (CC BY 4.0)',
  originalImage: 'Original image',
  distance: 'Distance',
  lightSetOut: 'This light set out',
}
