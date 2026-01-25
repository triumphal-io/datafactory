import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Drawer from '../components/drawer.jsx';
import MCPSettings from '../components/mcp-settings.jsx';
import ProviderSettings from '../components/provider-settings.jsx';

export default function SettingsPage() {
    const { tab } = useParams();
    const navigate = useNavigate();
    
    // Define valid tabs
    const validTabs = ['general', 'tools-mcp', 'models'];
    const activeTab = validTabs.includes(tab) ? tab : 'general';

    const setActiveTab = (newTab) => {
        navigate(`/settings/${newTab}`);
    };

    return (
        <div className="sheet-container">
            <main>
                <div className="flex flex-row">
                    <Drawer isOpen={true} onClose={() => {}} />
                    <div className="settings-content  flex flex-column flex-expanded">
                        {/* Tab Navigation */}
                        <div className="pad-20 padl-30 flex flex-row flex-row-center gap-25">
                            <p 
                                className={`pointer text--normal text__semibold cursor-pointer ${activeTab === 'general' ? '' : 'opacity-5'}`}
                                onClick={() => setActiveTab('general')}
                            >
                                General
                            </p>
                            <p 
                                className={`pointer text--normal text__semibold cursor-pointer ${activeTab === 'tools-mcp' ? '' : 'opacity-5'}`}
                                onClick={() => setActiveTab('tools-mcp')}
                            >
                                Tools & MCP
                            </p>
                            <p 
                                className={`pointer text--normal text__semibold cursor-pointer ${activeTab === 'models' ? '' : 'opacity-5'}`}
                                onClick={() => setActiveTab('models')}
                            >
                                Model Providers
                            </p>
                        </div>

                        {/* Tab Content */}
                        <div className="padt-5 padl-30 padr-30">
                            {activeTab === 'general' && (
                                <div className="general-settings flex flex-column gap-15">
                                    
                                    <div className="tile flex flex-row-center flex-space-between pad-15 padl-20 padr-20">
                                        <div className="flex flex-column gap-5">
                                            <p className="text--small text__medium marb-15">App Version</p>
                                            <p className="text--micro opacity-7">Check what's new by visiting our <a href="https://github.com/your-repo/releases" target="_blank" rel="noopener noreferrer">release page</a>.</p>
                                        </div>
                                        <p className="text--micro opacity-7">v1.0.0</p>
                                    </div>
                                    
                                    <div className="tile flex flex-row-center flex-space-between pad-15 padl-20 padr-20">
                                        <div className="flex flex-column gap-5">
                                            <p className="text--small text__medium marb-15">Check for Updates</p>
                                            <p className="text--micro opacity-7">Check if there are any new updates available for DataFactory.</p>
                                        </div>
                                        <button className="button button-dark mini-button">Check Now</button>
                                    </div>

                                    {/* Resources */}
                                    <div className="tile flex flex-column gap-25 pad-15 padl-20 padr-20">
                                        <p className="text--normal text__semibold marb-15">Resources</p>
                                        <div className="flex flex-row-center flex-space-between">
                                            <div className="flex flex-column gap-5">
                                                <p className="text--small text__medium marb-15">Documentation</p>
                                                <p className="text--micro opacity-7">Access our comprehensive guides and documentation for DataFactory.</p>
                                            </div>
                                            <a href="https://github.com/your-repo/docs" target="_blank" rel="noopener noreferrer" className="button button-dark mini-button">View Docs</a>
                                        </div>
                                        <div className="flex flex-row-center flex-space-between">
                                            <div className="flex flex-column gap-5">
                                                <p className="text--small text__medium marb-15">Release Notes</p>
                                                <p className="text--micro opacity-7">View detailed release notes for each version update.</p>
                                            </div>
                                            <a href="https://github.com/your-repo/releases" target="_blank" rel="noopener noreferrer" className="button button-dark mini-button">View Releases</a>
                                        </div>
                                    </div>

                                    {/* Community */}
                                    <div className="tile flex flex-column gap-25 pad-15 padl-20 padr-20">
                                        <p className="text--normal text__semibold marb-15">Community</p>
                                        <div className="flex flex-row-center flex-space-between">
                                            <div className="flex flex-column gap-5">
                                                <p className="text--small text__medium marb-15">Github</p>
                                                <p className="text--micro opacity-7">Join the discussion and contribute to DataFactory on Github.</p>
                                            </div>
                                            <a href="https://github.com/your-repo" target="_blank" rel="noopener noreferrer" className="button button-dark mini-button">Visit Github</a>
                                        </div>
                                        <div className="flex flex-row-center flex-space-between">
                                            <div className="flex flex-column gap-5">
                                                <p className="text--small text__medium marb-15">Discord</p>
                                                <p className="text--micro opacity-7">Connect with the community and get real-time support on Discord.</p>
                                            </div>
                                            <a href="https://discord.gg/your-invite" target="_blank" rel="noopener noreferrer" className="button button-dark mini-button">Join Discord</a>
                                        </div>
                                    </div>

                                    {/* Support */}
                                    <div className="tile flex flex-column gap-25 pad-15 padl-20 padr-20">
                                        <p className="text--normal text__semibold marb-15">Support</p>
                                        <div className="flex flex-row-center flex-space-between">
                                            <div className="flex flex-column gap-5">
                                                <p className="text--small text__medium marb-15">Report Issues</p>
                                                <p className="text--micro opacity-7">Found a bug or have a feature request? Report it on Github Issues.</p>
                                            </div>
                                            <a href="https://github.com/your-repo/issues" target="_blank" rel="noopener noreferrer" className="button button-dark mini-button">Report Issue</a>
                                        </div>
                                    </div>

                                    {/* Credits */}
                                    <div className="tile flex flex-column gap-25 pad-15 padl-20 padr-20">
                                        <p className="text--normal text__semibold marb-15">Credits</p>
                                        <div className="flex flex-row-center flex-space-between">
                                            <div className="flex flex-column gap-5">
                                                <p className="text--small text__medium marb-15">About DataFactory</p>
                                                <p className="text--micro opacity-7">Made with ❤️ by the DataFactory team. Built with React and Django.</p>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            )}

                            {activeTab === 'tools-mcp' && (
                                <MCPSettings />
                            )}

                            {activeTab === 'models' && (
                                <ProviderSettings />
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}