import * as THREE from 'three'
import { CABIN_EYE, CABIN_LOOK, CABIN_Y } from './cmCabin'

// 打ち上げの「映画」のカメラ：場面のカット割りと、それぞれのカメラの置き場所（LaunchWorld から使う）。
//
// カットは、点火の瞬間に始まるホルスト「木星」の出だしの強い音（波形から調べたアクセント）に合わせて切りかえる。
// 点火の前は、秒読みの時計で切りかえる。
//   0.46〜2.07 秒：最初の連打、12.19：盛り上がりの始まり、15.72：次の波、
//   25.90：全部の楽器が鳴る（いちばん強い）、29.22・33.74・38.53：主題の区切り。拍は約 0.88 秒。
//
// 位置は「地面の組」の座標（打ち上げの瞬間は世界と同じ：x 東、y 上、z 南、ロケットの根元が原点）。
// 狙う先は、地面の物なら地面の組の座標、ロケットなら世界の座標（ロケットはいつも原点）。

export type Shot = 'press' | 'cabin' | 'wide' | 'deck' | 'engine' | 'tower' | 'deckUp' | 'reveal' | 'chase'
/** 手本の写真と同じ向きのカメラ（確認の道具 tools/film から filmForce で使う。ふだんのカット割りには出ない） */
  | 'refNight'
  | 'refLiftoff'

type Cue = { shot: Shot; /** film：秒読みを始めてからの秒、music：曲の始まり（点火）からの秒 */ clock: 'film' | 'music'; at: number }

/** カット割り（順番どおり。前へはもどらない） */
export const FILM_CUTS: Cue[] = [
  // 点火の前：遠くの見物席 → 司令船の中で待つ 3 人 → 照明の下 → 甲板から見上げる
  { shot: 'press', clock: 'film', at: 0 },
  { shot: 'cabin', clock: 'film', at: 3 },
  { shot: 'wide', clock: 'film', at: 6 },
  { shot: 'deck', clock: 'film', at: 8.5 },
  // 点火：甲板の下、炎の溝へ火が落ちる
  { shot: 'engine', clock: 'music', at: 0 },
  // 煙がふくらみ、照明の下から離昇を見る（離昇は曲の 6〜9 秒め）
  { shot: 'wide', clock: 'music', at: 4.5 },
  // 盛り上がりの始まり：塔のてっぺん、横を機首が上がっていく
  { shot: 'tower', clock: 'music', at: 12.19 },
  // 次の波：甲板から、頭の上を炎が上がっていく
  { shot: 'deckUp', clock: 'music', at: 15.72 },
  // 拍に合わせて：見物席の望遠
  { shot: 'press', clock: 'music', at: 21.0 },
  // 全部の楽器：引いて、煙の柱と発射台とロケットをいっぺんに
  { shot: 'reveal', clock: 'music', at: 25.9 },
  { shot: 'chase', clock: 'music', at: 29.22 },
  // 主題の区切り：司令船の中、揺れる計器盤
  { shot: 'cabin', clock: 'music', at: 33.74 },
  { shot: 'chase', clock: 'music', at: 38.53 },
]
/** 確認用：カットを決めうちする（debugHooks から。ふだんは null） */
/** 確認の道具（tools/film）から：shot は映画のカット、orbit は地球を回るあいだの自動のカット（'flyby' など）と、そのカットの進み（0〜1） */
export const filmForce = { shot: null as Shot | null, orbit: null as string | null, orbitU: 0 }

/** この曲の秒を過ぎたら、映画のカメラを終えて、ふつうの自動のカメラ（うしろから）にもどす */
export const FILM_END = 44

/** いまのカット（idx より前にはもどさない）。m は曲の秒（点火の前は null） */
export function filmCut(idx: number, f: number, m: number | null) {
  let i = idx
  while (i + 1 < FILM_CUTS.length) {
    const c = FILM_CUTS[i + 1]
    const now = c.clock === 'film' ? f : m
    if (now === null || now < c.at) break
    i++
  }
  return i
}

export type FilmCtx = {
  ground: THREE.Object3D
  /** ロケットの組（司令船の中のカメラ） */
  rocket: THREE.Object3D
  nose: THREE.Vector3
  up: THREE.Vector3
  south: THREE.Vector3
  /** 高さ（m） */
  h: number
  /** このカットになってからの秒 */
  u: number
  groundY: number
}

export type FilmRig = { fov: number; /** 地上のカメラ（音と揺れが遅れて届く） */ onGround: boolean; /** 司令船の中 */ inside?: boolean }

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/** 地面の組の点を世界へ */
function G(ctx: FilmCtx, x: number, y: number, z: number, out: THREE.Vector3) {
  return ctx.ground.localToWorld(out.set(x, y, z))
}

/** 被写体の半分の大きさ half を、距離 dist から写す画角（度） */
function fovFor(half: number, dist: number, min: number, max: number) {
  return THREE.MathUtils.clamp((2 * Math.atan(half / dist) * 180) / Math.PI, min, max)
}

