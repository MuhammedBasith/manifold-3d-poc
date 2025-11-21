import { Vector3 } from 'three';
import { BIMWall, Vec3Tuple } from './bim';

/**
 * Wall transformation modes
 * Following professional BIM patterns (Revit, AutoCAD Architecture)
 */
export enum WallTransformMode {
  MOVE = 'MOVE',           // Move entire wall (maintains length, changes position)
  STRETCH_START = 'STRETCH_START', // Stretch from start point (changes length)
  STRETCH_END = 'STRETCH_END',     // Stretch from end point (changes length)
  MOVE_NETWORK = 'MOVE_NETWORK',   // Move connected wall network together
}

/**
 * Wall transform operation result
 */
export interface WallTransformResult {
  wall: BIMWall;
  affectedWalls: string[]; // IDs of other walls affected by this transform
  warnings?: string[];     // Any warnings about the transform
}

/**
 * Wall transform constraints
 */
export interface WallTransformConstraints {
  minLength: number;        // Minimum wall length (default 1 ft)
  maxLength: number;        // Maximum wall length (default 100 ft)
  snapToGrid: boolean;      // Whether to snap to grid
  gridSize: number;         // Grid size for snapping
  maintainConnections: boolean; // Whether to maintain wall connections
  allowSelfIntersection: boolean; // Whether to allow wall to intersect itself
}

/**
 * Wall network for grouped movement
 */
export interface WallNetwork {
  wallIds: string[];
  junctions: WallJunction[];
}

/**
 * Junction between walls
 */
export interface WallJunction {
  wallIds: string[];       // Walls meeting at this junction
  position: Vec3Tuple;     // Junction position
  junctionType: 'L_JOINT' | 'T_JOINT' | 'X_JOINT' | 'OBLIQUE' | 'BUTT';
}

/**
 * Transform operation state
 */
export interface WallTransformState {
  mode: WallTransformMode;
  wallId: string;
  originalWall: BIMWall;
  startPosition: Vector3;   // Mouse down position
  currentPosition: Vector3; // Current mouse position
  constraints: WallTransformConstraints;
}

/**
 * Default transform constraints
 */
export const DEFAULT_TRANSFORM_CONSTRAINTS: WallTransformConstraints = {
  minLength: 1.0,           // 1 foot minimum
  maxLength: 100.0,         // 100 feet maximum
  snapToGrid: true,
  gridSize: 1.0,            // 1 foot grid
  maintainConnections: true,
  allowSelfIntersection: false,
};
