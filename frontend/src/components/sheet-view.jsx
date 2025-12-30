import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import IconStar from '../assets/logo-icon.svg';
import IconDelete from '../assets/delete.svg';
import IconAdd from '../assets/add-circle.svg';
import IconExport from '../assets/export.svg';
import { apiFetch } from '../utils/api';

// Inject CSS for enrichment status indicators
if (typeof document !== 'undefined' && !document.getElementById('enrichment-styles')) {
    const style = document.createElement('style');
    style.id = 'enrichment-styles';
    style.textContent = `
        .enrichment-status {
            pointer-events: none;
            user-select: none;
        }
    `;
    document.head.appendChild(style);
}

const SheetView = forwardRef(({ documentId, sheetId, onSavingChange, onLastSavedChange, onNavigationChange }, ref) => {
    // State management
    const [selectedCells, setSelectedCells] = useState(new Set());
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [selectedColumns, setSelectedColumns] = useState(new Set());
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartCell, setDragStartCell] = useState(null);
    const [currentEditingCell, setCurrentEditingCell] = useState(null);
    const [enrichText, setEnrichText] = useState('Enrich');
    const [showDeleteRow, setShowDeleteRow] = useState(false);
    const [showDeleteColumn, setShowDeleteColumn] = useState(false);
    const [showPopup, setShowPopup] = useState(false);
    const [editingColumn, setEditingColumn] = useState(null);
    const [columnTitle, setColumnTitle] = useState('');
    const [columnPrompt, setColumnPrompt] = useState('');
    const [sheetData, setSheetData] = useState({
        columns: [],
        rows: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [columnWidths, setColumnWidths] = useState({});
    const [isResizing, setIsResizing] = useState(false);
    const [resizingColumn, setResizingColumn] = useState(null);
    const [overlayEditor, setOverlayEditor] = useState(null);

    const sheetContentRef = useRef(null);
    const lastClickedCellRef = useRef(null);
    const isSelectionModeRef = useRef(false);
    const clickTimerRef = useRef(null);
    const saveTimerRef = useRef(null);
    const resizeStartXRef = useRef(null);
    const resizeStartWidthRef = useRef(null);
    const loadedDataRef = useRef(null);

    // Load data from JSON on mount
    useEffect(() => {
        const loadSheetData = async () => {
            try {
                setIsLoading(true);
                const response = await apiFetch(`/api/documents/${documentId}/sheets/${sheetId}`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.sheet_data) {
                        setSheetData(data.sheet_data);
                        loadedDataRef.current = JSON.stringify(data.sheet_data);
                        if (onLastSavedChange) {
                            onLastSavedChange(new Date(data.last_modified));
                        }
                        console.log('Sheet data loaded from server');
                    }
                } else if (response.status === 404) {
                    // Sheet doesn't exist yet, start with empty data
                    const emptyData = { columns: [], rows: [] };
                    console.log('No existing sheet found, starting with empty data');
                    setSheetData(emptyData);
                    loadedDataRef.current = JSON.stringify(emptyData);
                } else {
                    throw new Error('Failed to load sheet data');
                }
            } catch (error) {
                console.error('Error loading sheet data:', error);
                // Fall back to empty data on error
                const emptyData = { columns: [], rows: [] };
                setSheetData(emptyData);
                loadedDataRef.current = JSON.stringify(emptyData);
            } finally {
                setIsLoading(false);
            }
        };

        loadSheetData();
    }, [documentId, sheetId, onLastSavedChange]);

    // Update enrich text based on selection
    useEffect(() => {
        if (selectedCells.size > 0) {
            const cellText = selectedCells.size === 1 ? 'cell' : 'cells';
            setEnrichText(`Enrich ${selectedCells.size} ${cellText}`);
        } else {
            setEnrichText('Enrich');
        }
    }, [selectedCells]);

    // Auto-save sheet data to server whenever it changes (debounced)
    useEffect(() => {
        // Don't save if still loading initial data
        if (isLoading) return;
        
        // Don't save if data hasn't actually changed from what was loaded
        const currentData = JSON.stringify(sheetData);
        if (currentData === loadedDataRef.current) return;

        // Clear existing timer
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        // Set new timer for debounced save (500ms after last change)
        saveTimerRef.current = setTimeout(async () => {
            try {
                if (onSavingChange) onSavingChange(true);
                const response = await apiFetch(`/api/documents/${documentId}/sheets/${sheetId}`, {
                    method: 'POST',
                    body: {
                        sheet_data: sheetData,
                        last_modified: new Date().toISOString()
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    loadedDataRef.current = JSON.stringify(sheetData);
                    if (onLastSavedChange) {
                        onLastSavedChange(new Date(result.last_modified));
                    }
                    console.log('Sheet data saved successfully');
                } else {
                    throw new Error('Failed to save sheet data');
                }
            } catch (error) {
                console.error('Error saving sheet data:', error);
                // Could show a toast notification here
            } finally {
                if (onSavingChange) onSavingChange(false);
            }
        }, 500);

        // Cleanup function
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, [sheetData, isLoading, documentId, sheetId, onSavingChange, onLastSavedChange]);

    // Update row checkbox states based on cell selection
    useEffect(() => {
        const totalColumns = sheetData.columns.length;
        if (totalColumns === 0) {
            setSelectedRows(new Set());
            return;
        }

        const completelySelectedRows = new Set();
        
        sheetData.rows.forEach((_, rowIndex) => {
            let allCellsSelected = true;
            for (let colIndex = 0; colIndex < totalColumns; colIndex++) {
                if (!selectedCells.has(`${rowIndex}-${colIndex}`)) {
                    allCellsSelected = false;
                    break;
                }
            }
            if (allCellsSelected) {
                completelySelectedRows.add(rowIndex);
            }
        });

        // Update selectedRows to match cells selection
        setSelectedRows(completelySelectedRows);
    }, [selectedCells, sheetData]);

    // Update delete button visibility
    useEffect(() => {
        const totalColumns = sheetData.columns.length;
        const totalRows = sheetData.rows.length;
        const completeRowsSelected = checkCompleteRowsSelected();
        const completeColumnsSelected = checkCompleteColumnsSelected();

        setShowDeleteRow(
            totalColumns > 0 && 
            totalRows > 0 && 
            (selectedRows.size > 0 || completeRowsSelected.length > 0)
        );

        setShowDeleteColumn(
            totalColumns > 0 && 
            (selectedColumns.size > 0 || completeColumnsSelected.length > 0)
        );
    }, [selectedCells, selectedRows, selectedColumns, sheetData]);

    // Cell selection functions
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

    // Check complete row/column selection
    const checkCompleteRowsSelected = useCallback(() => {
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
    }, [selectedCells, sheetData]);

    const checkCompleteColumnsSelected = useCallback(() => {
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
    }, [selectedCells, sheetData]);

    // Column management
    const handleAddColumn = useCallback(() => {
        if (!columnTitle.trim()) return;

        if (editingColumn !== null) {
            // Update existing column
            setSheetData(prev => ({
                ...prev,
                columns: prev.columns.map((col, idx) =>
                    idx === editingColumn
                        ? { title: columnTitle, prompt: columnPrompt }
                        : col
                )
            }));
        } else {
            // Add new column
            setSheetData(prev => ({
                ...prev,
                columns: [...prev.columns, { title: columnTitle, prompt: columnPrompt }],
                rows: prev.rows.map(row => [...row, ''])
            }));
        }

        setShowPopup(false);
        setColumnTitle('');
        setColumnPrompt('');
        setEditingColumn(null);
    }, [columnTitle, columnPrompt, editingColumn]);

    const handleDeleteColumns = useCallback(() => {
        const columnsToDelete = [
            ...Array.from(selectedColumns),
            ...checkCompleteColumnsSelected()
        ];
        const uniqueColumns = [...new Set(columnsToDelete)].sort((a, b) => b - a);

        if (uniqueColumns.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${uniqueColumns.length} column(s)?`)) return;

        setSheetData(prev => ({
            ...prev,
            columns: prev.columns.filter((_, idx) => !uniqueColumns.includes(idx)),
            rows: prev.rows.map(row =>
                row.filter((_, idx) => !uniqueColumns.includes(idx))
            )
        }));

        clearSelection();
    }, [selectedColumns, checkCompleteColumnsSelected, clearSelection]);

    // Row management
    const handleAddRow = useCallback(() => {
        setSheetData(prev => ({
            ...prev,
            rows: [...prev.rows, new Array(prev.columns.length).fill('')]
        }));
    }, []);

    const handleDeleteRows = useCallback(() => {
        const rowsToDelete = [
            ...Array.from(selectedRows),
            ...checkCompleteRowsSelected()
        ];
        const uniqueRows = [...new Set(rowsToDelete)].sort((a, b) => b - a);

        if (uniqueRows.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${uniqueRows.length} row(s)?`)) return;

        setSheetData(prev => ({
            ...prev,
            rows: prev.rows.filter((_, idx) => !uniqueRows.includes(idx))
        }));

        clearSelection();
    }, [selectedRows, checkCompleteRowsSelected, clearSelection]);

    // Cell editing
    const handleCellEdit = useCallback((rowIndex, colIndex, value) => {
        setSheetData(prev => ({
            ...prev,
            rows: prev.rows.map((row, rIdx) =>
                rIdx === rowIndex
                    ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell))
                    : row
            )
        }));
    }, []);

    // Enrichment utilities
    const setCellStatus = useCallback((rowIndex, colIndex, status) => {
        const statusMap = {
            queued: { text: 'Queued', color: '#f59e0b' },
            generating: { text: 'Generating...', color: '#10b981' },
            error: { text: 'Error', color: '#ef4444' }
        };
        
        const statusInfo = statusMap[status];
        if (!statusInfo) return;
        
        const statusContent = `<div style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: white;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusInfo.color};"></div>
            <span>${statusInfo.text}</span>
        </div>`;
        
        setSheetData(prev => ({
            ...prev,
            rows: prev.rows.map((row, rIdx) =>
                rIdx === rowIndex
                    ? row.map((cell, cIdx) => 
                        cIdx === colIndex ? `__STATUS__${statusContent}` : cell
                    )
                    : row
            )
        }));
    }, []);

    const generateMockEnrichedValue = useCallback((cellData) => {
        const { title, value } = cellData;
        const columnLower = title.toLowerCase();
        
        if (columnLower.includes('category')) {
            const categories = ['Software', 'Productivity', 'Communication', 'Design', 'Project Management'];
            return categories[Math.floor(Math.random() * categories.length)];
        } else if (columnLower.includes('price')) {
            const prices = ['$9.99/month', '$19.99/month', '$29.99/month', '$49.99/month', '$99.99/month'];
            return prices[Math.floor(Math.random() * prices.length)];
        } else if (columnLower.includes('description')) {
            return `AI-generated description for ${value}`;
        } else if (columnLower.includes('email') || columnLower.includes('contact')) {
            return `contact@${value.toLowerCase().replace(/\s+/g, '')}.com`;
        } else if (columnLower.includes('website') || columnLower.includes('url')) {
            return `https://www.${value.toLowerCase().replace(/\s+/g, '')}.com`;
        } else {
            return `Enriched: ${value}`;
        }
    }, []);

    const processEnrichmentQueue = useCallback(async (cellsToEnrich, currentIndex) => {
        if (currentIndex >= cellsToEnrich.length) {
            console.log('All cells enriched successfully');
            return;
        }

        const cellData = cellsToEnrich[currentIndex];
        const { position } = cellData;
        
        try {
            setCellStatus(position.Row, position.Column, 'generating');
            
            // Simulate API call with 2 second delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log('Sending cell data to API:', cellData);
            
            const response = await apiFetch('/api/enrich/do', {
                method: 'POST',
                body: {
                    action: 'enrich',
                    data: cellData
                }
            });
            
            const result = await response.json();
            const enrichedValue = result.status === 'success' ? result.result : cellData.value;
            
            // const enrichedValue = generateMockEnrichedValue(cellData);
            handleCellEdit(position.Row, position.Column, enrichedValue);
            
            console.log(`Enriched cell at row ${position.Row}, col ${position.Column}: "${enrichedValue}"`);
        } catch (error) {
            console.error('Error enriching cell:', error);
            setCellStatus(position.Row, position.Column, 'error');
            await new Promise(resolve => setTimeout(resolve, 1000));
            handleCellEdit(position.Row, position.Column, cellData.value);
        }
        
        processEnrichmentQueue(cellsToEnrich, currentIndex + 1);
    }, [setCellStatus, generateMockEnrichedValue, handleCellEdit]);

    // Enrichment
    const handleEnrichCells = useCallback(async () => {
        if (selectedCells.size === 0) {
            alert('No cells selected for enrichment');
            return;
        }

        // Cache header cells for better performance
        const headerCellsMap = new Map();
        sheetData.columns.forEach((col, idx) => {
            headerCellsMap.set(idx.toString(), {
                name: col.title,
                description: col.prompt || `No description found for column ${idx}`
            });
        });

        const cellsToEnrich = Array.from(selectedCells).map(cellKey => {
            const [rowIndex, colIndex] = cellKey.split('-').map(Number);
            const column = sheetData.columns[colIndex];
            const value = sheetData.rows[rowIndex][colIndex];

            // Get row context (only non-empty values)
            const rowData = {};
            sheetData.columns.forEach((col, idx) => {
                const cellValue = sheetData.rows[rowIndex][idx];
                if (cellValue && !cellValue.startsWith('__STATUS__')) {
                    rowData[col.title] = cellValue;
                }
            });

            return {
                context: rowData,
                position: { Row: rowIndex, Column: colIndex },
                title: column.title,
                description: column.prompt || `Generate data for ${column.title} column`,
                value: value
            };
        });

        console.log('Formatted data for enrichment:', cellsToEnrich);
        console.log(cellsToEnrich.length + ' cells to enrich');

        if (cellsToEnrich.length === 0) return;

        // Set all selected cells to "Queued" status immediately
        cellsToEnrich.forEach(cellData => {
            setCellStatus(cellData.position.Row, cellData.position.Column, 'queued');
        });

        // Clear the selection after setting queued status
        clearSelection();

        // Start processing cells sequentially
        processEnrichmentQueue(cellsToEnrich, 0);
    }, [selectedCells, sheetData, setCellStatus, clearSelection, processEnrichmentQueue]);

    // Popup handlers
    const openPopupForNewColumn = useCallback(() => {
        setEditingColumn(null);
        setColumnTitle('');
        setColumnPrompt('');
        setShowPopup(true);
    }, []);

    const openPopupForEditColumn = useCallback((colIndex) => {
        setEditingColumn(colIndex);
        setColumnTitle(sheetData.columns[colIndex].title);
        setColumnPrompt(sheetData.columns[colIndex].prompt || '');
        setShowPopup(true);
    }, [sheetData]);

    // Handle mouse events for cell selection
    const handleCellMouseDown = useCallback((rowIndex, colIndex, event) => {
        if (currentEditingCell || overlayEditor) return;
        
        event.preventDefault();
        
        // Track the last clicked cell for paste operations
        lastClickedCellRef.current = { row: rowIndex, col: colIndex };
        
        // Toggle individual cell selection with Ctrl
        if (event.ctrlKey || event.metaKey) {
            toggleCellSelection(rowIndex, colIndex, event);
            return;
        }
        
        // Clear previous selections when starting new selection without Ctrl
        clearSelection();
        
        // Start drag selection
        setIsDragging(true);
        setDragStartCell({ row: rowIndex, col: colIndex });
        selectCell(rowIndex, colIndex);
        isSelectionModeRef.current = true;
    }, [currentEditingCell, overlayEditor, toggleCellSelection, clearSelection, selectCell]);

    const handleCellMouseUp = useCallback(() => {
        // Handled by global mouseup
    }, []);
    
    const handleCellClick = useCallback((rowIndex, colIndex, event) => {
        if (isSelectionModeRef.current) {
            event.preventDefault();
            return;
        }
        
        // Track the last clicked cell for paste operations
        lastClickedCellRef.current = { row: rowIndex, col: colIndex };
    }, []);
    
    const handleHeaderClick = useCallback((colIndex, event) => {
        event.preventDefault();
        
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
            return; // This is a double-click
        }
        
        clickTimerRef.current = setTimeout(() => {
            // Single click - select entire column
            clearSelection();
            
            const newSelection = new Set();
            sheetData.rows.forEach((_, rowIndex) => {
                newSelection.add(`${rowIndex}-${colIndex}`);
            });
            setSelectedCells(newSelection);
            setSelectedColumns(new Set([colIndex]));
            
            clickTimerRef.current = null;
        }, 200);
    }, [sheetData, clearSelection]);
    
    const handleHeaderDoubleClick = useCallback((colIndex, event) => {
        event.preventDefault();
        
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
        }
        
        openPopupForEditColumn(colIndex);
    }, [openPopupForEditColumn]);
    
    const handleResizeMouseDown = useCallback((colIndex, event) => {
        event.preventDefault();
        event.stopPropagation();
        
        setIsResizing(true);
        setResizingColumn(colIndex);
        resizeStartXRef.current = event.clientX;
        resizeStartWidthRef.current = columnWidths[colIndex] || 160;
    }, [columnWidths]);
    
    const handleResizeMouseMove = useCallback((event) => {
        if (!isResizing || resizingColumn === null) return;
        
        const deltaX = event.clientX - resizeStartXRef.current;
        const newWidth = Math.max(60, resizeStartWidthRef.current + deltaX);
        
        setColumnWidths(prev => ({
            ...prev,
            [resizingColumn]: newWidth
        }));
    }, [isResizing, resizingColumn]);
    
    const handleResizeMouseUp = useCallback(() => {
        setIsResizing(false);
        setResizingColumn(null);
        resizeStartXRef.current = null;
        resizeStartWidthRef.current = null;
    }, []);
    
    const handleSelectAllRows = useCallback((checked) => {
        if (checked) {
            // Select all cells in data rows
            const newSelection = new Set();
            
            sheetData.rows.forEach((row, rowIndex) => {
                for (let colIndex = 0; colIndex < sheetData.columns.length; colIndex++) {
                    newSelection.add(`${rowIndex}-${colIndex}`);
                }
            });
            
            setSelectedCells(newSelection);
            // selectedRows will be updated automatically by the effect
        } else {
            clearSelection();
        }
    }, [sheetData, clearSelection]);
    
    const handleRowCheckboxChange = useCallback((rowIndex, checked) => {
        const totalColumns = sheetData.columns.length;
        
        if (checked) {
            // Select all cells in this row
            setSelectedCells(prev => {
                const newSet = new Set(prev);
                for (let colIndex = 0; colIndex < totalColumns; colIndex++) {
                    newSet.add(`${rowIndex}-${colIndex}`);
                }
                return newSet;
            });
            // selectedRows will be updated automatically by the effect
        } else {
            // Deselect all cells in this row
            setSelectedCells(prev => {
                const newSet = new Set(prev);
                for (let colIndex = 0; colIndex < totalColumns; colIndex++) {
                    newSet.delete(`${rowIndex}-${colIndex}`);
                }
                return newSet;
            });
            // selectedRows will be updated automatically by the effect
        }
    }, [sheetData]);

    const handleCellMouseEnter = useCallback((rowIndex, colIndex) => {
        if (isDragging && dragStartCell) {
            selectCellRange(
                dragStartCell.row,
                dragStartCell.col,
                rowIndex,
                colIndex
            );
        }
    }, [isDragging, dragStartCell, selectCellRange]);

    // Global mouse up listener
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                setDragStartCell(null);
                setTimeout(() => {
                    isSelectionModeRef.current = false;
                }, 10);
            }
        };

        document.addEventListener('mouseup', handleGlobalMouseUp);
        return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isDragging]);

    // Column resize listeners
    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleResizeMouseMove);
            document.addEventListener('mouseup', handleResizeMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleResizeMouseMove);
                document.removeEventListener('mouseup', handleResizeMouseUp);
            };
        }
    }, [isResizing, handleResizeMouseMove, handleResizeMouseUp]);

    // Click outside to deselect cells and close overlay editor
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Close overlay editor if clicking outside of it
            if (overlayEditor) {
                const textarea = event.target.closest('textarea[data-overlay-editor]');
                if (!textarea) {
                    // Save and close the overlay editor
                    const editorTextarea = document.querySelector('textarea[data-overlay-editor]');
                    if (editorTextarea) {
                        handleCellEdit(overlayEditor.row, overlayEditor.col, editorTextarea.value);
                    }
                    setOverlayEditor(null);
                    return;
                }
                return; // If clicking inside the textarea, do nothing
            }
            
            // Don't deselect if currently editing a cell
            if (currentEditingCell) return;
            
            // Don't deselect if clicking on popup or buttons in the navigation bar
            if (event.target.closest('.popup') || event.target.closest('.sheet-nav')) {
                return;
            }
            
            // Don't deselect if clicking on actual grid elements (cells, headers, row heads)
            if (event.target.closest('.sheet-row-item') ||
                event.target.closest('.sheet-row-head') ||
                event.target.closest('.header-cell')) {
                return;
            }
            
            // Deselect if clicking inside sheet-content but outside sheet-grid-container
            const clickedInsideContent = sheetContentRef.current && sheetContentRef.current.contains(event.target);
            const clickedInsideGrid = event.target.closest('.sheet-grid-container');
            
            if (clickedInsideContent && !clickedInsideGrid) {
                clearSelection();
                return;
            }
            
            // Deselect if clicking completely outside the sheet content
            if (sheetContentRef.current && !sheetContentRef.current.contains(event.target)) {
                clearSelection();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [currentEditingCell, overlayEditor, clearSelection, handleCellEdit]);

    // Paste handling helper
    const handleMultiLinePaste = useCallback((cellRef, pastedText) => {
        const lines = pastedText.split(/\r?\n/).filter(line => line.trim() !== '');
        
        if (lines.length === 0) return;
        
        const { row: startRow, col: startCol } = cellRef;
        clearSelection();
        
        const newRows = [...sheetData.rows];
        const newColumns = [...sheetData.columns];
        
        lines.forEach((line, rowOffset) => {
            const columns = line.split('\t');
            const targetRowIndex = startRow + rowOffset;
            
            // Create rows if needed
            while (targetRowIndex >= newRows.length) {
                newRows.push(new Array(newColumns.length).fill(''));
            }
            
            columns.forEach((cellValue, colOffset) => {
                const targetColIndex = startCol + colOffset;
                
                // Create columns if needed
                while (targetColIndex >= newColumns.length) {
                    newColumns.push({
                        title: `Column ${newColumns.length + 1}`,
                        prompt: `Auto-generated column ${newColumns.length + 1}`
                    });
                    newRows.forEach(row => row.push(''));
                }
                
                newRows[targetRowIndex][targetColIndex] = cellValue.trim();
                
                // Select pasted cells
                setSelectedCells(prev => {
                    const newSet = new Set(prev);
                    newSet.add(`${targetRowIndex}-${targetColIndex}`);
                    return newSet;
                });
            });
        });
        
        setSheetData({ columns: newColumns, rows: newRows });
        console.log(`Pasted ${lines.length} rows starting from row ${startRow + 1}, column ${startCol + 1}`);
    }, [sheetData, clearSelection]);

    // Export data as JSON file
    const handleExportJSON = useCallback(() => {
        const dataToExport = {
            documentId: documentId,
            sheetId: sheetId,
            sheetData: sheetData,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `document-${documentId}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('Sheet data exported as JSON');
    }, [sheetData, documentId, sheetId]);

    // Keyboard shortcuts and paste handler
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !currentEditingCell) {
                clearSelection();
                setCurrentEditingCell(null);
            }
            
            // Clear selected cells on Backspace or Delete (only when not editing)
            if ((e.key === 'Backspace' || e.key === 'Delete') && !currentEditingCell && !overlayEditor && selectedCells.size > 0) {
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
    }, [clearSelection, currentEditingCell, overlayEditor, handleMultiLinePaste, selectedCells]);

    // Update parent component with navigation menu whenever it changes
    useEffect(() => {
        if (onNavigationChange) {
            onNavigationChange(
                <div className="flex flex-row-center">
                <div 
                    onClick={handleEnrichCells}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconStar} alt="Star Icon" height="16" />
                    <p className="text--micro">{enrichText}</p>
                </div>
                
                {showDeleteRow && (
                    <div 
                        onClick={handleDeleteRows}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                    >
                        <img src={IconDelete} alt="Delete Icon" height="16" />
                        <p className="text--micro">Delete Row</p>
                    </div>
                )}
                
                {showDeleteColumn && (
                    <div 
                        onClick={handleDeleteColumns}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                    >
                        <img src={IconDelete} alt="Delete Icon" height="16" />
                        <p className="text--micro">Delete Column</p>
                    </div>
                )}
                
                <div 
                    onClick={handleAddRow}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconAdd} alt="Add Icon" height="16" />
                    <p className="text--micro">Add Row</p>
                </div>
                
                <div 
                    onClick={openPopupForNewColumn}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconAdd} alt="Add Icon" height="16" />
                    <p className="text--micro">Add Column</p>
                </div>
                
                <div 
                    onClick={handleExportJSON}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconExport} alt="Export Icon" height="16" />
                    <p className="text--micro">Export JSON</p>
                </div>
            </div>
            );
        }
    }, [onNavigationChange, enrichText, showDeleteRow, showDeleteColumn, handleEnrichCells, handleDeleteRows, handleDeleteColumns, handleAddRow, openPopupForNewColumn, handleExportJSON]);

    // Expose navigation menu to parent component (for imperative access if needed)
    useImperativeHandle(ref, () => ({
        // Can add imperative methods here if needed in future
    }), []);

    return (
        <>
            {/* Sheet Content Area */}
            <div 
                ref={sheetContentRef}
                className="sheet-content flex-expanded scroll-x scroll-y thin-scroll"
            >
                {isLoading ? (
                    <div className="flex flex-column flex-center" style={{ padding: '40px' }}>
                        <p style={{ color: '#6b7280' }}>Loading sheet data...</p>
                    </div>
                ) : (
                    <div className="sheet-grid-container">
                        {/* Header Row */}
                        <div className="sheet-row header-row">
                            <div className="sheet-row-head">
                                <input 
                                    type="checkbox" 
                                    className="cbx" 
                                    id="cbxbnall"
                                    style={{ display: 'none' }}
                                    checked={sheetData.rows.length > 0 && selectedRows.size === sheetData.rows.length}
                                    onChange={(e) => handleSelectAllRows(e.target.checked)}
                                />
                                <label className="check" htmlFor="cbxbnall">
                                    <svg width="16px" height="16px" viewBox="0 0 18 18">
                                        <path d="M1,9 L1,3.5 C1,2 2,1 3.5,1 L14.5,1 C16,1 17,2 17,3.5 L17,14.5 C17,16 16,17 14.5,17 L3.5,17 C2,17 1,16 1,14.5 L1,9 Z"></path>
                                        <polyline points="1 9 7 14 15 4"></polyline>
                                    </svg>
                                </label>
                            </div>
                            {sheetData.columns.map((column, colIndex) => (
                                <div
                                    key={colIndex}
                                    className={`sheet-row-item header-cell ${
                                        selectedColumns.has(colIndex) ? 'column-selected' : ''
                                    }`}
                                    style={{ width: `${columnWidths[colIndex] || 160}px` }}
                                    data-col={colIndex}
                                    data-description={column.prompt}
                                    onClick={(e) => handleHeaderClick(colIndex, e)}
                                    onDoubleClick={(e) => handleHeaderDoubleClick(colIndex, e)}
                                >
                                    {column.title}
                                    <div
                                        className="column-resize-handle"
                                        onMouseDown={(e) => handleResizeMouseDown(colIndex, e)}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Data Rows */}
                        {sheetData.rows.map((row, rowIndex) => (
                            <div key={rowIndex} className="sheet-row">
                                <div className="sheet-row-head" data-row={rowIndex}>
                                    <span className="row-number">{rowIndex + 1}</span>
                                    <input 
                                        type="checkbox"
                                        className="cbx row-checkbox"
                                        id={`cbxbn${rowIndex + 1}`}
                                        style={{ display: 'none' }}
                                        checked={selectedRows.has(rowIndex)}
                                        onChange={(e) => handleRowCheckboxChange(rowIndex, e.target.checked)}
                                    />
                                    <label className="check row-check" htmlFor={`cbxbn${rowIndex + 1}`}>
                                        <svg width="16px" height="16px" viewBox="0 0 18 18">
                                            <path d="M1,9 L1,3.5 C1,2 2,1 3.5,1 L14.5,1 C16,1 17,2 17,3.5 L17,14.5 C17,16 16,17 14.5,17 L3.5,17 C2,17 1,16 1,14.5 L1,9 Z"></path>
                                            <polyline points="1 9 7 14 15 4"></polyline>
                                        </svg>
                                    </label>
                                </div>
                                {row.map((cell, colIndex) => (
                                    <div
                                        key={`${rowIndex}-${colIndex}`}
                                        className={`sheet-row-item ${
                                            selectedCells.has(`${rowIndex}-${colIndex}`) ? 'selected' : ''
                                        }`}
                                        style={{ width: `${columnWidths[colIndex] || 160}px` }}
                                        data-row={rowIndex}
                                        data-col={colIndex}
                                        onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
                                        onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                                        onMouseUp={handleCellMouseUp}
                                        onClick={(e) => handleCellClick(rowIndex, colIndex, e)}
                                        onDoubleClick={(e) => {
                                            e.preventDefault();
                                            
                                            // Don't open editor if already editing
                                            if (overlayEditor) return;
                                            
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const cellValue = cell.startsWith('__STATUS__') ? '' : cell;
                                            setOverlayEditor({
                                                row: rowIndex,
                                                col: colIndex,
                                                value: cellValue,
                                                rect: rect
                                            });
                                        }}
                                    >
                                        {cell.startsWith('__STATUS__') ? (
                                            <div 
                                                className="enrichment-status"
                                                dangerouslySetInnerHTML={{ __html: cell.replace('__STATUS__', '') }}
                                            />
                                        ) : cell}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Overlay Editor */}
            {overlayEditor && (
                <div
                    style={{
                        position: 'fixed',
                        top: overlayEditor.rect.top,
                        left: overlayEditor.rect.left,
                        width: overlayEditor.rect.width,
                        display: 'flex',
                        zIndex: 1000,
                        border: '1.5px solid #0066cc',
                        backgroundColor: '#1e1e1e',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                    }}
                >
                    <textarea
                        key={`${overlayEditor.row}-${overlayEditor.col}`}
                        autoFocus
                        rows={1}
                        data-overlay-editor
                        ref={(el) => {
                            if (el) {
                                el.style.height = 'auto';
                                el.style.height = Math.max(0, el.scrollHeight-18) + 'px';
                            }
                        }}
                        defaultValue={overlayEditor.value}
                        style={{
                            width: '100%',
                            padding: '8px 8px 8px 8px',
                            fontSize: '12px',
                            border: 'none',
                            outline: 'none',
                            resize: 'vertical',
                            backgroundColor: '#1e1e1e',
                            color: '#e0e0e0',
                            fontFamily: 'inherit',
                            overflow: 'hidden'
                        }}
                        onInput={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.max(0, e.target.scrollHeight-18) + 'px';
                        }}
                        onBlur={(e) => {
                            handleCellEdit(overlayEditor.row, overlayEditor.col, e.target.value);
                            setOverlayEditor(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                setOverlayEditor(null);
                            }
                        }}
                    />
                </div>
            )}

            {/* Column Add/Edit Popup */}
            {showPopup && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="pop-add-column flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus" id="popup-title">
                                    {editingColumn !== null ? 'Edit Column' : 'Add Column'}
                                </p>
                                <i className="icon-ic_fluent_dismiss_48_regular text--black i-normal-plus pointer" 
                                   onClick={() => setShowPopup(false)}></i>
                            </div>
                            
                            <p className="text--micro mrgnt-15">Column Title</p>
                            <input
                                type="text"
                                id="column-title"
                                className="form--input wdth-full mrgnt-7"
                                placeholder="Enter column title"
                                value={columnTitle}
                                onChange={(e) => setColumnTitle(e.target.value)}
                            />
                            
                            <p className="text--micro mrgnt-15">Column Prompt (generated)</p>
                            <textarea
                                id="column-prompt"
                                className="form--input wdth-full mrgnt-7 text--black"
                                placeholder="Datafactory will generate a prompt based on the column title"
                                value={columnPrompt}
                                onChange={(e) => setColumnPrompt(e.target.value)}
                            />
                            
                            <button 
                                onClick={handleAddColumn}
                                className="button button-big wdth-full mrgnt-20"
                                id="column-action-btn"
                            >
                                {editingColumn !== null ? 'Update Column' : 'Add Column'}
                            </button>
                            
                            <button 
                                onClick={() => setShowPopup(false)}
                                className="button button-big button-dark wdth-full mrgnt-7"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});

export default SheetView;
