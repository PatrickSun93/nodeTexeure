import React, { useState, useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';

import { BLOCK_TYPES, BLOCK_META, getDefaultBlockData } from './utils/blockTypes';
import BlockToolbar from './BlockToolbar';
import AddBlockMenu, { AddBlockButton } from './AddBlockMenu';

// Block component imports
import TextBlock from './blocks/TextBlock';
import HeadingBlock from './blocks/HeadingBlock';
import ImageBlock from './blocks/ImageBlock';
import ButtonBlock from './blocks/ButtonBlock';
import DividerBlock from './blocks/DividerBlock';
import SpacerBlock from './blocks/SpacerBlock';
import SocialBlock from './blocks/SocialBlock';
import TableBlock from './blocks/TableBlock';
import HtmlBlock from './blocks/HtmlBlock';

// Block renderer based on type
const BlockRenderer = ({ block, isSelected, onChange, onFocus }) => {
    const props = {
        data: block.data,
        onChange: (newData) => onChange(block.id, newData),
        onFocus: () => onFocus(block.id),
        isSelected,
    };

    switch (block.type) {
        case BLOCK_TYPES.TEXT:
            return <TextBlock {...props} />;
        case BLOCK_TYPES.HEADING:
            return <HeadingBlock {...props} />;
        case BLOCK_TYPES.IMAGE:
            return <ImageBlock {...props} />;
        case BLOCK_TYPES.BUTTON:
            return <ButtonBlock {...props} />;
        case BLOCK_TYPES.DIVIDER:
            return <DividerBlock {...props} />;
        case BLOCK_TYPES.SPACER:
            return <SpacerBlock {...props} />;
        case BLOCK_TYPES.SOCIAL:
            return <SocialBlock {...props} />;
        case BLOCK_TYPES.TABLE:
            return <TableBlock {...props} />;
        case BLOCK_TYPES.HTML:
            return <HtmlBlock {...props} />;
        default:
            return <div className="p-4 bg-red-50 text-red-600">Unknown block type: {block.type}</div>;
    }
};

// Sortable block wrapper
function SortableBlock({ block, isSelected, onSelect, onChange, onDelete, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: block.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const meta = BLOCK_META[block.type] || { label: 'Block', icon: '📦' };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group ${isDragging ? 'z-50' : ''}`}
        >
            {/* Block Header */}
            <div className="flex items-center gap-2 mb-1">
                {/* Drag Handle */}
                <div
                    {...attributes}
                    {...listeners}
                    className="p-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                </div>
                <span className="text-xs text-gray-400">{meta.icon} {meta.label}</span>
            </div>

            {/* Block Content */}
            <div
                onClick={() => onSelect(block.id)}
                className={`relative bg-white rounded-lg border transition-shadow ${isSelected
                        ? 'border-blue-300 shadow-md ring-2 ring-blue-100'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
            >
                <div className="p-3">
                    <BlockRenderer
                        block={block}
                        isSelected={isSelected}
                        onChange={onChange}
                        onFocus={() => onSelect(block.id)}
                    />
                </div>

                {/* Block Actions (visible when selected) */}
                {isSelected && (
                    <div className="absolute -right-10 top-0 flex flex-col gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                            disabled={isFirst}
                            className="p-1.5 bg-white border border-gray-200 rounded shadow-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            title="Move up"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                            disabled={isLast}
                            className="p-1.5 bg-white border border-gray-200 rounded shadow-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            title="Move down"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                            className="p-1.5 bg-white border border-gray-200 rounded shadow-sm text-gray-400 hover:text-blue-600"
                            title="Duplicate"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-1.5 bg-white border border-gray-200 rounded shadow-sm text-gray-400 hover:text-red-600"
                            title="Delete"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Main email block editor component
export default function EmailBlockEditor({ blocks, onChange, onInsertVariable }) {
    const [selectedBlockId, setSelectedBlockId] = useState(null);
    const [addMenuPosition, setAddMenuPosition] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Handle drag end
    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = blocks.findIndex((b) => b.id === active.id);
            const newIndex = blocks.findIndex((b) => b.id === over.id);
            onChange(arrayMove(blocks, oldIndex, newIndex));
        }
    }, [blocks, onChange]);

    // Add a new block
    const addBlock = useCallback((type, position = null) => {
        const newBlock = {
            id: uuidv4(),
            type,
            data: getDefaultBlockData(type),
        };

        if (position !== null && position >= 0) {
            const newBlocks = [...blocks];
            newBlocks.splice(position, 0, newBlock);
            onChange(newBlocks);
        } else {
            onChange([...blocks, newBlock]);
        }

        setSelectedBlockId(newBlock.id);
        setAddMenuPosition(null);
    }, [blocks, onChange]);

    // Update block data
    const updateBlock = useCallback((blockId, newData) => {
        onChange(
            blocks.map((b) => (b.id === blockId ? { ...b, data: newData } : b))
        );
    }, [blocks, onChange]);

    // Delete a block
    const deleteBlock = useCallback((blockId) => {
        onChange(blocks.filter((b) => b.id !== blockId));
        if (selectedBlockId === blockId) {
            setSelectedBlockId(null);
        }
    }, [blocks, onChange, selectedBlockId]);

    // Duplicate a block
    const duplicateBlock = useCallback((blockId) => {
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index === -1) return;

        const block = blocks[index];
        const newBlock = {
            id: uuidv4(),
            type: block.type,
            data: JSON.parse(JSON.stringify(block.data)),
        };

        const newBlocks = [...blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        onChange(newBlocks);
        setSelectedBlockId(newBlock.id);
    }, [blocks, onChange]);

    // Move block up
    const moveBlockUp = useCallback((blockId) => {
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index <= 0) return;
        onChange(arrayMove(blocks, index, index - 1));
    }, [blocks, onChange]);

    // Move block down
    const moveBlockDown = useCallback((blockId) => {
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index === -1 || index >= blocks.length - 1) return;
        onChange(arrayMove(blocks, index, index + 1));
    }, [blocks, onChange]);

    return (
        <div className="email-block-editor">
            {/* Add Block Menu Popup */}
            {addMenuPosition !== null && (
                <div className="fixed inset-0 z-40" onClick={() => setAddMenuPosition(null)}>
                    <div
                        className="absolute z-50"
                        style={{
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <AddBlockMenu
                            onAddBlock={(type) => addBlock(type, addMenuPosition)}
                            position={addMenuPosition}
                        />
                    </div>
                </div>
            )}

            {/* Empty State */}
            {blocks.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Start building your email</h3>
                    <p className="text-sm text-gray-500 mb-4">Add blocks to create your email template</p>
                    <button
                        onClick={() => setAddMenuPosition(0)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add First Block
                    </button>
                </div>
            )}

            {/* Block List with Drag and Drop */}
            {blocks.length > 0 && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={blocks.map((b) => b.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-3">
                            {/* Add block button at the top */}
                            <AddBlockButton onClick={() => setAddMenuPosition(0)} className="opacity-50 hover:opacity-100" />

                            {blocks.map((block, index) => (
                                <React.Fragment key={block.id}>
                                    <SortableBlock
                                        block={block}
                                        isSelected={selectedBlockId === block.id}
                                        onSelect={setSelectedBlockId}
                                        onChange={updateBlock}
                                        onDelete={() => deleteBlock(block.id)}
                                        onDuplicate={() => duplicateBlock(block.id)}
                                        onMoveUp={() => moveBlockUp(block.id)}
                                        onMoveDown={() => moveBlockDown(block.id)}
                                        isFirst={index === 0}
                                        isLast={index === blocks.length - 1}
                                    />
                                    {/* Add block button after each block */}
                                    <AddBlockButton
                                        onClick={() => setAddMenuPosition(index + 1)}
                                        className="opacity-0 group-hover:opacity-100 hover:opacity-100"
                                    />
                                </React.Fragment>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}
