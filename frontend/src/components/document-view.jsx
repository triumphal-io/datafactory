import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import IconPanOpen from '../assets/pan-open.svg';
import IconFileAttach from '../assets/file-attach.svg';
import IconSheet from '../assets/sheet.svg';
import IconProject from '../assets/folder.svg';
import IconAdd from '../assets/add-circle.svg';
import IconChevronDown from '../assets/chevron-down.svg';
import Drawer from './drawer';
import SheetView from './sheet-view';
import FilesView from './files-view';
import { apiFetch } from '../utils/api';
import { getTimeAgo, showToast } from '../utils/utils';

const DocumentView = forwardRef(({ documentId: propDocumentId, sheetId: propSheetId, onSelectionChange, onSheetNameChange, onFilesDropped }, ref) => {
    const navigate = useNavigate();
    const sheetViewRef = useRef(null);
    const filesViewRef = useRef(null);
    const nameChangeTimeoutRef = useRef(null);

    // State management
    const [documentId, setDocumentId] = useState(propDocumentId);
    const [sheetId, setSheetId] = useState(propSheetId);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [sheetsList, setSheetsList] = useState([]);
    const [documentName, setDocumentName] = useState('Loading...');
    const [activeView, setActiveView] = useState(propSheetId ? 'sheet' : 'project-files'); // 'sheet' or 'project-files'
    const [lastSaved, setLastSaved] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [sheetNavState, setSheetNavState] = useState(null);
    const [initialDocumentName, setInitialDocumentName] = useState('');
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [dropdownOpenForSheet, setDropdownOpenForSheet] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSheetName, setEditingSheetName] = useState('');
    const [editingSheetId, setEditingSheetId] = useState(null);
    const dragCounterRef = useRef(0);
    const dropdownRef = useRef(null);

    // Expose tool execution methods to parent via ref
    useImperativeHandle(ref, () => ({
        getSheetData: () => {
            if (sheetViewRef.current && activeView === 'sheet') {
                return sheetViewRef.current.getSheetData();
            }
            return null;
        },
        
        executeTools: async (tools) => {
            console.log('Executing tools:', tools);
            
            const toolResults = [];
            
            // Execute tools sequentially
            for (const tool of tools) {
                console.log(`\n=== Tool Call: ${tool.name} ===`);
                console.log('Tool ID:', tool.id);
                console.log('Arguments:', JSON.stringify(tool.arguments, null, 2));
                
                try {
                    let result;
                    
                    switch (tool.name) {
                        case 'tool_add_rows':
                            if (sheetViewRef.current && activeView === 'sheet') {
                                result = await sheetViewRef.current.addRows(
                                    tool.arguments.count, 
                                    tool.arguments.position || 'end'
                                );
                                console.log('Result:', result);
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: result.success 
                                        ? result.message
                                        : `Failed: ${result.error}`
                                });
                            } else {
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: 'Error: No sheet is currently open'
                                });
                            }
                            console.log('=== Tool Completed ===\n');
                            break;
                        
                        case 'tool_delete_rows':
                            if (sheetViewRef.current && activeView === 'sheet') {
                                result = await sheetViewRef.current.deleteRows(
                                    tool.arguments.row_numbers
                                );
                                console.log('Result:', result);
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: result.success 
                                        ? result.message
                                        : `Failed: ${result.error}`
                                });
                            } else {
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: 'Error: No sheet is currently open'
                                });
                            }
                            console.log('=== Tool Completed ===\n');
                            break;
                        
                        case 'tool_delete_column':
                            if (sheetViewRef.current && activeView === 'sheet') {
                                result = await sheetViewRef.current.deleteColumns(
                                    tool.arguments.columns
                                );
                                console.log('Result:', result);
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: result.success 
                                        ? result.message
                                        : `Failed: ${result.error}`
                                });
                            } else {
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: 'Error: No sheet is currently open'
                                });
                            }
                            console.log('=== Tool Completed ===\n');
                            break;
                        
                        case 'tool_add_column':
                            if (sheetViewRef.current && activeView === 'sheet') {
                                result = await sheetViewRef.current.addColumns(
                                    tool.arguments.columns, 
                                    tool.arguments.position || 'end'
                                );
                                console.log('Result:', result);
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: result.success 
                                        ? result.message
                                        : `Failed: ${result.error}`
                                });
                            } else {
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: 'Error: No sheet is currently open'
                                });
                            }
                            console.log('=== Tool Completed ===\n');
                            break;
                        
                        case 'tool_populate_cells':
                            if (sheetViewRef.current && activeView === 'sheet') {
                                result = await sheetViewRef.current.populateCells(
                                    tool.arguments.cells
                                );
                                console.log('Result:', result);
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: result.success 
                                        ? result.message
                                        : `Failed: ${result.error}`
                                });
                            } else {
                                toolResults.push({
                                    id: tool.id,
                                    name: tool.name,
                                    result: 'Error: No sheet is currently open'
                                });
                            }
                            console.log('=== Tool Completed ===\n');
                            break;
                        
                        // Add more tool cases here as needed
                        default:
                            toolResults.push({
                                id: tool.id,
                                name: tool.name,
                                result: `Error: Unknown tool ${tool.name}`
                            });
                    }
                } catch (error) {
                    toolResults.push({
                        id: tool.id,
                        name: tool.name,
                        result: `Error: ${error.message}`
                    });
                }
            }
            
            return toolResults;
        }
    }), [activeView]);

    // Sync props to state when they change (for navigation)
    useEffect(() => {
        setDocumentId(propDocumentId);
    }, [propDocumentId]);

    useEffect(() => {
        setSheetId(propSheetId);
        setActiveView(propSheetId ? 'sheet' : 'project-files');
    }, [propSheetId]);

    // Load sheets list from backend
    useEffect(() => {
        const loadDocumentData = async () => {
            try {
                const response = await apiFetch(`/api/documents/${documentId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success' && data.sheets) {
                        setSheetsList(data.sheets);
                        setDocumentName(data.name);
                        setInitialDocumentName(data.name);
                        console.log('Sheets list loaded:', data.sheets);
                    }
                }
            } catch (error) {
                console.error('Error loading sheets list:', error);
            }
        };

        loadDocumentData();
    }, [documentId]);

    // Update sheet name when sheetId or sheetsList changes
    useEffect(() => {
        if (sheetId && sheetsList.length > 0 && onSheetNameChange) {
            const currentSheet = sheetsList.find(sheet => sheet.id === sheetId);
            if (currentSheet && currentSheet.name) {
                onSheetNameChange(currentSheet.name);
            }
        }
    }, [sheetId, sheetsList, onSheetNameChange]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpenForSheet(null);
            }
        };

        if (dropdownOpenForSheet) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownOpenForSheet]);

    // Auto-save document name when it changes (debounced)
    useEffect(() => {
        // Don't save if name hasn't loaded yet or hasn't changed
        if (!initialDocumentName || documentName === initialDocumentName) return;

        // Clear existing timer
        if (nameChangeTimeoutRef.current) {
            clearTimeout(nameChangeTimeoutRef.current);
        }

        // Set new timer for debounced save (500ms after last change)
        nameChangeTimeoutRef.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                const response = await apiFetch(`/api/documents/${documentId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: documentName }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success') {
                        setInitialDocumentName(documentName);
                        setLastSaved(new Date());
                    }
                }
            } catch (error) {
                console.error('Error saving document name:', error);
            } finally {
                setIsSaving(false);
            }
        }, 500);

        // Cleanup function
        return () => {
            if (nameChangeTimeoutRef.current) {
                clearTimeout(nameChangeTimeoutRef.current);
            }
        };
    }, [documentName, initialDocumentName, documentId]);

    // Drag and drop handlers
    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDraggingOver(false);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        dragCounterRef.current = 0;

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            // Send files to assistant chat instead of uploading
            // This will be handled by passing files to the assistant via a callback
            if (onFilesDropped) {
                onFilesDropped(files);
            }
        }
    };

    // Handle creating a new sheet
    const handleCreateNewSheet = async () => {
        try {
            const response = await apiFetch(`/api/documents/${documentId}/sheets/new`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast(`Created ${data.sheet.name}`, 'success');
                    // Refresh sheets list
                    const listResponse = await apiFetch(`/api/documents/${documentId}`);
                    if (listResponse.ok) {
                        const listData = await listResponse.json();
                        if (listData.status === 'success' && listData.sheets) {
                            setSheetsList(listData.sheets);
                            // Navigate to the new sheet
                            navigate(`/document/${documentId}/sheet/${data.sheet.id}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error creating new sheet:', error);
            showToast('Failed to create sheet', 'error');
        }
    };

    // Handle deleting a sheet
    const handleDeleteSheet = async (sheetIdToDelete) => {
        if (!confirm('Are you sure you want to delete this sheet?')) {
            return;
        }

        try {
            const response = await apiFetch(`/api/documents/${documentId}/sheets/${sheetIdToDelete}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('Sheet deleted successfully', 'success');
                    // Refresh sheets list
                    const listResponse = await apiFetch(`/api/documents/${documentId}`);
                    if (listResponse.ok) {
                        const listData = await listResponse.json();
                        if (listData.status === 'success' && listData.sheets) {
                            setSheetsList(listData.sheets);
                            // If we deleted the current sheet, navigate to the first sheet
                            if (sheetIdToDelete === sheetId && listData.sheets.length > 0) {
                                navigate(`/document/${documentId}/sheet/${listData.sheets[0].id}`);
                            }
                        }
                    }
                } else {
                    showToast(data.message || 'Failed to delete sheet', 'error');
                }
            }
        } catch (error) {
            console.error('Error deleting sheet:', error);
            showToast('Failed to delete sheet', 'error');
        }
        setDropdownOpenForSheet(null);
    };

    // Handle opening edit metadata modal
    const handleEditMetadata = (sheet) => {
        setEditingSheetId(sheet.id);
        setEditingSheetName(sheet.name);
        setIsEditModalOpen(true);
        setDropdownOpenForSheet(null);
    };

    // Handle saving sheet metadata
    const handleSaveSheetMetadata = async () => {
        if (!editingSheetName.trim()) {
            showToast('Sheet name cannot be empty', 'error');
            return;
        }

        try {
            // For now, we'll update the sheet name by updating the sheet data
            // You may need to add a PATCH endpoint to update only metadata
            const updatedSheets = sheetsList.map(sheet => 
                sheet.id === editingSheetId 
                    ? { ...sheet, name: editingSheetName }
                    : sheet
            );
            setSheetsList(updatedSheets);
            
            // TODO: Send update to backend when PATCH endpoint is available
            // For now, the name will be reset on reload
            showToast('Sheet name updated (temporary)', 'info');
            setIsEditModalOpen(false);
        } catch (error) {
            console.error('Error updating sheet metadata:', error);
            showToast('Failed to update sheet metadata', 'error');
        }
    };

    // Toggle dropdown for a specific sheet
    const toggleDropdown = (sheetIdToToggle, event) => {
        event.stopPropagation();
        setDropdownOpenForSheet(dropdownOpenForSheet === sheetIdToToggle ? null : sheetIdToToggle);
    };

    return (
        <div 
            className="sheet flex flex-row"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Sidebar Drawer */}
            <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

            {/* Main Content */}
            <div className="flex flex-column" style={{ flex: 1, height: '100vh', overflow: 'hidden' }}>
                {/* Document Navigation Bar */}
                <div className="sheet-nav flex flex-row-center flex-space-between padr-10">
                    <div className="flex flex-row-center gap-15 pad-14 padr-15 padl-15">
                        {!isDrawerOpen && (
                            <img src={IconPanOpen} alt="Back Icon" height="18" className='pointer' onClick={() => setIsDrawerOpen(!isDrawerOpen)} />
                        )}
                        <input 
                            type="text" 
                            className='input-empty text--white' 
                            value={documentName}
                            onChange={(e) => setDocumentName(e.target.value)}
                        />
                    </div>
                    
                    {/* View-specific navigation items */}
                    {sheetNavState}
                </div>
                
                {/* View Content */}
                {activeView === 'sheet' && sheetId && (
                    <SheetView 
                        ref={sheetViewRef}
                        documentId={documentId} 
                        sheetId={sheetId}
                        onSavingChange={setIsSaving}
                        onLastSavedChange={setLastSaved}
                        onNavigationChange={setSheetNavState}
                        onSelectionChange={onSelectionChange}
                    />
                )}

                {activeView === 'project-files' && (
                    <FilesView 
                        ref={filesViewRef}
                        documentId={documentId}
                        onSavingChange={setIsSaving}
                        onLastSavedChange={setLastSaved}
                        onNavigationChange={setSheetNavState}
                    />
                )}

                {/* Document Footer */}
                <div>
                    <div className="sheet-footer flex flex-row-center flex-space-betweenw">
                        <div className="sheet-footer-add pointer" onClick={handleCreateNewSheet}>
                            <img src={IconAdd} alt="Add Icon" height="16" />
                        </div>
                        <div className="sheet-footer-tab-group wdth-100">
                            {sheetsList.map((sheet, index) => {
                                const isActive = activeView === 'sheet' && (sheet.id === sheetId || (sheetId === 'default-sheet' && index === 0));
                                return (
                                    <div 
                                        key={sheet.id}
                                        className={`sheet-footer-tab flex flex-row-center gap-5 pointer ${
                                            isActive ? 'active' : ''
                                        }`}
                                        onClick={() => {
                                            setActiveView('sheet');
                                            navigate(`/document/${documentId}/sheet/${sheet.id}`);
                                        }}
                                    >
                                        <img src={IconSheet} alt="Sheet Icon" height="16" />
                                        <p className="text--micro">{sheet.name}</p>
                                        {isActive && (
                                            <div style={{ position: 'relative', display: 'inline-block' }} ref={dropdownOpenForSheet === sheet.id ? dropdownRef : null}>
                                                <span 
                                                    style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '4px', opacity: 0.7, cursor: 'pointer' }}
                                                    onClick={(e) => toggleDropdown(sheet.id, e)}
                                                >
                                                    <img src={IconChevronDown} alt="Options" height="12" />
                                                </span>
                                                {dropdownOpenForSheet === sheet.id && (
                                                    <div 
                                                        style={{
                                                            position: 'absolute',
                                                            bottom: '100%',
                                                            left: '0',
                                                            marginBottom: '4px',
                                                            backgroundColor: '#222',
                                                            border: '1px solid #3b3b3b',
                                                            borderRadius: '4px',
                                                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                                            zIndex: 1000,
                                                            minWidth: '150px'
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <div 
                                                            style={{
                                                                padding: '8px 12px',
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                                borderBottom: '1px solid #3b3b3b'
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEditMetadata(sheet);
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            Edit Metadata
                                                        </div>
                                                        <div 
                                                            style={{
                                                                padding: '8px 12px',
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                                color: '#ff6b6b'
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteSheet(sheet.id);
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            Delete
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <div 
                                className={`sheet-footer-tab flex flex-row-center gap-5 pointer ${
                                    activeView === 'project-files' ? 'active' : ''
                                }`}
                                onClick={() => {
                                    setActiveView('project-files');
                                    navigate(`/document/${documentId}/files`);
                                }}
                            >
                                <img src={IconProject} alt="Project Icon" height="16" />
                                <p className="text--micro">Project Files</p>
                            </div>
                            <div className='spacer'></div>
                            <div className="flex flex-row-center padr-15">
                                {isSaving && (
                                    <p className="text--micro" style={{ color: '#10b981' }}>Saving...</p>
                                )}
                                {!isSaving && lastSaved && (
                                    <p className="text--micro" style={{ color: '#6b7280', fontSize: '11px' }}>
                                        Saved {getTimeAgo(lastSaved)}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Sheet Metadata Popup */}
            {isEditModalOpen && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus">Edit Sheet Metadata</p>
                                <i className="icon-ic_fluent_dismiss_48_regular text--black i-normal-plus pointer" 
                                   onClick={() => setIsEditModalOpen(false)}></i>
                            </div>
                            
                            <p className="text--micro text__semibold mrgnt-15">Sheet Name</p>
                            <input
                                type="text"
                                className="form--input wdth-full mrgnt-7"
                                placeholder="Enter sheet name"
                                value={editingSheetName}
                                onChange={(e) => setEditingSheetName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveSheetMetadata();
                                    }
                                }}
                            />

                            <button 
                                onClick={handleSaveSheetMetadata}
                                className="button button-big wdth-full mrgnt-20"
                            >
                                Save
                            </button>
                            
                            <button 
                                onClick={() => setIsEditModalOpen(false)}
                                className="button button-big button-dark wdth-full mrgnt-7"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Drag and Drop Overlay */}
            {isDraggingOver && (
                <div className="drop-overlay">
                    <div className="flex flex-column gap-15">
                        <img src={IconFileAttach} alt="File Icon" height="80" />
                        <p className="text-mega">Drop files here to add to the project</p>
                    </div>
                </div>
            )}
        </div>
    );
});

DocumentView.displayName = 'DocumentView';

export default DocumentView;
