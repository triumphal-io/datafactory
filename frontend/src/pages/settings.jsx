import Drawer from '../components/drawer.jsx';

export default function SettingsPage() {
    return (
        <div className="sheet-container">
        <main>
            <div className="flex flex-row">
                <Drawer isOpen={true} onClose={() => {}} />
                <div className="settings-content flex flex-column">
                    <div className="pad-20 padl-30 flex flex-row flex-row-center gap-25">
                        <p className='text--normal text__semibold'>General</p>
                        <p className='text--normal text__semibold opacity-5'>Credentials</p>
                    </div>
                </div>
            </div>
        </main>
    </div>
    );
}