import { useRef, useState } from 'react';
import Resizer from '../components/resizer.jsx';
import Assistant from '../components/assistant.jsx';
import DocumentView from '../components/document-view.jsx';
import { useParams } from 'react-router-dom';

export default function DocumentPage() {
    const { sheetId, documentId } = useParams();
    const documentViewRef = useRef(null);
    const assistantRef = useRef(null);
    const [selectedCells, setSelectedCells] = useState(new Set());
    const [sheetName, setSheetName] = useState('');
    const [droppedFiles, setDroppedFiles] = useState(null);

    // Handle selection changes from SheetView
    const handleSelectionChange = (cells) => {
        setSelectedCells(cells);
    };

    // Handle sheet name changes
    const handleSheetNameChange = (name) => {
        setSheetName(name);
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
            />
        </aside>
    </div>
    );
}