import { useRef, useState, useEffect } from 'react';
import Resizer from '../components/resizer.jsx';
import Assistant from '../components/assistant.jsx';
import DocumentView from '../components/document-view.jsx';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../utils/websocket-context.jsx';
import { DEFAULT_AI_MODEL } from '../utils/utils';
import { apiFetch } from '../utils/api';

export default function DocumentPage() {
    const { sheetId, documentId } = useParams();
    const documentViewRef = useRef(null);
    const assistantRef = useRef(null);
    const { sendMessage: sendWebSocketMessage, isConnected: wsConnected } = useWebSocket();
    const [selectedCells, setSelectedCells] = useState(new Set());
    const [sheetName, setSheetName] = useState('');
    const [droppedFiles, setDroppedFiles] = useState(null);
    const [selectedModel, setSelectedModel] = useState(DEFAULT_AI_MODEL);
    const [sheetsList, setSheetsList] = useState([]);
    const [documentName, setDocumentName] = useState('Loading...');

    // Load document data including selected model, sheets, and name
    useEffect(() => {
        const loadDocument = async () => {
            try {
                const response = await apiFetch(`/api/documents/${documentId}`);
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
                            setDocumentName(data.name);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading document:', error);
            }
        };

        if (documentId) {
            loadDocument();
        }
    }, [documentId]);

    // Save selected model when it changes
    const handleModelChange = async (newModel) => {
        setSelectedModel(newModel);
        
        try {
            await apiFetch(`/api/documents/${documentId}`, {
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

    // Handle document name changes
    const handleDocumentNameChange = (name) => {
        setDocumentName(name);
    };

    // Handle sheets list refresh
    const handleSheetsListChange = (sheets) => {
        setSheetsList(sheets);
    };

    // Handle tool execution requests from assistant
    const handleToolsRequested = async (tools, conversationId) => {
        if (!documentViewRef.current) {
            console.error('DocumentView ref not available');
            return;
        }

        // Execute tools via DocumentView
        const toolResults = await documentViewRef.current.executeTools(tools);
        
        // Send results back to assistant with conversation ID
        if (assistantRef.current) {
            await assistantRef.current.sendToolResults(toolResults, conversationId);
        }
    };
    
    // Get current sheet data
    const getSheetData = () => {
        if (documentViewRef.current) {
            return documentViewRef.current.getSheetData();
        }
        return null;
    };

    // Handle files dropped anywhere on the document view
    const handleFilesDropped = (files) => {
        setDroppedFiles(files);
        // Clear after a brief moment to allow it to be picked up by the assistant
        setTimeout(() => setDroppedFiles(null), 100);
    };

    return (
        <div className="sheet-container">
        <main>
            <DocumentView 
                ref={documentViewRef}
                documentId={documentId} 
                sheetId={sheetId}
                onSelectionChange={handleSelectionChange}
                onSheetNameChange={handleSheetNameChange}
                onFilesDropped={handleFilesDropped}
                selectedModel={selectedModel}
                sheetsList={sheetsList}
                documentName={documentName}
                onDocumentNameChange={handleDocumentNameChange}
                onSheetsListChange={handleSheetsListChange}
            />
        </main>
        <Resizer />
        <aside>
            <Assistant 
                ref={assistantRef}
                documentId={documentId}
                onToolsRequested={handleToolsRequested}
                selectedCells={selectedCells}
                sheetName={sheetName}
                getSheetData={getSheetData}
                droppedFiles={droppedFiles}
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
            />
        </aside>
    </div>
    );
}