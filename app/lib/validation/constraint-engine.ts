import {
  ValidationRule,
  ValidationResult,
  ValidationContext,
} from '../../types/validation';
import { BIMElement } from '../../types/bim';

/**
 * Core validation engine - manages and executes validation rules
 * Follows enterprise patterns from Solibri Model Checker and similar BIM validators
 */
export class ConstraintEngine {
  private rules: Map<string, ValidationRule> = new Map();
  private cache: Map<string, ValidationResult[]> = new Map();

  /**
   * Register a single validation rule
   */
  registerRule<T extends BIMElement = BIMElement>(rule: ValidationRule<T>): void {
    this.rules.set(rule.id, rule as unknown as ValidationRule);
  }

  /**
   * Register multiple validation rules at once
   */
  registerRuleSet<T extends BIMElement = BIMElement>(rules: ValidationRule<T>[]): void {
    rules.forEach(rule => this.registerRule(rule));
  }

  /**
   * Get all registered rules
   */
  getRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules applicable to a specific element type
   */
  getRulesForElementType(elementType: BIMElement['type']): ValidationRule[] {
    return Array.from(this.rules.values()).filter(
      rule => rule.elementType === elementType || rule.elementType === 'cross-element'
    );
  }

  /**
   * Validate a single element against applicable rules
   */
  validateElement(
    element: BIMElement,
    context: ValidationContext,
    useCache: boolean = true
  ): ValidationResult[] {
    const cacheKey = this.getCacheKey(element, context);

    if (useCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const applicableRules = this.getRulesForElementType(element.type);

    const results = applicableRules.map(rule => {
      try {
        return rule.validate(element, context);
      } catch (error) {
        // If rule throws, return error result
        return {
          ruleId: rule.id,
          passed: false,
          severity: 'error' as const,
          message: `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          affectedElementIds: [element.id],
        };
      }
    });

    this.cache.set(cacheKey, results);
    return results;
  }

  /**
   * Validate all elements in a model
   */
  validateAll(context: ValidationContext): Map<string, ValidationResult[]> {
    const resultsMap = new Map<string, ValidationResult[]>();

    context.allElements.forEach(element => {
      const results = this.validateElement(element, context, false);
      resultsMap.set(element.id, results);
    });

    return resultsMap;
  }

  /**
   * Check if an element has validation errors
   */
  hasErrors(element: BIMElement, context: ValidationContext): boolean {
    const results = this.validateElement(element, context);
    return results.some(r => !r.passed && r.severity === 'error');
  }

  /**
   * Check if an element has validation warnings
   */
  hasWarnings(element: BIMElement, context: ValidationContext): boolean {
    const results = this.validateElement(element, context);
    return results.some(r => !r.passed && r.severity === 'warning');
  }

  /**
   * Get all errors for an element
   */
  getErrors(element: BIMElement, context: ValidationContext): ValidationResult[] {
    const results = this.validateElement(element, context);
    return results.filter(r => !r.passed && r.severity === 'error');
  }

  /**
   * Get all warnings for an element
   */
  getWarnings(element: BIMElement, context: ValidationContext): ValidationResult[] {
    const results = this.validateElement(element, context);
    return results.filter(r => !r.passed && r.severity === 'warning');
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for specific element
   */
  clearElementCache(elementId: string): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.startsWith(elementId)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Generate cache key based on element properties
   */
  private getCacheKey(element: BIMElement, context: ValidationContext): string {
    // Simple hash based on element ID, type, and geometry
    // In a production system, might want a more sophisticated cache key
    const geometryHash = JSON.stringify(element.geometry);
    return `${element.id}_${element.type}_${geometryHash}_${context.mode}`;
  }
}

/**
 * Global singleton instance
 * Can be imported and used throughout the application
 */
export const constraintEngine = new ConstraintEngine();
