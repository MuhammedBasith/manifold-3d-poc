import { Vector3 } from 'three';
import { BIMWall, BIMDoor, tupleToVec3, vec3ToTuple, Vec3Tuple } from '../types/bim';
import {
  DoorOrientation,
  DoorWallSide,
  DoorSwingDirection,
  DoorOpeningDirection,
  DOOR_ORIENTATION_STATES,
  DEFAULT_DOOR_ORIENTATION,
} from '../types/door-orientation';

/**
 * Calculate door rotation based on wall and orientation
 * Returns rotation in Euler angles (x, y, z) in radians
 */
export function calculateDoorRotation(
  wall: BIMWall,
  doorPosition: Vector3,
  orientation: DoorOrientation
): Vec3Tuple {
  const wallStart = tupleToVec3(wall.start);
  const wallEnd = tupleToVec3(wall.end);

  // Wall direction vector
  const wallDir = new Vector3().subVectors(wallEnd, wallStart).normalize();

  // Base rotation: align door with wall
  const baseAngle = Math.atan2(wallDir.z, wallDir.x);
  let rotationY = -baseAngle;

  // Adjust for wall side (front vs back)
  if (orientation.wallSide === DoorWallSide.BACK) {
    rotationY += Math.PI; // Flip 180 degrees
  }

  return { x: 0, y: rotationY, z: 0 };
}

/**
 * Calculate wall normal angle for orientation
 */
export function calculateWallNormalAngle(wall: BIMWall): number {
  const wallStart = tupleToVec3(wall.start);
  const wallEnd = tupleToVec3(wall.end);
  const wallDir = new Vector3().subVectors(wallEnd, wallStart).normalize();

  // Wall normal (perpendicular to wall direction, pointing to the "front")
  // Using right-hand rule: rotate wall direction 90° counterclockwise in XZ plane
  return Math.atan2(-wallDir.x, wallDir.z);
}

/**
 * Get orientation from state index (0-3) for a specific wall
 */
export function getOrientationFromState(
  stateIndex: number,
  wall: BIMWall
): DoorOrientation {
  const baseOrientation = DOOR_ORIENTATION_STATES[stateIndex % 4];
  const wallNormalAngle = calculateWallNormalAngle(wall);

  return {
    ...baseOrientation,
    wallNormalAngle,
  };
}

/**
 * Get state index from orientation
 * Useful for finding which of the 4 states an orientation represents
 */
export function getStateFromOrientation(orientation: DoorOrientation): number {
  return DOOR_ORIENTATION_STATES.findIndex(
    state =>
      state.wallSide === orientation.wallSide &&
      state.swingDirection === orientation.swingDirection &&
      state.openingDirection === orientation.openingDirection
  );
}

/**
 * Cycle to next orientation state
 */
export function cycleOrientation(currentState: number): number {
  return (currentState + 1) % 4;
}

/**
 * Flip wall side (Front ↔ Back)
 */
export function flipWallSide(orientation: DoorOrientation): DoorOrientation {
  return {
    ...orientation,
    wallSide:
      orientation.wallSide === DoorWallSide.FRONT
        ? DoorWallSide.BACK
        : DoorWallSide.FRONT,
    // Flipping wall side also changes opening direction
    openingDirection:
      orientation.openingDirection === DoorOpeningDirection.PUSH
        ? DoorOpeningDirection.PULL
        : DoorOpeningDirection.PUSH,
  };
}

/**
 * Flip handing/swing direction (Left ↔ Right)
 */
export function flipHanding(orientation: DoorOrientation): DoorOrientation {
  return {
    ...orientation,
    swingDirection:
      orientation.swingDirection === DoorSwingDirection.LEFT
        ? DoorSwingDirection.RIGHT
        : DoorSwingDirection.LEFT,
  };
}

/**
 * Flip opening direction (Push ↔ Pull)
 */
export function flipOpeningDirection(orientation: DoorOrientation): DoorOrientation {
  return {
    ...orientation,
    openingDirection:
      orientation.openingDirection === DoorOpeningDirection.PUSH
        ? DoorOpeningDirection.PULL
        : DoorOpeningDirection.PUSH,
    // Flipping opening direction also changes wall side
    wallSide:
      orientation.wallSide === DoorWallSide.FRONT
        ? DoorWallSide.BACK
        : DoorWallSide.FRONT,
  };
}

/**
 * Get default orientation for a door on a wall
 */
export function getDefaultOrientation(wall: BIMWall): DoorOrientation {
  const wallNormalAngle = calculateWallNormalAngle(wall);
  return {
    ...DEFAULT_DOOR_ORIENTATION,
    wallNormalAngle,
  };
}

/**
 * Get user-friendly description of orientation
 */
export function getOrientationDescription(orientation: DoorOrientation): string {
  const side = orientation.wallSide === DoorWallSide.FRONT ? 'Front' : 'Back';
  const swing = orientation.swingDirection === DoorSwingDirection.LEFT ? 'Left-Hand' : 'Right-Hand';
  const opening = orientation.openingDirection === DoorOpeningDirection.PUSH ? 'Push' : 'Pull';

  return `${side} / ${swing} / ${opening}`;
}

/**
 * Validate that door orientation is properly configured
 */
export function validateOrientation(orientation: DoorOrientation): boolean {
  // Check that all required fields are present and valid
  return (
    orientation.wallSide !== undefined &&
    orientation.swingDirection !== undefined &&
    orientation.openingDirection !== undefined &&
    typeof orientation.wallNormalAngle === 'number' &&
    !isNaN(orientation.wallNormalAngle)
  );
}
