'use client';

import { useState, useCallback, useEffect } from 'react';
import BIMCanvas from './BIMCanvas';
import BIMToolbar from './BIMToolbar';
import BIMProperties from './BIMProperties';
import { useBIMState } from '../hooks/useBIMState';
import {
  ToolMode,
  BIMWall,
  BIMDoor,
  DEFAULT_EDITOR_SETTINGS,
  isWall,
  isDoor,
} from '../types/bim';

export default function BIMEditor() {
  const {
    model,
    addElement,
    updateElement,
    removeElement,
    getElementById,
    getWalls,
    getDoors,
    clearModel,
    exportJSON,
    importJSON,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useBIMState();

  // Tool and selection state
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Settings state
  const [wallHeight, setWallHeight] = useState(DEFAULT_EDITOR_SETTINGS.wall.defaultHeight);
  const [wallThickness, setWallThickness] = useState(DEFAULT_EDITOR_SETTINGS.wall.defaultThickness);
  const [doorWidth, setDoorWidth] = useState(DEFAULT_EDITOR_SETTINGS.door.defaultWidth);
  const [doorHeight, setDoorHeight] = useState(DEFAULT_EDITOR_SETTINGS.door.defaultHeight);
  const [gridEnabled, setGridEnabled] = useState(DEFAULT_EDITOR_SETTINGS.grid.enabled);

  // Generate unique ID
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Handle wall creation
  const handleWallCreate = useCallback(
    (wallData: Omit<BIMWall, 'id' | 'type' | 'doors'>) => {
      const newWall: BIMWall = {
        ...wallData,
        id: generateId(),
        type: 'wall',
        doors: [],
      };
      addElement(newWall);
    },
    [addElement, generateId]
  );

  // Handle door placement
  const handleDoorPlace = useCallback(
    (doorData: Omit<BIMDoor, 'id' | 'type'>) => {
      const newDoor: BIMDoor = {
        ...doorData,
        id: generateId(),
        type: 'door',
      };

      // Add door to model
      addElement(newDoor);

      // Update parent wall to include this door
      const parentWall = getElementById(doorData.parentWallId) as BIMWall | undefined;
      if (parentWall && isWall(parentWall)) {
        updateElement(parentWall.id, {
          doors: [...parentWall.doors, newDoor.id],
        } as Partial<BIMWall>);
      }
    },
    [addElement, generateId, getElementById, updateElement]
  );

  // Handle element selection
  const handleElementSelect = useCallback((elementId: string | null) => {
    setSelectedElementId(elementId);
  }, []);

  // Handle element deletion
  const handleElementDelete = useCallback(
    (elementId: string) => {
      const element = getElementById(elementId);
      if (!element) return;

      // If deleting a door, update parent wall
      if (isDoor(element)) {
        const parentWall = getElementById(element.parentWallId) as BIMWall | undefined;
        if (parentWall && isWall(parentWall)) {
          updateElement(parentWall.id, {
            doors: parentWall.doors.filter((doorId) => doorId !== elementId),
          } as Partial<BIMWall>);
        }
      }

      removeElement(elementId);
      setSelectedElementId(null);
    },
    [getElementById, updateElement, removeElement]
  );

  // Handle element update
  const handleElementUpdate = useCallback(
    (elementId: string, updates: Partial<any>) => {
      updateElement(elementId, updates);
    },
    [updateElement]
  );

  // Handle export
  const handleExport = useCallback(() => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bim-model-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportJSON]);

  // Handle import
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const json = event.target?.result as string;
        const success = importJSON(json);
        if (success) {
          alert('Model imported successfully!');
        } else {
          alert('Failed to import model. Please check the JSON format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importJSON]);

  // Handle clear
  const handleClear = useCallback(() => {
    if (confirm('Are you sure you want to clear all elements?')) {
      clearModel();
      setSelectedElementId(null);
    }
  }, [clearModel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key) {
          case 'v':
          case 'V':
            setToolMode('select');
            break;
          case 'w':
          case 'W':
            setToolMode('wall');
            break;
          case 'd':
          case 'D':
            setToolMode('door');
            break;
          case 'Delete':
          case 'Backspace':
            if (selectedElementId) {
              handleElementDelete(selectedElementId);
            }
            break;
          case 'Escape':
            setSelectedElementId(null);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedElementId, handleElementDelete]);

  const selectedElement = selectedElementId ? (getElementById(selectedElementId) || null) : null;

  return (
    <div className="flex flex-col h-screen bg-zinc-900">
      {/* Toolbar */}
      <BIMToolbar
        toolMode={toolMode}
        onToolChange={setToolMode}
        wallHeight={wallHeight}
        onWallHeightChange={setWallHeight}
        wallThickness={wallThickness}
        onWallThicknessChange={setWallThickness}
        doorWidth={doorWidth}
        onDoorWidthChange={setDoorWidth}
        doorHeight={doorHeight}
        onDoorHeightChange={setDoorHeight}
        gridEnabled={gridEnabled}
        onGridToggle={() => setGridEnabled(!gridEnabled)}
        onExportJSON={handleExport}
        onImportJSON={handleImport}
        onClear={handleClear}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1">
          <BIMCanvas
            toolMode={toolMode}
            walls={getWalls()}
            doors={getDoors()}
            onWallCreate={handleWallCreate}
            onDoorPlace={handleDoorPlace}
            onElementSelect={handleElementSelect}
            onElementDelete={handleElementDelete}
            selectedElementId={selectedElementId}
            wallHeight={wallHeight}
            wallThickness={wallThickness}
            doorWidth={doorWidth}
            doorHeight={doorHeight}
            gridEnabled={gridEnabled}
          />
        </div>

        {/* Properties Panel */}
        <BIMProperties
          model={model}
          selectedElement={selectedElement}
          onElementUpdate={handleElementUpdate}
        />
      </div>

      {/* Help Overlay */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white p-4 rounded-lg text-sm max-w-xs">
        <h4 className="font-semibold mb-2">Keyboard Shortcuts</h4>
        <div className="space-y-1 text-xs">
          <div><kbd className="px-1 py-0.5 bg-zinc-700 rounded">V</kbd> - Select tool</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-700 rounded">W</kbd> - Wall tool</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-700 rounded">D</kbd> - Door tool</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-700 rounded">Del</kbd> - Delete selected</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-700 rounded">Ctrl+Z</kbd> - Undo</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-700 rounded">Ctrl+Y</kbd> - Redo</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-700 rounded">Esc</kbd> - Deselect</div>
        </div>
      </div>
    </div>
  );
}
