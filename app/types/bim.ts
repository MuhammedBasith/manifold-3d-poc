import { Vector3 } from 'three';

export type ElementType = 'wall' | 'door' | 'window' | 'floor';
export type ToolMode = 'select' | 'wall' | 'door' | 'delete';

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

export interface BIMWall extends BIMElement {
  type: 'wall';
  start: Vec3Tuple;
  end: Vec3Tuple;
  thickness: number;
  doors: string[]; // Array of door IDs attached to this wall
}

export interface BIMDoor extends BIMElement {
  type: 'door';
  parentWallId: string;
  offsetOnWall: number; // Distance along wall from start point
  wallNormal: Vec3Tuple; // Normal of the wall face
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

export interface WallSettings {
  defaultHeight: number; // meters
  defaultThickness: number; // meters
  minHeight: number;
  maxHeight: number;
  minThickness: number;
  maxThickness: number;
}

export interface DoorSettings {
  defaultWidth: number; // meters
  defaultHeight: number; // meters
  presets: {
    name: string;
    width: number; // meters (e.g., 0.914 for 36")
    height: number;
  }[];
}

export interface EditorSettings {
  grid: GridSettings;
  wall: WallSettings;
  door: DoorSettings;
  snapThreshold: number; // Distance threshold for snapping in meters
}

// Default settings
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  grid: {
    enabled: true,
    size: 0.1, // 100mm grid
    divisions: 100,
  },
  wall: {
    defaultHeight: 3.0, // 3 meters
    defaultThickness: 0.2, // 200mm
    minHeight: 2.0,
    maxHeight: 6.0,
    minThickness: 0.1,
    maxThickness: 0.5,
  },
  door: {
    defaultWidth: 0.914, // 36 inches
    defaultHeight: 2.032, // 80 inches
    presets: [
      { name: "36\" Standard", width: 0.914, height: 2.032 },
      { name: "32\" Standard", width: 0.813, height: 2.032 },
      { name: "30\" Standard", width: 0.762, height: 2.032 },
      { name: "48\" Double", width: 1.219, height: 2.032 },
    ],
  },
  snapThreshold: 0.2, // 200mm snap distance
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
