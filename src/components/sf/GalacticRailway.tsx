import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../../state/store";
import { useLayout } from "../../state/useLayout";
import { JAPAN_TEXT, RAILWAY_ID, railwayName } from "../../data/sfJapan";
import { useLang } from "../../i18n/lang";
import { LABEL_Z, useHideBehindSun } from "../labels";
import { useSite } from "./useSite";
import { useSpaceEnvOn } from "../SpaceLighting";
import {
  LOCO,
  buildCoachBody,
  buildCoachSides,
  buildLocoBody,
  buildLocoGlow,
  smokeTexture,
  trainMaterials,
  wheelGeometry,
} from "./railwayTrain";

// 銀河鉄道（宮沢賢治『銀河鉄道の夜』から）。光のレールが、地球の近くから土星の外まで太陽系をゆったり一周する。
// 機関車1両と客車3両。窓には明かりがともり、煙突から煙がたなびく（ときどき星くずの火の粉がまじる）。
// 車両は本物の蒸気機関車らしい質感（煤けた鋼板・リベット・磨いたロッド・回る動輪）。形と材質は railwayTrain.ts。
// 大きさは自機（全長 0.3）と並んで見えるくらいにしている。前は +Z。

/** レールの道すじ：太陽からの距離（天文単位）と、黄道面の上での向き（度）、高さ（表示単位） */
const ROUTE: [number, number, number][] = [
  [1.15, 0, 2],
  [1.8, 35, 6],
  [3.2, 70, 12],
  [5.6, 100, 18],
  [9.8, 130, 22],
  [11.5, 165, 16],
  [9.5, 200, 8],
  [6, 235, 2],
  [3.4, 270, -4],
  [1.9, 305, -2],
  [1.25, 335, 0],
];
/** 進む速さ（表示単位／秒）。自機の最高速の約3分の1なので、並んで飛べる */
const SPEED = 2.6;
/** レールの幅と、車両の長さ */
const GAUGE = 0.07;
const COACH = 0.24;
const COUPLING = 0.025;
/** 枕木の間隔 */
const SLEEPER_STEP = 0.12;
/** レールと枕木を区切る数と、描く距離（表示単位。これより遠いとレールの管は1ピクセルより細い） */
const RAIL_CHUNKS = 64;
const RAIL_DETAIL = 10;
const SMOKE = 520;
/** 車輪の見た目の回り方（道のりに対する割合）。本当の速さだと速すぎて、逆回りに見える */
const WHEEL_LOOK = 0.1;

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;
const p = new THREE.Vector3();
const tan = new THREE.Vector3();
const side = new THREE.Vector3();
const look = new THREE.Vector3();
const stack = new THREE.Vector3();

/** レールに沿った位置と向き（s：道のり） */
function place(
  curve: THREE.CatmullRomCurve3,
  length: number,
  s: number,
  obj: THREE.Object3D,
) {
  const u = (((s % length) + length) % length) / length;
  curve.getPointAt(u, p);
  curve.getTangentAt(u, tan);
  obj.position.copy(p);
  obj.lookAt(look.copy(p).add(tan));
}

