import * as THREE from 'three'

// ── 天の川の向き ──
// 全天画像は銀河座標（中央が銀河中心、左へ銀経が増え、画像の上が銀河の南）。
// アプリの座標（黄道面が XZ、+Y が黄道の北）の向き d から、球の模様の向き L へ：
//   d →(黄道) e = (dx, −dz, dy) →(赤道) q →(銀河) g →(球) L = (gx, −gz, gy)
// 球はその逆向きに回しておく
const EPS = THREE.MathUtils.degToRad(23.4392911)
const toEquatorial = new THREE.Matrix3().set(1, 0, 0, 0, Math.cos(EPS), -Math.sin(EPS), 0, Math.sin(EPS), Math.cos(EPS))
const toGalactic = new THREE.Matrix3().set(
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.44482963, 0.7469822445,
  -0.867666149, -0.1980763734, 0.4559837762,
)
const appToEcliptic = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0)
const galacticToSphere = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0)
/** アプリの向き → 全天画像を貼った球（回す前）の向き。シェーダーで画像を直接引くときに使う */
export const SKY_FROM_APP = galacticToSphere.clone().multiply(toGalactic).multiply(toEquatorial).multiply(appToEcliptic)
export const MILKY_WAY_ROTATION = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(SKY_FROM_APP.clone().transpose()))
/** アプリの向き → 赤道座標（J2000）の向き。打ち上げの場面で、星を発射場の空に並べるのに使う */
export const EQUATORIAL_FROM_APP = toEquatorial.clone().multiply(appToEcliptic)
