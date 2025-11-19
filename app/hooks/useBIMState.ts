import { useState, useCallback } from 'react';
import {
  BIMModel,
  BIMElement,
  BIMWall,
  BIMDoor,
  BIMWindow,
  BIMFloor,
  BIMMetadata,
  Vec3Tuple,
} from '../types/bim';

interface UseBIMStateReturn {
  model: BIMModel;
  addElement: (element: BIMElement) => void;
  updateElement: (id: string, updates: Partial<BIMElement>) => void;
  removeElement: (id: string) => void;
  getElementById: (id: string) => BIMElement | undefined;
  getElementsByType: (type: BIMElement['type']) => BIMElement[];
  getWalls: () => BIMWall[];
  getDoors: () => BIMDoor[];
  getDoorsForWall: (wallId: string) => BIMDoor[];
  clearModel: () => void;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const createInitialModel = (): BIMModel => ({
  elements: [],
  metadata: {
    version: '1.0.0',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: 'BIM Editor',
    description: 'Building model created with Manifold-3D BIM Editor',
  },
});

export function useBIMState(): UseBIMStateReturn {
  const [model, setModel] = useState<BIMModel>(createInitialModel());
  const [history, setHistory] = useState<BIMModel[]>([createInitialModel()]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Save state to history
  const saveToHistory = useCallback((newModel: BIMModel) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newModel);
      // Limit history to 50 states
      if (newHistory.length > 50) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Update metadata timestamp
  const updateMetadata = useCallback((modelToUpdate: BIMModel): BIMModel => ({
    ...modelToUpdate,
    metadata: {
      ...modelToUpdate.metadata,
      modified: new Date().toISOString(),
    },
  }), []);

  // Add element
  const addElement = useCallback((element: BIMElement) => {
    setModel((prev) => {
      const newModel = updateMetadata({
        ...prev,
        elements: [...prev.elements, element],
      });
      saveToHistory(newModel);
      return newModel;
    });
  }, [saveToHistory, updateMetadata]);

  // Update element
  const updateElement = useCallback((id: string, updates: Partial<BIMElement>) => {
    setModel((prev) => {
      const newModel = updateMetadata({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === id ? { ...el, ...updates } : el
        ),
      });
      saveToHistory(newModel);
      return newModel;
    });
  }, [saveToHistory, updateMetadata]);

  // Remove element
  const removeElement = useCallback((id: string) => {
    setModel((prev) => {
      // If removing a wall, also remove its doors
      const element = prev.elements.find((el) => el.id === id);
      let elementsToRemove = [id];

      if (element && element.type === 'wall') {
        const wall = element as BIMWall;
        elementsToRemove = [...elementsToRemove, ...wall.doors];
      }

      const newModel = updateMetadata({
        ...prev,
        elements: prev.elements.filter((el) => !elementsToRemove.includes(el.id)),
      });
      saveToHistory(newModel);
      return newModel;
    });
  }, [saveToHistory, updateMetadata]);

  // Get element by ID
  const getElementById = useCallback(
    (id: string): BIMElement | undefined => {
      return model.elements.find((el) => el.id === id);
    },
    [model.elements]
  );

  // Get elements by type
  const getElementsByType = useCallback(
    (type: BIMElement['type']): BIMElement[] => {
      return model.elements.filter((el) => el.type === type);
    },
    [model.elements]
  );

  // Get all walls
  const getWalls = useCallback((): BIMWall[] => {
    return model.elements.filter((el) => el.type === 'wall') as BIMWall[];
  }, [model.elements]);

  // Get all doors
  const getDoors = useCallback((): BIMDoor[] => {
    return model.elements.filter((el) => el.type === 'door') as BIMDoor[];
  }, [model.elements]);

  // Get doors for a specific wall
  const getDoorsForWall = useCallback(
    (wallId: string): BIMDoor[] => {
      return model.elements.filter(
        (el) => el.type === 'door' && (el as BIMDoor).parentWallId === wallId
      ) as BIMDoor[];
    },
    [model.elements]
  );

  // Clear entire model
  const clearModel = useCallback(() => {
    const newModel = createInitialModel();
    setModel(newModel);
    setHistory([newModel]);
    setHistoryIndex(0);
  }, []);

  // Export to JSON
  const exportJSON = useCallback((): string => {
    return JSON.stringify(model, null, 2);
  }, [model]);

  // Import from JSON
  const importJSON = useCallback((json: string): boolean => {
    try {
      const imported = JSON.parse(json) as BIMModel;

      // Validate structure
      if (!imported.elements || !imported.metadata) {
        throw new Error('Invalid BIM model structure');
      }

      setModel(imported);
      setHistory([imported]);
      setHistoryIndex(0);
      return true;
    } catch (error) {
      console.error('Failed to import JSON:', error);
      return false;
    }
  }, []);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
      setModel(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((prev) => prev + 1);
      setModel(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  return {
    model,
    addElement,
    updateElement,
    removeElement,
    getElementById,
    getElementsByType,
    getWalls,
    getDoors,
    getDoorsForWall,
    clearModel,
    exportJSON,
    importJSON,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}
