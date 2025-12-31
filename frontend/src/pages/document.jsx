import { useRef } from 'react';
import Resizer from '../components/resizer.jsx';
import Assistant from '../components/assistant.jsx';
import DocumentView from '../components/document-view.jsx';
import { useParams } from 'react-router-dom';

export default function DocumentPage() {
    const { sheetId, documentId } = useParams();
    const documentViewRef = useRef(null);
    const assistantRef = useRef(null);

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

    return (
        <div className="sheet-container">
        <main>
            <DocumentView 
                ref={documentViewRef}
                documentId={documentId} 
                sheetId={sheetId} 
            />
        </main>
        <Resizer />
        <aside>
            <Assistant 
                ref={assistantRef}
                documentId={documentId}
                onToolsRequested={handleToolsRequested}
            />
        </aside>
    </div>
    );
}