import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Suspense, useRef } from "react";
import * as THREE from "three";

type GameId = "coinflip" | "dice" | "roulette" | "rps" | "highlow";

type CasinoStage3DProps = {
  game: GameId;
  rolling: boolean;
  won?: boolean;
};

const GOLD = "#f7c95c";
const CRIMSON = "#d73355";
const INK = "#09070d";
const IVORY = "#f7efe0";
const EMERALD = "#176b4d";

export function CasinoStage3D({ game, rolling, won }: CasinoStage3DProps) {
  return (
    <div className="h-56 w-full" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        shadows
        camera={{ position: [0, 2.5, 6.5], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.65} />
        <spotLight position={[4, 6, 5]} intensity={35} angle={0.45} penumbra={0.8} castShadow />
        <pointLight position={[-4, 1, 2]} intensity={18} color={CRIMSON} />
        <Suspense fallback={null}>
          <Environment>
            <Lightformer intensity={3} color={GOLD} position={[0, 5, 1]} scale={[8, 2, 1]} />
            <Lightformer intensity={2} color={CRIMSON} position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
          </Environment>
          <GameObject game={game} rolling={rolling} won={won} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function GameObject({ game, rolling, won }: CasinoStage3DProps) {
  const group = useRef<THREE.Group>(null);
  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const node = group.current;
    if (!node) return;
    const speed = rolling ? 7 : 0.65;
    node.rotation.y += delta * speed;
    node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, rolling ? Math.sin(state.clock.elapsedTime * 9) * 0.45 : 0.12, 1 - Math.exp(-5 * delta));
    node.position.y = Math.sin(state.clock.elapsedTime * (rolling ? 7 : 1.4)) * (rolling ? 0.18 : 0.08);
    const scale = won ? 1.08 + Math.sin(state.clock.elapsedTime * 5) * 0.04 : 1;
    node.scale.setScalar(THREE.MathUtils.lerp(node.scale.x, scale, 1 - Math.exp(-6 * delta)));
  });

  return (
    <group ref={group}>
      {game === "coinflip" && <Coin />}
      {game === "dice" && <Dice />}
      {game === "roulette" && <Roulette />}
      {game === "rps" && <Rps />}
      {game === "highlow" && <HighLow />}
      <mesh position={[0, -1.25, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[2.1, 64]} />
        <meshStandardMaterial color={INK} roughness={0.45} metalness={0.35} />
      </mesh>
    </group>
  );
}

function Coin() {
  return (
    <group rotation-x={Math.PI / 2}>
      <mesh castShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.22, 64]} />
        <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.116, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.62, 0.08, 16, 64]} />
        <meshStandardMaterial color={CRIMSON} metalness={0.55} roughness={0.28} />
      </mesh>
    </group>
  );
}

function Dice() {
  const pips = [[-0.38, 0.38], [0.38, -0.38], [0, 0], [0.38, 0.38], [-0.38, -0.38]];
  return (
    <group rotation={[0.35, 0.6, 0.15]}>
      <RoundedBox args={[1.8, 1.8, 1.8]} radius={0.22} smoothness={5} castShadow>
        <meshStandardMaterial color={IVORY} roughness={0.24} metalness={0.08} />
      </RoundedBox>
      {pips.map(([x, y], index) => (
        <mesh key={index} position={[x, y, 0.91]}>
          <sphereGeometry args={[0.11, 20, 20]} />
          <meshStandardMaterial color={CRIMSON} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Roulette() {
  return (
    <group rotation-x={0.42}>
      <mesh castShadow>
        <cylinderGeometry args={[1.45, 1.6, 0.28, 48]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.22} />
      </mesh>
      <mesh position-y={0.18}>
        <cylinderGeometry args={[1.2, 1.2, 0.13, 36]} />
        <meshStandardMaterial color={CRIMSON} roughness={0.32} />
      </mesh>
      <mesh position-y={0.3}>
        <coneGeometry args={[0.62, 0.65, 48]} />
        <meshStandardMaterial color={INK} metalness={0.65} roughness={0.3} />
      </mesh>
      <mesh position={[0.78, 0.48, 0]} castShadow>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial color={IVORY} metalness={0.35} roughness={0.18} />
      </mesh>
    </group>
  );
}

function Rps() {
  return (
    <group>
      <RoundedBox args={[1.45, 1.45, 1.45]} radius={0.32} smoothness={5} castShadow rotation={[0.2, 0.5, 0.1]}>
        <meshStandardMaterial color={CRIMSON} metalness={0.42} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.82]}>
        <torusGeometry args={[0.38, 0.11, 20, 48]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function HighLow() {
  return (
    <group rotation={[0.1, 0.4, -0.08]}>
      <RoundedBox args={[1.65, 2.1, 0.16]} radius={0.14} smoothness={5} castShadow>
        <meshStandardMaterial color={IVORY} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.13]}>
        <coneGeometry args={[0.48, 0.85, 3]} />
        <meshStandardMaterial color={EMERALD} metalness={0.35} roughness={0.25} />
      </mesh>
    </group>
  );
}