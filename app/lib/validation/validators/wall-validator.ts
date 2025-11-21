import { ValidationRule, ValidationResult, ValidationContext } from '../../../types/validation';
import { BIMWall, tupleToVec3 } from '../../../types/bim';
import { ConstraintEngine } from '../constraint-engine';

/**
 * Wall Minimum Length Rule
 * Ensures walls meet minimum length requirements
 */
export const WallMinimumLengthRule: ValidationRule<BIMWall> = {
  id: 'wall-minimum-length',
  name: 'Wall Minimum Length',
  description: 'Walls must meet minimum length of 1 foot',
  category: 'parametric',
  elementType: 'wall',
  severity: 'error',

  validate: (wall: BIMWall, context: ValidationContext): ValidationResult => {
    const wallStart = tupleToVec3(wall.start);
    const wallEnd = tupleToVec3(wall.end);
    const length = wallStart.distanceTo(wallEnd);

    const minLength = 1.0; // 1 foot
    const passed = length >= minLength;

    return {
      ruleId: 'wall-minimum-length',
      passed,
      severity: 'error',
      message: passed
        ? 'Wall length OK'
        : `Wall length ${length.toFixed(2)} ft is below minimum ${minLength.toFixed(1)} ft`,
      affectedElementIds: [wall.id],
      metadata: { length, minLength },
    };
  },
};

/**
 * Wall Thickness Range Rule
 * Validates wall thickness is within reasonable range
 */
export const WallThicknessRangeRule: ValidationRule<BIMWall> = {
  id: 'wall-thickness-range',
  name: 'Wall Thickness Range',
  description: 'Wall thickness must be between 2 inches and 2 feet',
  category: 'parametric',
  elementType: 'wall',
  severity: 'error',

  validate: (wall: BIMWall, context: ValidationContext): ValidationResult => {
    const thickness = wall.thickness;

    const minThickness = 2.0 / 12; // 2 inches = 0.167 feet
    const maxThickness = 2.0; // 2 feet (warning threshold)

    const passed = thickness >= minThickness && thickness <= maxThickness;
    const severity: 'error' | 'warning' = thickness < minThickness ? 'error' : 'warning';

    let message = 'Wall thickness OK';
    if (thickness < minThickness) {
      message = `Wall thickness ${(thickness * 12).toFixed(1)}" is below minimum ${(minThickness * 12).toFixed(0)}"`;
    } else if (thickness > maxThickness) {
      message = `Wall thickness ${thickness.toFixed(2)} ft exceeds typical maximum ${maxThickness.toFixed(1)} ft`;
    }

    return {
      ruleId: 'wall-thickness-range',
      passed,
      severity,
      message,
      affectedElementIds: [wall.id],
      metadata: { thickness, minThickness, maxThickness },
    };
  },
};

/**
 * Wall Height Range Rule
 * Validates wall height is within reasonable architectural range
 */
export const WallHeightRangeRule: ValidationRule<BIMWall> = {
  id: 'wall-height-range',
  name: 'Wall Height Range',
  description: 'Wall height should be between 4 and 20 feet',
  category: 'parametric',
  elementType: 'wall',
  severity: 'warning',

  validate: (wall: BIMWall, context: ValidationContext): ValidationResult => {
    const height = wall.geometry.dimensions.height;

    const minHeight = 4.0; // 4 feet (very short wall)
    const maxHeight = 20.0; // 20 feet (typical residential ceiling)

    const passed = height >= minHeight && height <= maxHeight;

    let message = 'Wall height OK';
    if (height < minHeight) {
      message = `Wall height ${height.toFixed(2)} ft is unusually low (below ${minHeight.toFixed(1)} ft)`;
    } else if (height > maxHeight) {
      message = `Wall height ${height.toFixed(2)} ft is unusually high (above ${maxHeight.toFixed(1)} ft)`;
    }

    return {
      ruleId: 'wall-height-range',
      passed,
      severity: 'warning',
      message,
      affectedElementIds: [wall.id],
      metadata: { height, minHeight, maxHeight },
    };
  },
};

/**
 * Wall Hosted Elements Bounds Rule
 * Ensures all hosted elements (doors) fit within wall boundaries
 */
export const WallHostedElementsBoundsRule: ValidationRule<BIMWall> = {
  id: 'wall-hosted-elements-bounds',
  name: 'Hosted Elements Within Bounds',
  description: 'All hosted elements must fit within wall boundaries',
  category: 'relational',
  elementType: 'wall',
  severity: 'error',

  validate: (wall: BIMWall, context: ValidationContext): ValidationResult => {
    const wallStart = tupleToVec3(wall.start);
    const wallEnd = tupleToVec3(wall.end);
    const wallLength = wallStart.distanceTo(wallEnd);

    const hostedDoors = context.doors.filter(d => d.parentWallId === wall.id);

    const outOfBoundsDoors = hostedDoors.filter(door => {
      const doorWidth = door.geometry.dimensions.width;
      const doorStart = door.offsetOnWall - doorWidth / 2;
      const doorEnd = door.offsetOnWall + doorWidth / 2;

      return doorStart < 0 || doorEnd > wallLength;
    });

    const passed = outOfBoundsDoors.length === 0;

    return {
      ruleId: 'wall-hosted-elements-bounds',
      passed,
      severity: 'error',
      message: passed
        ? 'All hosted elements within bounds'
        : `${outOfBoundsDoors.length} door(s) exceed wall boundaries`,
      affectedElementIds: [wall.id, ...outOfBoundsDoors.map(d => d.id)],
      metadata: { wallLength, outOfBoundsDoors: outOfBoundsDoors.length },
    };
  },
};

/**
 * Register all wall validation rules
 */
export function registerWallRules(engine: ConstraintEngine): void {
  engine.registerRuleSet([
    WallMinimumLengthRule,
    WallThicknessRangeRule,
    WallHeightRangeRule,
    WallHostedElementsBoundsRule,
  ]);
}
