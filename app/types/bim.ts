import { Vector3 } from 'three';

export type ElementType = 'wall' | 'door' | 'window' | 'floor';
export type ToolMode = 'select' | 'wall' | 'door' | 'delete' | 'pan' | 'move';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface BIMGeometry {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
}

export interface BIMElement {
  id: string;
  type: ElementType;
  geometry: BIMGeometry;
  properties: Record<string, any>;
  materialId?: number;
}

export interface WallConnection {
  wallId: string;
  connectionType: 'L_JOINT' | 'T_JOINT' | 'X_JOINT' | 'OBLIQUE' | 'BUTT';
  at: 'start' | 'end';
}

export interface BIMWall extends BIMElement {
  type: 'wall';
  start: Vec3Tuple;
  end: Vec3Tuple;
  thickness: number;
  doors: string[]; // Array of door IDs attached to this wall
  relationships: {
    hostedElements: string[]; // IDs of elements hosted by this wall (doors, windows)
    connectedWalls: WallConnection[];
  };
}

export interface BIMDoor extends BIMElement {
  type: 'door';
  parentWallId: string;
  offsetOnWall: number; // Distance along wall from start point
  wallNormal: Vec3Tuple; // Normal of the wall face
  relationships: {
    parentWall: string; // ID of the wall hosting this door
  };
  // Optional: Door orientation (if not provided, defaults will be used)
  orientation?: import('./door-orientation').DoorOrientation;
}

export interface BIMWindow extends BIMElement {
  type: 'window';
  parentWallId: string;
  offsetOnWall: number;
  wallNormal: Vec3Tuple;
}

export interface BIMFloor extends BIMElement {
  type: 'floor';
  vertices: Vec3Tuple[]; // Polygon vertices
}

export interface BIMMetadata {
  version: string;
  created: string;
  modified: string;
  author?: string;
  description?: string;
}

export interface BIMModel {
  elements: BIMElement[];
  metadata: BIMMetadata;
}

export interface WallCreationState {
  startPoint: Vector3 | null;
  isCreating: boolean;
}

export interface DoorPlacementState {
  targetWallId: string | null;
  previewPosition: Vector3 | null;
  isPlacing: boolean;
}

export interface SelectionState {
  selectedElementId: string | null;
  hoveredElementId: string | null;
}

export interface GridSettings {
  enabled: boolean;
  size: number; // Grid spacing in meters
  divisions: number;
}

export interface WallType {
  name: string;
  thickness: number; // feet
  description: string;
}

export type WallJointMethod = 'auto' | 'butt' | 'miter';

export interface WallSettings {
  defaultHeight: number; // feet
  defaultThickness: number; // feet
  minHeight: number;
  maxHeight: number;
  minThickness: number;
  maxThickness: number;
  types: WallType[];
  jointMethod: WallJointMethod; // How walls connect at corners
}

export interface DoorSettings {
  defaultWidth: number; // feet
  defaultHeight: number; // feet
  presets: {
    name: string;
    width: number; // feet
    height: number; // feet
  }[];
}

export interface EditorSettings {
  grid: GridSettings;
  wall: WallSettings;
  door: DoorSettings;
  snapThreshold: number; // feet
}

// Default settings (Imperial Units: 1 unit = 1 foot)
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  grid: {
    enabled: true,
    size: 1.0, // 1 foot grid
    divisions: 12, // 1 inch subdivisions
  },
  wall: {
    defaultHeight: 9.0, // 9 feet
    defaultThickness: 4.5 / 12, // 4.5 inches (Interior)
    minHeight: 4.0,
    maxHeight: 20.0,
    minThickness: 2.0 / 12,
    maxThickness: 12.0 / 12,
    types: [
      { name: 'Interior (4.5")', thickness: 4.5 / 12, description: 'Standard 2x4 interior wall' },
      { name: 'Exterior (6.5")', thickness: 6.5 / 12, description: 'Standard 2x6 exterior wall' },
    ],
    jointMethod: 'auto', // Auto-select joint type based on geometry
  },
  door: {
    defaultWidth: 3.0, // 36 inches
    defaultHeight: 6 + 8 / 12, // 6'8" (80 inches)
    presets: [
      { name: '30" x 80"', width: 2.5, height: 6.667 },
      { name: '32" x 80"', width: 2.667, height: 6.667 },
      { name: '36" x 80"', width: 3.0, height: 6.667 },
      { name: '48" x 80" Double', width: 4.0, height: 6.667 },
      { name: '60" x 80" Double', width: 5.0, height: 6.667 },
    ],
  },
  snapThreshold: 0.5, // 6 inches snap threshold for close points
};

// Utility type guards
export function isWall(element: BIMElement): element is BIMWall {
  return element.type === 'wall';
}

export function isDoor(element: BIMElement): element is BIMDoor {
  return element.type === 'door';
}

export function isWindow(element: BIMElement): element is BIMWindow {
  return element.type === 'window';
}

export function isFloor(element: BIMElement): element is BIMFloor {
  return element.type === 'floor';
}

// Helper functions for Vec3Tuple <-> Vector3 conversion
export function vec3ToTuple(v: Vector3): Vec3Tuple {
  return { x: v.x, y: v.y, z: v.z };
}

export function tupleToVec3(t: Vec3Tuple): Vector3 {
  return new Vector3(t.x, t.y, t.z);
}
