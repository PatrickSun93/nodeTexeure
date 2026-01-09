import React from 'react';

export default function DividerBlock({ data, onChange, onFocus, isSelected }) {
    const handleStyleChange = (style) => {
        onChange({ ...data, style });
    };

    const handleColorChange = (e) => {
        onChange({ ...data, color: e.target.value });
    };

    const handleThicknessChange = (thickness) => {
        onChange({ ...data, thickness });
    };

    return (
        <div
            className={`divider-block ${isSelected ? 'ring-2 ring-blue-500 rounded-md p-2' : 'py-2'}`}
            onClick={onFocus}
        >
            {/* Toolbar */}
            {isSelected && (
                <div className="flex items-center gap-3 mb-3 p-2 bg-gray-50 rounded-md border border-gray-100">
                    {/* Line Style */}
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 mr-1">Style:</span>
                        {['solid', 'dashed', 'dotted'].map((style) => (
                            <button
                                key={style}
                                onClick={() => handleStyleChange(style)}
                                className={`px-2 py-1 text-xs rounded capitalize ${data.style === style
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'text-gray-500 hover:bg-gray-200'
                                    }`}
                            >
                                {style}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-4 bg-gray-300"></div>

                    {/* Color Picker */}
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">Color:</span>
                        <input
                            type="color"
                            value={data.color || '#e5e7eb'}
                            onChange={handleColorChange}
                            className="w-6 h-6 rounded cursor-pointer border border-gray-200"
                        />
                    </div>

                    <div className="w-px h-4 bg-gray-300"></div>

                    {/* Thickness */}
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">Thickness:</span>
                        {[1, 2, 3].map((thickness) => (
                            <button
                                key={thickness}
                                onClick={() => handleThicknessChange(thickness)}
                                className={`w-6 h-6 flex items-center justify-center text-xs rounded ${data.thickness === thickness
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'text-gray-500 hover:bg-gray-200'
                                    }`}
                            >
                                {thickness}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Divider Preview */}
            <hr
                style={{
                    border: 'none',
                    borderTop: `${data.thickness || 1}px ${data.style || 'solid'} ${data.color || '#e5e7eb'}`,
                    margin: '8px 0',
                }}
            />
        </div>
    );
}
