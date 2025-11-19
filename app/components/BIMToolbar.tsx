'use client';

import { ToolMode, DEFAULT_EDITOR_SETTINGS } from '../types/bim';

interface BIMToolbarProps {
  toolMode: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  wallHeight: number;
  onWallHeightChange: (height: number) => void;
  wallThickness: number;
  onWallThicknessChange: (thickness: number) => void;
  doorWidth: number;
  onDoorWidthChange: (width: number) => void;
  doorHeight: number;
  onDoorHeightChange: (height: number) => void;
  gridEnabled: boolean;
  onGridToggle: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export default function BIMToolbar({
  toolMode,
  onToolChange,
  wallHeight,
  onWallHeightChange,
  wallThickness,
  onWallThicknessChange,
  doorWidth,
  onDoorWidthChange,
  doorHeight,
  onDoorHeightChange,
  gridEnabled,
  onGridToggle,
  onExportJSON,
  onImportJSON,
  onClear,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: BIMToolbarProps) {
  const tools: { mode: ToolMode; icon: string; label: string; color: string }[] = [
    { mode: 'select', icon: '⊙', label: 'Select', color: 'bg-blue-600' },
    { mode: 'wall', icon: '▬', label: 'Wall', color: 'bg-green-600' },
    { mode: 'door', icon: '⌂', label: 'Door', color: 'bg-purple-600' },
    { mode: 'delete', icon: '✕', label: 'Delete', color: 'bg-red-600' },
  ];

  return (
    <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Tool Selection */}
        <div className="flex gap-2">
          {tools.map((tool) => (
            <button
              key={tool.mode}
              onClick={() => onToolChange(tool.mode)}
              className={`flex flex-col items-center justify-center w-16 h-16 rounded-lg font-semibold transition-all ${
                toolMode === tool.mode
                  ? `${tool.color} text-white shadow-lg scale-105`
                  : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
              }`}
              title={tool.label}
            >
              <span className="text-2xl">{tool.icon}</span>
              <span className="text-xs mt-1">{tool.label}</span>
            </button>
          ))}
        </div>

        <div className="h-12 w-px bg-zinc-300 dark:bg-zinc-600" />

        {/* Wall Settings */}
        {toolMode === 'wall' && (
          <div className="flex gap-4">
            <div className="flex flex-col">
              <label className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                Height (m)
              </label>
              <input
                type="number"
                value={wallHeight}
                onChange={(e) => onWallHeightChange(parseFloat(e.target.value))}
                min={DEFAULT_EDITOR_SETTINGS.wall.minHeight}
                max={DEFAULT_EDITOR_SETTINGS.wall.maxHeight}
                step={0.1}
                className="w-20 px-2 py-1 text-sm bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                Thickness (m)
              </label>
              <input
                type="number"
                value={wallThickness}
                onChange={(e) => onWallThicknessChange(parseFloat(e.target.value))}
                min={DEFAULT_EDITOR_SETTINGS.wall.minThickness}
                max={DEFAULT_EDITOR_SETTINGS.wall.maxThickness}
                step={0.05}
                className="w-20 px-2 py-1 text-sm bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
              />
            </div>
          </div>
        )}

        {/* Door Settings */}
        {toolMode === 'door' && (
          <div className="flex gap-4">
            <div className="flex flex-col">
              <label className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                Width (m)
              </label>
              <select
                value={doorWidth}
                onChange={(e) => onDoorWidthChange(parseFloat(e.target.value))}
                className="px-2 py-1 text-sm bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
              >
                {DEFAULT_EDITOR_SETTINGS.door.presets.map((preset) => (
                  <option key={preset.name} value={preset.width}>
                    {preset.name} ({preset.width.toFixed(3)}m)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                Height (m)
              </label>
              <input
                type="number"
                value={doorHeight}
                onChange={(e) => onDoorHeightChange(parseFloat(e.target.value))}
                min={1.8}
                max={3.0}
                step={0.1}
                className="w-20 px-2 py-1 text-sm bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
              />
            </div>
          </div>
        )}

        <div className="h-12 w-px bg-zinc-300 dark:bg-zinc-600" />

        {/* Grid Toggle */}
        <button
          onClick={onGridToggle}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            gridEnabled
              ? 'bg-green-600 text-white'
              : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
          }`}
        >
          Grid: {gridEnabled ? 'ON' : 'OFF'}
        </button>

        <div className="h-12 w-px bg-zinc-300 dark:bg-zinc-600" />

        {/* Undo/Redo */}
        <div className="flex gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Y)"
          >
            ↷ Redo
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={onImportJSON}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Import JSON
          </button>
          <button
            onClick={onExportJSON}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={onClear}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
