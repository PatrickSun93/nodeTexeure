import React, { useState } from 'react';

export default function HtmlBlock({ data, onChange, onFocus, isSelected }) {
    const [showPreview, setShowPreview] = useState(false);

    const handleCodeChange = (e) => {
        onChange({ ...data, code: e.target.value });
    };

    return (
        <div
            className={`html-block ${isSelected ? 'ring-2 ring-blue-500 rounded-md' : ''}`}
            onClick={onFocus}
        >
            {/* Toolbar */}
            {isSelected && (
                <div className="flex items-center justify-between p-2 bg-gray-800 rounded-t-md">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-mono">&lt;/&gt; HTML</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowPreview(false)}
                            className={`px-2 py-1 text-xs rounded ${!showPreview
                                    ? 'bg-gray-700 text-white'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Code
                        </button>
                        <button
                            onClick={() => setShowPreview(true)}
                            className={`px-2 py-1 text-xs rounded ${showPreview
                                    ? 'bg-gray-700 text-white'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Preview
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            {isSelected ? (
                showPreview ? (
                    <div
                        className="p-4 bg-white border border-t-0 border-gray-200 rounded-b-md min-h-[100px]"
                        dangerouslySetInnerHTML={{ __html: data.code || '' }}
                    />
                ) : (
                    <textarea
                        value={data.code || ''}
                        onChange={handleCodeChange}
                        placeholder="<!-- Enter your custom HTML here -->"
                        className="w-full min-h-[150px] p-4 font-mono text-sm bg-gray-900 text-green-400 border-0 rounded-b-md focus:outline-none focus:ring-0 resize-y"
                        spellCheck={false}
                    />
                )
            ) : (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                    {data.code ? (
                        <div className="flex items-start gap-2">
                            <span className="text-gray-400 font-mono text-sm">&lt;/&gt;</span>
                            <code className="text-xs text-gray-600 font-mono truncate flex-1">
                                {data.code.substring(0, 100)}
                                {data.code.length > 100 ? '...' : ''}
                            </code>
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 text-sm">
                            <span className="font-mono">&lt;/&gt;</span> Click to add custom HTML
                        </div>
                    )}
                </div>
            )}

            {/* Warning */}
            {isSelected && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                    ⚠️ Custom HTML may not render correctly in all email clients. Test thoroughly.
                </div>
            )}
        </div>
    );
}
