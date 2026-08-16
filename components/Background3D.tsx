"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface BackgroundProps {
  /** Dimmed, calmer variant for the read-only client document view. */
  dimmed?: boolean;
  /** Energized variant while waiting on the proposal webhook. */
  busy?: boolean;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Soft flowing ripples in warm off-whites — a light mesh, not a spectacle.
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uIntensity;
  uniform float uDim;

  float wave(vec2 p, vec2 dir, float freq, float speed) {
    return sin(dot(p, dir) * freq + uTime * speed);
  }

  void main() {
    vec2 p = vUv;

    float t = uTime * 0.15;
    float n = 0.0;
    n += wave(p, vec2(1.0, 0.6), 4.0, 0.35) * 0.5;
    n += wave(p, vec2(-0.7, 1.0), 6.0, 0.28) * 0.3;
    n += wave(p + n * 0.08, vec2(0.3, -1.0), 9.0, 0.22) * 0.2;

    // Gentle attraction toward the cursor.
    float d = distance(p, uMouse);
    float ripple = sin(d * 18.0 - uTime * 1.4) * exp(-d * 4.0) * 0.35;
    n += ripple;

    n *= uIntensity;

    vec3 cream  = vec3(0.980, 0.976, 0.965);
    vec3 sand   = vec3(0.945, 0.937, 0.914);
    vec3 stone  = vec3(0.906, 0.898, 0.871);

    vec3 col = mix(cream, sand, smoothstep(-0.6, 0.6, n));
    col = mix(col, stone, smoothstep(0.35, 0.9, n) * 0.6);

    // Soft top-left light falloff.
    col += (1.0 - distance(p, vec2(0.25, 0.8))) * 0.012;

    // Dim toward flat cream for the client document view.
    col = mix(col, cream, uDim);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function FlowPlane({ dimmed, busy }: BackgroundProps) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();
  const mouse = useRef(new THREE.Vector2(0.5, 0.5));

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uIntensity: { value: 1 },
      uDim: { value: 0 },
    }),
    []
  );

  useFrame((state, delta) => {
    const m = material.current;
    if (!m) return;
    // Speed up the flow while the system is generating.
    m.uniforms.uTime.value += delta * (busy ? 3.2 : 1);

    mouse.current.set(
      state.pointer.x * 0.5 + 0.5,
      state.pointer.y * 0.5 + 0.5
    );
    (m.uniforms.uMouse.value as THREE.Vector2).lerp(mouse.current, 0.04);

    const targetIntensity = busy ? 1.6 : 1;
    const targetDim = dimmed ? 0.75 : 0;
    m.uniforms.uIntensity.value +=
      (targetIntensity - m.uniforms.uIntensity.value) * 0.03;
    m.uniforms.uDim.value += (targetDim - m.uniforms.uDim.value) * 0.05;
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export default function Background3D({ dimmed, busy }: BackgroundProps) {
  return (
    <div className="fixed inset-0 -z-10" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 1] }}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        <FlowPlane dimmed={dimmed} busy={busy} />
      </Canvas>
    </div>
  );
}
