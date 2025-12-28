import Resizer from '../components/resizer.jsx';
import Assistant from '../components/assistant.jsx';
import SheetView from '../components/sheetview.jsx';
import { useParams } from 'react-router-dom';

export default function DocumentPage() {
    const { sheetId, documentId } = useParams();

    return (
        <div className="sheet-container">
        <main>
            <SheetView documentId={documentId} sheetId={sheetId} />
        </main>
        <Resizer />
        <aside>
            <Assistant />
        </aside>
    </div>
    );
}