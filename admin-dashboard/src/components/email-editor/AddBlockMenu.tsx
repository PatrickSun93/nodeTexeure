import React from 'react';
import { BLOCK_META, BLOCK_TYPES, type BlockType } from './utils/blockTypes';

interface AddBlockMenuProps {
    onAddBlock: (type: BlockType) => void;
    position?: number | null;
}

export default function AddBlockMenu({ onAddBlock, position = null }: AddBlockMenuProps) {
    const blockCategories: { label: string; blocks: BlockType[] }[] = [
        {
            label: 'Content',
            blocks: [BLOCK_TYPES.TEXT, BLOCK_TYPES.HEADING, BLOCK_TYPES.IMAGE],
        },
        {
            label: 'Actions',
            blocks: [BLOCK_TYPES.BUTTON, BLOCK_TYPES.SOCIAL],
        },
        {
            label: 'Layout',
            blocks: [BLOCK_TYPES.DIVIDER, BLOCK_TYPES.SPACER],
        },
        {
            label: 'Advanced',
            blocks: [BLOCK_TYPES.TABLE, BLOCK_TYPES.HTML],
        },
    ];

    return (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-72">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Add Block</h3>
                {position !== null && (
                    <span className="text-xs text-gray-400">Position: {position + 1}</span>
                )}
            </div>

            <div className="space-y-4">
                {blockCategories.map((category) => (
                    <div key={category.label}>
                        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                            {category.label}
                        </h4>
                        <div className="grid grid-cols-3 gap-2">
                            {category.blocks.map((type) => {
                                const meta = BLOCK_META[type];
                                return (
                                    <button
                                        key={type}
                                        onClick={() => onAddBlock(type)}
                                        className="flex flex-col items-center p-2 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors group"
                                    >
                                        <span className="text-xl mb-1 group-hover:scale-110 transition-transform">
                                            {meta.icon}
                                        </span>
                                        <span className="text-xs text-gray-600 group-hover:text-blue-600">
                                            {meta.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Compact inline version for adding between blocks
export function AddBlockButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
    return (
        <button
            onClick={onClick}
            className={`group flex items-center justify-center w-full py-2 text-gray-400 hover:text-blue-500 transition-colors ${className}`}
        >
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 hover:bg-blue-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs font-medium">Add Block</span>
            </div>
        </button>
    );
}
