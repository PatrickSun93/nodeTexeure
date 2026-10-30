'use client';

import { useState, useRef, useEffect } from 'react';

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value = '', onChange, placeholder = 'Start writing...' }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      execCommand('insertImage', url);
    }
  };

  const formatBlock = (tag: string) => {
    execCommand('formatBlock', tag);
  };

  const toolbarButtons = [
    {
      group: 'format',
      buttons: [
        { command: 'bold', icon: 'B', title: 'Bold' },
        { command: 'italic', icon: 'I', title: 'Italic' },
        { command: 'underline', icon: 'U', title: 'Underline' },
        { command: 'strikeThrough', icon: 'S', title: 'Strikethrough' }
      ]
    },
    {
      group: 'alignment',
      buttons: [
        { command: 'justifyLeft', icon: '⬅', title: 'Align Left' },
        { command: 'justifyCenter', icon: '⬌', title: 'Align Center' },
        { command: 'justifyRight', icon: '➡', title: 'Align Right' },
        { command: 'justifyFull', icon: '⬍', title: 'Justify' }
      ]
    },
    {
      group: 'lists',
      buttons: [
        { command: 'insertUnorderedList', icon: '•', title: 'Bullet List' },
        { command: 'insertOrderedList', icon: '1.', title: 'Numbered List' }
      ]
    },
    {
      group: 'indent',
      buttons: [
        { command: 'outdent', icon: '⬅', title: 'Decrease Indent' },
        { command: 'indent', icon: '➡', title: 'Increase Indent' }
      ]
    },
    {
      group: 'insert',
      buttons: [
        { command: 'insertLink', icon: '🔗', title: 'Insert Link', action: insertLink },
        { command: 'insertImage', icon: '🖼', title: 'Insert Image', action: insertImage },
        { command: 'insertHorizontalRule', icon: '—', title: 'Insert Horizontal Rule' }
      ]
    },
    {
      group: 'actions',
      buttons: [
        { command: 'undo', icon: '↶', title: 'Undo' },
        { command: 'redo', icon: '↷', title: 'Redo' },
        { command: 'removeFormat', icon: '✕', title: 'Clear Formatting' }
      ]
    }
  ];

  const headingOptions = [
    { value: 'p', label: 'Paragraph' },
    { value: 'h1', label: 'Heading 1' },
    { value: 'h2', label: 'Heading 2' },
    { value: 'h3', label: 'Heading 3' },
    { value: 'h4', label: 'Heading 4' },
    { value: 'h5', label: 'Heading 5' },
    { value: 'h6', label: 'Heading 6' }
  ];

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      {/* Toolbar */}
      {isToolbarVisible && (
        <div className="bg-gray-50 border-b border-gray-300 p-2">
          <div className="flex flex-wrap items-center gap-1">
            {/* Heading Selector */}
            <select
              onChange={(e) => formatBlock(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-sm mr-2"
              defaultValue="p"
            >
              {headingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* Toolbar Button Groups */}
            {toolbarButtons.map((group, groupIndex) => (
              <div key={group.group} className="flex items-center">
                {group.buttons.map((button) => (
                  <button
                    key={button.command}
                    type="button"
                    onClick={() => button.action ? button.action() : execCommand(button.command)}
                    className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                    title={button.title}
                  >
                    {button.icon}
                  </button>
                ))}
                {groupIndex < toolbarButtons.length - 1 && (
                  <div className="w-px h-6 bg-gray-300 mx-1" />
                )}
              </div>
            ))}

            {/* Toggle Toolbar Button */}
            <button
              type="button"
              onClick={() => setIsToolbarVisible(false)}
              className="ml-auto px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
              title="Hide Toolbar"
            >
              ⬆
            </button>
          </div>
        </div>
      )}

      {/* Show Toolbar Button (when hidden) */}
      {!isToolbarVisible && (
        <div className="bg-gray-50 border-b border-gray-300 p-1">
          <button
            type="button"
            onClick={() => setIsToolbarVisible(true)}
            className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
            title="Show Toolbar"
          >
            ⬇ Show Toolbar
          </button>
        </div>
      )}

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="min-h-[300px] p-4 focus:outline-none prose max-w-none"
        style={{
          minHeight: '300px',
          maxHeight: '600px',
          overflowY: 'auto'
        }}
        suppressContentEditableWarning={true}
        data-placeholder={placeholder}
      />

      {/* Character Count */}
      <div className="bg-gray-50 border-t border-gray-300 px-4 py-2 text-sm text-gray-500">
        Characters: {value.replace(/<[^>]*>/g, '').length}
      </div>

      <style jsx>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          font-style: italic;
        }
        
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 8px 0;
        }
        
        [contenteditable] a {
          color: #3b82f6;
          text-decoration: underline;
        }
        
        [contenteditable] blockquote {
          border-left: 4px solid #e5e7eb;
          padding-left: 16px;
          margin: 16px 0;
          font-style: italic;
          color: #6b7280;
        }
        
        [contenteditable] code {
          background-color: #f3f4f6;
          padding: 2px 4px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
        }
        
        [contenteditable] pre {
          background-color: #f3f4f6;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
          font-family: 'Courier New', monospace;
        }
        
        [contenteditable] hr {
          border: none;
          border-top: 2px solid #e5e7eb;
          margin: 24px 0;
        }
        
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 24px;
        }
        
        [contenteditable] li {
          margin: 4px 0;
        }
        
        [contenteditable] h1, [contenteditable] h2, [contenteditable] h3, 
        [contenteditable] h4, [contenteditable] h5, [contenteditable] h6 {
          margin: 16px 0 8px 0;
          font-weight: bold;
        }
        
        [contenteditable] h1 { font-size: 2em; }
        [contenteditable] h2 { font-size: 1.5em; }
        [contenteditable] h3 { font-size: 1.25em; }
        [contenteditable] h4 { font-size: 1.1em; }
        [contenteditable] h5 { font-size: 1em; }
        [contenteditable] h6 { font-size: 0.9em; }
        
        [contenteditable] p {
          margin: 8px 0;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}