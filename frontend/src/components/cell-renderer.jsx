import { useState, useRef, useEffect } from 'react';

const CellRenderer = ({ 
    value, 
    columnType, 
    columnOptions, 
    isSelected, 
    onEdit,
    rowIndex,
    colIndex 
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const dropdownRef = useRef(null);
    const triggerRef = useRef(null);

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
            setDropdownPosition({
                top: rect.bottom + 12,
                left: rect.left - 13,
                width: Math.max(rect.width + 25, 150)
            });
        }
    }, [dropdownOpen]);

    // Render Select field
    const renderSelect = () => {
        const options = columnOptions || [];
        const currentValue = value || '';

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
                                top: `${dropdownPosition.top}px`,
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
                                        fontSize: '12px',
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
                        padding: '3px 8px',
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
        const selectedValues = value ? value.split(',').map(v => v.trim()).filter(v => v) : [];

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
                                padding: '2px 8px',
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
                                top: `${dropdownPosition.top}px`,
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
                            padding: '2px 8px',
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
        const url = value || '';

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
        const email = value || '';

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
        const isChecked = value === true || value === 'true' || value === 'TRUE' || value === 1 || value === '1';
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
        default:
            return value || '';
    }
};

export default CellRenderer;
