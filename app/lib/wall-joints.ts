import { Vector3 } from 'three';
import { BIMWall, tupleToVec3, Vec3Tuple } from '../types/bim';

/**
 * Types of wall joints
 */
export enum JointType {
  L_JOINT = 'L_JOINT',       // 2 walls meeting at corner
  T_JOINT = 'T_JOINT',       // 3 walls meeting (one through, two butt)
  X_JOINT = 'X_JOINT',       // 4 walls meeting (cross)
  OBLIQUE = 'OBLIQUE',       // Non-orthogonal angles
  NONE = 'NONE',             // Isolated wall
}

/**
 * Joint method preference
 */
export type WallJointMethod = 'auto' | 'butt' | 'miter';

/**
 * Information about a connection point where walls meet
 */
export interface ConnectionPoint {
  point: Vector3;
  walls: BIMWall[];
  jointType: JointType;
}

/**
 * Extended wall geometry information
 */
export interface ExtendedWallGeometry {
  wallId: string;
  originalStart: Vector3;
  originalEnd: Vector3;
  extendedStart: Vector3;
  extendedEnd: Vector3;
  wasExtended: boolean;
}

/**
 * Find all unique connection points in a set of walls
 */
export function findConnectionPoints(walls: BIMWall[], tolerance: number = 0.01): ConnectionPoint[] {
  const pointMap = new Map<string, { point: Vector3; walls: BIMWall[] }>();

  walls.forEach(wall => {
    const start = tupleToVec3(wall.start);
    const end = tupleToVec3(wall.end);

    // Process start point
    let startMatchKey: string | null = null;
    for (const [key, value] of pointMap.entries()) {
      if (value.point.distanceTo(start) < tolerance) {
        startMatchKey = key;
        break;
      }
    }

    if (startMatchKey) {
      // Add wall to existing point
      pointMap.get(startMatchKey)!.walls.push(wall);
    } else {
      // Create new point
      const key = `${start.x.toFixed(3)},${start.y.toFixed(3)},${start.z.toFixed(3)}`;
      pointMap.set(key, { point: start, walls: [wall] });
    }

    // Process end point
    let endMatchKey: string | null = null;
    for (const [key, value] of pointMap.entries()) {
      if (value.point.distanceTo(end) < tolerance) {
        endMatchKey = key;
        break;
      }
    }

    if (endMatchKey) {
      // Add wall to existing point (avoid duplicates)
      const existingWalls = pointMap.get(endMatchKey)!.walls;
      if (!existingWalls.includes(wall)) {
        existingWalls.push(wall);
      }
    } else {
      // Create new point
      const key = `${end.x.toFixed(3)},${end.y.toFixed(3)},${end.z.toFixed(3)}`;
      pointMap.set(key, { point: end, walls: [wall] });
    }
  });

  // Convert to connection points array
  const connectionPoints: ConnectionPoint[] = [];

  for (const [key, value] of pointMap.entries()) {
    // Only consider points where 2 or more walls meet
    if (value.walls.length >= 2) {
      const jointType = detectJointType(value.walls, value.point, tolerance);
      connectionPoints.push({
        point: value.point,
        walls: value.walls,
        jointType,
      });
    }
  }

  return connectionPoints;
}

/**
 * Detect the type of joint based on number of walls and angles
 */
