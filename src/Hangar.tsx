import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import {
  Bloom,
  EffectComposer,
  N8AO,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { ShipModel } from "./components/ship/ShipModel";
import { CubeModel } from "./components/cube/CubeModel";
import { asteroidGeometry, asteroidMaterial } from "./components/asteroidShape";
import { HubbleModel } from "./components/telescope/HubbleModel";
import { HubbleTelescope } from "./components/telescope/HubbleNasa";
import { WebbModel } from "./components/telescope/WebbModel";
import { ColonyModel } from "./components/sf/ColonyModel";
import { ColonyDock } from "./components/sf/ColonyDock";
import { WorkMech } from "./components/sf/WorkMech";
import { VariantModel } from "./components/ship/VariantModel";
import { shipSpec, type ShipId } from "./data/ships";
import { Suspense } from "react";

/** 小惑星の見本：大きな岩の形を3つ並べる */
function AsteroidSamples() {
  const samples = useMemo(() => {
    let s = 11;
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const material = asteroidMaterial(
      new THREE.Vector3(2.5, 1.6, -1.5).multiplyScalar(1000),
    );
    return [0, 1, 2].map((i) => {
      const mesh = new THREE.InstancedMesh(
        asteroidGeometry(rand, 4),
        material,
        1,
      );
      mesh.setMatrixAt(
        0,
        new THREE.Matrix4().compose(
          new THREE.Vector3((i - 1) * 0.55, 0, 0),
          new THREE.Quaternion(),
          new THREE.Vector3(0.22, 0.22, 0.22),
        ),
      );
      mesh.setColorAt(0, new THREE.Color(["#5a534c", "#9a8f80", "#b8b4ac"][i]));
      return mesh;
    });
  }, []);
  return (
    <>
      {samples.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

/** 太陽光：影を落とす平行光。影の範囲は船の大きさに絞って解像度を稼ぐ */
function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null!);
  const { scene } = useThree();
  useEffect(() => {
    const cam = light.current.shadow.camera;
    cam.left = cam.bottom = -0.8;
    cam.right = cam.top = 0.8;
    cam.near = 0.1;
    cam.far = 10;
    cam.updateProjectionMatrix();
    light.current.target.position.set(0, 0, 0);
    scene.add(light.current.target);
  }, [scene]);
  return (
    <directionalLight
      ref={light}
      position={[2.5, 1.6, -1.5]}
      intensity={3.2}
      color="#fff4e6"
      castShadow
      shadow-mapSize={[4096, 4096]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.004}
    />
  );
}

// #hangar?cam=x,y,z&target=x,y,z&fov=n で視点を固定できる（確認用）
const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
const vec = (key: string, fallback: [number, number, number]) =>
  (params.get(key)?.split(",").map(Number) as
    | [number, number, number]
    | undefined) ?? fallback;
const CAM = vec("cam", [1.05, -0.2, -1.45]);
const TARGET = vec("target", [0, 0, 0.05]);
const FOV = Number(params.get("fov") ?? 26);
const NEAR = Number(params.get("near") ?? 0.01);
const FIXED = params.has("cam");
const MODEL = params.get("model") ?? "ship";

/**
 * 自機だけを眺める格納庫ビュー（URL の末尾に #hangar）。
 * 望遠気味の画角で低い位置から見上げると、模型ではなく巨大な船に見える。
 */
export default function Hangar() {
  // 格納庫ビューは太陽系を読み込まないので、読み込み中の画面はすぐ消す
  useEffect(() => document.getElementById("boot")?.remove(), []);
  return (
    <>
      <Canvas
        shadows={params.get("fx") !== "0"}
        camera={{ position: CAM, fov: FOV, near: NEAR, far: 100 }}
        gl={{ logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={["#000"]} />
        <Stars radius={50} depth={20} count={3000} factor={2} fade />
        <SunLight />
        <directionalLight
          position={[-2, -1, 2]}
          intensity={0.12}
          color="#8fa8ff"
        />
        {MODEL === "cube" ? (
          <CubeModel />
        ) : MODEL === "asteroid" ? (
          <AsteroidSamples />
        ) : MODEL === "hubble" ? (
          <HubbleTelescope eager />
        ) : MODEL === "hubble-handmade" ? (
          <HubbleModel />
        ) : MODEL === "webb" ? (
          <WebbModel />
        ) : [
            "heron",
            "sorakaze",
            "hakobune",
            "meguri",
            "amatsu",
            "arcadia",
          ].includes(MODEL) ? (
          <Suspense fallback={null}>
            <VariantModel spec={shipSpec(MODEL as ShipId)} />
          </Suspense>
        ) : MODEL === "sv02" ? (
          <ShipModel registry="SV-02" shipName="SOLAR WIND" tint="#e3cfa4" />
        ) : MODEL === "colony" ? (
          <group rotation={[0, 0, Math.PI / 2]}>
            <ColonyModel />
            <ColonyDock />
          </group>
        ) : MODEL === "mech" ? (
          <group position={[0, -0.5, 0]}>
            <WorkMech
              pose={
                (params.get("pose") as "weld" | "carry" | "float") ?? "weld"
              }
            />
          </group>
        ) : (
          <ShipModel />
        )}
        <OrbitControls
          autoRotate={!FIXED}
          autoRotateSpeed={0.35}
          minDistance={FIXED ? 0 : 0.2}
          maxDistance={6}
          target={TARGET}
        />
        {params.get("fx") !== "0" && (
          <EffectComposer>
            <N8AO
              aoRadius={0.08}
              distanceFalloff={0.5}
              intensity={2.5}
              quality="high"
            />
            <Bloom
              intensity={1.1}
              luminanceThreshold={1}
              luminanceSmoothing={0.2}
              mipmapBlur
            />
            <Vignette offset={0.25} darkness={0.6} />
          </EffectComposer>
        )}
      </Canvas>
      <div className="hud">
        <h1>HANGAR</h1>
        <div>
          SV-01 ソーラーボイジャー（ドラッグで回転） / SV-01 Solar Voyager (drag
          to rotate)
        </div>
      </div>
    </>
  );
}
