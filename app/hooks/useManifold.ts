import { useState, useEffect, useCallback, useRef } from 'react';
import { BufferGeometry, BufferAttribute } from 'three';

type ManifoldModule = any;
type Manifold = any;
type Mesh = any;

interface UseManifoldReturn {
  isLoaded: boolean;
  error: string | null;
  Manifold: any | null;
  geometry2mesh: ((geometry: BufferGeometry) => Mesh | null) | null;
  mesh2geometry: ((mesh: Mesh, id2matIndex?: Map<number, number>) => BufferGeometry | null) | null;
  performBoolean: ((
    geom1: BufferGeometry,
    geom2: BufferGeometry,
    operation: 'union' | 'difference' | 'intersection'
  ) => BufferGeometry | null) | null;
}

export function useManifold(): UseManifoldReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manifoldModuleRef = useRef<ManifoldModule | null>(null);
  const ManifoldRef = useRef<any | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadManifold = async () => {
      try {
        // Dynamically import Manifold WASM module (client-side only)
        const Module = (await import('manifold-3d')).default;
        const wasm = await Module();
        wasm.setup();
        const { Manifold: ManifoldClass } = wasm;

        if (!mounted) return;

        manifoldModuleRef.current = wasm;
        ManifoldRef.current = ManifoldClass;
        setIsLoaded(true);
      } catch (err) {
        console.error('Error loading Manifold:', err);
        setError(err instanceof Error ? err.message : 'Failed to load Manifold');
      }
    };

    loadManifold();

    return () => {
      mounted = false;
    };
  }, []);

  // Convert Three.js BufferGeometry to Manifold Mesh
  const geometry2mesh = useCallback(
    (geometry: BufferGeometry): Mesh | null => {
      const manifoldModule = manifoldModuleRef.current;
      if (!manifoldModule) {
        console.warn('Manifold module not loaded');
        return null;
      }

      // Validate geometry has position attribute
      if (!geometry.attributes.position) {
        console.error('Geometry missing position attribute');
        return null;
      }

      const vertProperties = geometry.attributes.position.array as Float32Array;

      // Validate we have vertices
      if (!vertProperties || vertProperties.length === 0) {
        console.error('Geometry has no vertices');
        return null;
      }

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

      try {
        const mesh = new manifoldModule.Mesh({
          numProp: 3,
          vertProperties,
          triVerts,
          runIndex,
          runOriginalID,
        });
        mesh.merge();
        return mesh;
      } catch (err) {
        console.error('Failed to create Manifold mesh:', err);
        return null;
      }
    },
    []
  );

  // Convert Manifold Mesh to Three.js BufferGeometry
  const mesh2geometry = useCallback(
    (mesh: Mesh, id2matIndex: Map<number, number> = new Map()): BufferGeometry | null => {
      const manifoldModule = manifoldModuleRef.current;
      if (!manifoldModule) return null;

      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(mesh.vertProperties, 3));
      geometry.setIndex(new BufferAttribute(mesh.triVerts, 1));

      if (mesh.numRun > 0) {
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
      }

      return geometry;
    },
    []
  );

  // Perform boolean operation
  const performBoolean = useCallback(
    (
      geom1: BufferGeometry,
      geom2: BufferGeometry,
      operation: 'union' | 'difference' | 'intersection'
    ): BufferGeometry | null => {
      const Manifold = ManifoldRef.current;
      if (!Manifold) {
        console.warn('Manifold not ready for boolean operation');
        return null;
      }

      try {
        const mesh1 = geometry2mesh(geom1);
        const mesh2 = geometry2mesh(geom2);

        if (!mesh1 || !mesh2) {
          console.warn('Failed to convert geometries to Manifold meshes');
          return null;
        }

        const manifold1 = new Manifold(mesh1);
        const manifold2 = new Manifold(mesh2);

        const result = Manifold[operation](manifold1, manifold2);
        const resultMesh = result.getMesh();

        const resultGeometry = mesh2geometry(resultMesh);

        // Note: Manifold WASM objects are managed by the library
        // We don't need to manually delete them

        return resultGeometry;
      } catch (err) {
        console.error('Boolean operation failed:', err, {
          operation,
          geom1Valid: !!geom1.attributes.position,
          geom2Valid: !!geom2.attributes.position,
        });
        return null;
      }
    },
    [geometry2mesh, mesh2geometry]
  );

  return {
    isLoaded,
    error,
    Manifold: ManifoldRef.current,
    geometry2mesh: isLoaded ? geometry2mesh : null,
    mesh2geometry: isLoaded ? mesh2geometry : null,
    performBoolean: isLoaded ? performBoolean : null,
  };
}
