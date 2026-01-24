import { useState, useEffect } from 'react';
import { Tooltip } from 'react-tooltip';
import { apiFetch } from '../utils/api';
import { showToast } from '../utils/utils';
import IconDismiss from '../assets/dismiss.svg';
import IconMore from '../assets/more.svg';
import IconAdd from '../assets/add.svg';

export default function MCPSettings() {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddPopup, setShowAddPopup] = useState(false);
    const [showEditPopup, setShowEditPopup] = useState(false);
    const [openDropdownIndex, setOpenDropdownIndex] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        display_name: '',
        url: '',
        description: '',
        enabled: true,
    });
    const [editingServer, setEditingServer] = useState(null);
    const [toolsList, setToolsList] = useState({});

    // Load MCP servers on mount
    useEffect(() => {
        loadServers();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (openDropdownIndex !== null) {
                setOpenDropdownIndex(null);
            }
        };
        
        if (openDropdownIndex !== null) {
            document.addEventListener('click', handleClickOutside);
        }
        
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [openDropdownIndex]);

    const loadServers = async () => {
        try {
            setLoading(true);
            const response = await apiFetch('/api/mcp-servers/list', { method: 'GET' });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    setServers(data.servers);
                    // Build tools list for tooltips
                    const toolsMap = {};
                    data.servers.forEach(server => {
                        toolsMap[server.id] = server.tools || [];
                    });
                    setToolsList(toolsMap);
                }
            }
        } catch (error) {
            console.error('Failed to load MCP servers:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleDropdown = (index, e) => {
        e?.stopPropagation();
        setOpenDropdownIndex(openDropdownIndex === index ? null : index);
    };

    const handleAddServer = async (e) => {
        e.preventDefault();
        
        if (!formData.name.trim() || !formData.display_name.trim() || !formData.url.trim()) {
            showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const toastId = showToast('Adding MCP server...', 'info', 999999);
        try {
            const response = await apiFetch('/api/mcp-servers/create', {
                method: 'POST',
                body: formData,
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    const newServer = data.server;
                    setServers([...servers, newServer]);
                    setToolsList(prev => ({ ...prev, [newServer.id]: [] }));
                    setShowAddPopup(false);
                    setFormData({
                        name: '',
                        display_name: '',
                        url: '',
                        description: '',
                        enabled: true,
                    });
                    showToast('MCP server added', 'success', 3000, toastId);
                } else {
                    showToast(data.message || 'Failed to add MCP server', 'error', 3000, toastId);
                }
            } else {
                const data = await response.json();
                showToast(data.message || 'Failed to add MCP server', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Failed to add MCP server:', error);
            showToast('Failed to add MCP server', 'error', 3000, toastId);
        }
    };

    const handleToggleEnabled = async (server, e) => {
        e?.stopPropagation();
        const toastId = showToast('Updating...', 'info', 999999);
        try {
            const response = await apiFetch('/api/mcp-servers/update', {
                method: 'PATCH',
                body: {
                    id: server.id,
                    enabled: !server.enabled,
                },
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    setServers(servers.map(s => 
                        s.id === server.id ? { ...s, enabled: !s.enabled } : s
                    ));
                    showToast(server.enabled ? 'Server disabled' : 'Server enabled', 'success', 3000, toastId);
                } else {
                    showToast('Failed to update server', 'error', 3000, toastId);
                }
            } else {
                showToast('Failed to update server', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Failed to toggle MCP server:', error);
            showToast('Failed to update server', 'error', 3000, toastId);
        }
    };

    const handleDeleteServer = async (serverId, e) => {
        e?.stopPropagation();
        if (!confirm('Are you sure you want to delete this MCP server?')) {
            return;
        }
        
        const toastId = showToast('Deleting server...', 'info', 999999);
        try {
            const response = await apiFetch(`/api/mcp-servers/delete?id=${serverId}`, {
                method: 'DELETE',
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    setServers(servers.filter(s => s.id !== serverId));
                    setToolsList(prev => {
                        const updated = { ...prev };
                        delete updated[serverId];
                        return updated;
                    });
                    showToast('Server deleted', 'success', 3000, toastId);
                } else {
                    showToast('Failed to delete server', 'error', 3000, toastId);
                }
            } else {
                showToast('Failed to delete server', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Failed to delete MCP server:', error);
            showToast('Failed to delete server', 'error', 3000, toastId);
        }
    };

    const handleEditServer = async (e) => {
        e.preventDefault();
        
        if (!editingServer.display_name.trim() || !editingServer.url.trim()) {
            showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const toastId = showToast('Updating server...', 'info', 999999);
        try {
            const response = await apiFetch('/api/mcp-servers/update', {
                method: 'PATCH',
                body: {
                    id: editingServer.id,
                    display_name: editingServer.display_name,
                    url: editingServer.url,
                    description: editingServer.description,
                },
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    const updatedServer = data.server;
                    setServers(servers.map(s => 
                        s.id === editingServer.id ? updatedServer : s
                    ));
                    setToolsList(prev => ({
                        ...prev,
                        [updatedServer.id]: updatedServer.tools || prev[updatedServer.id] || []
                    }));
                    setEditingServer(null);
                    setShowEditPopup(false);
                    showToast('Server updated', 'success', 3000, toastId);
                } else {
                    showToast('Failed to update server', 'error', 3000, toastId);
                }
            } else {
                showToast('Failed to update server', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Failed to update MCP server:', error);
            showToast('Failed to update server', 'error', 3000, toastId);
        }
    };

    const handleOpenEditPopup = (server, e) => {
        e?.stopPropagation();
        setEditingServer(server);
        setShowEditPopup(true);
        setOpenDropdownIndex(null);
    };

    if (loading) {
        return (
            <div className="flex flex-center" style={{ padding: '40px' }}>
                <p className="text--small opacity-5">Loading MCP servers...</p>
            </div>
        );
    }

    return (
        <div className="mcp-settings wdth-100 hght-100 flex flex-column">
            <div className="flex-expanded scroll-y thin-scroll">
                <div className="grid-flexible gap-10">
                    {/* Add Server Tile */}
                    <div
                        className="file flex flex-column flex-center pointer"
                        style={{
                            border: '3px dashed #2b2b2b',
                            position: 'relative',
                            minHeight: '150px',
                            transition: 'all 0.3s',
                        }}
                        onClick={() => setShowAddPopup(true)}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#4a4a4a';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#2b2b2b';
                        }}
                    >
                        <div className="flex flex-row-center flex-horizontal-center flex-center gap-10" style={{ height: '100%' }}>
                            <img src={IconAdd} alt="Add Server" />
                            <p className="text--small opacity-5 text-center">Add Server</p>
                        </div>
                    </div>

                    {/* Existing MCP Servers */}
                    {servers.map((server, index) => (
                        <div
                            key={server.id}
                            className="file flex flex-column"
                            style={{
                                border: '3px solid #2b2b2b',
                                position: 'relative',
                                opacity: server.enabled ? 1 : 0.4,
                                transition: 'opacity 0.3s'
                            }}
                        >
                            <div className="flex flex-column wdth-100" style={{ height: '100%' }}>
                                    <div className='flex flex-expanded flex-column padl-15 padr-15 padt-15 padb-10 flex'>
                                        <div className='flex flex-row-center flex-space-between marb-5'>
                                            <p className='text--small text__semibold'>{server.display_name}</p>
                                            <span
                                                className="text--nano"
                                                style={{
                                                    backgroundColor: server.enabled ? '#1e3a1e' : '#3a1e1e',
                                                    color: server.enabled ? '#4caf50' : '#f44336',
                                                    borderRadius: '3px',
                                                    padding: '2px 6px',
                                                    fontWeight: '500'
                                                }}
                                            >
                                                {server.enabled ? 'ENABLED' : 'DISABLED'}
                                            </span>
                                        </div>
                                        <p className='text--micro opacity-5 marb-3'>{server.name}</p>
                                        <p className='text--micro opacity-7 marb-5' style={{ wordBreak: 'break-all' }}>{server.url}</p>
                                        {server.description && (
                                            <p className='text--micro opacity-5 mart-5'>{server.description}</p>
                                        )}
                                        
                                    </div>
                                    
                                    <div className='flex flex-row-center flex-space-between padl-15 padr-15 padb-10'>
                                        <div className='flex flex-row-center gap-12'>
                                            <button
                                                className="button mini-button button-dark"
                                                onClick={(e) => handleToggleEnabled(server, e)}
                                                style={{ padding: '5px 12px' }}
                                            >
                                                {server.enabled ? 'Disable' : 'Enable'}
                                            </button>
                                            <p 
                                                className='text--micro opacity-7 mart-5'
                                                data-tooltip-id={`tools-tooltip-${server.id}`}
                                                data-tooltip-place="top"
                                                style={{ cursor: 'help', borderBottom: '1px dotted rgba(255,255,255,0.3)' }}
                                            >
                                                {server.tools_count !== undefined ? `${server.tools_count} tools available` : 'Checking tools...'}
                                            </p>
                                            <Tooltip 
                                                id={`tools-tooltip-${server.id}`}
                                                className="mcp-tools-tooltip"
                                            >
                                                <div style={{ maxWidth: '300px', textAlign: 'left' }}>
                                                    {(toolsList[server.id] && toolsList[server.id].length > 0) ? (
                                                        <div>
                                                            <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '12px' }}>Available Tools:</p>
                                                                {toolsList[server.id].slice(0, 5).map((tool, idx) => (
                                                                    <p key={idx} style={{ marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {tool.function?.name || tool.name || 'Unknown tool'}
                                                                    </p>
                                                                ))}
                                                                {toolsList[server.id].length > 5 && (
                                                                    <p style={{ marginTop: '4px', fontStyle: 'italic', color: '#888' }}>+{toolsList[server.id].length - 5} more...</p>
                                                                )}
                                                        </div>
                                                    ) : (
                                                        <p style={{ margin: '0', fontSize: '12px' }}>No tools discovered yet</p>
                                                    )}
                                                </div>
                                            </Tooltip>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <img 
                                                src={IconMore} 
                                                alt="More Options" 
                                                height="22" 
                                                style={{ cursor: 'pointer', opacity: 0.7 }}
                                                onClick={(e) => toggleDropdown(index, e)}
                                            />
                                            {openDropdownIndex === index && (
                                                <div 
                                                    className="dropdown-menu"
                                                    style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        right: 0,
                                                        background: '#1e1e1e',
                                                        border: '1px solid #2b2b2b',
                                                        borderRadius: '4px',
                                                        minWidth: '140px',
                                                        zIndex: 1000,
                                                        marginTop: '4px'
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div 
                                                        className="dropdown-item text--micro"
                                                        style={{ padding: '10px 15px', cursor: 'pointer' }}
                                                        onClick={(e) => handleOpenEditPopup(server, e)}
                                                        onMouseEnter={(e) => e.target.style.background = '#2b2b2b'}
                                                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                                    >
                                                        Edit Server
                                                    </div>
                                                    <div 
                                                        className="dropdown-item text--micro"
                                                        style={{ padding: '10px 15px', cursor: 'pointer', color: '#f44336' }}
                                                        onClick={(e) => handleDeleteServer(server.id, e)}
                                                        onMouseEnter={(e) => e.target.style.background = '#2b2b2b'}
                                                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                                    >
                                                        Delete Server
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                    ))}
                </div>
            </div>

            {/* Add Server Popup */}
            {showAddPopup && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="pop-add-column flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus" id="popup-title">
                                    Add MCP Server
                                </p>
                                <img 
                                    src={IconDismiss} 
                                    alt="Close" 
                                    height="24" 
                                    className="pointer"
                                    onClick={() => setShowAddPopup(false)}
                                />
                            </div>
                            
                            <form onSubmit={handleAddServer}>
                                <p className="text--micro text__semibold mrgnt-15">Server Name (identifier)</p>
                                <input
                                    type="text"
                                    className="form--input wdth-full mrgnt-7"
                                    placeholder="e.g., slack, notion"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                    required
                                />

                                <p className="text--micro text__semibold mrgnt-15">Display Name</p>
                                <input
                                    type="text"
                                    className="form--input wdth-full mrgnt-7"
                                    placeholder="e.g., Slack Integration"
                                    value={formData.display_name}
                                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                    required
                                />

                                <p className="text--micro text__semibold mrgnt-15">API URL</p>
                                <input
                                    type="url"
                                    className="form--input wdth-full mrgnt-7"
                                    placeholder="https://api.example.com"
                                    value={formData.url}
                                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                    required
                                />

                                <p className="text--micro text__semibold mrgnt-15">Description (optional)</p>
                                <textarea
                                    className="form--input wdth-full mrgnt-7"
                                    placeholder="What does this MCP server do?"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                    style={{ resize: 'vertical' }}
                                />

                                <button 
                                    type="submit"
                                    className="button wdth-full mrgnt-20"
                                >
                                    Add Server
                                </button>
                                
                                <button 
                                    type="button"
                                    onClick={() => setShowAddPopup(false)}
                                    className="button button-dark wdth-full mrgnt-7"
                                >
                                    Cancel
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Server Popup */}
            {showEditPopup && editingServer && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="pop-add-column flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus" id="popup-title">
                                    Edit MCP Server
                                </p>
                                <img 
                                    src={IconDismiss} 
                                    alt="Close" 
                                    height="24" 
                                    className="pointer"
                                    onClick={() => {
                                        setShowEditPopup(false);
                                        setEditingServer(null);
                                    }}
                                />
                            </div>
                            
                            <form onSubmit={handleEditServer}>
                                <p className="text--micro text__semibold mrgnt-15">Display Name</p>
                                <input
                                    type="text"
                                    className="form--input wdth-full mrgnt-7"
                                    value={editingServer.display_name}
                                    onChange={(e) => setEditingServer({ ...editingServer, display_name: e.target.value })}
                                    autoFocus
                                    required
                                />

                                <p className="text--micro text__semibold mrgnt-15">API URL</p>
                                <input
                                    type="url"
                                    className="form--input wdth-full mrgnt-7"
                                    value={editingServer.url}
                                    onChange={(e) => setEditingServer({ ...editingServer, url: e.target.value })}
                                    required
                                />

                                <p className="text--micro text__semibold mrgnt-15">Description (optional)</p>
                                <textarea
                                    className="form--input wdth-full mrgnt-7"
                                    value={editingServer.description}
                                    onChange={(e) => setEditingServer({ ...editingServer, description: e.target.value })}
                                    rows={3}
                                    style={{ resize: 'vertical' }}
                                />

                                <button 
                                    type="submit"
                                    className="button button-big wdth-full mrgnt-20"
                                >
                                    Save Changes
                                </button>
                                
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setShowEditPopup(false);
                                        setEditingServer(null);
                                    }}
                                    className="button button-big button-dark wdth-full mrgnt-7"
                                >
                                    Cancel
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
