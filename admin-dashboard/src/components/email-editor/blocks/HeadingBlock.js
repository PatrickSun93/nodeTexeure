import React, { useState, useRef, useEffect } from 'react';

export default function HeadingBlock({ data, onChange, onFocus, isSelected }) {
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleLevelChange = (level) => {
        onChange({ ...data, level });
    };

    const handleAlignment = (alignment) => {
        onChange({ ...data, alignment });
    };

    const handleContentChange = (e) => {
        onChange({ ...data, content: e.target.value });
    };

    const headingStyles = {
        h1: 'text-3xl font-bold',
        h2: 'text-2xl font-bold',
        h3: 'text-xl font-semibold',
    };

    return (
        <div className={`heading-block ${isSelected ? 'ring-2 ring-blue-500 rounded-md' : ''}`}>
            {/* Toolbar */}
            {isSelected && (
                <div className="flex items-center gap-2 mb-2 p-1.5 bg-gray-50 rounded-md border border-gray-100">
                    {/* Heading Level Selector */}
                    <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
                        {['h1', 'h2', 'h3'].map((level) => (
                            <button
                                key={level}
                                onClick={() => handleLevelChange(level)}
                                className={`px-2 py-1 text-xs font-bold rounded ${data.level === level
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'text-gray-500 hover:bg-gray-200'
                                    }`}
                            >
                                {level.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    {/* Alignment */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleAlignment('left')}
                            className={`p-1.5 rounded ${data.alignment === 'left' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                            title="Align Left"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
                            </svg>
                        </button>
                        <button
                            onClick={() => handleAlignment('center')}
                            className={`p-1.5 rounded ${data.alignment === 'center' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                            title="Align Center"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
                            </svg>
                        </button>
                        <button
                            onClick={() => handleAlignment('right')}
                            className={`p-1.5 rounded ${data.alignment === 'right' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                            title="Align Right"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Heading Content */}
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={data.content}
                    onChange={handleContentChange}
                    onBlur={() => setIsEditing(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') setIsEditing(false);
                    }}
                    className={`w-full p-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${headingStyles[data.level || 'h2']}`}
                    style={{ textAlign: data.alignment || 'left' }}
                />
            ) : (
                <div
                    onClick={() => {
                        setIsEditing(true);
                        onFocus?.();
                    }}
                    className={`p-2 cursor-text rounded-md hover:bg-gray-50 transition-colors ${headingStyles[data.level || 'h2']}`}
                    style={{ textAlign: data.alignment || 'left' }}
                >
                    {data.content || 'Click to edit heading...'}
                </div>
            )}
        </div>
    );
}