export function detectJointType(walls: BIMWall[], point: Vector3, tolerance: number = 0.01): JointType {
  const wallsAtPoint = walls.filter(w =>
    tupleToVec3(w.start).distanceTo(point) < tolerance ||
    tupleToVec3(w.end).distanceTo(point) < tolerance
  );

  const count = wallsAtPoint.length;

  if (count === 2) {
    // Check if walls are collinear (straight continuation, not a real joint)
    const dir1 = getDirectionFromPoint(wallsAtPoint[0], point);
    const dir2 = getDirectionFromPoint(wallsAtPoint[1], point);

    const dotProduct = dir1.dot(dir2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

    // If nearly parallel (angle close to 180°), it's a straight continuation, not a joint
    if (Math.abs(angle - Math.PI) < 0.1) {
      return JointType.NONE;
    }

    return JointType.L_JOINT;
  } else if (count === 3) {
    return JointType.T_JOINT;
  } else if (count === 4) {
    return JointType.X_JOINT;
  } else if (count > 4) {
    return JointType.OBLIQUE;
  }

  return JointType.NONE;
}

/**
 * Get direction vector pointing away from a specific point on a wall
 */
function getDirectionFromPoint(wall: BIMWall, point: Vector3, tolerance: number = 0.01): Vector3 {
  const start = tupleToVec3(wall.start);
  const end = tupleToVec3(wall.end);

  if (start.distanceTo(point) < tolerance) {
    // Point is at start, direction points toward end
    return new Vector3().subVectors(end, start).normalize();
  } else {
    // Point is at end, direction points toward start
    return new Vector3().subVectors(start, end).normalize();
  }
}

/**
 * Calculate the angle between two walls at a connection point
 */
function calculateAngleBetweenWalls(wall1: BIMWall, wall2: BIMWall, point: Vector3): number {
  const dir1 = getDirectionFromPoint(wall1, point);
  const dir2 = getDirectionFromPoint(wall2, point);

  const dotProduct = dir1.dot(dir2);
  const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

  return angle;
}

/**
 * Calculate extension for a butt joint
 */
function calculateButtExtension(
  wall: BIMWall,
  point: Vector3,
  intersectingWallThickness: number
): { start: Vector3; end: Vector3; wasExtended: boolean } {
  const start = tupleToVec3(wall.start);
  const end = tupleToVec3(wall.end);

  // Extension distance: extend to the far face of the intersecting wall
  const overlapMargin = 0.01; // Minimal overlap for CSG stability

  // Extend just enough to cross the full thickness of the intersecting wall
  const extensionDist = (intersectingWallThickness / 2) + overlapMargin;

  let newStart = start.clone();
  let newEnd = end.clone();
  let wasExtended = false;

  // Extend the wall BACK INTO ITSELF to create overlap at the connection
  if (start.distanceTo(point) < 0.01) {
    // Start is at connection - extend it BACK toward the end (into the wall body)
    const wallDir = new Vector3().subVectors(end, start).normalize();
    newStart = start.clone().sub(wallDir.multiplyScalar(extensionDist));
    wasExtended = true;
  } else if (end.distanceTo(point) < 0.01) {
    // End is at connection - extend it BACK toward the start (into the wall body)
    const wallDir = new Vector3().subVectors(start, end).normalize();
    newEnd = end.clone().sub(wallDir.multiplyScalar(extensionDist));
    wasExtended = true;
  }

  return { start: newStart, end: newEnd, wasExtended };
}

/**
 * Calculate extension for a miter joint
 */
function calculateMiterExtension(
  wall: BIMWall,
  point: Vector3,
  angle: number
): { start: Vector3; end: Vector3; wasExtended: boolean } {
  const start = tupleToVec3(wall.start);
  const end = tupleToVec3(wall.end);

  // Miter angle is half the corner angle
  const miterAngle = angle / 2;

  // Avoid division by very small numbers (near-parallel walls)
  if (Math.abs(Math.sin(miterAngle)) < 0.1) {
    // Fall back to butt joint for nearly parallel walls
    return calculateButtExtension(wall, point, wall.thickness);
  }

  // For proper overlap, we need extension to reach the outer corner
  // Triangle geometry: extension = (thickness/2) / tan(miterAngle)
  const overlapMargin = 0.01; // Minimal overlap for CSG stability

  // Calculate exact extension needed to reach the outer corner
  const extensionDist = ((wall.thickness / 2) / Math.tan(miterAngle)) + overlapMargin;

  let newStart = start.clone();
  let newEnd = end.clone();
  let wasExtended = false;

  // CRITICAL FIX: For miter joints, we need to extend the wall PAST the connection point
  // so that when two walls meet, they overlap in the corner region for proper CSG union
  if (start.distanceTo(point) < 0.01) {
    // Start is at connection - extend it PAST the connection point (away from wall body)
    const wallDir = new Vector3().subVectors(start, end).normalize();
    newStart = start.clone().add(wallDir.multiplyScalar(extensionDist));
    wasExtended = true;
  } else if (end.distanceTo(point) < 0.01) {
    // End is at connection - extend it PAST the connection point (away from wall body)
    const wallDir = new Vector3().subVectors(end, start).normalize();
    newEnd = end.clone().add(wallDir.multiplyScalar(extensionDist));
    wasExtended = true;
  }

  return { start: newStart, end: newEnd, wasExtended };
}

/**
 * Determine which wall should extend through in a T-joint or X-joint
 */
function determineExtendingWall(walls: BIMWall[]): BIMWall {
  if (walls.length === 0) return walls[0];

  // Priority rule: Longer wall extends
  let extendingWall = walls[0];
  let maxLength = tupleToVec3(walls[0].start).distanceTo(tupleToVec3(walls[0].end));

  for (let i = 1; i < walls.length; i++) {
    const length = tupleToVec3(walls[i].start).distanceTo(tupleToVec3(walls[i].end));
    if (length > maxLength) {
      maxLength = length;
      extendingWall = walls[i];
    }
  }

  return extendingWall;
}

/**
 * Process a wall network and calculate extended geometries for all walls
 */
export function processWallNetwork(
  walls: BIMWall[],
  jointMethod: WallJointMethod = 'auto'
): Map<string, ExtendedWallGeometry> {
  const extensions = new Map<string, ExtendedWallGeometry>();

  // Initialize all walls with no extension
  walls.forEach(wall => {
    extensions.set(wall.id, {
      wallId: wall.id,
      originalStart: tupleToVec3(wall.start),
      originalEnd: tupleToVec3(wall.end),
      extendedStart: tupleToVec3(wall.start),
      extendedEnd: tupleToVec3(wall.end),
      wasExtended: false,
    });
  });

  // Find all connection points
  const connectionPoints = findConnectionPoints(walls);

  console.log(`[Wall Joints] Processing ${walls.length} walls`);
  console.log(`[Wall Joints] Found ${connectionPoints.length} connection points`);

  connectionPoints.forEach((cp, idx) => {
    console.log(`[Wall Joints] Connection ${idx + 1}: ${cp.walls.length} walls at (${cp.point.x.toFixed(2)}, ${cp.point.y.toFixed(2)}, ${cp.point.z.toFixed(2)}), type: ${cp.jointType}`);
  });

  // Process each connection point
  connectionPoints.forEach(connection => {
    const { point, walls: connectedWalls, jointType } = connection;

    if (jointType === JointType.NONE) return;

    // Determine method to use
    let method = jointMethod;
    if (jointMethod === 'auto') {
      // Auto-select method based on joint type
      if (jointType === JointType.L_JOINT) {
        method = 'miter';
      } else {
        method = 'butt';
      }
    }

    if (method === 'miter' && jointType === JointType.L_JOINT && connectedWalls.length === 2) {
      // Miter joint for L-joints
      const angle = calculateAngleBetweenWalls(connectedWalls[0], connectedWalls[1], point);
      console.log(`[Wall Joints] L-Joint: Using miter, angle=${(angle * 180 / Math.PI).toFixed(1)}°`);
      console.log(`[Wall Joints]   Point: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);

      connectedWalls.forEach((wall, idx) => {
        const wallStart = tupleToVec3(wall.start);
        const wallEnd = tupleToVec3(wall.end);
        const existing = extensions.get(wall.id)!;

        console.log(`[Wall Joints]   Wall ${idx + 1} (${wall.id.substring(0, 8)}): start=(${wallStart.x.toFixed(2)}, ${wallStart.z.toFixed(2)}), end=(${wallEnd.x.toFixed(2)}, ${wallEnd.z.toFixed(2)})`);

        const ext = calculateMiterExtension(wall, point, angle);

        // Update the appropriate endpoint
        const isStartAtPoint = wallStart.distanceTo(point) < 0.01;
        const isEndAtPoint = wallEnd.distanceTo(point) < 0.01;

        console.log(`[Wall Joints]     Start at point: ${isStartAtPoint}, End at point: ${isEndAtPoint}`);
        console.log(`[Wall Joints]     Extension: start=(${ext.start.x.toFixed(2)}, ${ext.start.z.toFixed(2)}), end=(${ext.end.x.toFixed(2)}, ${ext.end.z.toFixed(2)})`);

        if (isStartAtPoint) {
          existing.extendedStart = ext.start;
          existing.wasExtended = ext.wasExtended || existing.wasExtended;
          console.log(`[Wall Joints]     -> Extended START to (${ext.start.x.toFixed(2)}, ${ext.start.z.toFixed(2)})`);
        } else if (isEndAtPoint) {
          existing.extendedEnd = ext.end;
          existing.wasExtended = ext.wasExtended || existing.wasExtended;
          console.log(`[Wall Joints]     -> Extended END to (${ext.end.x.toFixed(2)}, ${ext.end.z.toFixed(2)})`);
        } else {
          console.log(`[Wall Joints]     -> ERROR: Neither endpoint is at connection point!`);
        }
      });
    } else {
      // Butt joint for T-joints, X-joints, or when explicitly requested
      const extendingWall = determineExtendingWall(connectedWalls);
      const buttingWalls = connectedWalls.filter(w => w.id !== extendingWall.id);

      // Extend the through wall (no change, it already goes through)
      // Just mark it as processed
      const extWall = extensions.get(extendingWall.id)!;
      extWall.wasExtended = false; // Through wall doesn't extend

      // Calculate butt extensions for other walls
      buttingWalls.forEach(wall => {
        const ext = calculateButtExtension(wall, point, extendingWall.thickness);
        const existing = extensions.get(wall.id)!;

        // Update the appropriate endpoint
        if (tupleToVec3(wall.start).distanceTo(point) < 0.01) {
          existing.extendedStart = ext.start;
          existing.wasExtended = ext.wasExtended || existing.wasExtended;
        } else {
          existing.extendedEnd = ext.end;
          existing.wasExtended = ext.wasExtended || existing.wasExtended;
        }
      });
    }
  });

  return extensions;
}

/**
 * Helper to validate extended geometry
 */
export function validateExtendedGeometry(ext: ExtendedWallGeometry): boolean {
  const length = ext.extendedStart.distanceTo(ext.extendedEnd);
  return length >= 0.1; // Minimum 0.1 feet (1.2 inches)
}
