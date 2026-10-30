import React from 'react';
import { VARIABLE_GROUPS } from './utils/blockTypes';

export default function VariablesPalette({ onInsertVariable }: { onInsertVariable?: (variable: string) => void }) {
    const handleClick = (variable: string) => {
        // Copy to clipboard
        navigator.clipboard.writeText(variable).then(() => {
            // Also trigger insert if handler provided
            if (onInsertVariable) {
                onInsertVariable(variable);
            }
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    };

    return (
        <div className="variables-palette">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                <span className="font-mono text-blue-600">{`{ }`}</span>
                Dynamic Variables
            </h3>
            <p className="text-xs text-gray-500 mb-4">
                Click to copy variable to clipboard. Paste into text blocks to personalize emails.
            </p>

            <div className="space-y-4">
                {VARIABLE_GROUPS.map((group) => (
                    <div key={group.id}>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                            {group.label}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                            {group.tags.map((tag) => (
                                <button
                                    key={tag}
                                    onClick={() => handleClick(tag)}
                                    className="px-2 py-1 bg-blue-50 border border-blue-100 text-blue-600 rounded text-[11px] font-mono hover:bg-blue-100 hover:border-blue-200 transition-colors"
                                    title="Click to copy"
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Usage Tips */}
            <div className="mt-6 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">How to use:</h4>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                    <li>Click a variable to copy it</li>
                    <li>Paste into any text block</li>
                    <li>Variables are replaced when email is sent</li>
                </ol>
            </div>
        </div>
    );
}