export function GalacticRailway() {
  useLang();
  const layout = useLayout();
  const loco = useRef<THREE.Group>(null!);
  const coaches = useRef<THREE.Group[]>([]);
  const label = useRef<HTMLSpanElement>(null);
  const travelled = useRef(0);
  useHideBehindSun(label, loco);
  const moved = useSite(loco, {
    id: RAILWAY_ID,
    radius: 0.35,
    notice: { distance: 2.5, text: JAPAN_TEXT.railwayFound },
  });

  const rails = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.8, 1.2, 2.2),
        toneMapped: false,
      }),
    [],
  );
  // レールの道すじ（距離のスライダーで太陽系を広げると、一緒に広がる）
  const track = useMemo(() => {
    const points = ROUTE.map(([au, deg, y]) => {
      const r = layout.au(au);
      return new THREE.Vector3(
        Math.cos(deg * DEG) * r,
        y,
        -Math.sin(deg * DEG) * r,
      );
    });
    const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
    const length = curve.getLength();
    const count = Math.ceil(length / SLEEPER_STEP);
    // 2本のレール（細い光の管）と枕木は、道すじを RAIL_CHUNKS 個に区切って作る。
    // 区切りごとに、カメラから遠い（細すぎて見えない）ときは描かない。遠くからは淡い線（line）だけが見える
    const railPts = (offset: number) =>
      curve.getSpacedPoints(Math.ceil(length * 4)).slice(0, -1).map((q, i, all) => {
        const next = all[(i + 1) % all.length];
        side.copy(next).sub(q).normalize().cross(UP).normalize();
        return q.clone().addScaledVector(side, offset);
      });
    const leftPts = railPts(-GAUGE / 2);
    const rightPts = railPts(GAUGE / 2);
    const tube = (pts: THREE.Vector3[]) =>
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false), pts.length - 1, 0.004, 4, false);
    const line = new THREE.BufferGeometry().setFromPoints(
      curve.getSpacedPoints(1200),
    );
    // 枕木：光の板を一定の間隔で
    const sleeperGeometry = new THREE.BoxGeometry(GAUGE * 1.7, 0.004, 0.018);
    const sleeperMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.5, 0.75, 1.4),
      toneMapped: false,
      transparent: true,
      opacity: 0.55,
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const target = new THREE.Object3D();
    const n = leftPts.length;
    const chunks = Array.from({ length: RAIL_CHUNKS }, (_, k) => {
      const a = Math.floor((k * n) / RAIL_CHUNKS);
      const b = Math.floor(((k + 1) * n) / RAIL_CHUNKS);
      // となりの区切りとすき間ができないよう、1 点ずつ重ねる
      const range = (pts: THREE.Vector3[]) => Array.from({ length: b - a + 1 }, (_, i) => pts[(a + i) % n]);
      const left = tube(range(leftPts));
      const right = tube(range(rightPts));
      const s0 = (a / n) * length;
      const s1 = (b / n) * length;
      const first = Math.ceil(s0 / SLEEPER_STEP);
      const last = Math.min(Math.ceil(s1 / SLEEPER_STEP), count);
      const sleepers = new THREE.InstancedMesh(sleeperGeometry, sleeperMaterial, Math.max(0, last - first));
      for (let i = first; i < last; i++) {
        place(curve, length, i * SLEEPER_STEP, target);
        target.position.y -= 0.006;
        q.copy(target.quaternion);
        m.compose(target.position, q, one);
        sleepers.setMatrixAt(i - first, m);
      }
      sleepers.computeBoundingSphere();
      left.computeBoundingSphere();
      const bounds = left.boundingSphere!.clone();
      bounds.radius += GAUGE;
      const group = new THREE.Group();
      group.add(new THREE.Mesh(left, rails), new THREE.Mesh(right, rails), sleepers);
      return { group, left, right, sleepers, bounds };
    });
    return {
      curve,
      length,
      chunks,
      line,
      sleeperGeometry,
      sleeperMaterial,
    };
  }, [layout, rails]);
  useEffect(
    () => () => {
      for (const c of track.chunks) {
        c.left.dispose();
        c.right.dispose();
        c.sleepers.dispose();
      }
      track.line.dispose();
      track.sleeperGeometry.dispose();
      track.sleeperMaterial.dispose();
    },
    [track],
  );

  // 車両：材質ごとにまとめた形（客車 3 両は同じ形を使いまわす）
  const train = useMemo(() => {
    const mats = trainMaterials();
    const body = buildLocoBody();
    const glow = buildLocoGlow();
    const coachBody = buildCoachBody(COACH);
    const coachSides = buildCoachSides(COACH);
    const L = LOCO;
    const tireWheel = (r: number) => ({ geometry: wheelGeometry(r, 0.008), r });
    const axles = [
      ...L.drivers.map((z) => ({ z, ...tireWheel(L.driverR), driver: true })),
      { z: L.pony, ...tireWheel(L.ponyR), driver: false },
      { z: L.trail, ...tireWheel(L.trailR), driver: false },
      ...L.tender.map((z) => ({ z, ...tireWheel(L.tenderR), driver: false })),
    ];
    const pin = new THREE.CylinderGeometry(0.003, 0.003, 0.008, 10).rotateZ(
      Math.PI / 2,
    );
    const couplingRod = new THREE.BoxGeometry(
      0.003,
      0.005,
      L.drivers[0] - L.drivers[2] + 0.012,
    );
    const mainRod = new THREE.BoxGeometry(0.003, 0.005, 1);
    const crosshead = new THREE.BoxGeometry(0.006, 0.007, 0.01);
    const pistonRod = new THREE.CylinderGeometry(0.0015, 0.0015, 1, 8).rotateX(
      Math.PI / 2,
    );
    return {
      mats,
      body,
      glow,
      coachBody,
      coachSides,
      axles,
      pin,
      couplingRod,
      mainRod,
      crosshead,
      pistonRod,
    };
  }, []);
  useSpaceEnvOn(train.mats.list);
  useEffect(
    () => () => {
      const t = train;
      t.mats.dispose();
      for (const part of [
        ...t.body,
        ...t.glow,
        ...t.coachBody,
        ...t.coachSides,
      ])
        part.geometry.dispose();
      for (const a of t.axles) a.geometry.dispose();
      for (const g of [
        t.pin,
        t.couplingRod,
        t.mainRod,
        t.crosshead,
        t.pistonRod,
      ])
        g.dispose();
    },
    [train],
  );
  const axleRefs = useRef<THREE.Group[]>([]);
  const rodRefs = useRef<
    {
      coupling: THREE.Mesh;
      main: THREE.Mesh;
      cross: THREE.Mesh;
      piston: THREE.Mesh;
    }[]
  >([]);

  // 煙：煙突から「ポッ、ポッ」と出るかたまりが、ふくらみながら薄くなってレールの上に残る。
  // シリンダーの横からは白い蒸気。ときどき星くずの火の粉がまじる（銀河鉄道らしさ）
  const smoke = useMemo(() => {
    const n = SMOKE;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    const seeds = new Float32Array(n).map(() => Math.random() * Math.PI * 2);
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: smokeTexture() }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aSeed;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vRot;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          // 粒ごとに向きを変えて、同じ形が並ばないように（ふくらみながらゆっくり回る）
          float r = aSeed + aSize * 6.0;
          vRot = vec2(cos(r), sin(r));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aAlpha > 0.0 ? clamp(aSize * uScale / -mv.z, 0.0, 256.0) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vRot;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          c = vec2(c.x * vRot.x - c.y * vRot.y, c.x * vRot.y + c.y * vRot.x) + 0.5;
          float a = texture2D(uMap, c).r * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return {
      points,
      positions,
      colors,
      sizes,
      alphas,
      age: new Float32Array(n).fill(99),
      life: new Float32Array(n).fill(1),
      kind: new Uint8Array(n),
      drift: new Float32Array(n * 3),
      next: 0,
      chuff: 0,
      steam: 0,
    };
  }, []);

  useEffect(
    () => () => {
      const m = smoke.points.material as THREE.ShaderMaterial;
      (m.uniforms.uMap.value as THREE.Texture).dispose();
      m.dispose();
      smoke.points.geometry.dispose();
    },
    [smoke],
  );

  const lineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#7fa6ff",
        transparent: true,
        opacity: 0.35,
      }),
    [],
  );

  useFrame(({ clock, camera, size: view, gl }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const running = useStore.getState().timeScale > 0;
    if (running) travelled.current += dt * SPEED;
    const s = travelled.current;
    // レールと枕木は、カメラの近くの区切りだけ描く
    for (const c of track.chunks) c.group.visible = camera.position.distanceTo(c.bounds.center) - c.bounds.radius < RAIL_DETAIL;
    place(track.curve, track.length, s, loco.current);
    coaches.current.forEach((c, i) =>
      place(
        track.curve,
        track.length,
        s - LOCO.rear - COUPLING - COACH / 2 - i * (COACH + COUPLING),
        c,
      ),
    );
    moved();
    // レールがゆらめくように光る
    const t = clock.getElapsedTime();
    rails.color.setRGB(
      0.8 + 0.2 * Math.sin(t * 1.3),
      1.2 + 0.2 * Math.sin(t * 1.1),
      2.2,
    );
    // 車輪とロッド：見た目の回転は道のりの 1/10（実際の速さで回すと、速すぎて逆回りに見える）
    const turn = s * WHEEL_LOOK;
    const L = LOCO;
    train.axles.forEach((a, i) => {
      const g = axleRefs.current[i];
      if (g) g.rotation.x = turn / a.r;
    });
    const th = turn / L.driverR;
    rodRefs.current.forEach((r, i) => {
      if (!r) return;
      const side = i === 0 ? 1 : -1;
      // 左は 90° ずらす（本物の機関車と同じく、止まる位置がないように）
      const a = th + (side < 0 ? Math.PI / 2 : 0);
      const py = L.driverR + L.crank * Math.cos(a);
      const pz = L.crank * Math.sin(a);
      r.coupling.position.set(
        side * 0.0445,
        py,
        (L.drivers[0] + L.drivers[2]) / 2 + pz,
      );
      // 主連棒：2 番目の動輪のクランクから、シリンダーの高さを前後に動くクロスヘッドへ
      const pinZ = L.drivers[1] + pz;
      const dy = L.cylY - py;
      const dz = Math.sqrt(L.mainRod * L.mainRod - dy * dy);
      const xz = pinZ + dz;
      r.main.position.set(side * 0.049, (py + L.cylY) / 2, (pinZ + xz) / 2);
      r.main.rotation.x = Math.atan2(-dy, dz);
      r.main.scale.z = L.mainRod;
      r.cross.position.set(side * L.cylX, L.cylY, xz);
      const pl = L.cylBack - xz;
      r.piston.position.set(side * L.cylX, L.cylY, xz + pl / 2);
      r.piston.scale.set(1, 1, Math.max(pl, 0.001));
    });

    // 煙：走っているときは車輪 1 回転に 4 回「ポッ」と出す。止まっていても細く立ちのぼる
    const sm = smoke;
    const emit = (
      kind: number,
      x: number,
      y: number,
      z: number,
      life: number,
      dx: number,
      dy2: number,
      dz2: number,
    ) => {
      const i = sm.next;
      sm.next = (sm.next + 1) % SMOKE;
      sm.age[i] = 0;
      sm.life[i] = life;
      sm.kind[i] = kind;
      loco.current.localToWorld(stack.set(x, y, z));
      sm.positions.set([stack.x, stack.y, stack.z], i * 3);
      // 動きの向きも機関車の向きで（上 = 機関車の上）
      side.set(dx, dy2, dz2).applyQuaternion(loco.current.quaternion);
      sm.drift.set([side.x, side.y, side.z], i * 3);
    };
    const chuffs = Math.floor((th / (Math.PI * 2)) * 4);
    if (running && chuffs !== sm.chuff) {
      const n = Math.min(Math.abs(chuffs - sm.chuff), 2);
      sm.chuff = chuffs;
      for (let k = 0; k < n * 7; k++)
        emit(
          Math.random() < 0.08 ? 2 : 0,
          (Math.random() - 0.5) * 0.008,
          0.14,
          0.133 + (Math.random() - 0.5) * 0.008,
          4 + Math.random() * 3,
          (Math.random() - 0.5) * 0.025,
          0.035 + Math.random() * 0.035,
          (Math.random() - 0.5) * 0.025,
        );
      // シリンダーの排水弁から白い蒸気（左右交互）
      const sd = chuffs % 2 ? 1 : -1;
      emit(
        1,
        sd * 0.06,
        0.025,
        L.cylBack + 0.04,
        1.2 + Math.random() * 0.6,
        sd * (0.03 + Math.random() * 0.02),
        0.004,
        0.01,
      );
    }
    sm.steam += dt * (running ? 0 : 10);
    while (sm.steam > 1) {
      sm.steam -= 1;
      emit(
        0,
        0,
        0.14,
        0.133,
        5,
        (Math.random() - 0.5) * 0.008,
        0.02 + Math.random() * 0.01,
        (Math.random() - 0.5) * 0.008,
      );
    }
    for (let i = 0; i < SMOKE; i++) {
      const a = (sm.age[i] += dt);
      const u = a / sm.life[i];
      if (u >= 1) {
        sm.alphas[i] = 0;
        continue;
      }
      const kind = sm.kind[i];
      // ふくらむにつれて、ゆっくりになる
      const slow = 1 / (1 + a * 0.6);
      sm.positions[i * 3] += sm.drift[i * 3] * dt * slow;
      sm.positions[i * 3 + 1] += sm.drift[i * 3 + 1] * dt * slow;
      sm.positions[i * 3 + 2] += sm.drift[i * 3 + 2] * dt * slow;
      let size: number;
      let alpha: number;
      let gray: number;
      if (kind === 2) {
        // 星くずの火の粉
        size = 0.006;
        alpha = (1 - u) * 1.2;
        sm.colors.set([1.8, 1.25, 0.6], i * 3);
      } else if (kind === 1) {
        // 白い蒸気：すぐ広がって消える
        size = 0.01 + u * 0.035;
        alpha = Math.min(1, a * 12) * (1 - u) * 0.75;
        gray = 0.85;
        sm.colors.set([gray, gray, gray * 1.03], i * 3);
      } else {
        // 煙：出たては濃い灰色、薄まるにつれて明るい灰色に
        size = 0.016 + Math.sqrt(u) * 0.075;
        alpha = Math.min(1, a * 6) * Math.pow(1 - u, 1.4) * 0.75;
        gray = 0.16 + 0.42 * Math.min(1, u * 2);
        sm.colors.set([gray * 1.04, gray, gray * 0.95], i * 3);
      }
      sm.sizes[i] = size;
      sm.alphas[i] = alpha;
    }
    const ga = sm.points.geometry.attributes;
    ga.position.needsUpdate = true;
    ga.color.needsUpdate = true;
    ga.aSize.needsUpdate = true;
    ga.aAlpha.needsUpdate = true;
    const cam = camera as THREE.PerspectiveCamera;
    (sm.points.material as THREE.ShaderMaterial).uniforms.uScale.value =
      (view.height * gl.getPixelRatio()) /
      (2 * Math.tan(((cam.fov ?? 50) * DEG) / 2));
  });

  const T = train;
  const M = T.mats;
  return (
    <>
      {track.chunks.map((c, i) => (
        <primitive key={i} object={c.group} />
      ))}
      <lineLoop geometry={track.line} material={lineMat} />
      <primitive object={smoke.points} />

      {/* 機関車とテンダー（前は +Z） */}
      <group ref={loco}>
        {[...T.body, ...T.glow].map((part) => (
          <mesh
            key={part.key}
            geometry={part.geometry}
            material={M[part.key]}
            castShadow
            receiveShadow
          />
        ))}
        {T.axles.map((a, i) => (
          <group
            key={i}
            position={[0, a.r, a.z]}
            ref={(g: THREE.Group | null) => {
              if (g) axleRefs.current[i] = g;
            }}
          >
            {[1, -1].map((sd) => (
              <group key={sd}>
                <mesh
                  geometry={a.geometry}
                  material={[M.tire, M.wheel, M.wheel]}
                  position={[sd * LOCO.wheelX, 0, 0]}
                  castShadow
                  receiveShadow
                />
                {a.driver && (
                  <mesh
                    castShadow
                    receiveShadow
                    geometry={T.pin}
                    material={M.steel}
                    position={[
                      sd * (LOCO.wheelX + 0.006),
                      sd > 0 ? LOCO.crank : 0,
                      sd > 0 ? 0 : LOCO.crank,
                    ]}
                  />
                )}
              </group>
            ))}
          </group>
        ))}
        {[1, -1].map((sd, i) => (
          <group key={sd}>
            <mesh
              ref={(m: THREE.Mesh | null) => {
                if (m)
                  (rodRefs.current[i] ??=
                    {} as (typeof rodRefs.current)[number]).coupling = m;
              }}
              geometry={T.couplingRod}
              castShadow
              receiveShadow
              material={M.steel}
            />
            <mesh
              ref={(m: THREE.Mesh | null) => {
                if (m)
                  (rodRefs.current[i] ??=
                    {} as (typeof rodRefs.current)[number]).main = m;
              }}
              geometry={T.mainRod}
              castShadow
              receiveShadow
              material={M.steel}
            />
            <mesh
              ref={(m: THREE.Mesh | null) => {
                if (m)
                  (rodRefs.current[i] ??=
                    {} as (typeof rodRefs.current)[number]).cross = m;
              }}
              geometry={T.crosshead}
              castShadow
              receiveShadow
              material={M.iron}
            />
            <mesh
              ref={(m: THREE.Mesh | null) => {
                if (m)
                  (rodRefs.current[i] ??=
                    {} as (typeof rodRefs.current)[number]).piston = m;
              }}
              geometry={T.pistonRod}
              castShadow
              receiveShadow
              material={M.steel}
            />
          </group>
        ))}
        <Html
          position={[0, 0.25, 0]}
          center
          className="label"
          zIndexRange={LABEL_Z}
        >
          <span
            ref={label}
            onClick={() => useStore.getState().setTarget(RAILWAY_ID)}
          >
            {railwayName()}
          </span>
        </Html>
      </group>

      {/* 客車3両 */}
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          ref={(g: THREE.Group | null) => {
            if (g) coaches.current[i] = g;
          }}
        >
          {[...T.coachBody, ...T.coachSides].map((part) => (
            <mesh
              key={part.key}
              geometry={part.geometry}
              material={M[part.key]}
              castShadow
              receiveShadow
            />
          ))}
        </group>
      ))}
    </>
  );
}
