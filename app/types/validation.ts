import { BIMElement, BIMWall, BIMDoor, ElementType } from './bim';

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Validation rule categories
 */
export type ValidationCategory =
  | 'geometric'      // Bounds, intersections, clearances
  | 'parametric'     // Min/max dimensions, ratios
  | 'relational'     // Parent-child constraints, network rules
  | 'semantic'       // BIM standard compliance, property requirements
  | 'regulatory';    // Building codes, accessibility standards

/**
 * Validation context - provides access to model data during validation
 */
export interface ValidationContext {
  allElements: BIMElement[];
  walls: BIMWall[];
  doors: BIMDoor[];
  mode: 'real-time' | 'commit' | 'batch' | 'export';
}

/**
 * Result of a single validation rule execution
 */
export interface ValidationResult {
  ruleId: string;
  passed: boolean;
  severity: ValidationSeverity;
  message: string;
  affectedElementIds: string[];
  suggestedFix?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Definition of a validation rule
 */
export interface ValidationRule<T = BIMElement> {
  id: string;
  name: string;
  description: string;
  category: ValidationCategory;
  elementType: ElementType | 'cross-element';
  severity: ValidationSeverity;
  validate: (element: T, context: ValidationContext) => ValidationResult;
  autoFix?: (element: T, context: ValidationContext) => T | null;
}

/**
 * Constraint metadata attached to elements
 */
export interface ConstraintMetadata {
  rules: string[]; // Rule IDs that apply to this element
  lastValidated: string; // ISO timestamp
  validationStatus: 'valid' | 'warnings' | 'errors' | 'not-validated';
  violations: ValidationResult[];
}

/**
 * User override for validation warnings
 */
export interface ValidationOverride {
  ruleId: string;
  reason: string;
  overriddenBy: string;
  timestamp: string;
}

/**
 * Type guards
 */
export function isWall(element: BIMElement): element is BIMWall {
  return element.type === 'wall';
}

export function isDoor(element: BIMElement): element is BIMDoor {
  return element.type === 'door';
}
