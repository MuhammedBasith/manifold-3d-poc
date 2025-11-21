import { ValidationRule, ValidationResult, ValidationContext } from '../../../types/validation';
import { BIMDoor, tupleToVec3 } from '../../../types/bim';
import { ConstraintEngine } from '../constraint-engine';

/**
 * Door Edge Clearance Rule
 * Ensures door is not placed too close to wall edges
 */
export const DoorEdgeClearanceRule: ValidationRule<BIMDoor> = {
  id: 'door-edge-clearance',
  name: 'Door Edge Clearance',
  description: 'Ensures door is not placed too close to wall edges',
  category: 'geometric',
  elementType: 'door',
  severity: 'error',

  validate: (door: BIMDoor, context: ValidationContext): ValidationResult => {
    const wall = context.walls.find(w => w.id === door.parentWallId);

    if (!wall) {
      return {
        ruleId: 'door-edge-clearance',
        passed: false,
        severity: 'error',
        message: 'Door parent wall not found',
        affectedElementIds: [door.id],
      };
    }

    const wallStart = tupleToVec3(wall.start);
    const wallEnd = tupleToVec3(wall.end);
    const wallLength = wallStart.distanceTo(wallEnd);
    const doorWidth = door.geometry.dimensions.width;

    const minClearance = 0.25; // 3 inches (0.25 feet)
    const clearanceStart = door.offsetOnWall - doorWidth / 2;
    const clearanceEnd = wallLength - (door.offsetOnWall + doorWidth / 2);

    const passed = clearanceStart >= minClearance && clearanceEnd >= minClearance;

    return {
      ruleId: 'door-edge-clearance',
      passed,
      severity: 'error',
      message: passed
        ? 'Door clearance OK'
        : `Door must be at least ${(minClearance * 12).toFixed(0)}" from wall edge. Current: start=${(clearanceStart * 12).toFixed(1)}", end=${(clearanceEnd * 12).toFixed(1)}"`,
      affectedElementIds: [door.id, wall.id],
      metadata: { clearanceStart, clearanceEnd, minClearance },
    };
  },
};

/**
 * Door Overlap Rule
 * Prevents doors from overlapping on the same wall
 */
export const DoorOverlapRule: ValidationRule<BIMDoor> = {
  id: 'door-overlap',
  name: 'Door Overlap Check',
  description: 'Prevents doors from overlapping on the same wall',
  category: 'geometric',
  elementType: 'door',
  severity: 'error',

  validate: (door: BIMDoor, context: ValidationContext): ValidationResult => {
    const otherDoorsOnWall = context.doors.filter(
      d => d.parentWallId === door.parentWallId && d.id !== door.id
    );

    const door1Start = door.offsetOnWall - door.geometry.dimensions.width / 2;
    const door1End = door.offsetOnWall + door.geometry.dimensions.width / 2;

    const overlaps = otherDoorsOnWall.filter(otherDoor => {
      const door2Start = otherDoor.offsetOnWall - otherDoor.geometry.dimensions.width / 2;
      const door2End = otherDoor.offsetOnWall + otherDoor.geometry.dimensions.width / 2;

      // Check for overlap (not just touching)
      return !(door1End <= door2Start || door2End <= door1Start);
    });

    return {
      ruleId: 'door-overlap',
      passed: overlaps.length === 0,
      severity: 'error',
      message: overlaps.length === 0
        ? 'No door overlap'
        : `Door overlaps with ${overlaps.length} other door(s) on the same wall`,
      affectedElementIds: [door.id, ...overlaps.map(d => d.id)],
    };
  },
};

/**
 * Door Height Constraint Rule
 * Door height cannot exceed wall height (with clearance for header)
 */
export const DoorHeightConstraintRule: ValidationRule<BIMDoor> = {
  id: 'door-height-constraint',
  name: 'Door Height vs Wall Height',
  description: 'Door height cannot exceed wall height',
  category: 'parametric',
  elementType: 'door',
  severity: 'error',

  validate: (door: BIMDoor, context: ValidationContext): ValidationResult => {
    const wall = context.walls.find(w => w.id === door.parentWallId);

    if (!wall) {
      return {
        ruleId: 'door-height-constraint',
        passed: false,
        severity: 'error',
        message: 'Parent wall not found',
        affectedElementIds: [door.id],
      };
    }

    const doorHeight = door.geometry.dimensions.height;
    const wallHeight = wall.geometry.dimensions.height;
    const headerClearance = 0.5; // 6 inches for header
    const maxDoorHeight = wallHeight - headerClearance;

    const passed = doorHeight <= maxDoorHeight;

    return {
      ruleId: 'door-height-constraint',
      passed,
      severity: 'error',
      message: passed
        ? 'Door height OK'
        : `Door height ${doorHeight.toFixed(2)} ft exceeds maximum ${maxDoorHeight.toFixed(2)} ft (wall height ${wallHeight.toFixed(2)} ft - ${(headerClearance * 12).toFixed(0)}" header)`,
      affectedElementIds: [door.id, wall.id],
      metadata: { doorHeight, wallHeight, maxDoorHeight, headerClearance },
    };
  },
};

