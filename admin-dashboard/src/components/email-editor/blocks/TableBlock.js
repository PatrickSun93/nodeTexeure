import React, { useState } from 'react';

export default function TableBlock({ data, onChange, onFocus, isSelected }) {
    const [editingCell, setEditingCell] = useState(null);

    const cells = data.cells || [
        ['Header 1', 'Header 2', 'Header 3'],
        ['Cell 1', 'Cell 2', 'Cell 3'],
        ['Cell 4', 'Cell 5', 'Cell 6'],
    ];

    const updateCell = (rowIndex, colIndex, value) => {
        const newCells = cells.map((row, ri) =>
            ri === rowIndex
                ? row.map((cell, ci) => (ci === colIndex ? value : cell))
                : row
        );
        onChange({ ...data, cells: newCells });
    };

    const addRow = () => {
        const colCount = cells[0]?.length || 3;
        const newRow = Array(colCount).fill('New cell');
        onChange({
            ...data,
            cells: [...cells, newRow],
            rows: (data.rows || cells.length) + 1,
        });
    };

    const removeRow = () => {
        if (cells.length <= 1) return;
        const newCells = cells.slice(0, -1);
        onChange({
            ...data,
            cells: newCells,
            rows: newCells.length,
        });
    };

    const addColumn = () => {
        const newCells = cells.map((row, index) => [
            ...row,
            index === 0 && data.hasHeader ? 'New Header' : 'New cell',
        ]);
        onChange({
            ...data,
            cells: newCells,
            cols: (data.cols || cells[0]?.length) + 1,
        });
    };

    const removeColumn = () => {
        if (cells[0]?.length <= 1) return;
        const newCells = cells.map((row) => row.slice(0, -1));
        onChange({
            ...data,
            cells: newCells,
            cols: newCells[0]?.length,
        });
    };

    const toggleHeader = () => {
        onChange({ ...data, hasHeader: !data.hasHeader });
    };

    return (
        <div
            className={`table-block ${isSelected ? 'ring-2 ring-blue-500 rounded-md' : ''}`}
            onClick={onFocus}
        >
            {/* Toolbar */}
            {isSelected && (
                <div className="p-3 bg-gray-50 rounded-md border border-gray-100 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Row Controls */}
                        <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
                            <span className="text-xs text-gray-500">Rows:</span>
                            <button
                                onClick={removeRow}
                                disabled={cells.length <= 1}
                                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                −
                            </button>
                            <span className="text-xs text-gray-700 w-4 text-center">{cells.length}</span>
                            <button
                                onClick={addRow}
                                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded"
                            >
                                +
                            </button>
                        </div>

                        {/* Column Controls */}
                        <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
                            <span className="text-xs text-gray-500">Cols:</span>
                            <button
                                onClick={removeColumn}
                                disabled={cells[0]?.length <= 1}
                                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                −
                            </button>
                            <span className="text-xs text-gray-700 w-4 text-center">{cells[0]?.length || 0}</span>
                            <button
                                onClick={addColumn}
                                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded"
                            >
                                +
                            </button>
                        </div>

                        {/* Header Toggle */}
                        <button
                            onClick={toggleHeader}
                            className={`px-2 py-1 text-xs rounded ${data.hasHeader
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'text-gray-500 hover:bg-gray-200'
                                }`}
                        >
                            {data.hasHeader ? 'Header ON' : 'Header OFF'}
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <tbody>
                        {cells.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {row.map((cell, colIndex) => {
                                    const isHeader = data.hasHeader && rowIndex === 0;
                                    const CellTag = isHeader ? 'th' : 'td';
                                    const isEditing =
                                        editingCell?.row === rowIndex && editingCell?.col === colIndex;

                                    return (
                                        <CellTag
                                            key={colIndex}
                                            className={`border border-gray-200 p-2 ${isHeader ? 'bg-gray-50 font-semibold' : 'bg-white'
                                                }`}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setEditingCell({ row: rowIndex, col: colIndex });
                                                }
                                            }}
                                        >
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={cell}
                                                    onChange={(e) =>
                                                        updateCell(rowIndex, colIndex, e.target.value)
                                                    }
                                                    onBlur={() => setEditingCell(null)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === 'Tab') {
                                                            e.preventDefault();
                                                            setEditingCell(null);
                                                        }
                                                    }}
                                                    autoFocus
                                                    className="w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                                                />
                                            ) : (
                                                <span className="cursor-text">{cell}</span>
                                            )}
                                        </CellTag>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {!isSelected && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                    Click to edit table cells
                </p>
            )}
        </div>
    );
}
