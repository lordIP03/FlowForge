import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export type FlowSettings = {
  fluidType: "air" | "water";
  flowSpeed: number;
  angleOfAttack: number;
  density: number;
  particleCount: number;
  turbulence: number;
  wireframe: boolean;
  sectionCut: boolean;
  pressureMap: boolean;
};

export type GeometryStats = {
  fileName: string;
  vertices: number;
  faces: number;
  bounds: string;
  volumeEstimate: string;
  status: string;
};

type SceneBag = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  modelGroup: THREE.Group;
  particleSystem: THREE.Points;
  particlePositions: Float32Array;
  particleSpeeds: Float32Array;
  streamlines: THREE.LineSegments;
  sectionPlane: THREE.Mesh;
  frameId: number;
};

export function FlowViewport({
  settings,
  modelFile,
  onStats,
}: {
  settings: FlowSettings;
  modelFile: File | null;
  onStats: (stats: GeometryStats) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bagRef = useRef<SceneBag | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
    const bag = bagRef.current;
    if (!bag) return;

    bag.modelGroup.rotation.z = THREE.MathUtils.degToRad(settings.angleOfAttack);
    bag.sectionPlane.visible = settings.sectionCut;
    bag.renderer.localClippingEnabled = settings.sectionCut;
    bag.particleSystem.material = createParticleMaterial(settings.fluidType);
    refreshModelMaterials(bag.modelGroup, settings);
    refreshParticleField(bag, settings);
  }, [settings]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#07090c");
    scene.fog = new THREE.Fog("#07090c", 8, 24);

    const camera = new THREE.PerspectiveCamera(46, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(5.2, 2.6, 5.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.localClippingEnabled = false;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.8;
    controls.maxDistance = 16;

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroup.add(createReferenceWing(settings));

    addEnvironment(scene);
    const particleData = createParticles(settings.particleCount, settings.fluidType);
    scene.add(particleData.points);
    const streamlines = createStreamlines(settings);
    scene.add(streamlines);
    const sectionPlane = createSectionPlane();
    scene.add(sectionPlane);

    const bag: SceneBag = {
      renderer,
      scene,
      camera,
      controls,
      modelGroup,
      particleSystem: particleData.points,
      particlePositions: particleData.positions,
      particleSpeeds: particleData.speeds,
      streamlines,
      sectionPlane,
      frameId: 0,
    };
    bagRef.current = bag;

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(host);

    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const current = settingsRef.current;
      animateParticles(bag, elapsed, current);
      bag.streamlines.rotation.x = Math.sin(elapsed * 0.22) * 0.025;
      bag.streamlines.visible = current.density > 28;
      controls.update();
      renderer.render(scene, camera);
      bag.frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(bag.frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      disposeObject(scene);
      bagRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!modelFile || !bagRef.current) return;
    const bag = bagRef.current;
    const extension = modelFile.name.split(".").pop()?.toLowerCase();

    modelFile.arrayBuffer().then((buffer) => {
      clearGroup(bag.modelGroup);
      let object: THREE.Object3D;

      if (extension === "stl") {
        const geometry = new STLLoader().parse(buffer);
        object = new THREE.Mesh(geometry, createModelMaterial(settingsRef.current));
      } else {
        const text = new TextDecoder().decode(buffer);
        object = new OBJLoader().parse(text);
        refreshModelMaterials(object, settingsRef.current);
      }

      normalizeObject(object);
      bag.modelGroup.add(object);
      onStats(extractStats(object, modelFile.name));
    });
  }, [modelFile, onStats]);

  return <div className="viewport-canvas" ref={hostRef} />;
}

function addEnvironment(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight("#e9fbff", "#182233", 1.25));

  const key = new THREE.DirectionalLight("#ffffff", 3);
  key.position.set(5, 6, 4);
  key.castShadow = true;
  scene.add(key);

  const rim = new THREE.DirectionalLight("#35d6ff", 1.2);
  rim.position.set(-5, 2, -3);
  scene.add(rim);

  const grid = new THREE.GridHelper(12, 24, "#214055", "#13202b");
  grid.position.y = -1.05;
  scene.add(grid);
}

function createReferenceWing(settings: FlowSettings) {
  const shape = new THREE.Shape();
  shape.moveTo(-2.6, 0);
  shape.bezierCurveTo(-1.7, 0.22, 1.4, 0.28, 2.65, 0);
  shape.bezierCurveTo(1.25, -0.16, -1.7, -0.18, -2.6, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1.28,
    bevelEnabled: true,
    bevelSegments: 8,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    curveSegments: 48,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, createModelMaterial(settings));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createModelMaterial(settings: FlowSettings) {
  const clippingPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.35)];

  if (settings.pressureMap) {
    return new THREE.MeshStandardMaterial({
      color: settings.fluidType === "water" ? "#5ee7ff" : "#d7faff",
      roughness: 0.42,
      metalness: 0.35,
      transparent: true,
      opacity: 0.76,
      wireframe: settings.wireframe,
      clippingPlanes,
      emissive: settings.fluidType === "water" ? "#053348" : "#102d35",
      emissiveIntensity: 0.28,
    });
  }

  return new THREE.MeshPhysicalMaterial({
    color: "#dce7ef",
    roughness: 0.35,
    metalness: 0.12,
    transparent: true,
    opacity: 0.68,
    transmission: 0.18,
    wireframe: settings.wireframe,
    clippingPlanes,
  });
}

