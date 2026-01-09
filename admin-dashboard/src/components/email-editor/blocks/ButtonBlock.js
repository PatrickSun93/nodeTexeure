import React, { useState } from 'react';

export default function ButtonBlock({ data, onChange, onFocus, isSelected }) {
    const [isEditingText, setIsEditingText] = useState(false);

    const handleTextChange = (e) => {
        onChange({ ...data, text: e.target.value });
    };

    const handleUrlChange = (e) => {
        onChange({ ...data, url: e.target.value });
    };

    const handleBackgroundColorChange = (e) => {
        onChange({ ...data, backgroundColor: e.target.value });
    };

    const handleTextColorChange = (e) => {
        onChange({ ...data, textColor: e.target.value });
    };

    const handleBorderRadiusChange = (radius) => {
        onChange({ ...data, borderRadius: radius });
    };

    const handleAlignment = (alignment) => {
        onChange({ ...data, alignment });
    };

    // Preset colors
    const presetColors = [
        { bg: '#2563eb', text: '#ffffff', name: 'Blue' },
        { bg: '#16a34a', text: '#ffffff', name: 'Green' },
        { bg: '#dc2626', text: '#ffffff', name: 'Red' },
        { bg: '#9333ea', text: '#ffffff', name: 'Purple' },
        { bg: '#000000', text: '#ffffff', name: 'Black' },
        { bg: '#ffffff', text: '#000000', name: 'White' },
    ];

    return (
        <div
            className={`button-block ${isSelected ? 'ring-2 ring-blue-500 rounded-md' : ''}`}
            onClick={onFocus}
        >
            {/* Toolbar */}
            {isSelected && (
                <div className="p-3 bg-gray-50 rounded-md border border-gray-100 mb-2 space-y-3">
                    {/* Button Text */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-20">Text:</label>
                        <input
                            type="text"
                            value={data.text || ''}
                            onChange={handleTextChange}
                            placeholder="Button text"
                            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    {/* Button URL */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-20">URL:</label>
                        <input
                            type="url"
                            value={data.url || ''}
                            onChange={handleUrlChange}
                            placeholder="https://example.com"
                            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    {/* Preset Colors */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-20">Preset:</label>
                        <div className="flex items-center gap-1">
                            {presetColors.map((preset) => (
                                <button
                                    key={preset.name}
                                    onClick={() => onChange({ ...data, backgroundColor: preset.bg, textColor: preset.text })}
                                    className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: preset.bg }}
                                    title={preset.name}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Custom Colors */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">BG:</label>
                            <input
                                type="color"
                                value={data.backgroundColor || '#2563eb'}
                                onChange={handleBackgroundColorChange}
                                className="w-6 h-6 rounded cursor-pointer border border-gray-200"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">Text:</label>
                            <input
                                type="color"
                                value={data.textColor || '#ffffff'}
                                onChange={handleTextColorChange}
                                className="w-6 h-6 rounded cursor-pointer border border-gray-200"
                            />
                        </div>
                    </div>

                    {/* Border Radius */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-20">Corners:</label>
                        <div className="flex items-center gap-1">
                            {[0, 4, 8, 16, 24].map((radius) => (
                                <button
                                    key={radius}
                                    onClick={() => handleBorderRadiusChange(radius)}
                                    className={`px-2 py-1 text-xs rounded ${data.borderRadius === radius
                                            ? 'bg-blue-100 text-blue-600'
                                            : 'text-gray-500 hover:bg-gray-200'
                                        }`}
                                >
                                    {radius === 0 ? 'Square' : radius === 24 ? 'Pill' : `${radius}px`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Alignment */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-20">Align:</label>
                        <div className="flex items-center gap-1">
                            {['left', 'center', 'right'].map((align) => (
                                <button
                                    key={align}
                                    onClick={() => handleAlignment(align)}
                                    className={`px-2 py-1 text-xs rounded capitalize ${data.alignment === align
                                            ? 'bg-blue-100 text-blue-600'
                                            : 'text-gray-500 hover:bg-gray-200'
                                        }`}
                                >
                                    {align}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Button Preview */}
            <div
                className="p-4"
                style={{ textAlign: data.alignment || 'center' }}
            >
                <button
                    onClick={() => setIsEditingText(true)}
                    style={{
                        backgroundColor: data.backgroundColor || '#2563eb',
                        color: data.textColor || '#ffffff',
                        borderRadius: `${data.borderRadius || 4}px`,
                        padding: '12px 24px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-block',
                    }}
                    className="hover:opacity-90 transition-opacity"
                >
                    {data.text || 'Click Here'}
                </button>
            </div>
        </div>
    );
}
