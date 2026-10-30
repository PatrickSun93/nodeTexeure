import React, { type ChangeEvent } from 'react';
import type { BlockProps } from '../utils/blockTypes';

export default function SpacerBlock({ data, onChange, onFocus, isSelected }: BlockProps<'spacer'>) {
    const handleHeightChange = (e: ChangeEvent<HTMLInputElement>) => {
        const height = parseInt(e.target.value) || 16;
        onChange({ ...data, height: Math.max(8, Math.min(200, height)) });
    };

    const presetHeights = [16, 32, 48, 64, 96];

    return (
        <div
            className={`spacer-block ${isSelected ? 'ring-2 ring-blue-500 rounded-md' : ''}`}
            onClick={onFocus}
        >
            {/* Toolbar */}
            {isSelected && (
                <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-md border border-gray-100 mb-1">
                    <span className="text-xs text-gray-500">Height:</span>

                    {/* Preset Heights */}
                    <div className="flex items-center gap-1">
                        {presetHeights.map((h) => (
                            <button
                                key={h}
                                onClick={() => onChange({ ...data, height: h })}
                                className={`px-2 py-1 text-xs rounded ${data.height === h
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'text-gray-500 hover:bg-gray-200'
                                    }`}
                            >
                                {h}px
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-4 bg-gray-300"></div>

                    {/* Custom Input */}
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            value={data.height || 32}
                            onChange={handleHeightChange}
                            min={8}
                            max={200}
                            className="w-16 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-400">px</span>
                    </div>
                </div>
            )}

            {/* Spacer Visual */}
            <div
                className="relative bg-gray-50 border border-dashed border-gray-300 rounded flex items-center justify-center transition-all"
                style={{ height: `${data.height || 32}px` }}
            >
                <span className="text-xs text-gray-400 bg-white px-2 rounded">
                    {data.height || 32}px spacer
                </span>
            </div>
        </div>
    );
}
