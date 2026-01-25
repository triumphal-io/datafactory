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

const WorkbookView = forwardRef(({ workbookId: propWorkbookId, sheetId: propSheetId, onSelectionChange, onSheetNameChange, onFilesDropped, selectedModel, sheetsList: propSheetsList, workbookName: propWorkbookName, onWorkbookNameChange, onSheetsListChange }, ref) => {
    const navigate = useNavigate();
    const sheetViewRef = useRef(null);
    const filesViewRef = useRef(null);
    const nameChangeTimeoutRef = useRef(null);

    // State management
    const [workbookId, setWorkbookId] = useState(propWorkbookId);
    const [sheetId, setSheetId] = useState(propSheetId);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [sheetsList, setSheetsList] = useState(propSheetsList || []);
    const [workbookName, setWorkbookName] = useState(propWorkbookName || 'Loading...');
    const [activeView, setActiveView] = useState(propSheetId ? 'sheet' : 'resources'); // 'sheet' or 'resources'
    const [lastSaved, setLastSaved] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [sheetNavState, setSheetNavState] = useState(null);
    const [initialWorkbookName, setInitialWorkbookName] = useState('');
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
        setWorkbookId(propWorkbookId);
    }, [propWorkbookId]);

    useEffect(() => {
        if (propSheetsList) {
            setSheetsList(propSheetsList);
        }
    }, [propSheetsList]);

    useEffect(() => {
        if (propWorkbookName) {
            setWorkbookName(propWorkbookName);
        }
    }, [propWorkbookName]);

    useEffect(() => {
        setSheetId(propSheetId);
        const newView = propSheetId ? 'sheet' : 'resources';
        setActiveView(newView);

        // Update sheet name for assistant context
        if (newView === 'sheet' && onSheetNameChange) {
            let currentSheetName = '';
            // If default-sheet, use the first sheet's name
            if (propSheetId === 'default-sheet' && sheetsList.length > 0) {
                currentSheetName = sheetsList[0].name;
            } 
            // Otherwise find the sheet by ID
            else if (sheetsList.length > 0) {
                const sheet = sheetsList.find(s => s.id === propSheetId);
                if (sheet) {
                    currentSheetName = sheet.name;
                }
            }
            
            if (currentSheetName) {
                onSheetNameChange(currentSheetName);
            }
        } else if (newView === 'resources' && onSheetNameChange) {
            onSheetNameChange('');
        }
    }, [propSheetId, sheetsList, onSheetNameChange]);

    // Initialize workbook name when it first loads
    useEffect(() => {
        if (propWorkbookName && !initialWorkbookName) {
            setInitialWorkbookName(propWorkbookName);
        }
    }, [propWorkbookName, initialWorkbookName]);

    // Update sheet name when sheetId or sheetsList changes
    useEffect(() => {
        if (sheetId && sheetsList.length > 0 && onSheetNameChange) {
            const currentSheet = sheetsList.find(sheet => sheet.id === sheetId);
            if (currentSheet && currentSheet.name) {
                onSheetNameChange(currentSheet.name);
            }
        }
    }, [sheetId, sheetsList, onSheetNameChange]);

    // Clear sheet name when switching to resources
    useEffect(() => {
        if (activeView === 'resources' && onSheetNameChange) {
            onSheetNameChange('');
        }
    }, [activeView, onSheetNameChange]);

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

    // Auto-save workbook name when it changes (debounced)
    useEffect(() => {
        // Don't save if name hasn't loaded yet or hasn't changed
        if (!initialWorkbookName || workbookName === initialWorkbookName) return;

        // Clear existing timer
        if (nameChangeTimeoutRef.current) {
            clearTimeout(nameChangeTimeoutRef.current);
        }

        // Set new timer for debounced save (500ms after last change)
        nameChangeTimeoutRef.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                const response = await apiFetch(`/api/workbooks/${workbookId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: workbookName }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success') {
                        setInitialWorkbookName(workbookName);
                        setLastSaved(new Date());
                    }
                }
            } catch (error) {
                console.error('Error saving workbook name:', error);
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
    }, [workbookName, initialWorkbookName, workbookId]);

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
            const response = await apiFetch(`/api/workbooks/${workbookId}/sheets/new`, {
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
                    const listResponse = await apiFetch(`/api/workbooks/${workbookId}`);
                    if (listResponse.ok) {
                        const listData = await listResponse.json();
                        if (listData.status === 'success' && listData.sheets) {
                            setSheetsList(listData.sheets);
                            onSheetsListChange && onSheetsListChange(listData.sheets);
                            // Navigate to the new sheet
                            navigate(`/workbook/${workbookId}/sheet/${data.sheet.id}`);
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
            const response = await apiFetch(`/api/workbooks/${workbookId}/sheets/${sheetIdToDelete}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('Sheet deleted successfully', 'success');
                    // Refresh sheets list
                    const listResponse = await apiFetch(`/api/workbooks/${workbookId}`);
                    if (listResponse.ok) {
                        const listData = await listResponse.json();
                        if (listData.status === 'success' && listData.sheets) {
                            setSheetsList(listData.sheets);
                            onSheetsListChange && onSheetsListChange(listData.sheets);
                            // If we deleted the current sheet, navigate to the first sheet
                            if (sheetIdToDelete === sheetId && listData.sheets.length > 0) {
                                navigate(`/workbook/${workbookId}/sheet/${listData.sheets[0].id}`);
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
            // Send PATCH request to update sheet name
            const response = await apiFetch(`/api/workbooks/${workbookId}/sheets/${editingSheetId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: editingSheetName
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    // Update local state with the updated sheet info
                    const updatedSheets = sheetsList.map(sheet => 
                        sheet.id === editingSheetId 
                            ? { ...sheet, name: editingSheetName }
                            : sheet
                    );
                    setSheetsList(updatedSheets);
                    onSheetsListChange && onSheetsListChange(updatedSheets);
                    
                    showToast('Sheet name updated successfully', 'success');
                    setIsEditModalOpen(false);
                } else {
                    showToast(data.message || 'Failed to update sheet name', 'error');
                }
            } else {
                showToast('Failed to update sheet name', 'error');
            }
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
                {/* Workbook Navigation Bar */}
                <div className="sheet-nav flex flex-row-center flex-space-between padr-10">
                    <div className="flex flex-row-center gap-15 pad-14 padr-15 padl-15">
                        {!isDrawerOpen && (
                            <img src={IconPanOpen} alt="Back Icon" height="18" className='pointer' onClick={() => setIsDrawerOpen(!isDrawerOpen)} />
                        )}
                        <input 
                            type="text" 
                            className='input-empty text--white' 
                            value={workbookName}
                            onChange={(e) => {
                                setWorkbookName(e.target.value);
                                onWorkbookNameChange && onWorkbookNameChange(e.target.value);
                            }}
                        />
                    </div>
                    
                    {/* View-specific navigation items */}
                    {sheetNavState}
                </div>
                
                {/* View Content */}
                {activeView === 'sheet' && sheetId && (
                    <SheetView 
                        ref={sheetViewRef}
                        workbookId={workbookId} 
                        sheetId={sheetId}
                        onSavingChange={setIsSaving}
                        onLastSavedChange={setLastSaved}
                        onNavigationChange={setSheetNavState}
                        onSelectionChange={onSelectionChange}
                        selectedModel={selectedModel}
                    />
                )}

                {activeView === 'resources' && (
                    <FilesView 
                        ref={filesViewRef}
                        workbookId={workbookId}
                        onSavingChange={setIsSaving}
                        onLastSavedChange={setLastSaved}
                        onNavigationChange={setSheetNavState}
                    />
                )}

                {/* Workbook Footer */}
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
                                            navigate(`/workbook/${workbookId}/sheet/${sheet.id}`);
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
                                    activeView === 'resources' ? 'active' : ''
                                }`}
                                onClick={() => {
                                    setActiveView('resources');
                                    navigate(`/workbook/${workbookId}/files`);
                                }}
                            >
                                <img src={IconProject} alt="Resources Icon" height="16" />
                                <p className="text--micro">Resources</p>
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

WorkbookView.displayName = 'WorkbookView';

export default WorkbookView;
