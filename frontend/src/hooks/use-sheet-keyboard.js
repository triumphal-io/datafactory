import { useEffect } from 'react';

/**
 * Hook that registers global keyboard handlers for spreadsheet interactions.
 * Handles Escape (clear selection), Ctrl+C (copy), Backspace/Delete (clear cells), and paste.
 *
 * @param {Object} params
 * @param {function} params.clearSelection - Clears all cell/row/column selections
 * @param {Set<string>} params.selectedCells - Currently selected cell keys ("rowIndex-colIndex")
 * @param {Object} params.sheetData - Sheet data object ({columns, rows})
 * @param {function} params.setSheetData - Setter for sheet data state
 * @param {Object|null} params.currentEditingCell - Cell currently being edited, or null
 * @param {function} params.setCurrentEditingCell - Setter for the editing cell
 * @param {boolean} params.overlayEditor - Whether the overlay editor is open
 * @param {function} params.handleMultiLinePaste - Handler for multi-line paste operations
 * @param {React.RefObject} params.lastClickedCellRef - Ref to the last clicked cell position
 */
export const useSheetKeyboard = ({
    clearSelection,
    selectedCells,
    sheetData,
    setSheetData,
    currentEditingCell,
    setCurrentEditingCell,
    overlayEditor,
    handleMultiLinePaste,
    lastClickedCellRef,
}) => {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !currentEditingCell) {
                clearSelection();
                setCurrentEditingCell(null);
            }

            // Copy selected cells on Ctrl+C or Cmd+C
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' &&
                !currentEditingCell &&
                !overlayEditor &&
                selectedCells.size > 0 &&
                !e.target.closest('.assistant') &&
                e.target.tagName !== 'TEXTAREA' &&
                e.target.tagName !== 'INPUT') {
                e.preventDefault();

                // Get all selected cells and organize by row/column
                const cellPositions = Array.from(selectedCells).map(cellKey => {
                    const [row, col] = cellKey.split('-').map(Number);
                    return { row, col };
                });

                // Find the bounding box of selected cells
                const minRow = Math.min(...cellPositions.map(p => p.row));
                const maxRow = Math.max(...cellPositions.map(p => p.row));
                const minCol = Math.min(...cellPositions.map(p => p.col));
                const maxCol = Math.max(...cellPositions.map(p => p.col));

                // Build the grid of selected cells
                const copyData = [];
                for (let row = minRow; row <= maxRow; row++) {
                    const rowData = [];
                    for (let col = minCol; col <= maxCol; col++) {
                        if (selectedCells.has(`${row}-${col}`)) {
                            const cellData = sheetData.rows[row]?.[col];
                            // Extract value from cell (handles both simple values and metadata objects)
                            let cellValue = '';
                            if (cellData !== null && cellData !== undefined) {
                                if (typeof cellData === 'object' && cellData.value !== undefined) {
                                    cellValue = cellData.value;
                                } else {
                                    cellValue = cellData;
                                }
                            }
                            // Remove status markers if present
                            const cleanValue = typeof cellValue === 'string' && cellValue.startsWith('__STATUS__')
                                ? ''
                                : cellValue;
                            rowData.push(cleanValue);
                        } else {
                            rowData.push('');
                        }
                    }
                    copyData.push(rowData.join('\t'));
                }

                const textToCopy = copyData.join('\n');
                navigator.clipboard.writeText(textToCopy).then(() => {
                    console.log(`Copied ${selectedCells.size} cell(s) to clipboard`);
                }).catch(err => {
                    console.error('Failed to copy to clipboard:', err);
                });
            }

            // Clear selected cells on Backspace or Delete (only when not editing)
            // Don't handle if target is assistant, textarea, or input elements
            if ((e.key === 'Backspace' || e.key === 'Delete') &&
                !currentEditingCell &&
                !overlayEditor &&
                selectedCells.size > 0 &&
                !e.target.closest('.assistant') &&
                e.target.tagName !== 'TEXTAREA' &&
                e.target.tagName !== 'INPUT') {
                e.preventDefault();

                // Clear all selected cells
                setSheetData(prev => ({
                    ...prev,
                    rows: prev.rows.map((row, rowIndex) =>
                        row.map((cell, colIndex) => {
                            const cellKey = `${rowIndex}-${colIndex}`;
                            return selectedCells.has(cellKey) ? '' : cell;
                        })
                    )
                }));
            }
        };

        const handlePaste = (e) => {
            // Don't handle paste if target is assistant or other input/textarea elements
            if (e.target.closest('.assistant') || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                return;
            }

            if (!currentEditingCell && lastClickedCellRef.current) {
                e.preventDefault();
                const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                if (pastedText.trim()) {
                    handleMultiLinePaste(lastClickedCellRef.current, pastedText);
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('paste', handlePaste);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('paste', handlePaste);
        };
    }, [clearSelection, currentEditingCell, overlayEditor, handleMultiLinePaste, selectedCells, sheetData, setSheetData, setCurrentEditingCell, lastClickedCellRef]);
};
