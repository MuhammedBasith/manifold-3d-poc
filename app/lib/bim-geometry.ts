import * as THREE from 'three';
import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three';
import { BIMWall, tupleToVec3 } from '../types/bim';

/**
 * Creates a simple box geometry for a wall.
 */
export function createWallGeometry(
    width: number,
    height: number,
    depth: number
): BufferGeometry {
    return new BoxGeometry(width, height, depth);
}

/**
 * Represents a network of connected walls that should be unioned together
 */
export interface WallNetwork {
    wallIds: Set<string>;
    walls: BIMWall[];
}

/**
 * Detects if two walls share an endpoint (within tolerance)
 */
export function wallsAreConnected(wall1: BIMWall, wall2: BIMWall, tolerance: number = 0.01): boolean {
    const w1Start = tupleToVec3(wall1.start);
    const w1End = tupleToVec3(wall1.end);
    const w2Start = tupleToVec3(wall2.start);
    const w2End = tupleToVec3(wall2.end);

    // Check all endpoint combinations
    return (
        w1Start.distanceTo(w2Start) < tolerance ||
        w1Start.distanceTo(w2End) < tolerance ||
        w1End.distanceTo(w2Start) < tolerance ||
        w1End.distanceTo(w2End) < tolerance
    );
}

/**
 * Builds wall networks by grouping connected walls together
 * Uses flood-fill algorithm to find connected components
 */
export function buildWallNetworks(walls: BIMWall[]): WallNetwork[] {
    if (walls.length === 0) return [];

    const networks: WallNetwork[] = [];
    const visited = new Set<string>();

    // Helper function to recursively add connected walls to a network
    function addConnectedWalls(wall: BIMWall, network: WallNetwork) {
        if (visited.has(wall.id)) return;

        visited.add(wall.id);
        network.wallIds.add(wall.id);
        network.walls.push(wall);

        // Find all walls connected to this one
        for (const otherWall of walls) {
            if (!visited.has(otherWall.id) && wallsAreConnected(wall, otherWall)) {
                addConnectedWalls(otherWall, network);
            }
        }
    }

    // Process each wall
    for (const wall of walls) {
        if (!visited.has(wall.id)) {
            const network: WallNetwork = {
                wallIds: new Set(),
                walls: []
            };
            addConnectedWalls(wall, network);
            networks.push(network);
        }
    }

    return networks;
}

/**
 * Creates a realistic door geometry including frame and panel.
 * Returns a group-like structure or a merged geometry.
 * For simplicity in this POC and compatibility with Manifold, we'll return a single merged geometry
 * or a group of meshes if we want different materials.
 * 
 * However, for boolean operations, we need a single closed mesh.
 * So we will provide two functions:
 * 1. createDoorDisplayMesh: Returns a THREE.Group with multi-materials for rendering.
 * 2. createDoorCutterGeometry: Returns a simple box for cutting the hole in the wall.
 */

export interface DoorGeometries {
    frame: BufferGeometry;
    panel: BufferGeometry;
    handle: BufferGeometry;
}

/**
 * Creates the geometries for a realistic door.
 */
export function createDoorGeometries(
    width: number,
    height: number,
    depth: number, // Wall thickness (frame depth)
    frameWidth: number = 2 / 12 // Width of the frame face (2 inches)
): DoorGeometries {
    // 1. Frame
    // The frame goes around the top and sides.
    // We can create it by subtracting the inner opening from the outer block,
    // but since we might not have Manifold here, we'll construct it from 3 boxes.

    const frameThickness = 1 / 12; // How much it sticks out from the wall (1 inch)
    const actualFrameDepth = depth + (frameThickness * 2); // Frame is thicker than wall

    // Top piece
    const topGeo = new BoxGeometry(width, frameWidth, actualFrameDepth);
    topGeo.translate(0, height - (frameWidth / 2), 0);

    // Left piece
    const sideHeight = height - frameWidth;
    const leftGeo = new BoxGeometry(frameWidth, sideHeight, actualFrameDepth);
    leftGeo.translate(-(width / 2) + (frameWidth / 2), (height - frameWidth) / 2, 0);

    // Right piece
    const rightGeo = new BoxGeometry(frameWidth, sideHeight, actualFrameDepth);
    rightGeo.translate((width / 2) - (frameWidth / 2), (height - frameWidth) / 2, 0);

    // Merge frame parts (using simple geometry merging for display)
    // Note: In a real app we might want to keep them separate or use CSG, 
    // but for display this is fine.
    const frameGeo = mergeGeometries([topGeo, leftGeo, rightGeo]);

    // 2. Door Panel
    // Fits inside the frame
    const panelWidth = width - (frameWidth * 2);
    const panelHeight = height - frameWidth; // No frame at bottom
    const panelDepth = 1.5 / 12; // 1.5 inches door panel

    // Re-create Panel with Bottom-Center origin
    const finalPanelGeo = new BoxGeometry(panelWidth, panelHeight, panelDepth);
    finalPanelGeo.translate(0, panelHeight / 2, 0);

    // 3. Handle
    const handleGeo = new BoxGeometry(2 / 12, 6 / 12, 2 / 12); // Simple handle (2x6x2 inches)
    // Position: Right side, ~36 inches up (3 ft)
    handleGeo.translate((panelWidth / 2) - (4 / 12), 3.0, panelDepth / 2 + (1 / 12));

    return {
        frame: frameGeo,
        panel: finalPanelGeo,
        handle: handleGeo
    };
}

/**
 * Creates a cutter geometry for the door hole.
 * This should be slightly larger than the door opening to ensure clean cuts,
 * but smaller than the frame so the frame covers the cut edges.
 */
export function createDoorCutterGeometry(
    width: number,
    height: number,
    wallThickness: number
): BufferGeometry {
    // The hole should be the size of the door + frame width?
    // No, the frame sits *in* the hole usually, or wraps around it.
    // Let's assume the 'width' passed here is the total outer width of the door assembly.
    // So we cut a hole exactly that size.
    // To avoid z-fighting with the wall faces, we make it slightly deeper (thicker).

    const cutterDepth = wallThickness * 1.2; // 20% thicker than wall
    const cutter = new BoxGeometry(width, height, cutterDepth);

    // Origin at bottom-center
    cutter.translate(0, height / 2, 0);

    return cutter;
}

// Helper to merge geometries simply (without CSG)
function mergeGeometries(geometries: BufferGeometry[]): BufferGeometry {
    const mergedGeometry = new BufferGeometry();

    const nonIndexedGeometries = geometries.map(g => g.toNonIndexed());

    // Calculate total vertex count
    let totalVertices = 0;
    nonIndexedGeometries.forEach(g => {
        totalVertices += g.attributes.position.count;
    });

    const positionAttribute = new Float32Array(totalVertices * 3);
    const normalAttribute = new Float32Array(totalVertices * 3);

    let offset = 0;
    nonIndexedGeometries.forEach(g => {
        const positions = g.attributes.position.array;
        const normals = g.attributes.normal?.array;

        for (let i = 0; i < positions.length; i++) {
            positionAttribute[offset * 3 + i] = positions[i];
            if (normals) {
                normalAttribute[offset * 3 + i] = normals[i];
            }
        }

        offset += g.attributes.position.count;
    });

    mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positionAttribute, 3));
    mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(normalAttribute, 3));

    return mergedGeometry;
}
