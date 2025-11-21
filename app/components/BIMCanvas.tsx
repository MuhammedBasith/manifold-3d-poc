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
import { createWallGeometry, createDoorGeometries, createDoorCutterGeometry, buildWallNetworks, WallNetwork } from '../lib/bim-geometry';
import { processWallNetwork, ExtendedWallGeometry } from '../lib/wall-joints';

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
  const { scene, camera, isReady, controls } = useThreeScene(canvasRef, {
    enableGrid: gridEnabled,
    gridSize: 100, // 100 feet grid extent
    gridDivisions: 100, // 1 foot grid lines
  });
  const { isLoaded: manifoldLoaded, performBoolean } = useManifold();

  // Wall creation state
  const [wallStartPoint, setWallStartPoint] = useState<Vector3 | null>(null);
  const wallPreviewMeshRef = useRef<Object3D | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [currentSnapType, setCurrentSnapType] = useState<string | null>(null);

  // Door preview state
  const previewGroupRef = useRef<Group | null>(null);

  // Raycaster
  const raycasterRef = useRef(new Raycaster());
  const mouseRef = useRef(new Vector2());

  // Track modifier keys for snap override
  const [shiftKeyPressed, setShiftKeyPressed] = useState(false);

  // Snap to grid with improved floating-point precision
  const snapToGrid = useCallback(
    (position: Vector3): Vector3 => {
      if (!gridEnabled) return position;
      // Snap to nearest inch (1/12 foot) with improved precision
      // Using inverse multiplication to reduce floating-point errors
      const snapFactor = 12; // Inverse of 1/12
      return new Vector3(
        Math.round(position.x * snapFactor) / snapFactor,
        Math.round(position.y * snapFactor) / snapFactor,
        Math.round(position.z * snapFactor) / snapFactor
      );
    },
    [gridEnabled]
  );

  // Helper to get screen-space distance between world point and mouse
  const getScreenSpaceDistance = useCallback(
    (worldPoint: Vector3, mouseScreenPos: Vector2): number => {
      if (!camera || !canvasRef.current) return Infinity;

      // Project world point to screen space
      const screenPos = worldPoint.clone().project(camera);

      // Calculate pixel distance
      const dx = (screenPos.x - mouseScreenPos.x) * canvasRef.current.width / 2;
      const dy = (screenPos.y - mouseScreenPos.y) * canvasRef.current.height / 2;

      return Math.sqrt(dx * dx + dy * dy);
    },
    [camera]
  );

  // Snap to wall endpoints with status tracking and screen-space snapping
  const snapToWallEndpoints = useCallback(
    (position: Vector3, mouseScreenPos?: Vector2): { point: Vector3; snapped: boolean; snapType?: string } => {
      // Skip endpoint snapping if Shift key is held
      if (shiftKeyPressed) {
        return { point: position.clone(), snapped: false };
      }

      // Use screen-space snapping if mouse position is provided
      const useScreenSpace = mouseScreenPos && camera && canvasRef.current;
      const snapThresholdPixels = 20; // 20 pixels in screen space
      const snapThresholdWorld = 0.5; // Reduced from 1.0 foot for tighter control

      let closestPoint = position.clone();
      let minDistance = useScreenSpace ? snapThresholdPixels : snapThresholdWorld;
      let didSnap = false;

      walls.forEach((wall) => {
        const start = tupleToVec3(wall.start);
        const end = tupleToVec3(wall.end);

        if (useScreenSpace && mouseScreenPos) {
          // Screen-space snapping (pixels)
          const startDist = getScreenSpaceDistance(start, mouseScreenPos);
          const endDist = getScreenSpaceDistance(end, mouseScreenPos);

          if (startDist < minDistance) {
            minDistance = startDist;
            closestPoint = start;
            didSnap = true;
          }
          if (endDist < minDistance) {
            minDistance = endDist;
            closestPoint = end;
            didSnap = true;
          }
        } else {
          // World-space snapping (fallback)
          if (position.distanceTo(start) < minDistance) {
            minDistance = position.distanceTo(start);
            closestPoint = start;
            didSnap = true;
          }
          if (position.distanceTo(end) < minDistance) {
            minDistance = position.distanceTo(end);
            closestPoint = end;
            didSnap = true;
          }
        }
      });

      return { point: closestPoint, snapped: didSnap, snapType: didSnap ? 'endpoint' : undefined };
    },
    [walls, shiftKeyPressed, camera, getScreenSpaceDistance]
  );

  // Unified snapping function for consistent wall placement
  // Used by both preview (mouse move) and actual placement (click)
  const getSnappedWallEndpoint = useCallback(
    (rawPoint: Vector3, startPoint: Vector3, applyAngleSnap: boolean, mouseScreenPos?: Vector2): { point: Vector3; snapType?: string } => {
      // Priority: Endpoint Snap > Grid Snap
      const endpointSnap = snapToWallEndpoints(rawPoint, mouseScreenPos);
      let targetPoint = endpointSnap.snapped ? endpointSnap.point : snapToGrid(rawPoint);
      let snapType = endpointSnap.snapType;

      // If grid snap was used
      if (!endpointSnap.snapped && gridEnabled) {
        snapType = 'grid';
      }

      // Apply angle snapping if requested
      if (applyAngleSnap) {
        const direction = new Vector3().subVectors(targetPoint, startPoint);
        const angle = Math.atan2(direction.z, direction.x);

        // Snap to 45 degree increments
        const snapAngle = Math.PI / 4; // 45 degrees
        const snappedAngle = Math.round(angle / snapAngle) * snapAngle;

        // If close to a snap angle (within 5 degrees), snap to it
        if (Math.abs(angle - snappedAngle) < 0.087) { // ~5 degrees
          const length = direction.length();
          targetPoint = new Vector3(
            startPoint.x + Math.cos(snappedAngle) * length,
            startPoint.y,
            startPoint.z + Math.sin(snappedAngle) * length
          );
          snapType = snapType ? `${snapType}+angle` : 'angle';
        }
      }

      return { point: targetPoint, snapType };
    },
    [snapToWallEndpoints, snapToGrid, gridEnabled]
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

    // Remove all BIM elements, helpers, and highlights
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.userData.elementType || object.userData.isHighlight || object instanceof BoxHelper) {
        toRemove.push(object);
      }
    });
    toRemove.forEach((obj) => scene.remove(obj));

    // Build wall networks (groups of connected walls)
    const wallNetworks = buildWallNetworks(walls);

    // Process each wall network
    wallNetworks.forEach((network) => {
      if (network.walls.length === 0) return;

      // Calculate extended geometries for proper corner joining
      const extensions = processWallNetwork(network.walls, 'auto');

      // Create individual wall geometries in world space
      const wallGeometries: BufferGeometry[] = [];

      network.walls.forEach((wall) => {
        // Get extended geometry if available, otherwise use original
        const ext = extensions.get(wall.id);
        const start = ext ? ext.extendedStart : tupleToVec3(wall.start);
        const end = ext ? ext.extendedEnd : tupleToVec3(wall.end);

        const direction = new Vector3().subVectors(end, start);
        const length = direction.length();

        // Create wall geometry
        const geometry = createWallGeometry(length, wall.geometry.dimensions.height, wall.thickness);

        // Position and rotate geometry to world space
        const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);
        midpoint.y = wall.geometry.dimensions.height / 2;

        const angle = Math.atan2(direction.z, direction.x);

        const matrix = new Matrix4();
        matrix.makeRotationY(-angle);
        matrix.setPosition(midpoint);

        geometry.applyMatrix4(matrix);
        wallGeometries.push(geometry);
      });

      // Union all walls in the network together
      let unifiedGeometry: BufferGeometry | null = null;

      if (wallGeometries.length === 1) {
        // Single wall, no union needed
        unifiedGeometry = wallGeometries[0];
      } else {
        // Union multiple walls together
        unifiedGeometry = wallGeometries[0];

        for (let i = 1; i < wallGeometries.length; i++) {
          const result = performBoolean(unifiedGeometry, wallGeometries[i], 'union');

          if (result) {
            // Dispose previous geometry
            if (i > 1) {
              unifiedGeometry.dispose();
            }
            unifiedGeometry = result;
          }

          // Dispose the geometry we just unioned
          if (i > 0) {
            wallGeometries[i].dispose();
          }
        }
      }

      if (!unifiedGeometry) return;

      // Now subtract doors from the unified wall network
      const networkDoorIds = new Set(
        network.walls.flatMap(wall => wall.doors)
      );

      const networkDoors = doors.filter((door) => networkDoorIds.has(door.id));

      if (networkDoors.length > 0) {
        let wallGeometry = unifiedGeometry;

        for (const door of networkDoors) {
          const parentWall = network.walls.find(w => w.id === door.parentWallId);
          if (!parentWall) continue;

          // Create door cutter geometry
          const cutterGeometry = createDoorCutterGeometry(
            door.geometry.dimensions.width,
            door.geometry.dimensions.height,
            parentWall.thickness
          );

          // Position cutter geometry in world space
          const doorPos = tupleToVec3(door.geometry.position);
          const doorRot = tupleToVec3(door.geometry.rotation);

          const cutterMatrix = new Matrix4();
          const rotationMatrix = new Matrix4().makeRotationFromEuler(new THREE.Euler(doorRot.x, doorRot.y, doorRot.z));
          const translationMatrix = new Matrix4().makeTranslation(doorPos.x, doorPos.y, doorPos.z);

          cutterMatrix.multiplyMatrices(translationMatrix, rotationMatrix);
          cutterGeometry.applyMatrix4(cutterMatrix);

          // Perform boolean subtraction (cutter is already in world space)
          const resultGeometry = performBoolean(wallGeometry, cutterGeometry, 'difference');

          if (resultGeometry) {
            wallGeometry.dispose();
            wallGeometry = resultGeometry;
          }

          cutterGeometry.dispose();
        }

        unifiedGeometry = wallGeometry;
      }

      // Create final mesh for the unified wall network
      const material = new MeshLambertMaterial({
        color: 0xeeeeee,
        transparent: false,
      });

      const networkMesh = new ThreeMesh(unifiedGeometry, material);

      // Store metadata for all walls in this network
      networkMesh.userData.elementType = 'wall';
      networkMesh.userData.wallIds = Array.from(network.wallIds);
      networkMesh.userData.isNetwork = true;
      networkMesh.castShadow = true;
      networkMesh.receiveShadow = true;

      scene.add(networkMesh);

      // Add selection highlight for individual selected wall (not entire network)
      const selectedWall = network.walls.find(w => w.id === selectedElementId);
      if (selectedWall) {
        // Get the wall's actual geometry (possibly extended)
        const ext = extensions.get(selectedWall.id);
        const start = ext ? ext.extendedStart : tupleToVec3(selectedWall.start);
        const end = ext ? ext.extendedEnd : tupleToVec3(selectedWall.end);

        const direction = new Vector3().subVectors(end, start);
        const length = direction.length();

        // Create highlight box for just this wall
        const highlightGeo = new BoxGeometry(
          length,
          selectedWall.geometry.dimensions.height,
          selectedWall.thickness
        );

        const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);
        midpoint.y = selectedWall.geometry.dimensions.height / 2;

        const angle = Math.atan2(direction.z, direction.x);

        const matrix = new Matrix4();
        matrix.makeRotationY(-angle);
        matrix.setPosition(midpoint);

        highlightGeo.applyMatrix4(matrix);

        // Create edge highlight
        const edges = new EdgesGeometry(highlightGeo);
        const lineMaterial = new LineBasicMaterial({
          color: 0x00ff00,
          linewidth: 3,
          transparent: true,
          opacity: 0.9
        });
        const wireframe = new LineSegments(edges, lineMaterial);
        wireframe.userData.isHighlight = true;
        wireframe.userData.elementId = selectedWall.id;
        scene.add(wireframe);

        highlightGeo.dispose();
      }
    });

    // Create actual door meshes
    doors.forEach((door) => {
      const parentWall = walls.find(w => w.id === door.parentWallId);
      if (!parentWall) return;

      const doorObject = createDoorObject(door, parentWall);
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
  }, [scene, walls, doors, manifoldLoaded, performBoolean, createDoorObject, selectedElementId]);

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

        if (!wallStartPoint) {
          // First click - set start point (no angle snapping for start point)
          const endpointSnap = snapToWallEndpoints(point, mouseRef.current);
          const snappedPoint = endpointSnap.snapped ? endpointSnap.point : snapToGrid(point);
          setWallStartPoint(snappedPoint);
        } else {
          // Second click - create wall with unified snapping (includes angle snap)
          const start = wallStartPoint;
          const snapResult = getSnappedWallEndpoint(point, start, true, mouseRef.current);
          const end = snapResult.point;

          // Don't create zero-length walls
          if (start.distanceTo(end) < 0.01) {
            setWallStartPoint(null);
            if (wallPreviewMeshRef.current) {
              scene.remove(wallPreviewMeshRef.current);
              wallPreviewMeshRef.current = null;
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
            relationships: {
              hostedElements: [],
              connectedWalls: [],
            },
          });

          setWallStartPoint(null);
          if (wallPreviewMeshRef.current) {
            scene.remove(wallPreviewMeshRef.current);
            wallPreviewMeshRef.current = null;
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
          const point = intersection.point;
          const normal = intersection.face?.normal.clone();

          if (!normal || Math.abs(normal.y) > 0.1) return; // Ensure side face

          // Transform normal to world space
          normal.transformDirection(intersection.object.matrixWorld);

          // Check if this is a wall network or a single wall
          let wallId = intersection.object.userData.elementId;
          const isNetwork = intersection.object.userData.isNetwork;

          if (isNetwork && intersection.object.userData.wallIds) {
            // It's a network, find specific wall
            const wallIds = intersection.object.userData.wallIds as string[];
            const networkWalls = walls.filter(w => wallIds.includes(w.id));

            let closestWallId: string | null = null;
            let minDistance = Infinity;

            networkWalls.forEach(wall => {
              const start = tupleToVec3(wall.start);
              const end = tupleToVec3(wall.end);

              const wallDir = new Vector3().subVectors(end, start);
              const wallLength = wallDir.length();
              wallDir.normalize();

              const toPoint = new Vector3().subVectors(point, start);
              const projection = toPoint.dot(wallDir);
              const clampedProjection = Math.max(0, Math.min(wallLength, projection));

              const closestPointOnWall = start.clone().add(wallDir.multiplyScalar(clampedProjection));
              const distance = point.distanceTo(closestPointOnWall);

              if (distance < minDistance) {
                minDistance = distance;
                closestWallId = wall.id;
              }
            });

            if (closestWallId) {
              wallId = closestWallId;
            }
          }

          if (!wallId) return;

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
            relationships: {
              parentWall: wallId,
            },
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
          if (object.userData.elementId || object.userData.elementType === 'wall') {
            selectableObjects.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(selectableObjects, false);

        if (intersects.length > 0) {
          const target = intersects[0].object;
          const point = intersects[0].point;

          // Check if this is a wall network
          if (target.userData.isNetwork && target.userData.wallIds) {
            // Find which specific wall in the network was clicked
            const wallIds = target.userData.wallIds as string[];
            const networkWalls = walls.filter(w => wallIds.includes(w.id));

            // Find the closest wall to the intersection point
            let closestWallId: string | null = null;
            let minDistance = Infinity;

            networkWalls.forEach(wall => {
              const start = tupleToVec3(wall.start);
              const end = tupleToVec3(wall.end);

              // Calculate distance from point to wall line segment
              const wallDir = new Vector3().subVectors(end, start);
              const wallLength = wallDir.length();
              wallDir.normalize();

              const toPoint = new Vector3().subVectors(point, start);
              const projection = toPoint.dot(wallDir);
              const clampedProjection = Math.max(0, Math.min(wallLength, projection));

              const closestPointOnWall = start.clone().add(wallDir.multiplyScalar(clampedProjection));
              const distance = point.distanceTo(closestPointOnWall);

              if (distance < minDistance) {
                minDistance = distance;
                closestWallId = wall.id;
              }
            });

            if (closestWallId) {
              onElementSelect(closestWallId);
            }
          } else if (target.userData.elementId) {
            // Direct element ID (door, standalone wall, etc)
            onElementSelect(target.userData.elementId);
          } else {
            onElementSelect(null);
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
          if (object.userData.elementId || object.userData.elementType === 'wall') {
            selectableObjects.push(object);
          }
        });

        const intersects = raycasterRef.current.intersectObjects(selectableObjects, false);

        if (intersects.length > 0) {
          const target = intersects[0].object;
          const point = intersects[0].point;

          // Check if this is a wall network
          if (target.userData.isNetwork && target.userData.wallIds) {
            // Find which specific wall in the network was clicked
            const wallIds = target.userData.wallIds as string[];
            const networkWalls = walls.filter(w => wallIds.includes(w.id));

            // Find the closest wall to the intersection point
            let closestWallId: string | null = null;
            let minDistance = Infinity;

            networkWalls.forEach(wall => {
              const start = tupleToVec3(wall.start);
              const end = tupleToVec3(wall.end);

              // Calculate distance from point to wall line segment
              const wallDir = new Vector3().subVectors(end, start);
              const wallLength = wallDir.length();
              wallDir.normalize();

              const toPoint = new Vector3().subVectors(point, start);
              const projection = toPoint.dot(wallDir);
              const clampedProjection = Math.max(0, Math.min(wallLength, projection));

              const closestPointOnWall = start.clone().add(wallDir.multiplyScalar(clampedProjection));
              const distance = point.distanceTo(closestPointOnWall);

              if (distance < minDistance) {
                minDistance = distance;
                closestWallId = wall.id;
              }
            });

            if (closestWallId) {
              onElementDelete(closestWallId);
            }
          } else if (target.userData.elementId) {
            // Direct element ID (door, etc)
            onElementDelete(target.userData.elementId);
          }
        }
      }
    },
    [
      scene,
      camera,
      toolMode,
      wallStartPoint,
      snapToGrid,
      snapToWallEndpoints,
      getSnappedWallEndpoint,
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

        // Use unified snapping function (same as click handler)
        const start = wallStartPoint;
        const snapResult = getSnappedWallEndpoint(point, start, true, mouseRef.current);
        const end = snapResult.point;

        // Update snap type for visual feedback
        setCurrentSnapType(snapResult.snapType || null);

        // Update preview mesh
        if (wallPreviewMeshRef.current) {
          scene.remove(wallPreviewMeshRef.current);
          wallPreviewMeshRef.current = null;
        }

        // Calculate angle for display
        const direction = new Vector3().subVectors(end, start);
        const angle = Math.atan2(direction.z, direction.x);
        const length = start.distanceTo(end);

        if (length > 0.1) {
          const geometry = createWallGeometry(length, wallHeight, wallThickness);
          const material = new MeshLambertMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5
          });
          const mesh = new ThreeMesh(geometry, material);

          // Position at midpoint
          const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);
          midpoint.y = wallHeight / 2;
          mesh.position.copy(midpoint);

          // Rotate
          mesh.rotation.y = -angle;

          scene.add(mesh);
          wallPreviewMeshRef.current = mesh;

          // Update angle indicator
          setCurrentAngle(angle * (180 / Math.PI));
        }
      } else {
        setCurrentAngle(null);
        setCurrentSnapType(null);
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

          if (!normal || Math.abs(normal.y) > 0.1) return; // Ensure side face

          // Transform normal to world space
          normal.transformDirection(intersection.object.matrixWorld);

          // Check if this is a wall network or a single wall
          let wallId = intersection.object.userData.elementId;
          const isNetwork = intersection.object.userData.isNetwork;

          if (isNetwork && intersection.object.userData.wallIds) {
            // It's a network, we need to find which specific wall in the network was hit
            const wallIds = intersection.object.userData.wallIds as string[];
            const networkWalls = walls.filter(w => wallIds.includes(w.id));

            // Find closest wall in network to the intersection point
            let closestWallId: string | null = null;
            let minDistance = Infinity;

            networkWalls.forEach(wall => {
              const start = tupleToVec3(wall.start);
              const end = tupleToVec3(wall.end);

              // Calculate distance from point to wall line segment
              const wallDir = new Vector3().subVectors(end, start);
              const wallLength = wallDir.length();
              wallDir.normalize();

              const toPoint = new Vector3().subVectors(point, start);
              const projection = toPoint.dot(wallDir);
              const clampedProjection = Math.max(0, Math.min(wallLength, projection));

              const closestPointOnWall = start.clone().add(wallDir.multiplyScalar(clampedProjection));
              const distance = point.distanceTo(closestPointOnWall);

              if (distance < minDistance) {
                minDistance = distance;
                closestWallId = wall.id;
              }
            });

            if (closestWallId) {
              wallId = closestWallId;
            }
          }

          if (wallId) {
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
    [scene, camera, toolMode, wallStartPoint, getSnappedWallEndpoint, getGroundIntersection, doorWidth, doorHeight, wallThickness, handleCanvasMouseMoveForDrag, walls, gridEnabled, updateDoorPreview, wallHeight]
  );

  // Handle keyboard events for escape and Shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && wallStartPoint && scene) {
        // Cancel wall placement
        setWallStartPoint(null);
        if (wallPreviewMeshRef.current) {
          scene.remove(wallPreviewMeshRef.current);
          wallPreviewMeshRef.current = null;
        }
      }
      // Also cancel door preview if in door mode
      if (e.key === 'Escape' && toolMode === 'door') {
        updateDoorPreview(false);
      }
      // Track Shift key for snap override
      if (e.key === 'Shift') {
        setShiftKeyPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftKeyPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [wallStartPoint, scene, toolMode, updateDoorPreview]);

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

  // Reset wall creation state when tool mode changes
  useEffect(() => {
    if (toolMode !== 'wall') {
      setWallStartPoint(null);
      if (wallPreviewMeshRef.current && scene) {
        scene.remove(wallPreviewMeshRef.current);
        wallPreviewMeshRef.current = null;
      }
    }

    // Handle Pan Tool
    if (controls) {
      if (toolMode === 'pan') {
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        };
        // Change cursor
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      } else {
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        };
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'default';
        }
      }
      controls.update();
    }
  }, [toolMode, scene, controls]);

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
          <div className="flex items-center gap-2">
            <span>Click to set wall end point</span>
            {currentAngle !== null && (
              <span className="font-bold">
                {Math.abs(currentAngle).toFixed(0)}°
              </span>
            )}
            {currentSnapType && (
              <span className="text-xs bg-green-700 px-2 py-0.5 rounded">
                {currentSnapType}
              </span>
            )}
            {shiftKeyPressed && (
              <span className="text-xs bg-yellow-500 px-2 py-0.5 rounded text-black">
                Snap Override
              </span>
            )}
          </div>
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
