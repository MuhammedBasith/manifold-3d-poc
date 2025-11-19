'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Mesh as ThreeMesh,
  MeshNormalMaterial,
  MeshLambertMaterial,
  BufferGeometry,
  BufferAttribute,
  PointLight,
  AmbientLight,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
} from 'three';

type ManifoldModule = any;
type Manifold = any;
type Mesh = any;

type BooleanOp = 'union' | 'difference' | 'intersection';
type AdvancedOp = 'hull' | 'offset' | 'rotate' | 'translate' | 'scale';

interface OperationButton {
  name: string;
  value: BooleanOp | AdvancedOp;
  category: 'boolean' | 'advanced';
}

export default function ManifoldShowcase() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentOp, setCurrentOp] = useState<BooleanOp>('union');
  const [error, setError] = useState<string | null>(null);
  const animationFrameRef = useRef<number>();
  const sceneRef = useRef<{
    scene: Scene;
    camera: PerspectiveCamera;
    renderer: WebGLRenderer;
    resultMesh: ThreeMesh;
    materials: any[];
    manifoldModule: ManifoldModule;
    Manifold: any;
    manifoldCube: Manifold;
    manifoldSphere: Manifold;
  }>();

  const operations: OperationButton[] = [
    { name: 'Union', value: 'union', category: 'boolean' },
    { name: 'Difference', value: 'difference', category: 'boolean' },
    { name: 'Intersection', value: 'intersection', category: 'boolean' },
    { name: 'Convex Hull', value: 'hull', category: 'advanced' },
    { name: 'Offset', value: 'offset', category: 'advanced' },
  ];

  // Convert Three.js BufferGeometry to Manifold Mesh
  const geometry2mesh = (geometry: BufferGeometry, manifoldModule: any): Mesh => {
    const vertProperties = geometry.attributes.position.array as Float32Array;
    const triVerts =
      geometry.index != null
        ? (geometry.index.array as Uint32Array)
        : new Uint32Array(vertProperties.length / 3).map((_, idx) => idx);

    const starts = [...Array(geometry.groups.length || 1)].map((_, idx) =>
      geometry.groups[idx] ? geometry.groups[idx].start : 0
    );
    const originalIDs = [...Array(geometry.groups.length || 1)].map((_, idx) =>
      geometry.groups[idx] ? geometry.groups[idx].materialIndex || 0 : 0
    );

    const indices = Array.from(starts.keys());
    indices.sort((a, b) => starts[a] - starts[b]);
    const runIndex = new Uint32Array(indices.map((i) => starts[i]));
    const runOriginalID = new Uint32Array(indices.map((i) => originalIDs[i]));

    const mesh = new manifoldModule.Mesh({
      numProp: 3,
      vertProperties,
      triVerts,
      runIndex,
      runOriginalID,
    });
    mesh.merge();
    return mesh;
  };

  // Convert Manifold Mesh to Three.js BufferGeometry
  const mesh2geometry = (mesh: Mesh, id2matIndex: Map<number, number>): BufferGeometry => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(mesh.vertProperties, 3));
    geometry.setIndex(new BufferAttribute(mesh.triVerts, 1));

    let id = mesh.runOriginalID[0];
    let start = mesh.runIndex[0];
    for (let run = 0; run < mesh.numRun; ++run) {
      const nextID = mesh.runOriginalID[run + 1];
      if (nextID !== id) {
        const end = mesh.runIndex[run + 1];
        geometry.addGroup(start, end - start, id2matIndex.get(id) || 0);
        id = nextID;
        start = end;
      }
    }
    return geometry;
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    const initScene = async () => {
      try {
        setIsLoading(true);

        // Dynamically import Manifold WASM module (client-side only)
        const Module = (await import('manifold-3d')).default;
        const wasm = await Module();
        wasm.setup();
        const { Manifold, Mesh } = wasm;

        if (!mounted) return;

        // Set up materials
        const materials = [
          new MeshNormalMaterial({ flatShading: true }),
          new MeshLambertMaterial({ color: '#3b82f6', flatShading: true }), // Blue
          new MeshLambertMaterial({ color: '#ef4444', flatShading: true }), // Red
        ];

        const firstID = Manifold.reserveIDs(materials.length);
        const ids = [...Array(materials.length)].map((_, idx) => firstID + idx);
        const id2matIndex = new Map();
        ids.forEach((id, idx) => id2matIndex.set(id, idx));

        // Set up Three.js scene
        const scene = new Scene();
        const camera = new PerspectiveCamera(
          45,
          canvasRef.current!.clientWidth / canvasRef.current!.clientHeight,
          0.1,
          1000
        );
        camera.position.z = 3;
        camera.position.y = 1;
        camera.lookAt(0, 0, 0);

        // Add lights
        const pointLight = new PointLight(0xffffff, 1);
        pointLight.position.set(5, 5, 5);
        scene.add(pointLight);
        const ambientLight = new AmbientLight(0x404040, 0.5);
        scene.add(ambientLight);

        const resultMesh = new ThreeMesh(undefined, materials);
        scene.add(resultMesh);

        const renderer = new WebGLRenderer({
          canvas: canvasRef.current!,
          antialias: true,
          alpha: true,
        });
        const rect = canvasRef.current!.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height);
        renderer.setPixelRatio(window.devicePixelRatio);

        // Create input geometries
        const cubeGeometry = new BoxGeometry(0.8, 0.8, 0.8);
        cubeGeometry.clearGroups();
        cubeGeometry.addGroup(0, 18, 1); // Blue
        cubeGeometry.addGroup(18, Infinity, 0); // Normal

        const sphereGeometry = new SphereGeometry(0.6, 32, 32);
        sphereGeometry.clearGroups();
        sphereGeometry.addGroup(0, Infinity, 2); // Red

        // Convert to Manifold
        const manifoldCube = new Manifold(geometry2mesh(cubeGeometry, wasm));
        const manifoldSphere = new Manifold(geometry2mesh(sphereGeometry, wasm));

        // Perform initial operation
        const performOperation = (op: BooleanOp) => {
          if (resultMesh.geometry) {
            resultMesh.geometry.dispose();
          }
          resultMesh.geometry = mesh2geometry(
            Manifold[op](manifoldCube, manifoldSphere).getMesh(),
            id2matIndex
          );
        };

        performOperation('union');

        // Store references
        sceneRef.current = {
          scene,
          camera,
          renderer,
          resultMesh,
          materials,
          manifoldModule: wasm,
          Manifold,
          manifoldCube,
          manifoldSphere,
        };

        // Animation loop
        const animate = (time: number) => {
          if (!mounted) return;

          resultMesh.rotation.x = time / 3000;
          resultMesh.rotation.y = time / 2000;
          renderer.render(scene, camera);
          animationFrameRef.current = requestAnimationFrame(animate);
        };
        animationFrameRef.current = requestAnimationFrame(animate);

        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing Manifold:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize Manifold');
        setIsLoading(false);
      }
    };

    initScene();

    // Cleanup
    return () => {
      mounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sceneRef.current) {
        sceneRef.current.renderer.dispose();
        sceneRef.current.materials.forEach((mat) => mat.dispose());
        if (sceneRef.current.resultMesh.geometry) {
          sceneRef.current.resultMesh.geometry.dispose();
        }
      }
    };
  }, []);

  const handleOperationChange = (op: BooleanOp | AdvancedOp) => {
    if (!sceneRef.current) return;

    const { Manifold, manifoldCube, manifoldSphere, resultMesh } = sceneRef.current;

    try {
      if (resultMesh.geometry) {
        resultMesh.geometry.dispose();
      }

      let result;

      // Boolean operations
      if (op === 'union' || op === 'difference' || op === 'intersection') {
        result = Manifold[op](manifoldCube, manifoldSphere);
        setCurrentOp(op);
      }
      // Advanced operations
      else if (op === 'hull') {
        result = manifoldCube.add(manifoldSphere).hull();
      } else if (op === 'offset') {
        result = manifoldCube.offset(0.1, 'round');
      }

      if (result) {
        const id2matIndex = new Map();
        sceneRef.current.materials.forEach((_, idx) => {
          id2matIndex.set(idx, idx);
        });
        resultMesh.geometry = mesh2geometry(result.getMesh(), id2matIndex);
      }
    } catch (err) {
      console.error('Error performing operation:', err);
      setError(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full aspect-square max-w-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-lg overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} className="w-full h-full" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-white text-xl">Loading Manifold...</div>
          </div>
        )}
        {error && (
          <div className="absolute bottom-4 left-4 right-4 bg-red-500 text-white p-3 rounded">
            {error}
          </div>
        )}
      </div>

      <div className="mt-8 w-full max-w-2xl">
        <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          Boolean Operations
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {operations
            .filter((op) => op.category === 'boolean')
            .map((op) => (
              <button
                key={op.value}
                onClick={() => handleOperationChange(op.value)}
                disabled={isLoading}
                className={`px-4 py-3 rounded-lg font-medium transition-all ${
                  currentOp === op.value
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {op.name}
              </button>
            ))}
        </div>

        <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          Advanced Operations
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {operations
            .filter((op) => op.category === 'advanced')
            .map((op) => (
              <button
                key={op.value}
                onClick={() => handleOperationChange(op.value)}
                disabled={isLoading}
                className="px-4 py-3 rounded-lg font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {op.name}
              </button>
            ))}
        </div>
      </div>

      <div className="mt-8 p-6 bg-zinc-100 dark:bg-zinc-900 rounded-lg max-w-2xl w-full">
        <h3 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
          About This Demo
        </h3>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          This showcase demonstrates the powerful 3D boolean operations and geometric
          manipulations provided by Manifold-3D. The library uses WASM for high-performance
          computational geometry, enabling complex CSG (Constructive Solid Geometry) operations
          in the browser. Try different operations to see how two shapes (a cube and a sphere)
          can be combined in various ways.
        </p>
      </div>
    </div>
  );
}
