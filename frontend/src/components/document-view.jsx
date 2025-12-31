import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import IconPanOpen from '../assets/pan-open.svg';
import IconSheet from '../assets/sheet.svg';
import IconProject from '../assets/folder.svg';
import IconAdd from '../assets/add-circle.svg';
import Drawer from './drawer';
import SheetView from './sheet-view';
import FilesView from './files-view';
import { apiFetch } from '../utils/api';
import { getTimeAgo } from '../utils/utils';

const DocumentView = forwardRef(({ documentId: propDocumentId, sheetId: propSheetId }, ref) => {
    const navigate = useNavigate();
    const sheetViewRef = useRef(null);
    const filesViewRef = useRef(null);

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

    // Expose tool execution methods to parent via ref
    useImperativeHandle(ref, () => ({
        executeTools: async (tools) => {
            console.log('Executing tools:', tools);
            
            const toolResults = [];
            
            // Execute tools sequentially
            for (const tool of tools) {
                try {
                    let result;
                    
                    switch (tool.name) {
                        case 'tool_add_rows':
                            if (sheetViewRef.current && activeView === 'sheet') {
                                result = await sheetViewRef.current.addRows(
                                    tool.arguments.count, 
                                    tool.arguments.position || 'end'
                                );
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
                        console.log('Sheets list loaded:', data.sheets);
                    }
                }
            } catch (error) {
                console.error('Error loading sheets list:', error);
            }
        };

        loadDocumentData();
    }, [documentId]);

    return (
        <div className="sheet flex flex-row">
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
                        <div className="sheet-footer-add pointer">
                            <img src={IconAdd} alt="Add Icon" height="16" />
                        </div>
                        <div className="sheet-footer-tab-group wdth-100">
                            {sheetsList.map((sheet, index) => (
                                <div 
                                    key={sheet.id}
                                    className={`sheet-footer-tab flex flex-row-center gap-5 pointer ${
                                        activeView === 'sheet' && (sheet.id === sheetId || (sheetId === 'default-sheet' && index === 0)) ? 'active' : ''
                                    }`}
                                    onClick={() => {
                                        setActiveView('sheet');
                                        navigate(`/document/${documentId}/sheet/${sheet.id}`);
                                    }}
                                >
                                    <img src={IconSheet} alt="Sheet Icon" height="16" />
                                    <p className="text--micro">{sheet.name}</p>
                                </div>
                            ))}
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
        </div>
    );
});

DocumentView.displayName = 'DocumentView';

export default DocumentView;
