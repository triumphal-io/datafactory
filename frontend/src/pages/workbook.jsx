import { useRef, useState, useEffect } from 'react';
import Resizer from '../components/resizer.jsx';
import Assistant from '../components/assistant.jsx';
import WorkbookView from '../components/workbook-view.jsx';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../utils/websocket-context.jsx';
import { DEFAULT_AI_MODEL } from '../utils/utils';
import { apiFetch } from '../utils/api';

export default function WorkbookPage() {
    const { sheetId, workbookId } = useParams();
    const workbookViewRef = useRef(null);
    const assistantRef = useRef(null);
    const { sendMessage: sendWebSocketMessage, isConnected: wsConnected } = useWebSocket();
    const [selectedCells, setSelectedCells] = useState(new Set());
    const [sheetName, setSheetName] = useState('');
    const [droppedFiles, setDroppedFiles] = useState(null);
    const [selectedModel, setSelectedModel] = useState(DEFAULT_AI_MODEL);
    const [sheetsList, setSheetsList] = useState([]);
    const [workbookName, setWorkbookName] = useState('Loading...');

    // Load workbook data including selected model, sheets, and name
    useEffect(() => {
        const loadWorkbook = async () => {
            try {
                const response = await apiFetch(`/api/workbooks/${workbookId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success') {
                        if (data.selected_model) {
                            setSelectedModel(data.selected_model);
                        }
                        if (data.sheets) {
                            setSheetsList(data.sheets);
                        }
                        if (data.name) {
                            setWorkbookName(data.name);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading workbook:', error);
            }
        };

        if (workbookId) {
            loadWorkbook();
        }
    }, [workbookId]);

    // Save selected model when it changes
    const handleModelChange = async (newModel) => {
        setSelectedModel(newModel);
        
        try {
            await apiFetch(`/api/workbooks/${workbookId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    selected_model: newModel
                })
            });
        } catch (error) {
            console.error('Error saving selected model:', error);
        }
    };

    // Handle selection changes from SheetView
    const handleSelectionChange = (cells) => {
        setSelectedCells(cells);
    };

    // Handle sheet name changes
    const handleSheetNameChange = (name) => {
        setSheetName(name);
    };

    // Handle workbook name changes
    const handleWorkbookNameChange = (name) => {
        setWorkbookName(name);
    };

    // Handle sheets list refresh
    const handleSheetsListChange = (sheets) => {
        setSheetsList(sheets);
    };

    // Handle tool execution requests from assistant
    const handleToolsRequested = async (tools, conversationId) => {
        if (!workbookViewRef.current) {
            console.error('WorkbookView ref not available');
            return;
        }

        // Execute tools via WorkbookView
        const toolResults = await workbookViewRef.current.executeTools(tools);
        
        // Send results back to assistant with conversation ID
        if (assistantRef.current) {
            await assistantRef.current.sendToolResults(toolResults, conversationId);
        }
    };
    
    // Get current sheet data
    const getSheetData = () => {
        if (workbookViewRef.current) {
            return workbookViewRef.current.getSheetData();
        }
        return null;
    };

    // Handle files dropped anywhere on the workbook view
    const handleFilesDropped = (files) => {
        setDroppedFiles(files);
        // Clear after a brief moment to allow it to be picked up by the assistant
        setTimeout(() => setDroppedFiles(null), 100);
    };

    return (
        <div className="sheet-container">
        <main>
            <WorkbookView 
                ref={workbookViewRef}
                workbookId={workbookId} 
                sheetId={sheetId}
                onSelectionChange={handleSelectionChange}
                onSheetNameChange={handleSheetNameChange}
                onFilesDropped={handleFilesDropped}
                selectedModel={selectedModel}
                sheetsList={sheetsList}
                workbookName={workbookName}
                onWorkbookNameChange={handleWorkbookNameChange}
                onSheetsListChange={handleSheetsListChange}
            />
        </main>
        <Resizer />
        <aside>
            <Assistant 
                ref={assistantRef}
                workbookId={workbookId}
                onToolsRequested={handleToolsRequested}
                selectedCells={selectedCells}
                sheetName={sheetName}
                sheetId={sheetId}
                getSheetData={getSheetData}
                droppedFiles={droppedFiles}
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
            />
        </aside>
    </div>
    );
}