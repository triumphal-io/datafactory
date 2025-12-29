import Resizer from '../components/resizer.jsx';
import Assistant from '../components/assistant.jsx';
import DocumentView from '../components/document-view.jsx';
import { useParams } from 'react-router-dom';

export default function DocumentPage() {
    const { sheetId, documentId } = useParams();

    return (
        <div className="sheet-container">
        <main>
            <DocumentView documentId={documentId} sheetId={sheetId} />
        </main>
        <Resizer />
        <aside>
            <Assistant />
        </aside>
    </div>
    );
}