function createParticleMaterial(fluidType: FlowSettings["fluidType"]) {
  return new THREE.PointsMaterial({
    size: fluidType === "water" ? 0.034 : 0.026,
    color: fluidType === "water" ? "#5ee7ff" : "#69f0ae",
    transparent: true,
    opacity: fluidType === "water" ? 0.68 : 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function createParticles(count: number, fluidType: FlowSettings["fluidType"]) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = THREE.MathUtils.randFloatSpread(10);
    positions[index * 3 + 1] = THREE.MathUtils.randFloat(-1.5, 1.9);
    positions[index * 3 + 2] = THREE.MathUtils.randFloat(-2.8, 2.8);
    speeds[index] = THREE.MathUtils.randFloat(0.35, 1.45);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return {
    positions,
    speeds,
    points: new THREE.Points(geometry, createParticleMaterial(fluidType)),
  };
}

function refreshParticleField(bag: SceneBag, settings: FlowSettings) {
  const count = settings.particleCount;
  const currentCount = bag.particlePositions.length / 3;
  if (Math.abs(currentCount - count) < 80) return;

  bag.scene.remove(bag.particleSystem);
  disposeObject(bag.particleSystem);
  const particleData = createParticles(count, settings.fluidType);
  bag.particleSystem = particleData.points;
  bag.particlePositions = particleData.positions;
  bag.particleSpeeds = particleData.speeds;
  bag.scene.add(bag.particleSystem);
}

function animateParticles(bag: SceneBag, elapsed: number, settings: FlowSettings) {
  const positions = bag.particlePositions;
  const speedScale = settings.flowSpeed / 62;
  const turbulence = settings.turbulence / 100;
  const count = positions.length / 3;

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions[offset] += 0.018 * bag.particleSpeeds[index] * speedScale;

    const x = positions[offset];
    const wake = Math.max(0, 1.7 - Math.abs(x)) / 1.7;
    positions[offset + 1] += Math.sin(elapsed * 2.2 + index * 0.017) * 0.002 * turbulence * (1 + wake * 4);
    positions[offset + 2] += Math.cos(elapsed * 1.7 + index * 0.021) * 0.0025 * turbulence * (1 + wake * 3);

    if (positions[offset] > 5.2) {
      positions[offset] = -5.2;
      positions[offset + 1] = THREE.MathUtils.randFloat(-1.5, 1.9);
      positions[offset + 2] = THREE.MathUtils.randFloat(-2.8, 2.8);
    }
  }

  const attribute = bag.particleSystem.geometry.getAttribute("position") as THREE.BufferAttribute;
  attribute.needsUpdate = true;
}

function createStreamlines(settings: FlowSettings) {
  const points: number[] = [];
  const lanes = 13;
  const steps = 44;
  const color = settings.fluidType === "water" ? "#5ee7ff" : "#35d6ff";

  for (let lane = 0; lane < lanes; lane += 1) {
    const z = THREE.MathUtils.mapLinear(lane, 0, lanes - 1, -2.4, 2.4);
    const yBase = Math.sin(lane * 1.83) * 0.46;

    for (let step = 0; step < steps - 1; step += 1) {
      const x1 = THREE.MathUtils.mapLinear(step, 0, steps - 1, -5, 5);
      const x2 = THREE.MathUtils.mapLinear(step + 1, 0, steps - 1, -5, 5);
      const wake1 = Math.exp(-Math.pow(x1 - 0.35, 2) * 1.15);
      const wake2 = Math.exp(-Math.pow(x2 - 0.35, 2) * 1.15);
      points.push(x1, yBase + Math.sin(x1 * 2 + lane) * 0.08 * wake1, z + Math.cos(x1 * 2.4 + lane) * 0.15 * wake1);
      points.push(x2, yBase + Math.sin(x2 * 2 + lane) * 0.08 * wake2, z + Math.cos(x2 * 2.4 + lane) * 0.15 * wake2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending }),
  );
}

function createSectionPlane() {
  const geometry = new THREE.PlaneGeometry(3.4, 3.2, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: "#35d6ff",
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.y = Math.PI / 2;
  plane.visible = false;
  return plane;
}

function normalizeObject(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  object.scale.multiplyScalar(4.8 / maxAxis);

  const normalizedBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  normalizedBox.getCenter(center);
  object.position.sub(center);
  object.rotation.z = 0;
}

function extractStats(object: THREE.Object3D, fileName: string): GeometryStats {
  let vertices = 0;
  let faces = 0;

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry;
      const position = geometry.getAttribute("position");
      vertices += position?.count ?? 0;
      faces += geometry.index ? geometry.index.count / 3 : (position?.count ?? 0) / 3;
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const volume = Math.max(size.x * size.y * size.z * 0.42, 0.01);

  return {
    fileName,
    vertices,
    faces: Math.round(faces),
    bounds: `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m`,
    volumeEstimate: `${volume.toFixed(2)} m3`,
    status: vertices > 0 ? "Manifold check pending" : "No mesh detected",
  };
}

function refreshModelMaterials(object: THREE.Object3D, settings: FlowSettings) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = createModelMaterial(settings);
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function clearGroup(group: THREE.Group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}