/** カメラの位置 want・見る先 look・上 camUp を決める */
export function filmRig(shot: Shot, ctx: FilmCtx, want: THREE.Vector3, look: THREE.Vector3, camUp: THREE.Vector3): FilmRig {
  const { nose, up, south, h, u, groundY } = ctx
  camUp.copy(up)
  switch (shot) {
    case 'press': {
      // 約 4.7 km 先の見物席（本物の報道席は約 5.6 km）から望遠で
      G(ctx, -2600, groundY + 14, 3900, want)
      look.copy(nose).multiplyScalar(h < 60 ? 52 : 40)
      const half = h < 60 ? 80 : 85 + h * 0.06
      return { fov: fovFor(half, want.distanceTo(look), 0.4, 30), onGround: true }
    }
    case 'cabin': {
      // 司令船の中：足もとの上から、寝た姿勢の 3 人と計器盤
      ctx.rocket.localToWorld(want.copy(CABIN_EYE).setY(CABIN_EYE.y + CABIN_Y))
      ctx.rocket.localToWorld(look.copy(CABIN_LOOK).setY(CABIN_LOOK.y + CABIN_Y))
      camUp.copy(nose)
      return { fov: 72, onGround: false, inside: true }
    }
    case 'wide': {
      // 照明の足もと、約 350 m。ゆっくり横へ動く
      G(ctx, 255 - u * 1.4, groundY + 1.8, 235 + u * 0.5, want)
      if (h < 5) G(ctx, 0, 54, 0, look)
      else look.copy(nose).multiplyScalar(50)
      return { fov: 38, onGround: true }
    }
    case 'deck': {
      // 移動発射台の甲板から、機体を見上げる。ゆっくり上へ首を振る
      G(ctx, 9.5, 2.6, 7.5, want)
      G(ctx, 0, 58 + u * 2.5, 0, look)
      return { fov: 68, onGround: true }
    }
    case 'engine': {
      // 甲板の上、斜め上から 5 つのエンジンを見下ろす：火が入り、穴から炎と湯気が噴き上がる
      G(ctx, 13 + u * 0.4, 10 - u * 0.3, 15, want)
      G(ctx, 0, -2, 0, look)
      return { fov: 56, onGround: true }
    }
    case 'tower': {
      // 発射塔のカメラ（NASA の写真 as17-495a）：塔の南東の角、高さ約 52 m に付いた広角のカメラが、すぐ横を上がっていく
      // 機体を見上げる。機首の脱出塔から、照らされた白い機体、下の炎と煙までが 1 枚に入る
      G(ctx, 9.5, 52, -13.5, want)
      look.copy(nose).multiplyScalar(96)
      return { fov: 92, onGround: true }
    }
    case 'deckUp': {
      // 発射台の南の地面から見上げる：頭の上を炎が上がっていく
      G(ctx, 24, groundY + 2, 70, want)
      look.copy(nose).multiplyScalar(-10)
      return { fov: 64, onGround: true }
    }
    case 'reveal': {
      // 引いて：発射台・煙の柱・上がっていくロケットを一枚に。少しずつ下がる
      G(ctx, -420 - u * 8, groundY + 40 + u * 3, 1500 + u * 10, want)
      G(ctx, 0, 0, 0, _a)
      _b.copy(nose).multiplyScalar(40)
      look.copy(_a).lerp(_b, 0.55)
      const half = _a.distanceTo(_b) * 0.5 + 70
      return { fov: fovFor(half, want.distanceTo(look), 8, 50), onGround: true }
    }
    case 'refNight': {
      // NASA の写真 S72-54813（1972 年 11 月、満月とサーチライト）の向き：東南東の水辺、約 1.2 km から西を見る（塔はロケットの右）
      G(ctx, 1120, groundY + 4, 380, want)
      G(ctx, 0, 52, 0, look)
      return { fov: fovFor(88, want.distanceTo(look), 2, 40), onGround: true }
    }
    case 'refLiftoff': {
      // NASA の写真 S72-55070（12 月 7 日、塔を越えた直後）の向き：東南東の湿地、約 4 km 先から。煙が左右に大きく広がる
      G(ctx, 3800, groundY + 6, 1250, want)
      G(ctx, 0, 0, 0, _a)
      _b.copy(nose).multiplyScalar(60)
      look.copy(_a).lerp(_b, 0.5)
      return { fov: fovFor(_a.distanceTo(_b) * 0.5 + 240, want.distanceTo(look), 3, 40), onGround: true }
    }
    case 'chase':
    default: {
      // 横から並んで飛ぶ（ゆっくり前へ回りこむ）
      want
        .copy(south)
        .multiplyScalar(190)
        .addScaledVector(nose, 30 + u * 1.5)
        .addScaledVector(up, -15)
      look.copy(nose).multiplyScalar(35)
      return { fov: 50, onGround: false }
    }
  }
}

/**
 * 揺れ（見る向きのずれ、ラジアン）。地上のカメラには、音の速さ（343 m/s）で遅れて届く。
 * since：点火からの秒、dist：カメラから発射台までの距離（m）
 */
export function filmShake(since: number | null, dist: number, h: number) {
  if (since === null) return 0
  const arrive = since - dist / 343
  if (arrive <= 0) return 0
  const ramp = THREE.MathUtils.smoothstep(arrive, 0, 1.5)
  // 近いほど強く、ロケットが高く上がると弱く
  return 0.012 * ramp * (400 / (400 + dist)) * (h < 3000 ? 1 : 3000 / h)
}
