import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import ExcelJS from 'exceljs';
import IconStar from '../assets/logo-icon.svg';
import IconDelete from '../assets/delete.svg';
import IconDeleteBlack from '../assets/delete-black.svg';
import IconAdd from '../assets/add-circle.svg';
import IconAddBlack from '../assets/add-black.svg';
import IconExport from '../assets/export.svg';
import { apiFetch } from '../utils/api';
import { useWebSocket } from '../utils/websocket-context';
import { DEFAULT_AI_MODEL } from '../utils/utils';
import IconCheck from '../assets/checkmark.svg';
import IconDismiss from '../assets/dismiss.svg';
import IconChevronDown from '../assets/chevron-down.svg';
import IconText from '../assets/text.svg';
import IconNumber from '../assets/number.svg';
import IconSelect from '../assets/select.svg';
import IconMultiselect from '../assets/multiselect.svg';
import IconMail from '../assets/mail.svg';
import IconCheckbox from '../assets/checkbox.svg';
import IconUrl from '../assets/url.svg';
import IconFile from '../assets/file.svg';
import IconChevronRight from '../assets/chevron-right-black.svg';
import CellRenderer from './cell-renderer.jsx';

// Helper function to get icon based on column type
const getColumnTypeIcon = (type) => {
    switch (type) {
        case 'text':
            return IconText;
        case 'number':
            return IconNumber;
        case 'checkbox':
            return IconCheckbox;
        case 'select':
            return IconSelect;
        case 'multiselect':
            return IconMultiselect;
        case 'url':
            return IconUrl;
        case 'email':
            return IconMail;
        case 'file':
            return IconFile;
        default:
            return IconText;
    }
};

// Inject CSS for enrichment status indicators and AI changes
if (typeof document !== 'undefined' && !document.getElementById('enrichment-styles')) {
    const style = document.createElement('style');
    style.id = 'enrichment-styles';
    style.textContent = `
        .enrichment-status {
            pointer-events: none;
            user-select: none;
        }
        .ai-pending-change {
            background-color: rgba(34, 197, 94, 0.3) !important;
            // border: 1px solid rgba(34, 197, 94, 0.6) !important;
        }
        @keyframes enrichment-complete-blink {
            0% {
                background-color: rgba(59, 130, 246, 0.6);
            }
            100% {
                background-color: transparent;
            }
        }
        .enrichment-complete-blink {
            animation: enrichment-complete-blink 500ms ease-out forwards;
        }
        @keyframes slideDown {
            from {
                opacity: 0;
                max-height: 0;
                margin-top: 0;
                padding-top: 0;
                padding-bottom: 0;
            }
            to {
                opacity: 1;
                max-height: 200px;
                margin-top: 6px;
                padding-top: 8px;
                padding-bottom: 8px;
            }
        }
    `;
    document.head.appendChild(style);
}

