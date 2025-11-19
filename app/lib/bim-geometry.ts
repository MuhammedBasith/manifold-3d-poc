import * as THREE from 'three';
import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three';

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
    frameWidth: number = 0.1 // Width of the frame face
): DoorGeometries {
    // 1. Frame
    // The frame goes around the top and sides.
    // We can create it by subtracting the inner opening from the outer block,
    // but since we might not have Manifold here, we'll construct it from 3 boxes.

    const frameThickness = 0.05; // How much it sticks out from the wall
    const actualFrameDepth = depth + (frameThickness * 2); // Frame is thicker than wall

    // Top piece
    const topGeo = new BoxGeometry(width, frameWidth, actualFrameDepth);
    topGeo.translate(0, (height / 2) - (frameWidth / 2), 0);

    // Left piece
    const sideHeight = height - frameWidth;
    const leftGeo = new BoxGeometry(frameWidth, sideHeight, actualFrameDepth);
    leftGeo.translate(-(width / 2) + (frameWidth / 2), -frameWidth / 2, 0);

    // Right piece
    const rightGeo = new BoxGeometry(frameWidth, sideHeight, actualFrameDepth);
    rightGeo.translate((width / 2) - (frameWidth / 2), -frameWidth / 2, 0);

    // Merge frame parts (using simple geometry merging for display)
    // Note: In a real app we might want to keep them separate or use CSG, 
    // but for display this is fine.
    const frameGeo = mergeGeometries([topGeo, leftGeo, rightGeo]);

    // 2. Door Panel
    // Fits inside the frame
    const panelWidth = width - (frameWidth * 2);
    const panelHeight = height - frameWidth; // No frame at bottom
    const panelDepth = 0.05; // 50mm door panel

    const panelGeo = new BoxGeometry(panelWidth, panelHeight, panelDepth);
    // Position: centered horizontally, but needs to be moved down to align with bottom of frame
    // The frame's center is at 0,0,0 (relative to the door's center point which is usually bottom-center or center-center).
    // Let's assume the input 'height' is total height.
    // If the door mesh origin is at the bottom-center:
    // Frame top is at y=height.

    // Let's standardize: Origin is at the BOTTOM-CENTER of the door.

    // Re-create Frame with Bottom-Center origin
    const frameTop = new BoxGeometry(width, frameWidth, actualFrameDepth);
    frameTop.translate(0, height - (frameWidth / 2), 0);

    const frameLeft = new BoxGeometry(frameWidth, height - frameWidth, actualFrameDepth);
    frameLeft.translate(-(width / 2) + (frameWidth / 2), (height - frameWidth) / 2, 0);

    const frameRight = new BoxGeometry(frameWidth, height - frameWidth, actualFrameDepth);
    frameRight.translate((width / 2) - (frameWidth / 2), (height - frameWidth) / 2, 0);

    const finalFrameGeo = mergeGeometries([frameTop, frameLeft, frameRight]);

    // Re-create Panel with Bottom-Center origin
    const finalPanelGeo = new BoxGeometry(panelWidth, panelHeight, panelDepth);
    finalPanelGeo.translate(0, panelHeight / 2, 0);

    // 3. Handle
    const handleGeo = new BoxGeometry(0.05, 0.15, 0.05); // Simple handle
    // Position: Right side, ~1m up
    handleGeo.translate((panelWidth / 2) - 0.1, 1.0, panelDepth / 2 + 0.025);

    return {
        frame: finalFrameGeo,
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
