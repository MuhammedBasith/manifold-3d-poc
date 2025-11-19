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
  MeshStandardMaterial,
  LineBasicMaterial,
  Line,
  BufferGeometry,
  EdgesGeometry,
  LineSegments,
  Plane,
  Matrix4,
  Group,
  Object3D,
  BoxHelper,
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
import { createWallGeometry, createDoorGeometries, createDoorCutterGeometry } from '../lib/bim-geometry';

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
    gridSize: 100, // 100 feet grid extent
    gridDivisions: 100, // 1 foot grid lines
  });
  const { isLoaded: manifoldLoaded, performBoolean } = useManifold();

  // Wall creation state
  const [wallStartPoint, setWallStartPoint] = useState<Vector3 | null>(null);
  const [wallPreviewLine, setWallPreviewLine] = useState<Line | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Door preview state
  const previewGroupRef = useRef<Group | null>(null);

  // Raycaster
  const raycasterRef = useRef(new Raycaster());
  const mouseRef = useRef(new Vector2());

  // Snap to grid
  const snapToGrid = useCallback(
    (position: Vector3): Vector3 => {
      if (!gridEnabled) return position;
      // Snap to nearest inch (1/12 foot)
      const snapIncrement = 1 / 12;
      return new Vector3(
        Math.round(position.x / snapIncrement) * snapIncrement,
        Math.round(position.y / snapIncrement) * snapIncrement,
        Math.round(position.z / snapIncrement) * snapIncrement
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

      const geometry = createWallGeometry(length, height, thickness);
      const material = new MeshLambertMaterial({
        color: 0xeeeeee,
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

  // Create door mesh (Group)
  const createDoorObject = useCallback(
    (door: BIMDoor, parentWall: BIMWall): Group => {
      const { frame, panel, handle } = createDoorGeometries(
        door.geometry.dimensions.width,
        door.geometry.dimensions.height,
        door.geometry.dimensions.depth
      );

      const group = new Group();

      const frameMat = new MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.8 }); // Dark wood
      const panelMat = new MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 }); // Lighter wood
      const handleMat = new MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.2 }); // Silver

      const frameMesh = new ThreeMesh(frame, frameMat);
      const panelMesh = new ThreeMesh(panel, panelMat);
      const handleMesh = new ThreeMesh(handle, handleMat);

      frameMesh.castShadow = true;
      panelMesh.castShadow = true;
      handleMesh.castShadow = true;

      group.add(frameMesh);
      group.add(panelMesh);
      group.add(handleMesh);

      const position = tupleToVec3(door.geometry.position);
      group.position.copy(position);

      const rotation = tupleToVec3(door.geometry.rotation);
      group.rotation.set(rotation.x, rotation.y, rotation.z);

      // Store metadata on the group and children for raycasting
      group.userData.elementId = door.id;
      group.userData.elementType = 'door';

      frameMesh.userData.elementId = door.id;
      frameMesh.userData.elementType = 'door';
      panelMesh.userData.elementId = door.id;
      panelMesh.userData.elementType = 'door';

      return group;
    },
    []
  );

  // Rebuild scene from BIM model
  const rebuildScene = useCallback(() => {
    if (!scene || !manifoldLoaded || !performBoolean) return;

    // Remove all BIM elements and helpers
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.userData.elementType || object instanceof BoxHelper) {
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
          // Create door cutter geometry
          const cutterGeometry = createDoorCutterGeometry(
            door.geometry.dimensions.width,
            door.geometry.dimensions.height,
            wall.thickness
          );

          // Position cutter geometry in world space
          const doorPos = tupleToVec3(door.geometry.position);
          const doorRot = tupleToVec3(door.geometry.rotation);

          const cutterMatrix = new Matrix4();
          // Apply rotation first, then translation
          const rotationMatrix = new Matrix4().makeRotationFromEuler(new THREE.Euler(doorRot.x, doorRot.y, doorRot.z));
          const translationMatrix = new Matrix4().makeTranslation(doorPos.x, doorPos.y, doorPos.z);

          cutterMatrix.multiplyMatrices(translationMatrix, rotationMatrix);
          cutterGeometry.applyMatrix4(cutterMatrix);

          // Transform cutter to Wall's Local Space.
          wallMesh.updateMatrix();
          const wallInverse = wallMesh.matrix.clone().invert();
          cutterGeometry.applyMatrix4(wallInverse);

          // Perform boolean subtraction
          const resultGeometry = performBoolean(wallGeometry, cutterGeometry, 'difference');

          if (resultGeometry) {
            wallGeometry.dispose();
            wallGeometry = resultGeometry;
          }

          cutterGeometry.dispose();
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
      const doorObject = createDoorObject(door, walls.find(w => w.id === door.parentWallId)!);
      if (doorObject) {
        scene.add(doorObject);

        // Add selection highlight for selected doors
        if (selectedElementId === door.id) {
          const { width, height, depth } = door.geometry.dimensions;
          const boxGeo = new BoxGeometry(width, height, depth);
          // Align with door origin (bottom-center)
          boxGeo.translate(0, height / 2, 0);

          const edges = new EdgesGeometry(boxGeo);
          const lineMat = new LineBasicMaterial({ color: 0x00ff00 });
          const wireframe = new LineSegments(edges, lineMat);

          doorObject.add(wireframe);
        }
      }
    });
  }, [scene, walls, doors, manifoldLoaded, performBoolean, createWallMesh, createDoorObject, selectedElementId]);

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

  // Helper to update door preview
  const updateDoorPreview = useCallback((visible: boolean, position?: Vector3, rotationY?: number) => {
    if (!scene) return;

    // Lazy create preview group
    if (!previewGroupRef.current) {
      const group = new Group();
      const { frame, panel } = createDoorGeometries(doorWidth, doorHeight, wallThickness);

      const previewMat = new MeshLambertMaterial({
        color: 0x8B4513,
        transparent: true,
        opacity: 0.6,
      });

      const frameMesh = new ThreeMesh(frame, previewMat);
      const panelMesh = new ThreeMesh(panel, previewMat);

      group.add(frameMesh);
      group.add(panelMesh);

      previewGroupRef.current = group;
      scene.add(group);
    }

    const group = previewGroupRef.current;

    if (visible && position && rotationY !== undefined) {
      group.visible = true;
      group.position.copy(position);
      group.rotation.set(0, rotationY, 0);
    } else {
      group.visible = false;
    }
  }, [scene, doorWidth, doorHeight, wallThickness]);

  // Reset preview when dimensions change
  useEffect(() => {
    if (previewGroupRef.current && scene) {
      scene.remove(previewGroupRef.current);
      previewGroupRef.current = null;
    }
  }, [doorWidth, doorHeight, wallThickness, scene]);

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

          if (!normal || Math.abs(normal.y) > 0.1) return; // Ensure side face

          // Transform normal to world space
          normal.transformDirection(intersection.object.matrixWorld);

          const wall = walls.find((w) => w.id === wallId);
          if (!wall) return;

          // Snap to floor (y=0)
          point.y = 0;

          // Calculate offset along wall
          const wallStart = tupleToVec3(wall.start);
          const wallEnd = tupleToVec3(wall.end);
          const wallDirection = new Vector3().subVectors(wallEnd, wallStart).normalize();

          // Project point onto wall line to get precise offset
          const v = new Vector3().subVectors(point, wallStart);
          const dist = v.dot(wallDirection);
          const projectedPoint = wallStart.clone().add(wallDirection.clone().multiplyScalar(dist));

          // Snap to grid if enabled
          if (gridEnabled) {
            // Snap the distance along the wall
            const gridSize = DEFAULT_EDITOR_SETTINGS.grid.size;
            const snappedDist = Math.round(dist / gridSize) * gridSize;

            // Clamp to wall length
            const wallLength = wallStart.distanceTo(wallEnd);
            const clampedDist = Math.max(0, Math.min(wallLength, snappedDist));

            projectedPoint.copy(wallStart).add(wallDirection.clone().multiplyScalar(clampedDist));
          } else {
            // Even if grid is disabled, clamp to wall length
            const wallLength = wallStart.distanceTo(wallEnd);
            const clampedDist = Math.max(0, Math.min(wallLength, dist));
            projectedPoint.copy(wallStart).add(wallDirection.clone().multiplyScalar(clampedDist));
          }

          // Calculate rotation based on wall direction
          const angle = Math.atan2(wallDirection.z, wallDirection.x);
          const rotationY = -angle;

          onDoorPlace({
            parentWallId: wallId,
            offsetOnWall: projectedPoint.distanceTo(wallStart),
            wallNormal: vec3ToTuple(normal),
            geometry: {
              position: vec3ToTuple(projectedPoint),
              rotation: { x: 0, y: rotationY, z: 0 }, // Use wall alignment
              dimensions: {
                width: doorWidth,
                height: doorHeight,
                depth: wall.thickness,
              },
            },
            properties: {},
          });

          // Clear preview immediately
          updateDoorPreview(false);
        }
      } else if (toolMode === 'select') {
        // Raycast to select element
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, camera);

        const selectableObjects: Object3D[] = [];
        scene.traverse((object) => {
          if (object.userData.elementId) {
            // If it's a mesh inside a group (like door parts), we want the group or the ID
            selectableObjects.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(selectableObjects, false);

        if (intersects.length > 0) {
          // Find the root element ID (could be on parent group)
          let target = intersects[0].object;
          while (target && !target.userData.elementId && target.parent) {
            target = target.parent;
          }

          const elementId = target.userData.elementId;
          if (elementId) {
            onElementSelect(elementId);
          }
        } else {
          onElementSelect(null);
        }
      } else if (toolMode === 'delete') {
        // Similar logic to select
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, camera);

        const selectableObjects: Object3D[] = [];
        scene.traverse((object) => {
          if (object.userData.elementId) {
            selectableObjects.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(selectableObjects, false);

        if (intersects.length > 0) {
          let target = intersects[0].object;
          while (target && !target.userData.elementId && target.parent) {
            target = target.parent;
          }
          const elementId = target.userData.elementId;
          if (elementId) {
            onElementDelete(elementId);
          }
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
      gridEnabled,
      updateDoorPreview
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
          const wallId = intersection.object.userData.elementId;
          const point = intersection.point;
          const normal = intersection.face?.normal.clone();

          // Ensure we are hitting a wall (not inside a hole or weird angle)
          if (normal && Math.abs(normal.y) < 0.1) { // Wall normal should be horizontal
            // Transform normal to world space
            normal.transformDirection(intersection.object.matrixWorld);

            // Snap logic
            const wall = walls.find(w => w.id === wallId);

            if (wall) {
              const wallStart = tupleToVec3(wall.start);
              const wallEnd = tupleToVec3(wall.end);
              const wallDirection = new Vector3().subVectors(wallEnd, wallStart).normalize();

              // Project point onto wall line
              const v = new Vector3().subVectors(point, wallStart);
              const dist = v.dot(wallDirection);

              let snappedDist = dist;
              if (gridEnabled) {
                const gridSize = DEFAULT_EDITOR_SETTINGS.grid.size;
                snappedDist = Math.round(dist / gridSize) * gridSize;
              }

              // Clamp to wall length to avoid ghost appearing off-wall
              const wallLength = wallStart.distanceTo(wallEnd);
              snappedDist = Math.max(0, Math.min(wallLength, snappedDist));

              const finalPos = wallStart.clone().add(wallDirection.multiplyScalar(snappedDist));

              // Calculate rotation based on wall direction
              const angle = Math.atan2(wallDirection.z, wallDirection.x);
              const rotationY = -angle;

              updateDoorPreview(true, finalPos, rotationY);
            }
          } else {
            updateDoorPreview(false);
          }
        } else {
          // No wall hit - hide preview
          updateDoorPreview(false);
        }
      } else {
        // Not in door mode - hide preview
        updateDoorPreview(false);
      }
    },
    [scene, camera, toolMode, wallStartPoint, wallPreviewLine, snapToGrid, getGroundIntersection, doorWidth, doorHeight, wallThickness, handleCanvasMouseMoveForDrag, walls, gridEnabled, updateDoorPreview]
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
      // Also cancel door preview if in door mode
      if (e.key === 'Escape' && toolMode === 'door') {
        updateDoorPreview(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wallStartPoint, wallPreviewLine, scene, toolMode, updateDoorPreview]);

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
