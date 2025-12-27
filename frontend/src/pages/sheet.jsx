import Resizer from '../components/resizer.jsx';
import Assistant from '../components/assistant.jsx';
import SheetView from '../components/sheetview.jsx';

export default function SheetPage() {
    return (
        <div className="sheet-container">
        <main>
            <SheetView />
        </main>
        <Resizer />
        <aside>
            <Assistant />
        </aside>
    </div>
    );
}