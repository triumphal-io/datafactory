import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api';
import { showToast } from '../utils/utils';
import IconDismiss from '../assets/dismiss.svg';
import LogoChatGPT from '../assets/logos/chatgpt.png';
import LogoClaude from '../assets/logos/claude.png';
import LogoGemini from '../assets/logos/gemini.png';

const PROVIDERS = [
    { provider: 'openai', display_name: 'OpenAI', description: 'GPT models (OpenAI)' },
    { provider: 'gemini', display_name: 'Gemini', description: 'Google Gemini models' },
    { provider: 'anthropic', display_name: 'Claude', description: 'Anthropic Claude models' },
];

export default function ProviderSettings() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showKeyPopup, setShowKeyPopup] = useState(false);
    const [activeProvider, setActiveProvider] = useState(null);
    const [apiKey, setApiKey] = useState('');

    const providerMap = useMemo(() => {
        const map = new Map();
        for (const p of providers) map.set(p.provider, p);
        return map;
    }, [providers]);

    const mergedProviders = useMemo(() => {
        return PROVIDERS.map((p) => ({
            ...p,
            ...(providerMap.get(p.provider) || {}),
        }));
    }, [providerMap]);

    useEffect(() => {
        loadProviders();
    }, []);

    const loadProviders = async () => {
        try {
            setLoading(true);
            const res = await apiFetch('/api/provider-credentials/list', { method: 'GET' });
            if (!res.ok) throw new Error('Failed to load providers');
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message || 'Failed to load providers');
            setProviders(data.providers || []);
        } catch (e) {
            console.error(e);
            showToast('Failed to load providers', 'error');
        } finally {
            setLoading(false);
        }
    };

    const openKeyPopup = (provider) => {
        setActiveProvider(provider);
        setApiKey('');
        setShowKeyPopup(true);
    };

    const saveKey = async (e) => {
        e?.preventDefault();
        if (!activeProvider) return;

        if (!apiKey.trim()) {
            showToast('API key is required', 'error');
            return;
        }

        const toastId = showToast('Saving API key...', 'info', 999999);
        try {
            const res = await apiFetch('/api/provider-credentials/set-key', {
                method: 'POST',
                body: {
                    provider: activeProvider.provider,
                    api_key: apiKey.trim(),
                    enabled: true,
                },
            });

            const data = await res.json();
            if (!res.ok || data.status !== 'success') {
                showToast(data.message || 'Failed to save API key', 'error', 3000, toastId);
                return;
            }

            setProviders((prev) => {
                const updated = prev.filter((p) => p.provider !== data.provider.provider);
                updated.push(data.provider);
                return updated;
            });

            setShowKeyPopup(false);
            setActiveProvider(null);
            setApiKey('');
            showToast('API key saved', 'success', 2500, toastId);
        } catch (err) {
            console.error(err);
            showToast('Failed to save API key', 'error', 3000, toastId);
        }
    };

    const toggleEnabled = async (providerObj) => {
        const nextEnabled = !providerObj.enabled;

        if (nextEnabled && !providerObj.has_key) {
            showToast('Set an API key before enabling', 'error');
            return;
        }

        const toastId = showToast('Updating provider...', 'info', 999999);
        try {
            const res = await apiFetch('/api/provider-credentials/toggle', {
                method: 'PATCH',
                body: {
                    provider: providerObj.provider,
                    enabled: nextEnabled,
                },
            });
            const data = await res.json();
            if (!res.ok || data.status !== 'success') {
                showToast(data.message || 'Failed to update provider', 'error', 3000, toastId);
                return;
            }

            setProviders((prev) => {
                const updated = prev.filter((p) => p.provider !== data.provider.provider);
                updated.push(data.provider);
                return updated;
            });

            showToast(nextEnabled ? 'Provider enabled' : 'Provider disabled', 'success', 2000, toastId);
        } catch (err) {
            console.error(err);
            showToast('Failed to update provider', 'error', 3000, toastId);
        }
    };

    const clearKey = async () => {
        if (!activeProvider) return;
        if (!confirm(`Remove API key for ${activeProvider.display_name}?`)) return;

        const toastId = showToast('Removing API key...', 'info', 999999);
        try {
            const res = await apiFetch(`/api/provider-credentials/clear?provider=${activeProvider.provider}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok || data.status !== 'success') {
                showToast(data.message || 'Failed to remove API key', 'error', 3000, toastId);
                return;
            }

            setProviders((prev) => {
                const updated = prev.filter((p) => p.provider !== activeProvider.provider);
                updated.push(data.provider);
                return updated;
            });

            setShowKeyPopup(false);
            setActiveProvider(null);
            setApiKey('');
            showToast('API key removed', 'success', 2000, toastId);
        } catch (err) {
            console.error(err);
            showToast('Failed to remove API key', 'error', 3000, toastId);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-center" style={{ padding: '40px' }}>
                <p className="text--small opacity-5">Loading providers...</p>
            </div>
        );
    }

    return (
        <div className="models-settings flex flex-column gap-15">
            <div className="flex flex-column gap-15">

                <p className="text--micro opacity-7">
                    Add API keys for the providers you want to use. Only providers with an API key can be enabled.
                </p>

                <div className="flex flex-column gap-12">
                    {mergedProviders.map((p) => (
                        <div
                            key={p.provider}
                            className="tile flex gap-15 pad-15 padl-20 padr-20 flex-row-center flex-space-between">
                            
                            <div className="flex flex-row-center gap-20 wdth-50">
                            <img
                                src={
                                    p.provider === 'openai' ? LogoChatGPT : 
                                    p.provider === 'anthropic' ? LogoClaude :
                                    p.provider === 'gemini' ? LogoGemini :
                                    ''
                                }
                                alt={p.display_name}
                                height="32"
                            />
                            <div className="flex flex-column gap-2_5">
                                <p className="text--small text__medium">{p.display_name}</p>
                                <p className="text--micro opacity-7">{p.description}</p>
                            </div>
                            </div>
                            <p className="text--micro opacity-7">
                                {p.has_key ? `Set (…${p.last4 || '****'})` : ''}
                            </p>

                            <div className="flex flex-row-center gap-15">
                                <button className="button button-dark mini-button" onClick={() => openKeyPopup(p)}>
                                    {p.has_key ? 'Update Key' : 'Add Key'}
                                </button>

                                {p.has_key ? (
                                <label className="switch" title={p.has_key ? '' : 'Set an API key first'}>
                                    <input
                                        type="checkbox"
                                        checked={!!p.enabled}
                                        disabled={!p.has_key}
                                        onChange={() => toggleEnabled(p)}
                                    />
                                    <span className="slider round"></span>
                                </label>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>

                
                <p className="text--micro opacity-7">
                    Support for more models, providers, and local model connections is coming soon. If you have a priority model you require, please vote for it on GitHub.
                </p>
            </div>

            {/* API Key Modal */}
            {showKeyPopup && activeProvider && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="pop-add-column flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus" id="popup-title">
                                    {activeProvider.display_name} API Key
                                </p>
                                <img 
                                    src={IconDismiss} 
                                    alt="Close" 
                                    height="24" 
                                    className="pointer"
                                    onClick={() => {
                                        setShowKeyPopup(false);
                                        setActiveProvider(null);
                                        setApiKey('');
                                    }}
                                />
                            </div>
                            
                            <form onSubmit={saveKey}>
                                <p className="text--micro opacity-7 mrgnt-15">
                                    Paste your API key below. It will be stored in the database and never returned back to the browser.
                                </p>

                                <p className="text--micro text__semibold mrgnt-15">API Key</p>
                                <input
                                    type="password"
                                    className="form--input wdth-full mrgnt-7"
                                    placeholder="Enter API key"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    autoFocus
                                />

                                <button 
                                    type="submit"
                                    className="button wdth-full mrgnt-20"
                                >
                                    Save Key
                                </button>
                                
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setShowKeyPopup(false);
                                        setActiveProvider(null);
                                        setApiKey('');
                                    }}
                                    className="button button-dark wdth-full mrgnt-7"
                                >
                                    Cancel
                                </button>

                                {activeProvider.has_key && (
                                    <button 
                                        type="button" 
                                        className="button button-dark wdth-full mrgnt-7"
                                        style={{ color: '#ff6b6b', borderColor: '#ff6b6b' }}
                                        onClick={clearKey}
                                    >
                                        Remove Key
                                    </button>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