/**
 * Door Width Ratio Rule
 * Door width should not exceed a reasonable percentage of wall length
 */
export const DoorWidthRatioRule: ValidationRule<BIMDoor> = {
  id: 'door-width-ratio',
  name: 'Door Width vs Wall Length',
  description: 'Door width should not exceed 80% of wall length',
  category: 'parametric',
  elementType: 'door',
  severity: 'warning',

  validate: (door: BIMDoor, context: ValidationContext): ValidationResult => {
    const wall = context.walls.find(w => w.id === door.parentWallId);

    if (!wall) {
      return {
        ruleId: 'door-width-ratio',
        passed: false,
        severity: 'error',
        message: 'Parent wall not found',
        affectedElementIds: [door.id],
      };
    }

    const wallStart = tupleToVec3(wall.start);
    const wallEnd = tupleToVec3(wall.end);
    const wallLength = wallStart.distanceTo(wallEnd);
    const doorWidth = door.geometry.dimensions.width;

    const maxRatio = 0.8; // 80%
    const currentRatio = doorWidth / wallLength;
    const passed = currentRatio <= maxRatio;

    return {
      ruleId: 'door-width-ratio',
      passed,
      severity: 'warning',
      message: passed
        ? 'Door width ratio OK'
        : `Door width (${doorWidth.toFixed(2)} ft) is ${(currentRatio * 100).toFixed(0)}% of wall length (${wallLength.toFixed(2)} ft), exceeds recommended ${(maxRatio * 100).toFixed(0)}%`,
      affectedElementIds: [door.id, wall.id],
      metadata: { doorWidth, wallLength, currentRatio, maxRatio },
    };
  },
};

/**
 * Door Dimension Ranges Rule
 * Validates door dimensions are within reasonable architectural ranges
 */
export const DoorDimensionRangesRule: ValidationRule<BIMDoor> = {
  id: 'door-dimension-ranges',
  name: 'Door Dimension Ranges',
  description: 'Validates door dimensions are within standard ranges',
  category: 'parametric',
  elementType: 'door',
  severity: 'error',

  validate: (door: BIMDoor, context: ValidationContext): ValidationResult => {
    const { width, height } = door.geometry.dimensions;

    const minWidth = 2.0; // 24 inches
    const maxWidth = 8.0; // 96 inches
    const minHeight = 6.0; // 72 inches
    const maxHeight = 10.0; // 120 inches

    const widthValid = width >= minWidth && width <= maxWidth;
    const heightValid = height >= minHeight && height <= maxHeight;
    const passed = widthValid && heightValid;

    let message = 'Door dimensions OK';
    if (!widthValid) {
      message = `Door width ${width.toFixed(2)} ft is outside range ${minWidth.toFixed(1)}-${maxWidth.toFixed(1)} ft`;
    } else if (!heightValid) {
      message = `Door height ${height.toFixed(2)} ft is outside range ${minHeight.toFixed(1)}-${maxHeight.toFixed(1)} ft`;
    }

    return {
      ruleId: 'door-dimension-ranges',
      passed,
      severity: 'error',
      message,
      affectedElementIds: [door.id],
      metadata: { width, height, minWidth, maxWidth, minHeight, maxHeight },
    };
  },
};

/**
 * ADA Compliance Info Rule
 * Informational rule about ADA door width requirements
 */
export const DoorADAComplianceRule: ValidationRule<BIMDoor> = {
  id: 'door-ada-compliance',
  name: 'ADA Door Width Compliance',
  description: 'ADA requires minimum 32" clear width',
  category: 'regulatory',
  elementType: 'door',
  severity: 'info',

  validate: (door: BIMDoor, context: ValidationContext): ValidationResult => {
    const doorWidth = door.geometry.dimensions.width;
    const adaMinClearWidth = 2.667; // 32 inches = 2.667 feet

    const passed = doorWidth >= adaMinClearWidth;

    return {
      ruleId: 'door-ada-compliance',
      passed,
      severity: 'info',
      message: passed
        ? 'Door meets ADA minimum clear width requirement'
        : `Door width ${doorWidth.toFixed(2)} ft (${(doorWidth * 12).toFixed(0)}") is below ADA minimum ${(adaMinClearWidth * 12).toFixed(0)}" clear width`,
      affectedElementIds: [door.id],
      metadata: { doorWidth, adaMinClearWidth },
      suggestedFix: passed ? undefined : `Increase door width to at least ${adaMinClearWidth.toFixed(2)} ft`,
    };
  },
};

/**
 * Register all door validation rules
 */
export function registerDoorRules(engine: ConstraintEngine): void {
  engine.registerRuleSet([
    DoorEdgeClearanceRule,
    DoorOverlapRule,
    DoorHeightConstraintRule,
    DoorWidthRatioRule,
    DoorDimensionRangesRule,
    DoorADAComplianceRule,
  ]);
}
