'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import {
  Vector3,
  Vector2,
  Raycaster,
  Mesh as ThreeMesh,
  BoxGeometry,
  MeshLambertMaterial,
  LineBasicMaterial,
  Line,
  BufferGeometry,
  EdgesGeometry,
  LineSegments,
  Plane,
  Matrix4,
} from 'three';
import { useThreeScene } from '../hooks/useThreeScene';
import { useManifold } from '../hooks/useManifold';
import {
  BIMWall,
  BIMDoor,
  BIMElement,
  ToolMode,
  vec3ToTuple,
  tupleToVec3,
  DEFAULT_EDITOR_SETTINGS,
} from '../types/bim';

interface BIMCanvasProps {
  toolMode: ToolMode;
  walls: BIMWall[];
  doors: BIMDoor[];
  onWallCreate: (wall: Omit<BIMWall, 'id' | 'type' | 'doors'>) => void;
  onDoorPlace: (door: Omit<BIMDoor, 'id' | 'type'>) => void;
  onElementSelect: (elementId: string | null) => void;
  onElementDelete: (elementId: string) => void;
  selectedElementId: string | null;
  wallHeight: number;
  wallThickness: number;
  doorWidth: number;
  doorHeight: number;
  gridEnabled: boolean;
}

export default function BIMCanvas({
  toolMode,
  walls,
  doors,
  onWallCreate,
  onDoorPlace,
  onElementSelect,
  onElementDelete,
  selectedElementId,
  wallHeight,
  wallThickness,
  doorWidth,
  doorHeight,
  gridEnabled,
}: BIMCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const { scene, camera, isReady } = useThreeScene(canvasRef, {
    enableGrid: gridEnabled,
    gridSize: 10,
    gridDivisions: 100,
  });
  const { isLoaded: manifoldLoaded, performBoolean } = useManifold();

  // Wall creation state
  const [wallStartPoint, setWallStartPoint] = useState<Vector3 | null>(null);
  const [wallPreviewLine, setWallPreviewLine] = useState<Line | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Door preview state
  const [doorPreviewMesh, setDoorPreviewMesh] = useState<ThreeMesh | null>(null);

  // Raycaster
  const raycasterRef = useRef(new Raycaster());
  const mouseRef = useRef(new Vector2());

  // Snap to grid
  const snapToGrid = useCallback(
    (position: Vector3): Vector3 => {
      if (!gridEnabled) return position;
      const gridSize = DEFAULT_EDITOR_SETTINGS.grid.size;
      return new Vector3(
        Math.round(position.x / gridSize) * gridSize,
        Math.round(position.y / gridSize) * gridSize,
        Math.round(position.z / gridSize) * gridSize
      );
    },
    [gridEnabled]
  );

  // Get mouse position in 3D space (on ground plane)
  const getGroundIntersection = useCallback(
    (event: MouseEvent): Vector3 | null => {
      if (!camera || !scene) return null;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;

      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Intersect with ground plane (y = 0)
      const groundPlane = new THREE.Plane(new Vector3(0, 1, 0), 0);
      const intersection = new Vector3();
      raycasterRef.current.ray.intersectPlane(groundPlane, intersection);

      return intersection;
    },
    [camera, scene]
  );

  // Create wall mesh
  const createWallMesh = useCallback(
    (start: Vector3, end: Vector3, height: number, thickness: number, wallId: string): ThreeMesh => {
      const direction = new Vector3().subVectors(end, start);
      const length = direction.length();

      const geometry = new BoxGeometry(length, height, thickness);
      const material = new MeshLambertMaterial({
        color: 0xcccccc,
        transparent: false,
      });

      const mesh = new ThreeMesh(geometry, material);

      // Position at midpoint
      const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);
      midpoint.y = height / 2;
      mesh.position.copy(midpoint);

      // Rotate to align with direction
      const angle = Math.atan2(direction.z, direction.x);
      mesh.rotation.y = -angle;

      mesh.userData.elementId = wallId;
      mesh.userData.elementType = 'wall';
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      return mesh;
    },
    []
  );

  // Create door mesh
  const createDoorMesh = useCallback(
    (door: BIMDoor, parentWall: BIMWall): ThreeMesh => {
      const geometry = new BoxGeometry(door.geometry.dimensions.width, door.geometry.dimensions.height, door.geometry.dimensions.depth);
      const material = new MeshLambertMaterial({ color: 0x8B4513 });
      const mesh = new ThreeMesh(geometry, material);

      const position = tupleToVec3(door.geometry.position);
      mesh.position.copy(position);

      const rotation = tupleToVec3(door.geometry.rotation);
      mesh.rotation.set(rotation.x, rotation.y, rotation.z);

      mesh.userData.elementId = door.id;
      mesh.userData.elementType = 'door';
      mesh.castShadow = true;

      return mesh;
    },
    []
  );

  // Rebuild scene from BIM model
  const rebuildScene = useCallback(() => {
    if (!scene || !manifoldLoaded || !performBoolean) return;

    // Remove all BIM elements
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.userData.elementType) {
        toRemove.push(object);
      }
    });
    toRemove.forEach((obj) => scene.remove(obj));

    // Create wall meshes with door openings
    walls.forEach((wall) => {
      const start = tupleToVec3(wall.start);
      const end = tupleToVec3(wall.end);

      let wallMesh = createWallMesh(start, end, wall.geometry.dimensions.height, wall.thickness, wall.id);

      // If wall has doors, subtract them using Manifold
      const wallDoors = doors.filter((door) => door.parentWallId === wall.id);

      if (wallDoors.length > 0 && wallMesh.geometry) {
        let wallGeometry = wallMesh.geometry.clone();

        for (const door of wallDoors) {
          // Create door opening geometry (slightly smaller than door for frame)
          const openingWidth = door.geometry.dimensions.width * 0.95;
          const openingHeight = door.geometry.dimensions.height * 0.98;
          const openingGeometry = new BoxGeometry(
            openingWidth,
            openingHeight,
            wall.thickness * 1.5 // Thicker to ensure clean cut
          );

          // Position door opening geometry in world space
          const doorPos = tupleToVec3(door.geometry.position);
          const openingMatrix = new Matrix4();
          openingMatrix.makeTranslation(doorPos.x, doorPos.y, doorPos.z);
          openingGeometry.applyMatrix4(openingMatrix);

          // Perform boolean subtraction
          const resultGeometry = performBoolean(wallGeometry, openingGeometry, 'difference');

          if (resultGeometry) {
            wallGeometry.dispose();
            wallGeometry = resultGeometry;
          }

          openingGeometry.dispose();
        }

        wallMesh.geometry.dispose();
        wallMesh.geometry = wallGeometry;
      }

      // Add selection highlight for selected walls
      if (selectedElementId === wall.id) {
        const edges = new EdgesGeometry(wallMesh.geometry);
        const lineMaterial = new LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
        const wireframe = new LineSegments(edges, lineMaterial);
        wallMesh.add(wireframe);
      }

      scene.add(wallMesh);
    });

    // Create actual door meshes
    doors.forEach((door) => {
      const doorMesh = createDoorMesh(door, walls.find(w => w.id === door.parentWallId)!);
      if (doorMesh) {
        // Add selection highlight for selected doors
        if (selectedElementId === door.id) {
          const edges = new EdgesGeometry(doorMesh.geometry);
          const lineMaterial = new LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
          const wireframe = new LineSegments(edges, lineMaterial);
          doorMesh.add(wireframe);
        }
        scene.add(doorMesh);
      }
    });
  }, [scene, walls, doors, manifoldLoaded, performBoolean, createWallMesh, createDoorMesh, selectedElementId]);

  // Update scene when model changes
  useEffect(() => {
    if (isReady && manifoldLoaded) {
      rebuildScene();
    }
  }, [isReady, manifoldLoaded, walls, doors, rebuildScene, selectedElementId]);

  // Handle mouse down to track dragging
  const handleCanvasMouseDown = useCallback((event: MouseEvent) => {
    mouseDownPosRef.current = { x: event.clientX, y: event.clientY };
    setIsDragging(false);
  }, []);

  // Handle mouse move to detect dragging
  const handleCanvasMouseMoveForDrag = useCallback((event: MouseEvent) => {
    if (mouseDownPosRef.current) {
      const dx = event.clientX - mouseDownPosRef.current.x;
      const dy = event.clientY - mouseDownPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        // More than 5px movement = dragging
        setIsDragging(true);
      }
    }
  }, []);

  // Handle mouse click
  const handleCanvasClick = useCallback(
    (event: MouseEvent) => {
      if (!scene || !camera) return;

      // If user was dragging (panning/zooming), don't process click
      if (isDragging) {
        setIsDragging(false);
        mouseDownPosRef.current = null;
        return;
      }

      if (toolMode === 'wall') {
        const point = getGroundIntersection(event);
        if (!point) return;

        const snappedPoint = snapToGrid(point);

        if (!wallStartPoint) {
          // First click - set start point
          setWallStartPoint(snappedPoint);
        } else {
          // Second click - create wall
          const start = wallStartPoint;
          const end = snappedPoint;

          // Don't create zero-length walls
          if (start.distanceTo(end) < 0.01) {
            setWallStartPoint(null);
            if (wallPreviewLine) {
              scene.remove(wallPreviewLine);
              setWallPreviewLine(null);
            }
            return;
          }

          onWallCreate({
            start: vec3ToTuple(start),
            end: vec3ToTuple(end),
            thickness: wallThickness,
            geometry: {
              position: vec3ToTuple(new Vector3().addVectors(start, end).multiplyScalar(0.5)),
              rotation: { x: 0, y: 0, z: 0 },
              dimensions: {
                width: start.distanceTo(end),
                height: wallHeight,
                depth: wallThickness,
              },
            },
            properties: {},
          });

          setWallStartPoint(null);
          if (wallPreviewLine) {
            scene.remove(wallPreviewLine);
            setWallPreviewLine(null);
          }
        }
      } else if (toolMode === 'door') {
        // Raycast to find wall
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, camera);

        const wallMeshes: ThreeMesh[] = [];
        scene.traverse((object) => {
          if (object.userData.elementType === 'wall' && object instanceof ThreeMesh) {
            wallMeshes.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(wallMeshes, false);

        if (intersects.length > 0) {
          const intersection = intersects[0];
          const wallId = intersection.object.userData.elementId;
          const point = intersection.point;
          const normal = intersection.face?.normal.clone();

          if (!normal) return;

          // Transform normal to world space
          normal.transformDirection(intersection.object.matrixWorld);

          const wall = walls.find((w) => w.id === wallId);
          if (!wall) return;

          // Calculate offset along wall
          const wallStart = tupleToVec3(wall.start);
          const wallEnd = tupleToVec3(wall.end);
          const wallDirection = new Vector3().subVectors(wallEnd, wallStart);
          const pointOnWall = point.clone();
          pointOnWall.y = 0;
          const offset = pointOnWall.distanceTo(wallStart);

          onDoorPlace({
            parentWallId: wallId,
            offsetOnWall: offset,
            wallNormal: vec3ToTuple(normal),
            geometry: {
              position: vec3ToTuple(point),
              rotation: { x: 0, y: Math.atan2(normal.z, normal.x), z: 0 },
              dimensions: {
                width: doorWidth,
                height: doorHeight,
                depth: wall.thickness,
              },
            },
            properties: {},
          });
        }
      } else if (toolMode === 'select') {
        // Raycast to select element
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, camera);

        const selectableMeshes: ThreeMesh[] = [];
        scene.traverse((object) => {
          if (object.userData.elementType && object instanceof ThreeMesh) {
            selectableMeshes.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(selectableMeshes, false);

        if (intersects.length > 0) {
          const elementId = intersects[0].object.userData.elementId;
          onElementSelect(elementId);
        } else {
          onElementSelect(null);
        }
      } else if (toolMode === 'delete') {
        // Raycast to delete element
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, camera);

        const selectableMeshes: ThreeMesh[] = [];
        scene.traverse((object) => {
          if (object.userData.elementType && object instanceof ThreeMesh) {
            selectableMeshes.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(selectableMeshes, false);

        if (intersects.length > 0) {
          const elementId = intersects[0].object.userData.elementId;
          onElementDelete(elementId);
        }
      }
    },
    [
      scene,
      camera,
      toolMode,
      wallStartPoint,
      wallPreviewLine,
      snapToGrid,
      getGroundIntersection,
      onWallCreate,
      onDoorPlace,
      onElementSelect,
      onElementDelete,
      walls,
      wallHeight,
      wallThickness,
      doorWidth,
      doorHeight,
      isDragging,
    ]
  );

  // Handle mouse move for wall preview and door preview
  const handleCanvasMouseMove = useCallback(
    (event: MouseEvent) => {
      // Track dragging
      handleCanvasMouseMoveForDrag(event);

      if (!scene || !camera) return;

      // Wall preview
      if (toolMode === 'wall' && wallStartPoint) {
        const point = getGroundIntersection(event);
        if (!point) return;

        const snappedPoint = snapToGrid(point);

        // Update preview line
        if (wallPreviewLine) {
          scene.remove(wallPreviewLine);
        }

        const points = [wallStartPoint, snappedPoint];
        const geometry = new BufferGeometry().setFromPoints(points);
        const material = new LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
        const line = new Line(geometry, material);

        scene.add(line);
        setWallPreviewLine(line);
      }

      // Door preview
      if (toolMode === 'door') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, camera);

        const wallMeshes: ThreeMesh[] = [];
        scene.traverse((object) => {
          if (object.userData.elementType === 'wall' && object instanceof ThreeMesh) {
            wallMeshes.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(wallMeshes, false);

        if (intersects.length > 0) {
          const intersection = intersects[0];
          const point = intersection.point;
          const normal = intersection.face?.normal.clone();

          if (normal) {
            // Transform normal to world space
            normal.transformDirection(intersection.object.matrixWorld);

            // Remove old preview
            if (doorPreviewMesh) {
              scene.remove(doorPreviewMesh);
            }

            // Create door preview mesh
            const previewGeometry = new BoxGeometry(doorWidth, doorHeight, wallThickness);
            const previewMaterial = new MeshLambertMaterial({
              color: 0x8B4513,
              transparent: true,
              opacity: 0.6,
            });
            const preview = new ThreeMesh(previewGeometry, previewMaterial);

            // Position at intersection point
            preview.position.copy(point);
            preview.position.y = doorHeight / 2;
            preview.rotation.y = Math.atan2(normal.z, normal.x);

            scene.add(preview);
            setDoorPreviewMesh(preview);
          }
        } else {
          // No wall hit - remove preview
          if (doorPreviewMesh) {
            scene.remove(doorPreviewMesh);
            setDoorPreviewMesh(null);
          }
        }
      } else {
        // Not in door mode - remove preview
        if (doorPreviewMesh) {
          scene.remove(doorPreviewMesh);
          setDoorPreviewMesh(null);
        }
      }
    },
    [scene, camera, toolMode, wallStartPoint, wallPreviewLine, snapToGrid, getGroundIntersection, doorPreviewMesh, doorWidth, doorHeight, wallThickness, handleCanvasMouseMoveForDrag]
  );

  // Handle escape key to cancel wall placement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && wallStartPoint && scene) {
        // Cancel wall placement
        setWallStartPoint(null);
        if (wallPreviewLine) {
          scene.remove(wallPreviewLine);
          setWallPreviewLine(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wallStartPoint, wallPreviewLine, scene]);

  // Attach event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);

    return () => {
      canvas.removeEventListener('mousedown', handleCanvasMouseDown);
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
    };
  }, [handleCanvasMouseDown, handleCanvasClick, handleCanvasMouseMove]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 bg-opacity-75">
          <div className="text-white text-xl">Initializing 3D Scene...</div>
        </div>
      )}
      {!manifoldLoaded && isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 bg-opacity-75">
          <div className="text-white text-xl">Loading Manifold...</div>
        </div>
      )}
      {toolMode === 'wall' && wallStartPoint && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg">
          Click to set wall end point
        </div>
      )}
      {toolMode === 'door' && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          Click on a wall to place door
        </div>
      )}
    </div>
  );
}
