import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  GridHelper,
  AxesHelper,
  AmbientLight,
  DirectionalLight,
  Color,
  PCFSoftShadowMap,
  Mesh as ThreeMesh,
} from 'three';
import { OrbitControls } from 'three-stdlib';
import { createInfiniteGridMeshV3 } from '../lib/infinite-grid';

// ... (keeping the rest of the file imports)



interface ThreeSceneOptions {
  enableShadows?: boolean;
  enableGrid?: boolean;
  gridSize?: number;
  gridDivisions?: number;
  enableAxes?: boolean;
  backgroundColor?: string;
}

interface UseThreeSceneReturn {
  scene: Scene | null;
  camera: PerspectiveCamera | null;
  renderer: WebGLRenderer | null;
  controls: OrbitControls | null;
  isReady: boolean;
}

export function useThreeScene(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: ThreeSceneOptions = {}
): UseThreeSceneReturn {
  const {
    enableShadows = true,
    enableGrid = true,
    gridSize = 10,
    gridDivisions = 100,
    enableAxes = true,
    backgroundColor = '#1a1a1a',
  } = options;

  const [isReady, setIsReady] = useState(false);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    // Initialize scene
    const scene = new Scene();
    scene.background = new Color(backgroundColor);
    sceneRef.current = scene;

    // Initialize camera
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const camera = new PerspectiveCamera(
      50,
      rect.width / rect.height,
      0.1,
      1000
    );
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Initialize renderer
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setSize(rect.width, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (enableShadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
    }

    rendererRef.current = renderer;

    // Initialize controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2; // Don't go below ground
    controlsRef.current = controls;

    // Add lights
    const ambientLight = new AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    if (enableShadows) {
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.1;
      directionalLight.shadow.camera.far = 100;
      directionalLight.shadow.camera.left = -20;
      directionalLight.shadow.camera.top = 20;
      directionalLight.shadow.camera.bottom = -20;
    }
    scene.add(directionalLight);

    // Add infinite grid
    if (enableGrid) {
      // Create infinite grid (v6)
      const grid = createInfiniteGridMeshV3(gridSize / 10, 10, 0x666666);
      scene.add(grid);
    }

    // Add axes helper
    if (enableAxes) {
      const axesHelper = new AxesHelper(2);
      axesHelper.name = 'axesHelper';
      scene.add(axesHelper);
    }

    // Handle window resize
    const handleResize = () => {
      if (!canvasRef.current || !camera || !renderer) return;

      const rect = canvasRef.current.getBoundingClientRect();
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height);
    };

    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      if (!mounted) return;

      controls.update();
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);
    setIsReady(true);

    // Cleanup
    return () => {
      mounted = false;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      window.removeEventListener('resize', handleResize);

      controls.dispose();
      renderer.dispose();

      // Clean up scene
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else {
            object.material?.dispose();
          }
        }
      });

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [
    canvasRef,
    enableShadows,
    enableGrid,
    gridSize,
    gridDivisions,
    enableAxes,
    backgroundColor,
  ]);

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    isReady,
  };
}
