import { useState, useRef, useCallback, useEffect } from 'react';
import { getColumnTypeIcon, getColumnLetter } from '../../utils/sheet-helpers.jsx';

const SheetColumnHeader = ({
    columns,
    columnWidths,
    selectedColumns,
    selectedRows,
    rows,
    onHeaderClick,
    onHeaderDoubleClick,
    onSelectAllRows,
    onColumnWidthChange,
    onColumnWidthPersist,
}) => {
    const [isResizing, setIsResizing] = useState(false);
    const [resizingColumn, setResizingColumn] = useState(null);
    const resizeStartXRef = useRef(null);
    const resizeStartWidthRef = useRef(null);

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

        onColumnWidthChange(resizingColumn, newWidth);
    }, [isResizing, resizingColumn, onColumnWidthChange]);

    const handleResizeMouseUp = useCallback(() => {
        if (resizingColumn !== null) {
            onColumnWidthPersist(resizingColumn);
        }

        setIsResizing(false);
        setResizingColumn(null);
        resizeStartXRef.current = null;
        resizeStartWidthRef.current = null;
    }, [resizingColumn, onColumnWidthPersist]);

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

    return (
        <div className="sheet-row header-row">
            {columns.length > 0 && (
                <div className="sheet-row-head">
                    <input
                        type="checkbox"
                        className="cbx"
                        id="cbxbnall"
                        style={{ display: 'none' }}
                        checked={rows.length > 0 && selectedRows.size === rows.length}
                        onChange={(e) => onSelectAllRows(e.target.checked)}
                    />
                    <label className="check" htmlFor="cbxbnall">
                        <svg width="16px" height="16px" viewBox="0 0 18 18">
                            <path d="M1,9 L1,3.5 C1,2 2,1 3.5,1 L14.5,1 C16,1 17,2 17,3.5 L17,14.5 C17,16 16,17 14.5,17 L3.5,17 C2,17 1,16 1,14.5 L1,9 Z"></path>
                            <polyline points="1 9 7 14 15 4"></polyline>
                        </svg>
                    </label>
                </div>
            )}
            {columns.map((column, colIndex) => (
                <div
                    key={colIndex}
                    className={`sheet-row-item header-cell ${
                        selectedColumns.has(colIndex) ? 'column-selected' : ''
                    }`}
                    style={{ width: `${columnWidths[colIndex] || 160}px` }}
                    data-col={colIndex}
                    data-description={column.prompt}
                    onClick={(e) => onHeaderClick(colIndex, e)}
                    onDoubleClick={(e) => onHeaderDoubleClick(colIndex, e)}
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
    );
};

export default SheetColumnHeader;
