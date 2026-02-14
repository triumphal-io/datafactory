import { useState, useCallback } from 'react';

/**
 * Hook for managing spreadsheet cell, row, and column selection state.
 * Provides methods for selecting, deselecting, toggling, and range-selecting cells.
 *
 * @returns {{
 *   selectedCells: Set<string>,
 *   setSelectedCells: function,
 *   selectedRows: Set<number>,
 *   setSelectedRows: function,
 *   selectedColumns: Set<number>,
 *   setSelectedColumns: function,
 *   selectCell: (rowIndex: number, colIndex: number) => void,
 *   deselectCell: (rowIndex: number, colIndex: number) => void,
 *   toggleCellSelection: (rowIndex: number, colIndex: number, event: MouseEvent) => void,
 *   selectCellRange: (startRow: number, startCol: number, endRow: number, endCol: number) => void,
 *   clearSelection: () => void,
 *   checkCompleteRowsSelected: (sheetData: Object) => number[],
 *   checkCompleteColumnsSelected: (sheetData: Object) => number[]
 * }}
 */
export const useSheetSelection = () => {
    const [selectedCells, setSelectedCells] = useState(new Set());
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [selectedColumns, setSelectedColumns] = useState(new Set());

    const selectCell = useCallback((rowIndex, colIndex) => {
        setSelectedCells(prev => {
            const newSet = new Set(prev);
            newSet.add(`${rowIndex}-${colIndex}`);
            return newSet;
        });
    }, []);

    const deselectCell = useCallback((rowIndex, colIndex) => {
        setSelectedCells(prev => {
            const newSet = new Set(prev);
            newSet.delete(`${rowIndex}-${colIndex}`);
            return newSet;
        });
    }, []);

    const toggleCellSelection = useCallback((rowIndex, colIndex, event) => {
        const cellKey = `${rowIndex}-${colIndex}`;
        if (event.ctrlKey || event.metaKey) {
            setSelectedCells(prev => {
                const newSet = new Set(prev);
                if (newSet.has(cellKey)) {
                    newSet.delete(cellKey);
                } else {
                    newSet.add(cellKey);
                }
                return newSet;
            });
        } else {
            setSelectedCells(new Set([cellKey]));
        }
    }, []);

    const selectCellRange = useCallback((startRow, startCol, endRow, endCol) => {
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        const newSelection = new Set();
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                newSelection.add(`${row}-${col}`);
            }
        }
        setSelectedCells(newSelection);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedCells(new Set());
        setSelectedRows(new Set());
        setSelectedColumns(new Set());
    }, []);

    const checkCompleteRowsSelected = useCallback((sheetData) => {
        const totalColumns = sheetData.columns.length;
        if (totalColumns === 0) return [];

        const rowsWithAllCellsSelected = [];
        sheetData.rows.forEach((_, rowIndex) => {
            let allCellsSelected = true;
            for (let colIndex = 0; colIndex < totalColumns; colIndex++) {
                if (!selectedCells.has(`${rowIndex}-${colIndex}`)) {
                    allCellsSelected = false;
                    break;
                }
            }
            if (allCellsSelected) {
                rowsWithAllCellsSelected.push(rowIndex);
            }
        });
        return rowsWithAllCellsSelected;
    }, [selectedCells]);

    const checkCompleteColumnsSelected = useCallback((sheetData) => {
        const totalRows = sheetData.rows.length;
        const totalColumns = sheetData.columns.length;
        const columnsWithAllCellsSelected = [];

        for (let colIndex = 0; colIndex < totalColumns; colIndex++) {
            let allCellsSelected = true;
            for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
                if (!selectedCells.has(`${rowIndex}-${colIndex}`)) {
                    allCellsSelected = false;
                    break;
                }
            }
            if (allCellsSelected) {
                columnsWithAllCellsSelected.push(colIndex);
            }
        }
        return columnsWithAllCellsSelected;
    }, [selectedCells]);

    return {
        selectedCells,
        setSelectedCells,
        selectedRows,
        setSelectedRows,
        selectedColumns,
        setSelectedColumns,
        selectCell,
        deselectCell,
        toggleCellSelection,
        selectCellRange,
        clearSelection,
        checkCompleteRowsSelected,
        checkCompleteColumnsSelected,
    };
};