// Helper function to convert column index to Excel-style letter (A, B, C, ..., Z, AA, AB, ...)
const getColumnLetter = (index) => {
    let letter = '';
    let num = index;
    while (num >= 0) {
        letter = String.fromCharCode(65 + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
};

// Helper function to extract display value from cell (handles both simple values and metadata objects)
const getCellValue = (cellData) => {
    if (cellData === null || cellData === undefined) {
        return '';
    }
    // If cell has metadata structure, extract the value
    if (typeof cellData === 'object' && cellData.value !== undefined) {
        return cellData.value;
    }
    // Otherwise return as-is (string, number, etc.)
    return cellData;
};

// Helper function to get cell metadata
const getCellMeta = (cellData) => {
    if (typeof cellData === 'object' && cellData.meta !== undefined) {
        return cellData.meta;
    }
    return null;
};

// Helper function to create cell value with metadata
const createCellWithMeta = (value, meta = null) => {
    return { value, meta };
};

// Helper function to humanize tool execution display
const humanizeToolExecution = (tool) => {
    const { tool: toolName, args, summary } = tool;

    let mainText = '';
    let summaryText = summary;
    switch (toolName) {
        case 'tool_search':
            mainText = `Searched for "${args.keyword || ''}"`;
            // count number "href" occurrences in summary
            const results = (summary.match(/href/g) || []).length;
            summaryText = `Found ${results || 0} results`;
            break;

        case 'tool_web_scraper':
            mainText = `Read ${args.url || ''}`;
            break;

        case 'tool_query_file_data':
            if (args.search_type === 'identifier') {
                mainText = `Searched for ID "${args.query || ''}" in ${args.filename || ''}`;
            } else {
                mainText = `Queried "${args.query || ''}" in ${args.filename || ''}`;
            }
            break;

        case 'tool_get_sheet_data':
            mainText = `Retrieved data from sheet ${args.sheet_identifier || ''}`;
            break;

        case 'tool_read_file':
            mainText = `Read file ${args.file_id || ''}`;
            break;

        default:
            // For unrecognized tools, show tool name and args as JSON
            mainText = (
                <>
                    <span style={{ fontWeight: '600', color: '#e0e0e0' }}>{toolName}</span>
                    {args && Object.keys(args).length > 0 && (
                        <>
                            <br />
                            <span style={{ opacity: 0.8 }}>
                                {JSON.stringify(args, null, 2)}
                            </span>
                        </>
                    )}
                </>
            );
    }

    return { mainText, summary: summaryText || '' };
};

const SheetView = forwardRef(({ workbookId, sheetId, onSavingChange, onLastSavedChange, onNavigationChange, onSelectionChange, selectedModel = DEFAULT_AI_MODEL }, ref) => {
    // WebSocket connection
    const { isConnected } = useWebSocket();
    
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
    const [columnFormat, setColumnFormat] = useState('');
    const [columnType, setColumnType] = useState('text');
    const [showFormatSection, setShowFormatSection] = useState(false);
    const [selectOptions, setSelectOptions] = useState([]);
    const [newOptionValue, setNewOptionValue] = useState('');
    const [sheetData, setSheetData] = useState({
        columns: [],
        rows: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [columnWidths, setColumnWidths] = useState({});
    const [isResizing, setIsResizing] = useState(false);
    const [resizingColumn, setResizingColumn] = useState(null);
    const [overlayEditor, setOverlayEditor] = useState(null);
    const [overlayEditorHeight, setOverlayEditorHeight] = useState(0);
    const [pendingAiChanges, setPendingAiChanges] = useState(new Set());
    const [originalValues, setOriginalValues] = useState({});
    const [availableFiles, setAvailableFiles] = useState([]);
    const [blinkingCells, setBlinkingCells] = useState(new Set());
    const [expandedToolSteps, setExpandedToolSteps] = useState(new Set());

    const sheetContentRef = useRef(null);
    const lastClickedCellRef = useRef(null);
    const isSelectionModeRef = useRef(false);
    const clickTimerRef = useRef(null);
    const saveTimerRef = useRef(null);
    const resizeStartXRef = useRef(null);
    const resizeStartWidthRef = useRef(null);
    const loadedDataRef = useRef(null);
    const autoScrollIntervalRef = useRef(null);
    const lastMousePositionRef = useRef({ x: 0, y: 0 });

    // Load available files for file column type
    useEffect(() => {
        const loadFiles = async () => {
             try {
                // Fetch ALL files for the workbook by adding ?all=true
                const response = await apiFetch(`/api/workbooks/${workbookId}/files/list?all=true`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success' && data.files) {
                        setAvailableFiles(data.files.map(f => f.name));
                    }
                }
            } catch (error) {
                console.error('Error loading files:', error);
            }
        };
        
        if (workbookId) {
            loadFiles();
        }
    }, [workbookId]);

    // Load data from JSON on mount
    useEffect(() => {
        const loadSheetData = async () => {
            try {
                setIsLoading(true);
                const response = await apiFetch(`/api/workbooks/${workbookId}/sheets/${sheetId}`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.sheet_data) {
                        console.log('Loaded sheet data from backend:', data.sheet_data);
                        console.log('Sample cell with metadata:', data.sheet_data.rows[0]?.[0]);
                        
                        setSheetData(data.sheet_data);
                        loadedDataRef.current = JSON.stringify(data.sheet_data);
                        
                        // Load column widths from sheet data
                        const widths = {};
                        data.sheet_data.columns.forEach((col, idx) => {
                            if (col.width) {
                                widths[idx] = col.width;
                            }
                        });
                        setColumnWidths(widths);
                        
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
    }, [workbookId, sheetId, onLastSavedChange]);

    // Update enrich text based on selection
    useEffect(() => {
        if (selectedCells.size > 0) {
            const cellText = selectedCells.size === 1 ? 'cell' : 'cells';
            setEnrichText(`Enrich ${selectedCells.size} ${cellText}`);
        } else {
            setEnrichText('Enrich');
        }
    }, [selectedCells]);

    // Notify parent of selection changes
    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(selectedCells);
        }
    }, [selectedCells, onSelectionChange]);

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
                const response = await apiFetch(`/api/workbooks/${workbookId}/sheets/${sheetId}`, {
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
    }, [sheetData, isLoading, workbookId, sheetId, onSavingChange, onLastSavedChange]);

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
                        ? { title: columnTitle, prompt: columnPrompt, format: columnFormat, type: columnType, options: selectOptions }
                        : col
                )
            }));
        } else {
            // Add new column
            setSheetData(prev => ({
                ...prev,
                columns: [...prev.columns, { title: columnTitle, prompt: columnPrompt, format: columnFormat, type: columnType, options: selectOptions }],
                rows: prev.rows.map(row => [...row, ''])
            }));
        }

        setShowPopup(false);
        setColumnTitle('');
        setColumnPrompt('');
        setColumnFormat('');
        setShowFormatSection(false);
        setSelectOptions([]);
        setNewOptionValue('');
        setEditingColumn(null);
    }, [columnTitle, columnPrompt, columnFormat, columnType, selectOptions, editingColumn]);

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
                    ? row.map((cell, cIdx) => {
                        if (cIdx === colIndex) {
                            // Check if incoming value has metadata (from enrichment/AI)
                            const incomingMeta = getCellMeta(value);
                            if (incomingMeta) {
                                // Value already has metadata (e.g., from enrichment), use it as-is
                                return value;
                            }
                            
                            // Manual edit: check if value changed
                            const oldValue = getCellValue(cell);
                            const newValueOnly = getCellValue(value);
                            const existingMeta = getCellMeta(cell);
                            
                            // If value changed, clear metadata; if same, preserve it
                            if (existingMeta && oldValue === newValueOnly) {
                                // Value unchanged, preserve existing metadata
                                return createCellWithMeta(newValueOnly, existingMeta);
                            }
                            // Value changed or no metadata, return new value without metadata
                            return newValueOnly;
                        }
                        return cell;
                    })
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

    // WebSocket listener for enrichment updates
    useEffect(() => {
        const handleWebSocketMessage = (event) => {
            const { type, data } = event.detail;
            
            if (type === 'enrichment_status') {
                // Cell status update (queued or generating)
                const { row, column, status } = data;
                setCellStatus(row, column, status);
                console.log(`Cell [${row}, ${column}] status: ${status}`);
            } else if (type === 'enrichment_complete') {
                // Cell enrichment completed with cellValue containing value + metadata
                const { row, column, cellValue } = data;
                
                console.log('Enrichment complete - received cellValue:', cellValue);
                console.log('Cell metadata:', cellValue?.meta);
                
                // Store complete cell value with metadata in sheet data
                handleCellEdit(row, column, cellValue);

                // Trigger blink animation
                const cellKey = `${row}-${column}`;
                setBlinkingCells(prev => new Set(prev).add(cellKey));

                // Remove blink class after animation completes (500ms)
                setTimeout(() => {
                    setBlinkingCells(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(cellKey);
                        return newSet;
                    });
                }, 500);

                console.log(`Cell [${row}, ${column}] enriched:`, cellValue);
            } else if (type === 'enrichment_error') {
                // Cell enrichment failed
                const { row, column, error } = data;
                setCellStatus(row, column, 'error');
                console.error(`Cell [${row}, ${column}] enrichment error: ${error}`);
            }
        };
        
        window.addEventListener('websocket-message', handleWebSocketMessage);
        
        return () => {
            window.removeEventListener('websocket-message', handleWebSocketMessage);
        };
    }, [setCellStatus, handleCellEdit]);

    // Enrichment - send all cells in bulk to backend
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
                const cellData = sheetData.rows[rowIndex][idx];
                const cellValue = getCellValue(cellData);
                if (cellValue && typeof cellValue === 'string' && !cellValue.startsWith('__STATUS__')) {
                    rowData[col.title] = cellValue;
                }
            });

            // Build enrichment data object with type, format, and options
            const enrichData = {
                context: rowData,
                position: { Row: rowIndex, Column: colIndex },
                title: column.title,
                description: column.prompt || `Generate data for ${column.title} column`,
                value: value,
                type: column.type || 'text',
                sheet_uuid: sheetId  // Add sheet UUID for tracking
            };

            // Add format if available
            if (column.format) {
                enrichData.format = column.format;
            }

            // Add options only for select and multiselect types
            if ((column.type === 'select' || column.type === 'multiselect') && column.options) {
                enrichData.options = column.options;
            }

            return enrichData;
        });

        console.log('Formatted data for enrichment:', cellsToEnrich);
        console.log(cellsToEnrich.length + ' cells to enrich');

        if (cellsToEnrich.length === 0) return;

        // Set all selected cells to "Queued" status immediately (optimistic UI update)
        cellsToEnrich.forEach(cellData => {
            setCellStatus(cellData.position.Row, cellData.position.Column, 'queued');
        });

        // Clear the selection after setting queued status
        clearSelection();

        // Send bulk enrichment request to backend
        try {
            const response = await apiFetch('/api/enrich-bulk', {
                method: 'POST',
                body: {
                    cells: cellsToEnrich,
                    workbookId: workbookId,
                    model: selectedModel
                }
            });
            
            const result = await response.json();
            if (result.status === 'success') {
                console.log(result.message);
            } else {
                console.error('Bulk enrichment failed:', result.message);
                alert('Enrichment failed: ' + result.message);
                
                // Reset status on error
                cellsToEnrich.forEach(cellData => {
                    setCellStatus(cellData.position.Row, cellData.position.Column, null);
                });
            }
        } catch (error) {
            console.error('Error starting bulk enrichment:', error);
            alert('Failed to start enrichment process');
            
            // Reset status on error
            cellsToEnrich.forEach(cellData => {
                setCellStatus(cellData.position.Row, cellData.position.Column, null);
            });
        }
    }, [selectedCells, sheetData, setCellStatus, clearSelection, workbookId, selectedModel]);

    // Popup handlers
    const openPopupForNewColumn = useCallback(() => {
        setEditingColumn(null);
        setColumnTitle('');
        setColumnPrompt('');
        setColumnFormat('');
        setColumnType('text');
        setShowFormatSection(false);
        setSelectOptions([]);
        setNewOptionValue('');
        setShowPopup(true);
    }, []);

    const openPopupForEditColumn = useCallback((colIndex) => {
        setEditingColumn(colIndex);
        setColumnTitle(sheetData.columns[colIndex].title);
        setColumnPrompt(sheetData.columns[colIndex].prompt || '');
        setColumnFormat(sheetData.columns[colIndex].format || '');
        setColumnType(sheetData.columns[colIndex].type || 'text');
        setShowFormatSection(!!(sheetData.columns[colIndex].format || '').trim());
        setSelectOptions(sheetData.columns[colIndex].options || []);
        setNewOptionValue('');
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
        
        // Clear previous selections and select new cell in a single setState
        // to avoid double updates to onSelectionChange
        setSelectedCells(new Set([`${rowIndex}-${colIndex}`]));
        setSelectedRows(new Set());
        setSelectedColumns(new Set());
        
        // Start drag selection
        setIsDragging(true);
        setDragStartCell({ row: rowIndex, col: colIndex });
        isSelectionModeRef.current = true;
    }, [currentEditingCell, overlayEditor, toggleCellSelection]);

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
        if (resizingColumn !== null && columnWidths[resizingColumn]) {
            // Update sheetData to persist the column width
            setSheetData(prev => ({
                ...prev,
                columns: prev.columns.map((col, idx) => 
                    idx === resizingColumn 
                        ? { ...col, width: columnWidths[resizingColumn] }
                        : col
                )
            }));
        }
        
        setIsResizing(false);
        setResizingColumn(null);
        resizeStartXRef.current = null;
        resizeStartWidthRef.current = null;
    }, [resizingColumn, columnWidths]);
    
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

    // Auto-scroll when dragging near edges
    const handleAutoScroll = useCallback((mouseY) => {
        if (!sheetContentRef.current || !isDragging) return;

        const container = sheetContentRef.current;
        const rect = container.getBoundingClientRect();
        const scrollThreshold = 50; // pixels from edge to trigger scroll
        const scrollSpeed = 10; // pixels per frame

        const distanceFromBottom = rect.bottom - mouseY;
        const distanceFromTop = mouseY - rect.top;

        if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0) {
            // Scroll down
            container.scrollTop += scrollSpeed;
        } else if (distanceFromTop < scrollThreshold && distanceFromTop > 0) {
            // Scroll up
            container.scrollTop -= scrollSpeed;
        }
    }, [isDragging]);

    // Handle mouse move during drag to track position and trigger auto-scroll
    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;

        lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
        
        // Check if we need to auto-scroll
        handleAutoScroll(e.clientY);

        // Find the cell under the mouse cursor
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const cell = element?.closest('.sheet-row-item[data-row][data-col]');
        
        if (cell && dragStartCell) {
            const rowIndex = parseInt(cell.getAttribute('data-row'));
            const colIndex = parseInt(cell.getAttribute('data-col'));
            
            if (!isNaN(rowIndex) && !isNaN(colIndex)) {
                selectCellRange(
                    dragStartCell.row,
                    dragStartCell.col,
                    rowIndex,
                    colIndex
                );
            }
        }
    }, [isDragging, dragStartCell, handleAutoScroll, selectCellRange]);

    // Global mouse up listener
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                setDragStartCell(null);
                setTimeout(() => {
                    isSelectionModeRef.current = false;
                }, 10);
                
                // Clear auto-scroll interval
                if (autoScrollIntervalRef.current) {
                    clearInterval(autoScrollIntervalRef.current);
                    autoScrollIntervalRef.current = null;
                }
            }
        };

        document.addEventListener('mouseup', handleGlobalMouseUp);
        return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isDragging]);

    // Mouse move listener for drag selection with auto-scroll
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            
            // Start auto-scroll interval
            autoScrollIntervalRef.current = setInterval(() => {
                if (isDragging && lastMousePositionRef.current.y) {
                    handleAutoScroll(lastMousePositionRef.current.y);
                }
            }, 16); // ~60fps
            
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                if (autoScrollIntervalRef.current) {
                    clearInterval(autoScrollIntervalRef.current);
                    autoScrollIntervalRef.current = null;
                }
            };
        }
    }, [isDragging, handleMouseMove, handleAutoScroll]);

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
                const infoPanel = event.target.closest('.cell-info-panel');

                // Don't close if clicking on textarea or info panel
                if (!textarea && !infoPanel) {
                    // Save and close the overlay editor
                    const editorTextarea = document.querySelector('textarea[data-overlay-editor]');
                    if (editorTextarea) {
                        handleCellEdit(overlayEditor.row, overlayEditor.col, editorTextarea.value);
                    }
                    setOverlayEditor(null);
                    return;
                }
                return; // If clicking inside the textarea or info panel, do nothing
            }
            
            // Don't deselect if currently editing a cell
            if (currentEditingCell) return;
            
            // Don't deselect if clicking on popup, buttons in the navigation bar, or assistant
            if (event.target.closest('.popup') || event.target.closest('.sheet-nav') || event.target.closest('.assistant')) {
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

    // Export all sheets as XLSX file
    const handleExportXLSX = useCallback(async () => {
        try {
            // Fetch all sheets for this workbook
            const response = await apiFetch(`/api/workbooks/${workbookId}`);
            if (!response.ok) {
                alert('Failed to fetch workbook sheets');
                return;
            }
            
            const docData = await response.json();
            if (docData.status !== 'success' || !docData.sheets) {
                alert('No sheets found in workbook');
                return;
            }
            
            // Create a new workbook
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'DataFactory';
            workbook.created = new Date();
            
            // Fetch and add each sheet to the workbook
            for (const sheet of docData.sheets) {
                const sheetResponse = await apiFetch(`/api/workbooks/${workbookId}/sheets/${sheet.id}`);
                if (sheetResponse.ok) {
                    const sheetDataResponse = await sheetResponse.json();
                    if (sheetDataResponse.status === 'success' && sheetDataResponse.sheet_data) {
                        const data = sheetDataResponse.sheet_data;
                        
                        // Sanitize sheet name (Excel has restrictions)
                        let sheetName = sheet.name.replace(/[\[\]\*\/\\?:]/g, '_');
                        if (sheetName.length > 31) {
                            sheetName = sheetName.substring(0, 31);
                        }
                        
                        // Add worksheet to workbook
                        const worksheet = workbook.addWorksheet(sheetName);
                        
                        // Add header row
                        if (data.columns && data.columns.length > 0) {
                            const headers = data.columns.map(col => col.title || '');
                            worksheet.addRow(headers);
                            
                            // Style header row
                            const headerRow = worksheet.getRow(1);
                            headerRow.font = { bold: true };
                            headerRow.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFE0E0E0' }
                            };
                        }
                        
                        // Add data rows
                        if (data.rows && data.rows.length > 0) {
                            data.rows.forEach(row => {
                                // Remove status markers from cells
                                const cleanRow = row.map(cell => {
                                    if (typeof cell === 'string' && cell.startsWith('__STATUS__')) {
                                        return '';
                                    }
                                    return cell;
                                });
                                worksheet.addRow(cleanRow);
                            });
                        }
                        
                        // Auto-fit columns
                        worksheet.columns.forEach(column => {
                            let maxLength = 0;
                            column.eachCell({ includeEmpty: true }, cell => {
                                const cellValue = cell.value ? cell.value.toString() : '';
                                maxLength = Math.max(maxLength, cellValue.length);
                            });
                            column.width = Math.min(Math.max(maxLength + 2, 10), 50);
                        });
                    }
                }
            }
            
            // Generate Excel file and trigger download
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const fileName = `${docData.name || 'workbook'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('All sheets exported as XLSX');
        } catch (error) {
            console.error('Error exporting XLSX:', error);
            alert('Failed to export Excel file');
        }
    }, [workbookId]);

    // Accept AI changes
    const handleAcceptAiChanges = useCallback(() => {
        setPendingAiChanges(new Set());
        setOriginalValues({});
        clearSelection();
        console.log('AI changes accepted');
    }, [clearSelection]);

    // Reject AI changes and revert to original values
    const handleRejectAiChanges = useCallback(() => {
        setSheetData(prev => {
            const newRows = prev.rows.map((row, rowIndex) => 
                row.map((cell, colIndex) => {
                    const cellKey = `${rowIndex}-${colIndex}`;
                    if (pendingAiChanges.has(cellKey) && originalValues[cellKey] !== undefined) {
                        return originalValues[cellKey];
                    }
                    return cell;
                })
            );

            // Remove rows that were added by AI (identified by having all cells as pending changes)
            const rowsToKeep = [];
            newRows.forEach((row, rowIndex) => {
                const allCellsPending = row.every((_, colIndex) => 
                    pendingAiChanges.has(`${rowIndex}-${colIndex}`)
                );
                
                // Check if this row existed before by checking if all original values were empty
                // If all original values were empty AND all cells are pending, this is a newly added row
                const allOriginalValuesEmpty = row.every((_, colIndex) => {
                    const cellKey = `${rowIndex}-${colIndex}`;
                    return originalValues[cellKey] === '';
                });

                // Keep row if: not all cells are pending OR it had non-empty original values
                if (!allCellsPending || !allOriginalValuesEmpty) {
                    rowsToKeep.push(row);
                }
            });

            return {
                ...prev,
                rows: rowsToKeep
            };
        });

        setPendingAiChanges(new Set());
        setOriginalValues({});
        clearSelection();
        console.log('AI changes rejected and reverted');
    }, [pendingAiChanges, originalValues, clearSelection]);

    // Keyboard shortcuts and paste handler
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
    }, [clearSelection, currentEditingCell, overlayEditor, handleMultiLinePaste, selectedCells, sheetData]);

    // Update parent component with navigation menu whenever it changes
    useEffect(() => {
        if (onNavigationChange) {
            onNavigationChange(
                <div className="flex flex-row-center">
                {pendingAiChanges.size > 0 ? (
                    <>
                        <div 
                            onClick={handleAcceptAiChanges}
                            className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                            style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
                        >
                            <img src={IconCheck} alt="Check Icon" height="16" />
                            <p className="text--micro">Accept Changes</p>
                        </div>
                        <div 
                            onClick={handleRejectAiChanges}
                            className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                            style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                        >
                            <img src={IconDismiss} alt="Dismiss Icon" height="16" />
                            <p className="text--micro">Reject Changes</p>
                        </div>
                    </>
                ) : (
                    <div 
                        onClick={handleEnrichCells}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                    >
                        <img src={IconStar} alt="Star Icon" height="16" />
                        <p className="text--micro">{enrichText}</p>
                    </div>
                )}
                
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
                
                {sheetData.columns.length > 0 && (
                    <div 
                        onClick={handleAddRow}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                    >
                        <img src={IconAdd} alt="Add Icon" height="16" />
                        <p className="text--micro">Add Row</p>
                    </div>
                )}
                
                <div 
                    onClick={openPopupForNewColumn}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconAdd} alt="Add Icon" height="16" />
                    <p className="text--micro">Add Column</p>
                </div>
                
                <div 
                    onClick={handleExportXLSX}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconExport} alt="Export Icon" height="16" />
                    <p className="text--micro">Export</p>
                </div>
            </div>
            );
        }
    }, [onNavigationChange, enrichText, showDeleteRow, showDeleteColumn, handleEnrichCells, handleDeleteRows, handleDeleteColumns, handleAddRow, openPopupForNewColumn, handleExportXLSX, pendingAiChanges, handleAcceptAiChanges, handleRejectAiChanges]);

    // Expose navigation menu to parent component (for imperative access if needed)
    useImperativeHandle(ref, () => ({
        // Expose sheet manipulation methods for AI assistant
        addRows: async (count, position = 'end') => {
            try {
                const numRows = parseInt(count);
                if (isNaN(numRows) || numRows <= 0) {
                    return { success: false, error: 'Invalid row count' };
                }

                const currentRowCount = sheetData.rows.length;
                const columnCount = sheetData.columns.length;

                // Add the specified number of rows
                setSheetData(prev => {
                    const newRows = Array(numRows).fill(null).map(() => 
                        new Array(prev.columns.length).fill('')
                    );
                    return {
                        ...prev,
                        rows: position === 'beginning' 
                            ? [...newRows, ...prev.rows]  // Add at beginning
                            : [...prev.rows, ...newRows]   // Add at end
                    };
                });

                // Track new rows as pending AI changes
                setPendingAiChanges(prev => {
                    const newPending = new Set(prev);
                    const startRow = position === 'beginning' ? 0 : currentRowCount;
                    
                    for (let i = 0; i < numRows; i++) {
                        const rowIndex = startRow + i;
                        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
                            newPending.add(`${rowIndex}-${colIndex}`);
                        }
                    }
                    return newPending;
                });

                // Store original values (empty for new rows)
                setOriginalValues(prev => {
                    const newOriginals = { ...prev };
                    const startRow = position === 'beginning' ? 0 : currentRowCount;
                    
                    for (let i = 0; i < numRows; i++) {
                        const rowIndex = startRow + i;
                        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
                            newOriginals[`${rowIndex}-${colIndex}`] = '';
                        }
                    }
                    return newOriginals;
                });

                const positionText = position === 'beginning' ? ' at the beginning' : '';
                return { 
                    success: true, 
                    message: `Added ${numRows} row${numRows > 1 ? 's' : ''}${positionText}` 
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        deleteRows: async (rowNumbers) => {
            try {
                if (!Array.isArray(rowNumbers) || rowNumbers.length === 0) {
                    return { success: false, error: 'Invalid row numbers array' };
                }

                // Convert 1-based row numbers to 0-based indices
                const rowIndices = rowNumbers.map(num => parseInt(num) - 1);
                
                // Validate row numbers
                const totalRows = sheetData.rows.length;
                for (const idx of rowIndices) {
                    if (isNaN(idx) || idx < 0 || idx >= totalRows) {
                        return { success: false, error: `Invalid row number: ${idx + 1}. Sheet has ${totalRows} rows.` };
                    }
                }

                // Delete the rows
                setSheetData(prev => ({
                    ...prev,
                    rows: prev.rows.filter((_, idx) => !rowIndices.includes(idx))
                }));

                // Clear any pending AI changes for deleted rows
                setPendingAiChanges(prev => {
                    const newPending = new Set();
                    for (const cellKey of prev) {
                        const [rowIdx] = cellKey.split('-').map(Number);
                        if (!rowIndices.includes(rowIdx)) {
                            newPending.add(cellKey);
                        }
                    }
                    return newPending;
                });

                // Clear original values for deleted rows
                setOriginalValues(prev => {
                    const newOriginals = { ...prev };
                    for (const cellKey in newOriginals) {
                        const [rowIdx] = cellKey.split('-').map(Number);
                        if (rowIndices.includes(rowIdx)) {
                            delete newOriginals[cellKey];
                        }
                    }
                    return newOriginals;
                });

                // Clear selection
                clearSelection();

                const rowNumbersText = rowNumbers.sort((a, b) => a - b).join(', ');
                return { 
                    success: true, 
                    message: `Deleted ${rowNumbers.length} row${rowNumbers.length > 1 ? 's' : ''} (${rowNumbersText})` 
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        deleteColumns: async (columnIdentifiers) => {
            try {
                if (!Array.isArray(columnIdentifiers) || columnIdentifiers.length === 0) {
                    return { success: false, error: 'Invalid column identifiers array' };
                }

                const columnIndices = [];
                const columnNames = sheetData.columns.map(col => col.title);

                // Parse column identifiers (can be column letters like 'A', 'B' or column names)
                for (const identifier of columnIdentifiers) {
                    const trimmed = identifier.trim();
                    
                    // Check if it's a column letter (A, B, C, etc.)
                    const letterMatch = trimmed.match(/^[A-Z]+$/i);
                    if (letterMatch) {
                        // Convert letter to index
                        let colIndex = 0;
                        const upper = trimmed.toUpperCase();
                        for (let i = 0; i < upper.length; i++) {
                            colIndex = colIndex * 26 + (upper.charCodeAt(i) - 64);
                        }
                        colIndex -= 1; // Convert to 0-based
                        
                        if (colIndex >= 0 && colIndex < sheetData.columns.length) {
                            columnIndices.push(colIndex);
                        } else {
                            return { success: false, error: `Column '${trimmed}' is out of range. Sheet has ${sheetData.columns.length} columns.` };
                        }
                    } else {
                        // Try to find by column name
                        const colIndex = columnNames.findIndex(name => name === trimmed);
                        if (colIndex !== -1) {
                            columnIndices.push(colIndex);
                        } else {
                            return { success: false, error: `Column '${trimmed}' not found.` };
                        }
                    }
                }

                // Remove duplicates and sort in descending order
                const uniqueIndices = [...new Set(columnIndices)].sort((a, b) => b - a);

                // Delete the columns
                setSheetData(prev => ({
                    ...prev,
                    columns: prev.columns.filter((_, idx) => !uniqueIndices.includes(idx)),
                    rows: prev.rows.map(row => row.filter((_, idx) => !uniqueIndices.includes(idx)))
                }));

                // Clear any pending AI changes for deleted columns
                setPendingAiChanges(prev => {
                    const newPending = new Set();
                    for (const cellKey of prev) {
                        const [rowIdx, colIdx] = cellKey.split('-').map(Number);
                        if (!uniqueIndices.includes(colIdx)) {
                            newPending.add(cellKey);
                        }
                    }
                    return newPending;
                });

                // Clear original values for deleted columns
                setOriginalValues(prev => {
                    const newOriginals = { ...prev };
                    for (const cellKey in newOriginals) {
                        const [rowIdx, colIdx] = cellKey.split('-').map(Number);
                        if (uniqueIndices.includes(colIdx)) {
                            delete newOriginals[cellKey];
                        }
                    }
                    return newOriginals;
                });

                // Clear selection
                clearSelection();

                const deletedColumnNames = uniqueIndices.map(idx => sheetData.columns[idx].title).join(', ');
                return { 
                    success: true, 
                    message: `Deleted ${uniqueIndices.length} column${uniqueIndices.length > 1 ? 's' : ''} (${deletedColumnNames})` 
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        addColumns: async (columns, position = 'end') => {
            try {
                if (!Array.isArray(columns) || columns.length === 0) {
                    return { success: false, error: 'Invalid columns array' };
                }

                // Validate each column has a title
                for (const col of columns) {
                    if (!col.title || col.title.trim() === '') {
                        return { success: false, error: 'Each column must have a title' };
                    }
                }

                // Add the columns
                setSheetData(prev => {
                    const newColumns = columns.map(col => ({
                        title: col.title,
                        prompt: col.prompt || '',
                        type: col.type || 'text'
                    }));
                    
                    // Extend existing rows to accommodate new columns
                    const extendedRows = prev.rows.map(row => {
                        const newCells = Array(columns.length).fill('');
                        return position === 'beginning'
                            ? [...newCells, ...row]  // Add cells at beginning
                            : [...row, ...newCells]   // Add cells at end
                    });

                    return {
                        ...prev,
                        columns: position === 'beginning'
                            ? [...newColumns, ...prev.columns]  // Add at beginning
                            : [...prev.columns, ...newColumns],  // Add at end
                        rows: extendedRows
                    };
                });

                const positionText = position === 'beginning' ? ' at the beginning' : '';
                const columnNames = columns.map(c => c.title).join(', ');
                return { 
                    success: true, 
                    message: `Added ${columns.length} column${columns.length > 1 ? 's' : ''} (${columnNames})${positionText}` 
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        populateCells: async (cells) => {
            try {
                if (!cells || typeof cells !== 'object' || Object.keys(cells).length === 0) {
                    return { success: false, error: 'Invalid cells data' };
                }
                
                // Parse cell positions like "A1", "B15", etc.
                const parseCellPosition = (cellPos) => {
                    const match = cellPos.match(/^([A-Z]+)(\d+)$/i);
                    if (!match) return null;
                    
                    const colLetter = match[1].toUpperCase();
                    const rowNum = parseInt(match[2]);
                    
                    // Convert column letter to index (A=0, B=1, etc.)
                    let colIndex = 0;
                    for (let i = 0; i < colLetter.length; i++) {
                        colIndex = colIndex * 26 + (colLetter.charCodeAt(i) - 64);
                    }
                    colIndex -= 1;
                    
                    // Row index (1-based to 0-based)
                    const rowIndex = rowNum - 1;
                    
                    return { rowIndex, colIndex };
                };
                
                // Group cells by row for efficient processing
                const cellsByRow = {};
                for (const [cellPos, value] of Object.entries(cells)) {
                    const parsed = parseCellPosition(cellPos);
                    if (!parsed) continue;
                    
                    if (!cellsByRow[parsed.rowIndex]) {
                        cellsByRow[parsed.rowIndex] = [];
                    }
                    cellsByRow[parsed.rowIndex].push({ colIndex: parsed.colIndex, value });
                }
                
                // Calculate counts BEFORE setState (we have all the data we need)
                const rowIndices = Object.keys(cellsByRow).map(Number);
                const maxRowNeeded = Math.max(...rowIndices);
                const currentRowCount = sheetData.rows.length;
                const addedRows = Math.max(0, maxRowNeeded - currentRowCount + 1);
                
                let updatedCount = 0;
                const columnCount = sheetData.columns.length;
                
                for (const [rowIndex, cells] of Object.entries(cellsByRow)) {
                    for (const { colIndex } of cells) {
                        if (colIndex >= 0 && colIndex < columnCount) {
                            updatedCount++;
                        }
                    }
                }
                
                // Store original values before updating
                setOriginalValues(prev => {
                    const newOriginals = { ...prev };
                    
                    for (const [rowIndex, cells] of Object.entries(cellsByRow)) {
                        const idx = parseInt(rowIndex);
                        for (const { colIndex } of cells) {
                            const cellKey = `${idx}-${colIndex}`;
                            // Only store if not already tracked
                            if (newOriginals[cellKey] === undefined) {
                                const currentValue = sheetData.rows[idx]?.[colIndex] || '';
                                newOriginals[cellKey] = currentValue;
                            }
                        }
                    }
                    
                    // Also track new rows that will be added
                    if (addedRows > 0) {
                        for (let i = currentRowCount; i <= maxRowNeeded; i++) {
                            for (let colIndex = 0; colIndex < columnCount; colIndex++) {
                                const cellKey = `${i}-${colIndex}`;
                                if (newOriginals[cellKey] === undefined) {
                                    newOriginals[cellKey] = '';
                                }
                            }
                        }
                    }
                    
                    return newOriginals;
                });

                // Track cells as pending changes
                setPendingAiChanges(prev => {
                    const newPending = new Set(prev);
                    
                    for (const [rowIndex, cells] of Object.entries(cellsByRow)) {
                        const idx = parseInt(rowIndex);
                        for (const { colIndex } of cells) {
                            if (colIndex >= 0 && colIndex < sheetData.columns.length) {
                                newPending.add(`${idx}-${colIndex}`);
                            }
                        }
                    }
                    
                    // Also mark all cells in newly added rows as pending
                    if (addedRows > 0) {
                        for (let i = currentRowCount; i <= maxRowNeeded; i++) {
                            for (let colIndex = 0; colIndex < columnCount; colIndex++) {
                                newPending.add(`${i}-${colIndex}`);
                            }
                        }
                    }
                    
                    return newPending;
                });

                // Update or add rows
                setSheetData(prev => {
                    const newRows = [...prev.rows];
                    const maxRowNeeded = Math.max(...Object.keys(cellsByRow).map(Number));
                    
                    // Calculate how many rows need to be added
                    const currentRowCount = newRows.length;
                    const rowsToAdd = Math.max(0, maxRowNeeded - currentRowCount + 1);
                    
                    // Add empty rows if needed
                    for (let i = 0; i < rowsToAdd; i++) {
                        newRows.push(new Array(prev.columns.length).fill(''));
                    }
                    
                    // Populate cells
                    for (const [rowIndex, cells] of Object.entries(cellsByRow)) {
                        const idx = parseInt(rowIndex);
                        if (!newRows[idx]) {
                            newRows[idx] = new Array(prev.columns.length).fill('');
                        }
                        
                        for (const { colIndex, value } of cells) {
                            if (colIndex >= 0 && colIndex < prev.columns.length) {
                                newRows[idx][colIndex] = value || '';
                            }
                        }
                    }
                    
                    return { ...prev, rows: newRows };
                });
                
                // Clear selection after populating cells
                clearSelection();
                
                // Build message using pre-calculated counts
                let message = `Updated ${updatedCount} cell${updatedCount !== 1 ? 's' : ''}`;
                if (addedRows > 0) {
                    message += ` (added ${addedRows} new row${addedRows !== 1 ? 's' : ''})`;
                }
                
                console.log('Returning message:', message);
                return { success: true, message };
            } catch (error) {
                console.error('populateCells error:', error);
                return { success: false, error: error.message };
            }
        },
        
        getSheetData: () => {
            return sheetData;
        }
    }), [sheetData]);

    return (
        <>
            {/* Sheet Content Area */}
            <div 
                ref={sheetContentRef}
                className="sheet-content flex-expanded scroll-x scroll-y thin-scroll"
            >
                {isLoading ? (
                    <div className="sheet-grid-container" style={{ padding: '5px', borderBottom: 'none' }}>
                        {/* Header Row Shimmer */}
                        <div className="sheet-row header-row" style={{ marginBottom: '0px' }}>
                            {[...Array(5)].map((_, colIndex) => (
                                <div
                                    key={colIndex}
                                    className="sheet-row-item header-cell"
                                    style={{
                                        width: '160px',
                                        marginRight: '4px',
                                        border: 'none',
                                        borderBottom: 'none',
                                        borderRight: 'none'
                                    }}
                                >
                                    <div className="shimmer" style={{ height: '40px' }}></div>
                                </div>
                            ))}
                        </div>

                        {/* Data Rows Shimmer */}
                        {[...Array(6)].map((_, rowIndex) => (
                            <div key={rowIndex} className="sheet-row" style={{ marginBottom: '0px', ...(rowIndex === 5 ? { borderBottom: 'none' } : {}) }}>
                                {[...Array(5)].map((_, colIndex) => (
                                    <div
                                        key={colIndex}
                                        className="sheet-row-item"
                                        style={{
                                            width: '160px',
                                            marginRight: '4px',
                                            border: 'none',
                                            borderBottom: 'none',
                                            borderRight: 'none'
                                        }}
                                    >
                                        <div className="shimmer" style={{ height: '40px' }}></div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="sheet-grid-container">
                        {/* Header Row */}
                        <div className="sheet-row header-row">
                            {sheetData.columns.length > 0 && (
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
                            )}
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
                                    <div className="flex flex-row-center gap-10 flex-space-between">
                                        <div className="flex flex-row-center" style={{
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            flex: 1,
                                            gap: 8,
                                            minWidth: 0
                                        }}>
                                            <img 
                                                src={getColumnTypeIcon(column.type)} 
                                                alt={column.type || 'text'} 
                                                height="14"
                                                style={{ flexShrink: 0, opacity: 1 }}
                                            />
                                            <p style={{
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>{column.title}</p>
                                        </div>
                                        <p className='opacity-5 text--micro' style={{ flexShrink: 0 }}>{getColumnLetter(colIndex)}</p>
                                    </div>
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
                                {row.map((cell, colIndex) => {
                                    const column = sheetData.columns[colIndex];
                                    const columnType = column?.type || 'text';
                                    const shouldUseCustomRenderer = ['select', 'multiselect', 'url', 'email', 'checkbox', 'file'].includes(columnType);
                                    const shouldBlockOverlayEditor = ['select', 'multiselect', 'checkbox', 'file'].includes(columnType);
                                    const cellKey = `${rowIndex}-${colIndex}`;
                                    // Extract metadata from cell itself (not used in rendering, kept for future)
                                    const cellMeta = getCellMeta(cell);
                                    
                                    return (
                                        <div
                                            key={`${rowIndex}-${colIndex}`}
                                            className={`sheet-row-item ${
                                                selectedCells.has(`${rowIndex}-${colIndex}`) ? 'selected' : ''
                                            } ${
                                                pendingAiChanges.has(`${rowIndex}-${colIndex}`) ? 'ai-pending-change' : ''
                                            } ${
                                                blinkingCells.has(`${rowIndex}-${colIndex}`) ? 'enrichment-complete-blink' : ''
                                            }`}
                                            style={{ width: `${columnWidths[colIndex] || 160}px`, position: 'relative' }}
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
                                                
                                                // For special types (select, multiselect), don't open overlay editor
                                                if (shouldBlockOverlayEditor) return;
                                                
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const displayValue = getCellValue(cell);
                                                const cellValue = displayValue.startsWith('__STATUS__') ? '' : displayValue;
                                                setOverlayEditor({
                                                    row: rowIndex,
                                                    col: colIndex,
                                                    value: cellValue,
                                                    rect: rect
                                                });
                                            }}
                                        >
                                            {(() => {
                                                const displayValue = getCellValue(cell);
                                                
                                                if (typeof displayValue === 'string' && displayValue.startsWith('__STATUS__')) {
                                                    return (
                                                        <div 
                                                            className="enrichment-status"
                                                            dangerouslySetInnerHTML={{ __html: displayValue.replace('__STATUS__', '') }}
                                                        />
                                                    );
                                                }
                                                
                                                if (shouldUseCustomRenderer) {
                                                    return (
                                                        <CellRenderer
                                                            value={cell}
                                                            columnType={columnType}
                                                            columnOptions={columnType === 'file' ? availableFiles : (column?.options || [])}
                                                            isSelected={selectedCells.has(`${rowIndex}-${colIndex}`)}
                                                            onEdit={(newValue) => handleCellEdit(rowIndex, colIndex, newValue)}
                                                            rowIndex={rowIndex}
                                                            colIndex={colIndex}
                                                        />
                                                    );
                                                }
                                                
                                                return displayValue;
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Overlay Editor */}
            {overlayEditor && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            top: overlayEditor.rect.top,
                            left: overlayEditor.rect.left,
                            width: overlayEditor.rect.width - 2.5,
                            display: 'flex',
                            zIndex: 1000,
                            border: '1.5px solid #0066cc',
                            backgroundColor: '#1e1e1e',
                            // boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
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
                                    const newHeight = Math.max(0, el.scrollHeight-18);
                                    el.style.height = newHeight + 'px';
                                    setOverlayEditorHeight(el.offsetHeight);
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
                                const newHeight = Math.max(0, e.target.scrollHeight-18);
                                e.target.style.height = newHeight + 'px';
                                setOverlayEditorHeight(e.target.offsetHeight);
                            }}
                            onBlur={(e) => {
                                // Check if the blur is because user clicked on the info panel
                                const relatedTarget = e.relatedTarget;
                                const clickedInfoPanel = relatedTarget?.closest?.('.cell-info-panel');

                                if (clickedInfoPanel) {
                                    // Don't close - user is interacting with info panel
                                    return;
                                }

                                // Use setTimeout to delay closure, allowing click events on info panel to register
                                setTimeout(() => {
                                    // Double-check if info panel was clicked
                                    if (document.activeElement?.closest('.cell-info-panel')) {
                                        return;
                                    }

                                    // Otherwise, save and close as normal
                                    const currentCell = sheetData.rows[overlayEditor.row][overlayEditor.col];
                                    const oldValue = getCellValue(currentCell);
                                    const newValue = e.target.value;
                                    const currentMeta = getCellMeta(currentCell);

                                    // If value unchanged and has metadata, preserve it
                                    const finalValue = (currentMeta && oldValue === newValue)
                                        ? createCellWithMeta(newValue, currentMeta)
                                        : newValue;

                                    handleCellEdit(overlayEditor.row, overlayEditor.col, finalValue);
                                    setOverlayEditor(null);
                                }, 100);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setOverlayEditor(null);
                                }
                            }}
                        />
                    </div>
                    
                    {/* Information Panel Below Editing Cell */}
                    <div
                        className="cell-info-panel"
                        onMouseDown={(e) => {
                            // Prevent the textarea from losing focus when clicking on info panel
                            e.preventDefault();
                        }}
                        style={{
                            position: 'fixed',
                            top: overlayEditor.rect.top + (overlayEditorHeight || overlayEditor.rect.height) + 3,
                            left: overlayEditor.rect.left,
                            width: overlayEditor.rect.width + 0,
                            maxWidth: '400px',
                            // minHeight: '120px',
                            maxHeight: '250px',
                            overflowY: 'auto',
                            zIndex: 999,
                            backgroundColor: '#2a2a2a',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                        }}
                    >
                        <div style={{ fontSize: '11px', color: '#b0b0b0', lineHeight: '1.5', padding: '12px' }}>
                            {(() => {
                                const cellKey = `${overlayEditor.row}-${overlayEditor.col}`;
                                // Get cell data and extract metadata
                                const cellData = sheetData.rows[overlayEditor.row]?.[overlayEditor.col];
                                const cellMeta = getCellMeta(cellData);
                                
                                if (cellMeta && cellMeta.process && cellMeta.process.length > 0) {
                                    const filteredTools = cellMeta.process.filter(tool =>
                                        tool.tool !== 'tool_get_workbook_structure'
                                    );

                                    return (
                                        <>
                                            <p style={{ margin: '0 0 12px 0', fontWeight: '600', color: '#e0e0e0' }}>Process</p>

                                            <div style={{ position: 'relative', paddingLeft: '8px' }}>
                                                {/* Continuous vertical line for entire timeline */}
                                                <div style={{
                                                    position: 'absolute',
                                                    left: '3.5px',
                                                    top: '10px',
                                                    bottom: '10px',
                                                    width: '1px',
                                                    backgroundColor: '#5b5b5b'
                                                }} />

                                                {filteredTools.map((tool, idx) => {
                                                    const { mainText, summary } = humanizeToolExecution(tool);
                                                    const isExpanded = expandedToolSteps.has(idx);

                                                    return (
                                                        <div key={idx} style={{
                                                            position: 'relative',
                                                            marginBottom: idx === filteredTools.length - 1 ? '0' : '16px',
                                                            paddingLeft: '7.5px'
                                                        }}>
                                                            {/* Timeline dot */}
                                                            <div style={{
                                                                position: 'absolute',
                                                                left: '-7.5px',
                                                                top: '4px',
                                                                width: '6px',
                                                                height: '6px',
                                                                backgroundColor: '#5b5b5b',
                                                                boxSizing: 'border-box'
                                                            }} />

                                                            {/* Main tool description with expand/collapse functionality */}
                                                            <div
                                                                onClick={() => {
                                                                    if (summary) {
                                                                        setExpandedToolSteps(prev => {
                                                                            const newSet = new Set(prev);
                                                                            if (isExpanded) {
                                                                                newSet.delete(idx);
                                                                            } else {
                                                                                newSet.add(idx);
                                                                            }
                                                                            return newSet;
                                                                        });
                                                                    }
                                                                }}
                                                                style={{
                                                                    cursor: summary ? 'pointer' : 'default',
                                                                    display: 'flex',
                                                                    alignItems: 'start',
                                                                    gap: '6px'
                                                                }}
                                                            >
                                                                <p style={{
                                                                    margin: '0',
                                                                    color: '#d0d0d0',
                                                                    lineHeight: '1.6',
                                                                    fontSize: '10px',
                                                                    wordBreak: 'break-word',
                                                                    flex: 1
                                                                }}>
                                                                    {mainText}
                                                                </p>
                                                                {summary && (
                                                                    <img
                                                                        src={IconChevronDown}
                                                                        alt="Toggle"
                                                                        height="10"
                                                                        style={{
                                                                            marginTop: '2px',
                                                                            opacity: 0.6,
                                                                            transition: 'transform 0.2s',
                                                                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                                                                        }}
                                                                    />
                                                                )}
                                                                
                                                            </div>

                                                            {/* Collapsible summary section */}
                                                            {summary && isExpanded && (
                                                                <div style={{
                                                                    paddingTop: '6px',
                                                                    fontSize: '10px',
                                                                    color: '#b8b8b8',
                                                                    fontStyle: 'italic',
                                                                    lineHeight: '1.5',
                                                                }}>
                                                                    {summary}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div> 

                                            {cellMeta.sources?.files && cellMeta.sources.files.length > 0 && (
                                                <div style={{ marginTop: '5px', paddingTop: '12px' }}>
                                                    <p className='text--nano opacity-5 mrgnb-5'>Source Files:</p>
                                                    <p style={{ margin: 0, color: '#b0b0b0' }}>
                                                        {cellMeta.sources.files.join(', ')}
                                                    </p>
                                                </div>
                                            )}
                                            {cellMeta.sources?.links && cellMeta.sources.links.length > 0 && (
                                                <div style={{ marginTop: '5px', paddingTop: '12px' }}>
                                                    <p className='text--nano opacity-7 mrgnb-5'>Source Links:</p>
                                                    <div style={{ margin: 0 }}>
                                                        {cellMeta.sources.links.map((link, idx) => {
                                                            // Extract domain for favicon
                                                            let faviconUrl = '';
                                                            try {
                                                                const url = new URL(link);
                                                                faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=16`;
                                                            } catch (e) {
                                                                // Invalid URL, no favicon
                                                            }

                                                            return (
                                                                <a
                                                                    key={idx}
                                                                    href={link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className='text--nano opacity-7 text--white mrgnt-10'
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'start',
                                                                        gap: '6px',
                                                                        textDecoration: 'underline',
                                                                        fontSize: '10px',
                                                                        marginBottom: idx === cellMeta.sources.links.length - 1 ? 0 : '4px',
                                                                        wordBreak: 'break-all'
                                                                    }}
                                                                >
                                                                    {faviconUrl && (
                                                                        <img
                                                                            src={faviconUrl}
                                                                            alt=""
                                                                            style={{
                                                                                width: '15px',
                                                                                height: '15px',
                                                                                flexShrink: 0,
                                                                                marginTop: '4px'
                                                                            }}
                                                                            onError={(e) => e.target.style.display = 'none'}
                                                                        />
                                                                    )}
                                                                    <span>{link}</span>
                                                                </a>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                }
                                
                                return (
                                    <>
                                        <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#e0e0e0' }}>Information</p>
                                        <p style={{ margin: 0 }}>
                                            No enrichment process information available for this cell.
                                        </p>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </>
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
                            
                            <p className="text--micro text__semibold mrgnt-15">Column Title</p>
                            <input
                                type="text"
                                id="column-title"
                                className="form--input wdth-full mrgnt-7"
                                placeholder="Enter column title"
                                value={columnTitle}
                                onChange={(e) => setColumnTitle(e.target.value)}
                            />
                            
                            <p className="text--micro text__semibold mrgnt-15">Column Prompt (generated)</p>
                            <textarea
                                id="column-prompt"
                                className="form--input wdth-full mrgnt-7 text--black text--micro"
                                placeholder="Describe how the agent should fill this column, e.g. 'Extract the contact email from the company’s homepage'"
                                value={columnPrompt}
                                onChange={(e) => setColumnPrompt(e.target.value)}
                            />

                            <div className='flex mrgnt-20 flex-row-center flex-space-between'>
                                <p className="text--micro text__semibold">Data type</p>
                                <select
                                    id="column-type"
                                    className="input-empty"
                                    value={columnType}
                                    onChange={(e) => setColumnType(e.target.value)}
                                >
                                    <option value="text">Text</option>
                                    <option value="number">Number</option>
                                    <option value="checkbox">Checkbox</option>
                                    <option value="select">Select</option>
                                    <option value="multiselect">Multi-Select</option>
                                    <option value="url">URL</option>
                                    <option value="email">Email</option>
                                    <option value="file">Link to File</option>
                                </select>
                            </div>


                            {(columnType === 'text' || columnType === 'number') && (
                                <>
                                    <div 
                                        className='flex flex-row-center flex-space-between mrgnt-15 pointer'
                                        onClick={() => setShowFormatSection(!showFormatSection)}
                                    >
                                        <p className='text--micro text__semibold'>Add Formatting Instruction</p>
                                        <img 
                                            src={IconChevronRight} 
                                            alt="Chevron Icon" 
                                            height="16" 
                                            style={{ 
                                                transform: showFormatSection ? 'rotate(90deg)' : 'rotate(0deg)',
                                                transition: 'transform 0.2s ease'
                                            }} 
                                        />
                                    </div>
                                    
                                    {showFormatSection && (
                                        <textarea
                                            id="column-format"
                                            className="form--input wdth-full mrgnt-7 text--black text--micro"
                                            placeholder="E.g., 'Ensure the twitter handle starts with @ and has no spaces'"
                                            value={columnFormat}
                                            onChange={(e) => setColumnFormat(e.target.value)}
                                        />
                                    )}
                                </>
                            )}

                            {(columnType === 'select' || columnType === 'multiselect') && (
                                <div className="mrgnt-15">
                                    <p className="text--micro text__semibold mrgnb-7">Selection Options</p>
                                    <div style={{
                                        padding: '5px 8px'
                                    }} className="flex flex-row-center gap-10 mrgnt-10 mrgnb-10 form--input wdth-full">
                                        <input
                                            type="text"
                                            className="input-empty flex-expanded"
                                            placeholder="Enter option value"
                                            value={newOptionValue}
                                            onChange={(e) => setNewOptionValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && newOptionValue.trim()) {
                                                    e.preventDefault();
                                                    setSelectOptions([...selectOptions, newOptionValue.trim()]);
                                                    setNewOptionValue('');
                                                }
                                            }}
                                        />
                                        <img src={IconAddBlack} height="25" className="pointer" onClick={() => {
                                            if (newOptionValue.trim()) {
                                                setSelectOptions([...selectOptions, newOptionValue.trim()]);
                                                    setNewOptionValue('');
                                                }
                                            }}
                                        />
                                    </div>
                                    {selectOptions.length > 0 && (
                                        <div className="flex flex-column gap-10">
                                            {selectOptions.map((option, index) => (
                                                <div key={index} className="flex flex-row-center flex-space-between" 
                                                    style={{ border: '4px solid #EAE7E1', padding: '6px 12px' }}>
                                                    <p className="text--micro">{option}</p>
                                                    <img
                                                        src={IconDeleteBlack}
                                                        alt="Delete"
                                                        height="18"
                                                        className="pointer"
                                                        onClick={() => {
                                                            setSelectOptions(selectOptions.filter((_, i) => i !== index));
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

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

// Export helper functions for use in other components
export { getCellValue, getCellMeta, createCellWithMeta };

export default SheetView;
