'use client';

import { useState } from 'react';
import { BIMModel, BIMElement, BIMWall, BIMDoor, isWall, isDoor } from '../types/bim';
import {
  DoorWallSide,
  DoorSwingDirection,
  DoorOpeningDirection,
} from '../types/door-orientation';
import {
  flipWallSide,
  flipHanding,
  flipOpeningDirection,
  getOrientationDescription,
} from '../lib/door-orientation';

interface BIMPropertiesProps {
  model: BIMModel;
  selectedElement: BIMElement | null;
  onElementUpdate: (id: string, updates: Partial<BIMElement>) => void;
}

export default function BIMProperties({
  model,
  selectedElement,
  onElementUpdate,
}: BIMPropertiesProps) {
  const [showJSON, setShowJSON] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyJSON = () => {
    const json = JSON.stringify(model, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-80 bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Properties
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Model Stats */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            Model Statistics
          </h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Walls:</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {model.elements.filter((el) => el.type === 'wall').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Doors:</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {model.elements.filter((el) => el.type === 'door').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Total Elements:</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {model.elements.length}
              </span>
            </div>
          </div>
        </div>

        {/* Selected Element */}
        {selectedElement ? (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Selected {selectedElement.type.charAt(0).toUpperCase() + selectedElement.type.slice(1)}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  ID
                </label>
                <input
                  type="text"
                  value={selectedElement.id}
                  disabled
                  className="w-full px-2 py-1 text-sm bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                />
              </div>

              {/* Wall-specific properties */}
              {isWall(selectedElement) && (
                <>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Height (ft)
                    </label>
                    <input
                      type="number"
                      value={selectedElement.geometry.dimensions.height}
                      onChange={(e) =>
                        onElementUpdate(selectedElement.id, {
                          geometry: {
                            ...selectedElement.geometry,
                            dimensions: {
                              ...selectedElement.geometry.dimensions,
                              height: parseFloat(e.target.value),
                            },
                          },
                        })
                      }
                      min={4}
                      max={20}
                      step={0.5}
                      className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Thickness (ft)
                    </label>
                    <input
                      type="number"
                      value={selectedElement.thickness}
                      onChange={(e) =>
                        onElementUpdate(selectedElement.id, {
                          thickness: parseFloat(e.target.value),
                        } as Partial<BIMWall>)
                      }
                      min={0.1}
                      max={2.0}
                      step={1 / 12}
                      className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Doors Attached
                    </label>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedElement.doors.length}
                    </div>
                  </div>
                </>
              )}

              {/* Door-specific properties */}
              {isDoor(selectedElement) && (
                <>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Width (ft)
                    </label>
                    <input
                      type="number"
                      value={selectedElement.geometry.dimensions.width}
                      onChange={(e) =>
                        onElementUpdate(selectedElement.id, {
                          geometry: {
                            ...selectedElement.geometry,
                            dimensions: {
                              ...selectedElement.geometry.dimensions,
                              width: parseFloat(e.target.value),
                            },
                          },
                        })
                      }
                      min={1.5}
                      max={10}
                      step={1 / 12}
                      className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Height (ft)
                    </label>
                    <input
                      type="number"
                      value={selectedElement.geometry.dimensions.height}
                      onChange={(e) =>
                        onElementUpdate(selectedElement.id, {
                          geometry: {
                            ...selectedElement.geometry,
                            dimensions: {
                              ...selectedElement.geometry.dimensions,
                              height: parseFloat(e.target.value),
                            },
                          },
                        })
                      }
                      min={6}
                      max={12}
                      step={1 / 12}
                      className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Parent Wall
                    </label>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedElement.parentWallId}
                    </div>
                  </div>

                  {/* Door Orientation Controls */}
                  {selectedElement.orientation && (
                    <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 mt-3">
                      <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                        Door Orientation
                      </h4>

                      {/* Current Orientation Display */}
                      <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                        <div className="font-medium text-blue-900 dark:text-blue-100">
                          {getOrientationDescription(selectedElement.orientation)}
                        </div>
                      </div>

                      {/* Wall Side Control */}
                      <div className="mb-2">
                        <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                          Wall Side
                        </label>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              onElementUpdate(selectedElement.id, {
                                orientation: flipWallSide(selectedElement.orientation!),
                              } as Partial<BIMDoor>)
                            }
                            className="flex-1 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                          >
                            Flip Side
                          </button>
                        </div>
                      </div>

                      {/* Swing Direction (Handing) Control */}
                      <div className="mb-2">
                        <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                          Handing
                        </label>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              onElementUpdate(selectedElement.id, {
                                orientation: flipHanding(selectedElement.orientation!),
                              } as Partial<BIMDoor>)
                            }
                            className="flex-1 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                          >
                            Flip Handing
                          </button>
                        </div>
                      </div>

                      {/* Opening Direction Control */}
                      <div>
                        <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                          Opening Direction
                        </label>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              onElementUpdate(selectedElement.id, {
                                orientation: flipOpeningDirection(selectedElement.orientation!),
                              } as Partial<BIMDoor>)
                            }
                            className="flex-1 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                          >
                            Flip Direction
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Position */}
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  Position (x, y, z) [ft]
                </label>
                <div className="grid grid-cols-3 gap-1">
                  <input
                    type="number"
                    value={selectedElement.geometry.position.x.toFixed(3)}
                    disabled
                    className="px-1 py-1 text-xs bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                  />
                  <input
                    type="number"
                    value={selectedElement.geometry.position.y.toFixed(3)}
                    disabled
                    className="px-1 py-1 text-xs bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                  />
                  <input
                    type="number"
                    value={selectedElement.geometry.position.z.toFixed(3)}
                    disabled
                    className="px-1 py-1 text-xs bg-zinc-100 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No element selected
            </p>
          </div>
        )}

        {/* BIM-JSON Viewer */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              BIM-JSON
            </h3>
            <button
              onClick={() => setShowJSON(!showJSON)}
              className="text-xs px-2 py-1 bg-zinc-200 dark:bg-zinc-700 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600"
            >
              {showJSON ? 'Hide' : 'Show'}
            </button>
          </div>

          {showJSON && (
            <div className="relative">
              <pre className="text-xs bg-zinc-900 text-green-400 p-3 rounded overflow-x-auto max-h-96 overflow-y-auto font-mono">
                {JSON.stringify(model, null, 2)}
              </pre>
              <button
                onClick={handleCopyJSON}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
