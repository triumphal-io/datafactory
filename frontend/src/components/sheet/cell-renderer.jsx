import { useState, useRef, useEffect } from 'react';
import IconSheet from '../../assets/sheet.svg';
import IconDocument from '../../assets/document-black.svg';

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

/**
 * Renders an individual spreadsheet cell based on its column type.
 * Supports text, number, select, multiselect, url, email, checkbox, and file types.
 *
 * @param {Object} props
 * @param {*} props.value - Cell value (string, number, boolean, or object with {value, meta})
 * @param {string} props.columnType - Column type: 'text' | 'number' | 'select' | 'multiselect' | 'url' | 'email' | 'checkbox' | 'file'
 * @param {string[]} [props.columnOptions] - Available options for select/multiselect/file columns
 * @param {boolean} props.isSelected - Whether the cell is currently selected
 * @param {function} props.onEdit - Callback with the new value when the cell is edited
 * @param {number} props.rowIndex - Row index of this cell
 * @param {number} props.colIndex - Column index of this cell
 * @param {function} [props.onDropdownToggle] - Callback when a dropdown opens/closes (for scroll management)
 */
const CellRenderer = ({
    value,
    columnType,
    columnOptions,
    isSelected,
    onEdit,
    rowIndex,
    colIndex,
    onDropdownToggle
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const dropdownRef = useRef(null);
    const triggerRef = useRef(null);
    
    // Extract actual value and metadata from cell data
    const displayValue = getCellValue(value);
    const cellMeta = getCellMeta(value);

    // Handle clicking outside dropdown to close it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
                setIsEditing(false);
            }
        };

        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [dropdownOpen]);

    // Calculate dropdown position when opened
    useEffect(() => {
        if (dropdownOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const dropdownMaxHeight = 200;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            if (spaceBelow < dropdownMaxHeight + 20 && spaceAbove > dropdownMaxHeight + 20) {
                // Open above the trigger
                setDropdownPosition({
                    bottom: window.innerHeight - rect.top + 4,
                    left: rect.left - 13,
                    width: Math.max(rect.width + 25, 150),
                    openAbove: true
                });
            } else {
                // Open below the trigger (default)
                setDropdownPosition({
                    top: rect.bottom + 12,
                    left: rect.left - 13,
                    width: Math.max(rect.width + 25, 150),
                    openAbove: false
                });
            }
        } else if (!dropdownOpen && onDropdownToggle) {
            onDropdownToggle(false);
        }
    }, [dropdownOpen]);

    // Notify parent after dropdown renders with correct position
    useEffect(() => {
        if (dropdownOpen && dropdownRef.current && onDropdownToggle) {
            const dropdownRect = dropdownRef.current.getBoundingClientRect();
            onDropdownToggle(true, { row: rowIndex, col: colIndex, dropdownRect, openAbove: dropdownPosition.openAbove });
        }
    }, [dropdownPosition]);

    // Render Select field
    const renderSelect = () => {
        const options = columnOptions || [];
        const currentValue = displayValue || '';

        if (isEditing || dropdownOpen) {
            return (
                <>
                    <div 
                        ref={triggerRef}
                        className="select-trigger"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            width: 'auto'
                        }}
                    >
                        {currentValue ? (
                            <span className="chip" style={{
                                backgroundColor: '#0066cc',
                                color: 'white',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                lineHeight: '1.2'
                            }}>
                                <span>{currentValue}</span>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: '4px', flexShrink: 0 }}>
                                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </span>
                        ) : (
                            <span style={{ color: '#888', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span>Select...</span>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </span>
                        )}
                    </div>
                    {dropdownOpen && (
                        <div
                            ref={dropdownRef}
                            className="dropdown-menu"
                            style={{
                                position: 'fixed',
                                top: dropdownPosition.openAbove ? undefined : `${dropdownPosition.top}px`,
                                bottom: dropdownPosition.openAbove ? `${dropdownPosition.bottom}px` : undefined,
                                left: `${dropdownPosition.left}px`,
                                width: `${dropdownPosition.width}px`,
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                zIndex: 10000,
                                boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                            }}
                        >
                            {options.map((option, index) => (
                                <div
                                    key={index}
                                    className="dropdown-item"
                                    onClick={() => {
                                        onEdit(option);
                                        setDropdownOpen(false);
                                        setIsEditing(false);
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        color: currentValue === option ? '#0066cc' : '#e0e0e0',
                                        backgroundColor: currentValue === option ? 'rgba(0, 102, 204, 0.1)' : 'transparent'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = 'rgba(0, 102, 204, 0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = currentValue === option ? 'rgba(0, 102, 204, 0.1)' : 'transparent';
                                    }}
                                >
                                    {option}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            );
        }

        // View mode - show as chip
        if (currentValue) {
            return (
                <div 
                    onDoubleClick={() => {
                        setIsEditing(true);
                        setDropdownOpen(true);
                    }}
                    style={{ cursor: 'pointer', width: '100%' }}
                >
                    <span className="chip" style={{
                        backgroundColor: '#0066cc',
                        color: 'white',
                        padding: '2px 6px',
                        // borderRadius: '12px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: 'auto',
                        lineHeight: '1.2'
                    }}>
                        <span>{currentValue}</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: '4px', flexShrink: 0 }}>
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </span>
                </div>
            );
        }

        return (
            <div 
                onDoubleClick={() => {
                    setIsEditing(true);
                    setDropdownOpen(true);
                }}
                style={{ cursor: 'pointer', color: '#888', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
            >
                <span>Select...</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
        );
    };

    // Render Multi-select field
    const renderMultiSelect = () => {
        const options = columnOptions || [];
        const selectedValues = displayValue ? displayValue.split(',').map(v => v.trim()).filter(v => v) : [];

        if (isEditing || dropdownOpen) {
            return (
                <>
                    <div 
                        ref={triggerRef}
                        className="multiselect-trigger"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexWrap: 'wrap'
                        }}
                    >
                        {selectedValues.length > 0 ? selectedValues.map((val, idx) => (
                            <span key={idx} className="chip" style={{
                                backgroundColor: '#0066cc',
                                color: 'white',
                                padding: '2px 6px',
                                // borderRadius: '12px',
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                {val}
                                <span 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newValues = selectedValues.filter(v => v !== val);
                                        onEdit(newValues.join(', '));
                                    }}
                                    style={{ cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    ×
                                </span>
                            </span>
                        )) : (
                            <span style={{ color: '#888', fontSize: '12px' }}>Select...</span>
                        )}
                    </div>
                    {dropdownOpen && (
                        <div
                            ref={dropdownRef}
                            className="dropdown-menu"
                            style={{
                                position: 'fixed',
                                top: dropdownPosition.openAbove ? undefined : `${dropdownPosition.top}px`,
                                bottom: dropdownPosition.openAbove ? `${dropdownPosition.bottom}px` : undefined,
                                left: `${dropdownPosition.left}px`,
                                width: `${dropdownPosition.width}px`,
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                zIndex: 10000,
                                boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                            }}
                        >
                            {options.map((option, index) => {
                                const isSelected = selectedValues.includes(option);
                                return (
                                    <div
                                        key={index}
                                        className="dropdown-item"
                                        onClick={() => {
                                            let newValues;
                                            if (isSelected) {
                                                newValues = selectedValues.filter(v => v !== option);
                                            } else {
                                                newValues = [...selectedValues, option];
                                            }
                                            onEdit(newValues.join(', '));
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            color: '#e0e0e0',
                                            backgroundColor: isSelected ? 'rgba(0, 102, 204, 0.2)' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.target.style.backgroundColor = 'rgba(0, 102, 204, 0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.target.style.backgroundColor = isSelected ? 'rgba(0, 102, 204, 0.2)' : 'transparent';
                                        }}
                                    >
                                        <input 
                                            type="checkbox" 
                                            checked={isSelected} 
                                            readOnly 
                                            style={{ pointerEvents: 'none' }}
                                        />
                                        {option}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            );
        }

        // View mode - show as chips
        if (selectedValues.length > 0) {
            return (
                <div 
                    onDoubleClick={() => {
                        setIsEditing(true);
                        setDropdownOpen(true);
                    }}
                    style={{ 
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '4px',
                        flexWrap: 'wrap'
                    }}
                >
                    {selectedValues.map((val, idx) => (
                        <span key={idx} className="chip" style={{
                            backgroundColor: '#0066cc',
                            color: 'white',
                            padding: '2px 6px',
                            // borderRadius: '12px',
                            fontSize: '11px',
                            display: 'inline-block'
                        }}>
                            {val}
                        </span>
                    ))}
                </div>
            );
        }

        return (
            <div 
                onDoubleClick={() => {
                    setIsEditing(true);
                    setDropdownOpen(true);
                }}
                style={{ cursor: 'pointer', color: '#888', fontSize: '12px' }}
            >
                Select...
            </div>
        );
    };

    // Render URL field
    const renderUrl = () => {
        const url = displayValue || '';

        if (!url) {
            return <span style={{ color: '#888' }}></span>;
        }

        // Ensure URL has protocol
        const formattedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

        return (
            <a
                href={formattedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                    color: '#0066cc',
                    textDecoration: 'underline',
                    cursor: 'pointer'
                }}
            >
                {url}
            </a>
        );
    };

    // Render Email field
    const renderEmail = () => {
        const email = displayValue || '';

        if (!email) {
            return <span style={{ color: '#888' }}></span>;
        }

        return (
            <a
                href={`mailto:${email}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                    color: '#0066cc',
                    textDecoration: 'underline',
                    cursor: 'pointer'
                }}
            >
                {email}
            </a>
        );
    };

    // Render Checkbox field
    const renderCheckbox = () => {
        const isChecked = displayValue === true || displayValue === 'true' || displayValue === 'TRUE' || displayValue === 1 || displayValue === '1';
        const checkboxId = `cell-cbx-${rowIndex}-${colIndex}`;

        return (
            <div 
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%'
                }}
            >
                <input 
                    type="checkbox"
                    className="cbx"
                    id={checkboxId}
                    style={{ display: 'none' }}
                    checked={isChecked}
                    readOnly
                />
                <label 
                    className="check"
                    htmlFor={checkboxId}
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(!isChecked);
                    }}
                >
                    <svg width="16px" height="16px" viewBox="0 0 18 18">
                        <path d="M1,9 L1,3.5 C1,2 2,1 3.5,1 L14.5,1 C16,1 17,2 17,3.5 L17,14.5 C17,16 16,17 14.5,17 L3.5,17 C2,17 1,16 1,14.5 L1,9 Z"></path>
                        <polyline points="1 9 7 14 15 4"></polyline>
                    </svg>
                </label>
            </div>
        );
    };

    // Render File field
    const renderFile = () => {
        const options = columnOptions || [];
        const selectedValues = displayValue ? displayValue.split(',').map(v => v.trim()).filter(v => v) : [];

        if (isEditing || dropdownOpen) {
            return (
                <>
                    <div 
                        ref={triggerRef}
                        className="multiselect-trigger"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexWrap: 'wrap'
                        }}
                    >
                        {selectedValues.length > 0 ? selectedValues.map((val, idx) => (
                            <span key={idx} className="chip" style={{
                                backgroundColor: '#ffffff', // White
                                color: '#000000', // Black
                                // border: '1px solid #e0e0e0', // Light border for visibility
                                padding: '2px 6px',
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                borderRadius: '4px' // Consistent look
                            }}>
                                <img src={IconSheet} width="10" height="10" alt="file" />
                                {val}
                                <span 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newValues = selectedValues.filter(v => v !== val);
                                        onEdit(newValues.join(', '));
                                    }}
                                    style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '2px' }}
                                >
                                    ×
                                </span>
                            </span>
                        )) : (
                            <span style={{ color: '#888', fontSize: '12px' }}>Select files...</span>
                        )}
                    </div>
                    {dropdownOpen && (
                        <div
                            ref={dropdownRef}
                            className="dropdown-menu"
                            style={{
                                position: 'fixed',
                                top: dropdownPosition.openAbove ? undefined : `${dropdownPosition.top}px`,
                                bottom: dropdownPosition.openAbove ? `${dropdownPosition.bottom}px` : undefined,
                                left: `${dropdownPosition.left}px`,
                                width: `${dropdownPosition.width}px`,
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                zIndex: 10000,
                                boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                            }}
                        >
                            {options.map((option, index) => {
                                const isSelected = selectedValues.includes(option);
                                return (
                                    <div
                                        key={index}
                                        className="dropdown-item"
                                        onClick={() => {
                                            let newValues;
                                            if (isSelected) {
                                                newValues = selectedValues.filter(v => v !== option);
                                            } else {
                                                newValues = [...selectedValues, option];
                                            }
                                            onEdit(newValues.join(', '));
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            color: '#e0e0e0',
                                            backgroundColor: isSelected ? 'rgba(0, 102, 204, 0.2)' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.target.style.backgroundColor = 'rgba(0, 102, 204, 0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.target.style.backgroundColor = isSelected ? 'rgba(0, 102, 204, 0.2)' : 'transparent';
                                        }}
                                    >
                                        <input 
                                            type="checkbox" 
                                            checked={isSelected} 
                                            readOnly 
                                            style={{ pointerEvents: 'none' }}
                                        />
                                        {option}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            );
        }

        // View mode - show as chips
        if (selectedValues.length > 0) {
            return (
                <div 
                    onDoubleClick={() => {
                        setIsEditing(true);
                        setDropdownOpen(true);
                    }}
                    style={{ 
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '4px',
                        flexWrap: 'wrap'
                    }}
                >
                    {selectedValues.map((val, idx) => (
                        <span key={idx} className="chip" style={{
                            backgroundColor: '#ffffff', // White
                            color: '#000000', // Black
                            // border: '1px solid #e0e0e0',
                            padding: '2px 6px',
                            fontSize: '11px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderRadius: '4px'
                        }}>
                             <img src={IconDocument} width="10" height="10" alt="file" />
                            {val}
                        </span>
                    ))}
                </div>
            );
        }

        return (
            <div 
                onDoubleClick={() => {
                    setIsEditing(true);
                    setDropdownOpen(true);
                }}
                style={{ cursor: 'pointer', color: '#888', fontSize: '12px' }}
            >
                Select files...
            </div>
        );
    };

    // Render based on column type
    switch (columnType) {
        case 'select':
            return renderSelect();
        case 'multiselect':
            return renderMultiSelect();
        case 'url':
            return renderUrl();
        case 'email':
            return renderEmail();
        case 'checkbox':
            return renderCheckbox();
        case 'file':
            return renderFile();
        default:
            return displayValue || '';
    }
};

export default CellRenderer;
