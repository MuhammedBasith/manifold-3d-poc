import { Vector3 } from 'three';
import { BIMWall, vec3ToTuple, tupleToVec3, Vec3Tuple } from '../types/bim';
import {
  WallTransformMode,
  WallTransformResult,
  WallTransformConstraints,
  WallTransformState,
  DEFAULT_TRANSFORM_CONSTRAINTS,
} from '../types/wall-transform';

/**
 * Calculate new wall position after a move transform
 */
export function calculateWallMove(
  wall: BIMWall,
  delta: Vector3,
  constraints: WallTransformConstraints = DEFAULT_TRANSFORM_CONSTRAINTS
): WallTransformResult {
  const start = tupleToVec3(wall.start);
  const end = tupleToVec3(wall.end);

  // Apply delta to both points
  let newStart = start.clone().add(delta);
  let newEnd = end.clone().add(delta);

  // Snap to grid if enabled
  if (constraints.snapToGrid) {
    newStart = snapToGrid(newStart, constraints.gridSize);
    newEnd = snapToGrid(newEnd, constraints.gridSize);
  }

  // Create transformed wall
  const transformedWall: BIMWall = {
    ...wall,
    start: vec3ToTuple(newStart),
    end: vec3ToTuple(newEnd),
    geometry: {
      ...wall.geometry,
      position: vec3ToTuple(newStart.clone().add(newEnd).multiplyScalar(0.5)),
    },
  };

  return {
    wall: transformedWall,
    affectedWalls: [], // Move doesn't affect other walls
  };
}

/**
 * Calculate new wall position after a stretch transform
 */
