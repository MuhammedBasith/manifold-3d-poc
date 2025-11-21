import { BIMWall, Vec3Tuple } from './bim';

/**
 * Door swing direction (handing)
 * From the perspective of looking at the hinge side
 */
export enum DoorSwingDirection {
  LEFT = 'LEFT',   // Hinges on left, swings left
  RIGHT = 'RIGHT', // Hinges on right, swings right
}

/**
 * Which side of the wall the door faces
 */
export enum DoorWallSide {
  FRONT = 'FRONT', // Door on front face of wall (wall normal direction)
  BACK = 'BACK',   // Door on back face of wall (opposite wall normal)
}

/**
 * Opening direction
 */
export enum DoorOpeningDirection {
  PUSH = 'PUSH', // Opens away from viewer
  PULL = 'PULL', // Opens toward viewer
}

/**
 * Complete door orientation specification
 * Follows Revit's orientation model
 */
export interface DoorOrientation {
  wallSide: DoorWallSide;
  swingDirection: DoorSwingDirection;
  openingDirection: DoorOpeningDirection;
  wallNormalAngle: number; // Angle of wall normal in world space (radians)
}

/**
 * Door handing state for spacebar cycling
 */
export interface DoorHandingState {
  orientation: DoorOrientation;
  stateIndex: number; // 0-3 for four possible states
}

/**
 * IFC-compatible door operation types
 */
export type IFCDoorOperationType =
  | 'SINGLE_SWING_LEFT'
  | 'SINGLE_SWING_RIGHT'
  | 'DOUBLE_SWING'
  | 'SLIDING'
  | 'FOLDING'
  | 'REVOLVING';

/**
 * Map orientation to IFC operation type
 */
export function mapOrientationToIFC(orientation: DoorOrientation): IFCDoorOperationType {
  // For single swing doors, left/right depends on wall side and swing direction
  if (orientation.wallSide === DoorWallSide.FRONT) {
    return orientation.swingDirection === DoorSwingDirection.LEFT
      ? 'SINGLE_SWING_LEFT'
      : 'SINGLE_SWING_RIGHT';
  } else {
    // Back side flips the handing
    return orientation.swingDirection === DoorSwingDirection.LEFT
      ? 'SINGLE_SWING_RIGHT'
      : 'SINGLE_SWING_LEFT';
  }
}

/**
 * Default door orientation (Front, Left, Push)
 */
export const DEFAULT_DOOR_ORIENTATION: DoorOrientation = {
  wallSide: DoorWallSide.FRONT,
  swingDirection: DoorSwingDirection.LEFT,
  openingDirection: DoorOpeningDirection.PUSH,
  wallNormalAngle: 0,
};

/**
 * Four possible orientation states for spacebar cycling
 * Matches Revit's orientation cycling behavior
 */
export const DOOR_ORIENTATION_STATES: Omit<DoorOrientation, 'wallNormalAngle'>[] = [
  // State 0: Front face, left swing, push
  {
    wallSide: DoorWallSide.FRONT,
    swingDirection: DoorSwingDirection.LEFT,
    openingDirection: DoorOpeningDirection.PUSH,
  },

  // State 1: Front face, right swing, push
  {
    wallSide: DoorWallSide.FRONT,
    swingDirection: DoorSwingDirection.RIGHT,
    openingDirection: DoorOpeningDirection.PUSH,
  },

  // State 2: Back face, left swing, pull
  {
    wallSide: DoorWallSide.BACK,
    swingDirection: DoorSwingDirection.LEFT,
    openingDirection: DoorOpeningDirection.PULL,
  },

  // State 3: Back face, right swing, pull
  {
    wallSide: DoorWallSide.BACK,
    swingDirection: DoorSwingDirection.RIGHT,
    openingDirection: DoorOpeningDirection.PULL,
  },
];
