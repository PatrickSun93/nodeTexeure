import React, { useRef, useEffect } from 'react';
import type { Alignment, BlockProps } from '../utils/blockTypes';

export default function TextBlock({ data, onChange, onFocus, isSelected }: BlockProps<'text'>) {
    const editorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef(data.content);

    // Update editor when data changes externally
    useEffect(() => {
        if (editorRef.current && data.content !== contentRef.current) {
            editorRef.current.innerHTML = data.content;
            contentRef.current = data.content;
        }
    }, [data.content]);

    // Set initial content
    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML) {
            editorRef.current.innerHTML = data.content || '';
        }
    }, []);

    const handleInput = () => {
        if (editorRef.current) {
            const newContent = editorRef.current.innerHTML;
            contentRef.current = newContent;
            onChange({ ...data, content: newContent });
        }
    };

    const formatText = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        handleInput();
    };

    const handleAlignment = (alignment: Alignment) => {
        onChange({ ...data, alignment });
    };

    const insertVariable = (variable: string) => {
        document.execCommand('insertText', false, variable);
        handleInput();
    };

    return (
        <div className={`text-block ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
            {/* Mini Toolbar - visible when selected */}
            {isSelected && (
                <div className="flex items-center gap-1 mb-2 p-1.5 bg-gray-50 rounded-md border border-gray-100">
                    <button
                        onClick={() => formatText('bold')}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded font-bold text-sm"
                        title="Bold"
                    >
                        B
                    </button>
                    <button
                        onClick={() => formatText('italic')}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded italic text-sm"
                        title="Italic"
                    >
                        I
                    </button>
                    <button
                        onClick={() => formatText('underline')}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded underline text-sm"
                        title="Underline"
                    >
                        U
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button
                        onClick={() => handleAlignment('left')}
                        className={`p-1.5 rounded text-sm ${data.alignment === 'left' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        title="Align Left"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
                        </svg>
                    </button>
                    <button
                        onClick={() => handleAlignment('center')}
                        className={`p-1.5 rounded text-sm ${data.alignment === 'center' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        title="Align Center"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
                        </svg>
                    </button>
                    <button
                        onClick={() => handleAlignment('right')}
                        className={`p-1.5 rounded text-sm ${data.alignment === 'right' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        title="Align Right"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
                        </svg>
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button
                        onClick={() => {
                            const url = prompt('Enter URL:');
                            if (url) formatText('createLink', url);
                        }}
                        className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"
                        title="Insert Link"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Content Editable Area */}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onFocus={onFocus}
                className="min-h-[60px] p-3 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent prose prose-sm max-w-none"
                style={{ textAlign: data.alignment || 'left' }}
            />
        </div>
    );
}
