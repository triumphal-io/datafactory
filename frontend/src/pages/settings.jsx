import { useState } from 'react';
import Drawer from '../components/drawer.jsx';
import MCPSettings from '../components/mcp-settings.jsx';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general');

    return (
        <div className="sheet-container">
            <main>
                <div className="flex flex-row">
                    <Drawer isOpen={true} onClose={() => {}} />
                    <div className="settings-content flex flex-column flex-expanded">
                        {/* Tab Navigation */}
                        <div className="pad-20 padl-30 flex flex-row flex-row-center gap-25">
                            <p 
                                className={`pointer text--normal text__semibold cursor-pointer ${activeTab === 'general' ? '' : 'opacity-5'}`}
                                onClick={() => setActiveTab('general')}
                            >
                                General
                            </p>
                            <p 
                                className={`pointer text--normal text__semibold cursor-pointer ${activeTab === 'mcp' ? '' : 'opacity-5'}`}
                                onClick={() => setActiveTab('mcp')}
                            >
                                MCP Servers
                            </p>
                            <p 
                                className={`pointer text--normal text__semibold cursor-pointer ${activeTab === 'credentials' ? '' : 'opacity-5'}`}
                                onClick={() => setActiveTab('credentials')}
                            >
                                Credentials
                            </p>
                        </div>

                        {/* Tab Content */}
                        <div className="padt-5 padl-30 padr-30">
                            {activeTab === 'general' && (
                                <div className="general-settings">
                                    <p className="text--small text__medium marb-15">General Settings</p>
                                    <p className="text--micro opacity-7">General settings will be available here.</p>
                                </div>
                            )}

                            {activeTab === 'mcp' && (
                                <MCPSettings />
                            )}

                            {activeTab === 'credentials' && (
                                <div className="credentials-settings">
                                    <p className="text--small text__medium marb-15">API Credentials</p>
                                    <p className="text--micro opacity-7">Manage your API keys and credentials here.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}