export function calculateWallStretch(
  wall: BIMWall,
  mode: WallTransformMode.STRETCH_START | WallTransformMode.STRETCH_END,
  newPosition: Vector3,
  constraints: WallTransformConstraints = DEFAULT_TRANSFORM_CONSTRAINTS
): WallTransformResult {
  const start = tupleToVec3(wall.start);
  const end = tupleToVec3(wall.end);

  let newStart = start.clone();
  let newEnd = end.clone();

  // Snap new position to grid if enabled
  let snappedPosition = newPosition.clone();
  if (constraints.snapToGrid) {
    snappedPosition = snapToGrid(snappedPosition, constraints.gridSize);
  }

  // Update the appropriate endpoint
  if (mode === WallTransformMode.STRETCH_START) {
    newStart = snappedPosition;
  } else {
    newEnd = snappedPosition;
  }

  // Check length constraints
  const newLength = newStart.distanceTo(newEnd);
  const warnings: string[] = [];

  if (newLength < constraints.minLength) {
    warnings.push(`Wall length (${newLength.toFixed(2)} ft) is below minimum (${constraints.minLength} ft)`);
    // Clamp to minimum length
    const direction = new Vector3().subVectors(newEnd, newStart).normalize();
    if (mode === WallTransformMode.STRETCH_START) {
      newStart = newEnd.clone().add(direction.multiplyScalar(-constraints.minLength));
    } else {
      newEnd = newStart.clone().add(direction.multiplyScalar(constraints.minLength));
    }
  }

  if (newLength > constraints.maxLength) {
    warnings.push(`Wall length (${newLength.toFixed(2)} ft) exceeds maximum (${constraints.maxLength} ft)`);
    // Clamp to maximum length
    const direction = new Vector3().subVectors(newEnd, newStart).normalize();
    if (mode === WallTransformMode.STRETCH_START) {
      newStart = newEnd.clone().add(direction.multiplyScalar(-constraints.maxLength));
    } else {
      newEnd = newStart.clone().add(direction.multiplyScalar(constraints.maxLength));
    }
  }

  // Calculate new midpoint for geometry position
  const midpoint = newStart.clone().add(newEnd).multiplyScalar(0.5);

  // Create transformed wall
  const transformedWall: BIMWall = {
    ...wall,
    start: vec3ToTuple(newStart),
    end: vec3ToTuple(newEnd),
    geometry: {
      ...wall.geometry,
      position: vec3ToTuple(midpoint),
      dimensions: {
        ...wall.geometry.dimensions,
        width: newStart.distanceTo(newEnd),
      },
    },
  };

  // Find connected walls that need updating
  const affectedWalls: string[] = [];
  if (constraints.maintainConnections) {
    wall.relationships.connectedWalls.forEach(conn => {
      affectedWalls.push(conn.wallId);
    });
  }

  return {
    wall: transformedWall,
    affectedWalls,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Calculate network move (move multiple connected walls together)
 */
export function calculateNetworkMove(
  walls: BIMWall[],
  networkWallIds: string[],
  delta: Vector3,
  constraints: WallTransformConstraints = DEFAULT_TRANSFORM_CONSTRAINTS
): Map<string, BIMWall> {
  const transformedWalls = new Map<string, BIMWall>();

  networkWallIds.forEach(wallId => {
    const wall = walls.find(w => w.id === wallId);
    if (!wall) return;

    const result = calculateWallMove(wall, delta, constraints);
    transformedWalls.set(wallId, result.wall);
  });

  return transformedWalls;
}

/**
 * Find walls connected at a specific endpoint
 */
export function findConnectedWalls(
  wall: BIMWall,
  endpoint: 'start' | 'end',
  allWalls: BIMWall[],
  threshold: number = 0.1
): BIMWall[] {
  const point = tupleToVec3(endpoint === 'start' ? wall.start : wall.end);
  const connected: BIMWall[] = [];

  allWalls.forEach(otherWall => {
    if (otherWall.id === wall.id) return;

    const otherStart = tupleToVec3(otherWall.start);
    const otherEnd = tupleToVec3(otherWall.end);

    if (point.distanceTo(otherStart) < threshold || point.distanceTo(otherEnd) < threshold) {
      connected.push(otherWall);
    }
  });

  return connected;
}

/**
 * Build wall network from a starting wall
 * Recursively finds all connected walls
 */
export function buildWallNetwork(
  startWall: BIMWall,
  allWalls: BIMWall[],
  visited: Set<string> = new Set()
): string[] {
  if (visited.has(startWall.id)) return [];

  visited.add(startWall.id);
  const networkWallIds = [startWall.id];

  // Find walls connected at start
  const connectedAtStart = findConnectedWalls(startWall, 'start', allWalls);
  connectedAtStart.forEach(wall => {
    const subNetwork = buildWallNetwork(wall, allWalls, visited);
    networkWallIds.push(...subNetwork);
  });

  // Find walls connected at end
  const connectedAtEnd = findConnectedWalls(startWall, 'end', allWalls);
  connectedAtEnd.forEach(wall => {
    const subNetwork = buildWallNetwork(wall, allWalls, visited);
    networkWallIds.push(...subNetwork);
  });

  return networkWallIds;
}

/**
 * Check if a transform would cause wall self-intersection
 */
export function checkSelfIntersection(wall: BIMWall): boolean {
  const start = tupleToVec3(wall.start);
  const end = tupleToVec3(wall.end);

  // For now, just check if start and end are too close
  // More sophisticated intersection detection could be added
  return start.distanceTo(end) < 0.1;
}

/**
 * Snap a position to grid
 */
function snapToGrid(position: Vector3, gridSize: number): Vector3 {
  return new Vector3(
    Math.round(position.x / gridSize) * gridSize,
    position.y, // Don't snap Y (keep at ground level)
    Math.round(position.z / gridSize) * gridSize
  );
}

/**
 * Calculate distance from a point to a line segment
 */
export function distanceToLineSegment(
  point: Vector3,
  lineStart: Vector3,
  lineEnd: Vector3
): number {
  const line = new Vector3().subVectors(lineEnd, lineStart);
  const lineLength = line.length();

  if (lineLength === 0) {
    return point.distanceTo(lineStart);
  }

  const t = Math.max(0, Math.min(1, new Vector3().subVectors(point, lineStart).dot(line) / (lineLength * lineLength)));
  const projection = lineStart.clone().add(line.multiplyScalar(t));

  return point.distanceTo(projection);
}

/**
 * Get the closest point on a line segment to a given point
 */
export function closestPointOnLineSegment(
  point: Vector3,
  lineStart: Vector3,
  lineEnd: Vector3
): Vector3 {
  const line = new Vector3().subVectors(lineEnd, lineStart);
  const lineLength = line.length();

  if (lineLength === 0) {
    return lineStart.clone();
  }

  const t = Math.max(0, Math.min(1, new Vector3().subVectors(point, lineStart).dot(line) / (lineLength * lineLength)));
  return lineStart.clone().add(line.multiplyScalar(t));
}

/**
 * Detect which transform mode should be used based on click position
 */
export function detectTransformMode(
  wall: BIMWall,
  clickPoint: Vector3,
  threshold: number = 0.5
): WallTransformMode {
  const start = tupleToVec3(wall.start);
  const end = tupleToVec3(wall.end);

  const distToStart = clickPoint.distanceTo(start);
  const distToEnd = clickPoint.distanceTo(end);

  // Click near start endpoint
  if (distToStart < threshold) {
    return WallTransformMode.STRETCH_START;
  }

  // Click near end endpoint
  if (distToEnd < threshold) {
    return WallTransformMode.STRETCH_END;
  }

  // Click on wall body
  return WallTransformMode.MOVE;
}
