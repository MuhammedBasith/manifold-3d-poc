import { useState, useEffect, useMemo, useCallback } from 'react';
import { BIMElement, BIMWall, BIMDoor } from '../types/bim';
import { ValidationResult, ValidationContext, isWall, isDoor } from '../types/validation';
import { constraintEngine } from '../lib/validation/constraint-engine';
import { registerDoorRules } from '../lib/validation/validators/door-validator';
import { registerWallRules } from '../lib/validation/validators/wall-validator';

// Register rules once on module load
let rulesRegistered = false;
function ensureRulesRegistered() {
  if (!rulesRegistered) {
    registerDoorRules(constraintEngine);
    registerWallRules(constraintEngine);
    rulesRegistered = true;
  }
}

/**
 * Debounce utility
 */
function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Hook for validation management
 * Provides real-time validation of BIM elements
 */
export function useValidation(
  elements: BIMElement[],
  mode: 'real-time' | 'manual' = 'real-time'
) {
  ensureRulesRegistered();

  const [validationResults, setValidationResults] = useState<Map<string, ValidationResult[]>>(
    new Map()
  );
  const [hasErrors, setHasErrors] = useState(false);
  const [hasWarnings, setHasWarnings] = useState(false);

  // Memoize walls and doors to avoid recalculation
  const walls = useMemo(
    () => elements.filter((el): el is BIMWall => isWall(el)),
    [elements]
  );

  const doors = useMemo(
    () => elements.filter((el): el is BIMDoor => isDoor(el)),
    [elements]
  );

  /**
   * Perform full model validation
   */
  const validateModel = useCallback(() => {
    const context: ValidationContext = {
      allElements: elements,
      walls,
      doors,
      mode: mode === 'real-time' ? 'real-time' : 'batch',
    };

    const results = constraintEngine.validateAll(context);
    setValidationResults(results);

    // Update error/warning flags
    let errors = false;
    let warnings = false;
    results.forEach(elementResults => {
      elementResults.forEach(result => {
        if (!result.passed) {
          if (result.severity === 'error') errors = true;
          if (result.severity === 'warning') warnings = true;
        }
      });
    });

    setHasErrors(errors);
    setHasWarnings(warnings);

    return results;
  }, [elements, walls, doors, mode]);

  /**
   * Debounced validation for real-time mode
   */
  const debouncedValidate = useMemo(
    () => debounce(validateModel, 300), // 300ms debounce
    [validateModel]
  );

  /**
   * Auto-validate in real-time mode
   */
  useEffect(() => {
    if (mode === 'real-time') {
      debouncedValidate();
    }
  }, [mode, debouncedValidate]);

  /**
   * Validate a single element
   */
  const validateElement = useCallback(
    (elementId: string): ValidationResult[] => {
      const element = elements.find(el => el.id === elementId);
      if (!element) return [];

      const context: ValidationContext = {
        allElements: elements,
        walls,
        doors,
        mode: 'real-time',
      };

      return constraintEngine.validateElement(element, context);
    },
    [elements, walls, doors]
  );

  /**
   * Get errors for a specific element
   */
  const getElementErrors = useCallback(
    (elementId: string): ValidationResult[] => {
      const results = validationResults.get(elementId) || [];
      return results.filter(r => !r.passed && r.severity === 'error');
    },
    [validationResults]
  );

  /**
   * Get warnings for a specific element
   */
  const getElementWarnings = useCallback(
    (elementId: string): ValidationResult[] => {
      const results = validationResults.get(elementId) || [];
      return results.filter(r => !r.passed && r.severity === 'warning');
    },
    [validationResults]
  );

  /**
   * Check if element has errors
   */
  const hasElementErrors = useCallback(
    (elementId: string): boolean => {
      return getElementErrors(elementId).length > 0;
    },
    [getElementErrors]
  );

  /**
   * Check if element has warnings
   */
  const hasElementWarnings = useCallback(
    (elementId: string): boolean => {
      return getElementWarnings(elementId).length > 0;
    },
    [getElementWarnings]
  );

  /**
   * Get all validation failures (errors + warnings)
   */
  const getAllFailures = useCallback((): Array<ValidationResult & { elementId: string }> => {
    const failures: Array<ValidationResult & { elementId: string }> = [];

    validationResults.forEach((results, elementId) => {
      results.forEach(result => {
        if (!result.passed) {
          failures.push({ ...result, elementId });
        }
      });
    });

    return failures;
  }, [validationResults]);

  /**
   * Clear validation cache
   */
  const clearCache = useCallback(() => {
    constraintEngine.clearCache();
  }, []);

  return {
    validationResults,
    hasErrors,
    hasWarnings,
    validateElement,
    validateModel,
    getElementErrors,
    getElementWarnings,
    hasElementErrors,
    hasElementWarnings,
    getAllFailures,
    clearCache,
  };
}

/**
 * Hook to validate a single preview element (like during placement)
 */
export function usePreviewValidation(
  previewElement: BIMElement | null,
  allElements: BIMElement[]
) {
  ensureRulesRegistered();

  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValid, setIsValid] = useState(true);

  const walls = useMemo(
    () => allElements.filter((el): el is BIMWall => isWall(el)),
    [allElements]
  );

  const doors = useMemo(
    () => allElements.filter((el): el is BIMDoor => isDoor(el)),
    [allElements]
  );

  useEffect(() => {
    if (!previewElement) {
      if (validationResults.length > 0) setValidationResults([]);
      if (!isValid) setIsValid(true);
      return;
    }

    const context: ValidationContext = {
      allElements: [...allElements, previewElement],
      walls,
      doors,
      mode: 'real-time',
    };

    const results = constraintEngine.validateElement(previewElement, context, false);
    setValidationResults(results);

    const hasErrors = results.some(r => !r.passed && r.severity === 'error');
    setIsValid(!hasErrors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewElement, allElements, walls, doors]);

  const getErrors = useCallback(
    () => validationResults.filter(r => !r.passed && r.severity === 'error'),
    [validationResults]
  );

  const getWarnings = useCallback(
    () => validationResults.filter(r => !r.passed && r.severity === 'warning'),
    [validationResults]
  );

  return {
    validationResults,
    isValid,
    getErrors,
    getWarnings,
  };
}
