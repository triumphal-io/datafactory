import { useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import IconAdd from '../assets/add-circle.svg';
import IconFile from '../assets/file.svg';
import IconFolder from '../assets/folder.svg';
import IconChevronRight from '../assets/chevron-right.svg';
import IconDismiss from '../assets/dismiss.svg';
import IconLoader from '../assets/loader.gif';
import IconMore from '../assets/more.svg';
import { apiFetch } from '../utils/api';
import { showToast, getTimeAgo, convertMarkdownToHtml } from '../utils/utils';

const FilesView = forwardRef(({ documentId, onSavingChange, onLastSavedChange, onNavigationChange }, ref) => {
    // State management
    const [projectFiles, setProjectFiles] = useState([]);
    const [projectFolders, setProjectFolders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [openDropdownIndex, setOpenDropdownIndex] = useState(null);
    const [showFolderPopup, setShowFolderPopup] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [currentFolder, setCurrentFolder] = useState(null);
    const [renamingFolder, setRenamingFolder] = useState(null);
    const [renamingFile, setRenamingFile] = useState(null);
    const [renameValue, setRenameValue] = useState('');

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        uploadFiles: uploadFiles,
        loadProjectFiles: loadProjectFiles
    }));

    // Load project files and folders from backend
    const loadProjectFiles = useCallback(async () => {
        try {
            setIsLoading(true);
            
            // Load files and folders in parallel
            const filesUrl = currentFolder 
                ? `/api/documents/${documentId}/files/list?folder_id=${currentFolder.id}`
                : `/api/documents/${documentId}/files/list`;
            
            const [foldersResponse, filesResponse] = await Promise.all([
                apiFetch(`/api/documents/${documentId}/folders/list`),
                apiFetch(filesUrl)
            ]);
            
            if (foldersResponse.ok) {
                const foldersData = await foldersResponse.json();
                if (foldersData.status === 'success') {
                    setProjectFolders(foldersData.folders || []);
                }
            }
            
            if (filesResponse.ok) {
                const filesData = await filesResponse.json();
                if (filesData.status === 'success') {
                    setProjectFiles(filesData.files || []);
                }
            }
        } catch (error) {
            console.error('Error loading project files:', error);
            showToast('Failed to load files', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [documentId, currentFolder]);

    useEffect(() => {
        if (documentId) {
            loadProjectFiles();
        }
    }, [documentId, loadProjectFiles]);

    // Upload files to backend
    const uploadFiles = useCallback(async (files) => {
        const toastId = showToast('Uploading...', 'info', 999999);
        try {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });
            
            // Include folder ID if uploading inside a folder
            if (currentFolder) {
                formData.append('folder_id', currentFolder.id);
            }

            const response = await apiFetch(`/api/documents/${documentId}/files/upload`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('Uploaded', 'success', 3000, toastId);
                    // Refresh the files list
                    await loadProjectFiles();
                } else {
                    showToast('Upload failed', 'error', 3000, toastId);
                }
            } else {
                showToast('Upload failed', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Error uploading files:', error);
            showToast('Upload failed', 'error', 3000, toastId);
        }
    }, [documentId, currentFolder, loadProjectFiles]);

    // Handle add folder
    const handleAddFolder = useCallback(() => {
        setFolderName('');
        setShowFolderPopup(true);
    }, []);

    // Handle create folder
    const handleCreateFolder = useCallback(async () => {
        if (!folderName.trim()) {
            showToast('Folder name cannot be empty', 'error');
            return;
        }
        
        const toastId = showToast('Creating folder...', 'info', 999999);
        try {
            const response = await apiFetch(`/api/documents/${documentId}/folders/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: folderName })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('Folder created', 'success', 3000, toastId);
                    setShowFolderPopup(false);
                    await loadProjectFiles();
                } else {
                    showToast('Failed to create folder', 'error', 3000, toastId);
                }
            } else {
                showToast('Failed to create folder', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            showToast('Failed to create folder', 'error', 3000, toastId);
        }
    }, [documentId, folderName, loadProjectFiles]);

    // Handle open folder
    const handleOpenFolder = useCallback((folder) => {
        setCurrentFolder(folder);
    }, []);

    // Handle back to all files
    const handleBackToAllFiles = useCallback(() => {
        setCurrentFolder(null);
    }, []);

    // Handle rename folder
    const handleRenameFolder = useCallback((folder) => {
        setRenamingFolder(folder);
        setRenameValue(folder.name);
    }, []);

    // Handle confirm folder rename
    const handleConfirmFolderRename = useCallback(async () => {
        if (!renameValue.trim()) {
            showToast('Folder name cannot be empty', 'error');
            return;
        }
        
        const toastId = showToast('Renaming folder...', 'info', 999999);
        try {
            const response = await apiFetch(`/api/documents/${documentId}/folders/${renamingFolder.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: renameValue })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('Folder renamed', 'success', 3000, toastId);
                    setRenamingFolder(null);
                    setRenameValue('');
                    // Update current folder if we're inside it
                    if (currentFolder && currentFolder.id === renamingFolder.id) {
                        setCurrentFolder({ ...currentFolder, name: renameValue });
                    }
                    await loadProjectFiles();
                } else {
                    showToast('Rename failed', 'error', 3000, toastId);
                }
            } else {
                showToast('Rename failed', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Error renaming folder:', error);
            showToast('Rename failed', 'error', 3000, toastId);
        }
    }, [documentId, renamingFolder, renameValue, currentFolder, loadProjectFiles]);

    // Handle delete folder
    const handleDeleteFolder = useCallback(async (folderId, folderName) => {
        if (!confirm(`Are you sure you want to delete "${folderName}" and all files in it?`)) {
            return;
        }
        
        const toastId = showToast('Deleting folder...', 'info', 999999);
        try {
            const response = await apiFetch(`/api/documents/${documentId}/folders/${folderId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('Folder deleted', 'success', 3000, toastId);
                    await loadProjectFiles();
                } else {
                    showToast('Delete failed', 'error', 3000, toastId);
                }
            } else {
                showToast('Delete failed', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Error deleting folder:', error);
            showToast('Delete failed', 'error', 3000, toastId);
        }
    }, [documentId, loadProjectFiles]);

    // Handle add files
    const handleAddFiles = useCallback(() => {
        // Create a file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.csv,.xlsx,.xls,.pdf,.docx,.doc,.txt,.md,.pptx,.ppt';
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                await uploadFiles(files);
            }
        };
        input.click();
    }, [uploadFiles]);

    // Handle delete file
    const handleDeleteFile = useCallback(async (fileId, fileName) => {
        if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
            return;
        }
        
        const toastId = showToast('Deleting...', 'info', 999999);
        try {
            const response = await apiFetch(`/api/documents/${documentId}/files/${fileId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('File deleted', 'success', 3000, toastId);
                    await loadProjectFiles();
                } else {
                    showToast('Delete failed', 'error', 3000, toastId);
                }
            } else {
                showToast('Delete failed', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            showToast('Delete failed', 'error', 3000, toastId);
        }
        setOpenDropdownIndex(null);
    }, [documentId, loadProjectFiles]);

    // Handle rename file
    const handleRenameFile = useCallback((file) => {
        setRenamingFile(file);
        setRenameValue(file.name);
        setOpenDropdownIndex(null);
    }, []);

    // Handle view file in new window
    const handleViewFile = useCallback((file) => {
        if (!file.content) {
            showToast('No content available', 'error');
            return;
        }
        
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            const htmlContent = convertMarkdownToHtml(file.content);
            newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${file.name}</title>
                    <meta charset="UTF-8">
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                            margin: 0;
                            padding: 20px;
                            line-height: 1.6;
                            color: #333;
                            background: #fff;
                        }
                        @media (prefers-color-scheme: dark) {
                            body {
                                background: #1a1a1a;
                                color: #e0e0e0;
                            }
                        }
                        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        @media (prefers-color-scheme: dark) {
                            th, td { border-color: #444; }
                            th { background-color: #2a2a2a; }
                        }
                        h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; }
                        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
                        @media (prefers-color-scheme: dark) {
                            code { background: #2a2a2a; }
                        }
                        pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
                        @media (prefers-color-scheme: dark) {
                            pre { background: #2a2a2a; }
                        }
                    </style>
                </head>
                <body>
                    ${htmlContent}
                </body>
                </html>
            `);
            newWindow.document.close();
        }
    }, []);

    // Handle confirm file rename
    const handleConfirmFileRename = useCallback(async () => {
        if (!renameValue.trim()) {
            showToast('File name cannot be empty', 'error');
            return;
        }
        
        const toastId = showToast('Renaming file...', 'info', 999999);
        try {
            const response = await apiFetch(`/api/documents/${documentId}/files/${renamingFile.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: renameValue })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast('File renamed', 'success', 3000, toastId);
                    setRenamingFile(null);
                    setRenameValue('');
                    await loadProjectFiles();
                } else {
                    showToast('Rename failed', 'error', 3000, toastId);
                }
            } else {
                showToast('Rename failed', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Error renaming file:', error);
            showToast('Rename failed', 'error', 3000, toastId);
        }
    }, [documentId, renamingFile, renameValue, loadProjectFiles]);

    // Handle toggle visibility
    const handleToggleVisibility = useCallback(async (fileId, fileName, currentVisibility) => {
        const newVisibility = !currentVisibility;
        const toastId = showToast('Updating...', 'info', 999999);
        try {
            const response = await apiFetch(`/api/documents/${documentId}/files/${fileId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ visible: newVisibility })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    showToast(newVisibility ? 'File shown' : 'File hidden', 'success', 3000, toastId);
                    await loadProjectFiles();
                } else {
                    showToast('Update failed', 'error', 3000, toastId);
                }
            } else {
                showToast('Update failed', 'error', 3000, toastId);
            }
        } catch (error) {
            console.error('Error updating visibility:', error);
            showToast('Update failed', 'error', 3000, toastId);
        }
        setOpenDropdownIndex(null);
    }, [documentId, loadProjectFiles]);

    // Toggle dropdown menu
    const toggleDropdown = useCallback((index, e) => {
        e.stopPropagation();
        setOpenDropdownIndex(openDropdownIndex === index ? null : index);
    }, [openDropdownIndex]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setOpenDropdownIndex(null);
        };
        
        if (openDropdownIndex !== null) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [openDropdownIndex]);

    // Helper functions - moved outside map for better performance
    const formatFileSize = useCallback((bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }, []);

    const getFileType = useCallback((filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        const types = {
            'csv': 'CSV',
            'xlsx': 'Excel',
            'xls': 'Excel',
            'pdf': 'PDF',
            'png': 'Image',
            'jpg': 'Image',
            'jpeg': 'Image',
            'gif': 'Image',
            'txt': 'Text',
            'doc': 'Word',
            'docx': 'Word',
            'ppt': 'PowerPoint',
            'pptx': 'PowerPoint'
        };
        return types[ext] || 'File';
    }, []);

    // Memoize converted HTML for files to avoid re-converting on every render
    // Only convert first 500 characters for thumbnail preview
    const filesWithHtml = useMemo(() => {
        return projectFiles.map(file => ({
            ...file,
            htmlContent: file.content ? convertMarkdownToHtml(file.content.slice(0, 500)) : null
        }));
    }, [projectFiles]);

    // Memoize navigation component
    const navigationContent = useMemo(() => (
        <div className="flex flex-row-center flex-space-between wdth-100">
            {/* Breadcrumb navigation */}
            <div className="flex flex-row-center gap-10">
                <img src={IconChevronRight} alt=">" height="12" style={{ opacity: 0.5 }} />
                <p 
                    className="text--micro pointer" 
                    onClick={handleBackToAllFiles}
                    style={{ opacity: currentFolder ? 0.7 : 1 }}
                >
                    Project Files
                </p>
                {currentFolder && (
                    <>
                        <img src={IconChevronRight} alt=">" height="12" style={{ opacity: 0.5 }} />
                        <p className="text--micro">{currentFolder.name}</p>
                    </>
                )}
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-row-center">
                {!currentFolder && (
                    <div 
                        onClick={handleAddFolder}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                    >
                        <img src={IconAdd} alt="Add Icon" height="16" />
                        <p className="text--micro">Add Folder</p>
                    </div>
                )}
                <div 
                    onClick={handleAddFiles}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconAdd} alt="Add Icon" height="16" />
                    <p className="text--micro">Add Files</p>
                </div>
            </div>
        </div>
    ), [currentFolder, handleBackToAllFiles, handleAddFolder, handleAddFiles]);

    // Set navigation state for project view
    useEffect(() => {
        if (onNavigationChange) {
            onNavigationChange(navigationContent);
        }

        return () => {
            if (onNavigationChange) {
                onNavigationChange(null);
            }
        };
    }, [onNavigationChange, navigationContent]);

    if (isLoading) {
        return (
            <div className="sheet-content flex-expanded scroll-x scroll-y thin-scroll">
                <div className="flex flex-column" style={{ padding: '20px' }}>
                    <div className="grid-flexible gap-10">
                        {[...Array(3)].map((_, index) => (
                            <div key={index} className="shimmer" style={{ height: '180px' }}></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Folder creation popup */}
            {showFolderPopup && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="pop-add-column flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus" id="popup-title">
                                    Create New Folder
                                </p>
                                <img 
                                    src={IconDismiss} 
                                    alt="Close" 
                                    height="24" 
                                    className="pointer"
                                    onClick={() => setShowFolderPopup(false)}
                                />
                            </div>
                            
                            <p className="text--micro text__semibold mrgnt-15">Folder Name</p>
                            <input
                                type="text"
                                className="form--input wdth-full mrgnt-7"
                                placeholder="Enter folder name"
                                value={folderName}
                                onChange={(e) => setFolderName(e.target.value)}
                                autoFocus
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleCreateFolder();
                                    }
                                }}
                            />

                            <button 
                                onClick={handleCreateFolder}
                                className="button button-big wdth-full mrgnt-20"
                            >
                                Create Folder
                            </button>
                            
                            <button 
                                onClick={() => setShowFolderPopup(false)}
                                className="button button-big button-dark wdth-full mrgnt-7"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Folder rename popup */}
            {renamingFolder && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="pop-add-column flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus" id="popup-title">
                                    Rename Folder
                                </p>
                                <img 
                                    src={IconDismiss} 
                                    alt="Close" 
                                    height="24" 
                                    className="pointer"
                                    onClick={() => {
                                        setRenamingFolder(null);
                                        setRenameValue('');
                                    }}
                                />
                            </div>
                            
                            <p className="text--micro text__semibold mrgnt-15">Folder Name</p>
                            <input
                                type="text"
                                className="form--input wdth-full mrgnt-7"
                                placeholder="Enter folder name"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                autoFocus
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleConfirmFolderRename();
                                    }
                                }}
                            />

                            <button 
                                onClick={handleConfirmFolderRename}
                                className="button button-big wdth-full mrgnt-20"
                            >
                                Rename Folder
                            </button>
                            
                            <button 
                                onClick={() => {
                                    setRenamingFolder(null);
                                    setRenameValue('');
                                }}
                                className="button button-big button-dark wdth-full mrgnt-7"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* File rename popup */}
            {renamingFile && (
                <div className="popup" style={{ display: 'block' }}>
                    <div className="popup-content">
                        <div className="pop-add-column flex flex-column">
                            <div className="flex flex-row-center flex-space-between">
                                <p className="text--mega-plus" id="popup-title">
                                    Rename File
                                </p>
                                <img 
                                    src={IconDismiss} 
                                    alt="Close" 
                                    height="24" 
                                    className="pointer"
                                    onClick={() => {
                                        setRenamingFile(null);
                                        setRenameValue('');
                                    }}
                                />
                            </div>
                            
                            <p className="text--micro text__semibold mrgnt-15">File Name</p>
                            <input
                                type="text"
                                className="form--input wdth-full mrgnt-7"
                                placeholder="Enter file name"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                autoFocus
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleConfirmFileRename();
                                    }
                                }}
                            />

                            <button 
                                onClick={handleConfirmFileRename}
                                className="button button-big wdth-full mrgnt-20"
                            >
                                Rename File
                            </button>
                            
                            <button 
                                onClick={() => {
                                    setRenamingFile(null);
                                    setRenameValue('');
                                }}
                                className="button button-big button-dark wdth-full mrgnt-7"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="sheet-content flex-expanded scroll-x scroll-y thin-scroll">
                <div className="flex flex-column" style={{ padding: '20px' }}>
                    
                    {projectFiles.length === 0 && projectFolders.length === 0 ? (
                        <div className="flex flex-column flex-center" style={{ padding: '40px' }}>
                            <p style={{ color: '#6b7280' }}>No project files yet</p>
                        </div>
                    ) : (
                        <div className="grid-flexible gap-10">
                            {/* Render folders first (only when not inside a folder) */}
                            {!currentFolder && projectFolders.map((folder, index) => (
                                <div 
                                    key={`folder-${index}`}
                                    className="file flex flex-row-center flex-space-between"
                                    style={{
                                        border: '3px solid #2b2b2b',
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                    onClick={() => handleOpenFolder(folder)}
                                >
                                    <div className="flex flex-column wdth-100">
                                        <div className='flex flex-column flex-center' style={{
                                            padding: '28px 10px', margin: 'auto',
                                            opacity: folder.in_use ? 1 : 0.2,
                                            transition: 'opacity 0.3s'
                                        }}>
                                            <img src={IconFolder} alt="Folder" width="64" style={{ marginBottom: '16px', opacity: 0.7 }} />
                                        </div>
                                        <div className='flex flex-column gap-5 padl-15 padr-15 padb-10'>
                                            <div className='flex flex-row-center flex-space-between'>
                                                <p className='text--micro'>{folder.name}</p>
                                                <p className='text--nano opacity-5'>{folder.file_count} files</p>
                                            </div>
                                            <div className='flex flex-row-center flex-space-between'>
                                                <p className='text--micro opacity-5'>{getTimeAgo(new Date(folder.last_uploaded || folder.created_at))}</p>
                                                {/* Folder actions menu */}
                                                <div style={{ position: 'relative' }}>
                                                    <img 
                                                        src={IconMore} 
                                                        alt="More Options" 
                                                        height="22" 
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => toggleDropdown(`folder-${index}`, e)}
                                                    />
                                                    {openDropdownIndex === `folder-${index}` && (
                                            <div 
                                                className="dropdown-menu"
                                                style={{
                                                    position: 'absolute',
                                                    right: '0',
                                                    top: '100%',
                                                    marginTop: '4px',
                                                    backgroundColor: '#222',
                                                    border: '1px solid #3b3b3b',
                                                    borderRadius: '4px',
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                                    zIndex: 1000,
                                                    minWidth: '150px'
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div 
                                                    className="dropdown-item"
                                                    style={{
                                                        padding: '8px 12px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px',
                                                        borderBottom: '1px solid #3b3b3b'
                                                    }}
                                                    onClick={() => {
                                                        handleRenameFolder(folder);
                                                        setOpenDropdownIndex(null);
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    Rename
                                                </div>
                                                <div 
                                                    className="dropdown-item"
                                                    style={{
                                                        padding: '8px 12px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px',
                                                        color: '#ff6b6b'
                                                    }}
                                                    onClick={() => {
                                                        handleDeleteFolder(folder.id, folder.name);
                                                        setOpenDropdownIndex(null);
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    Delete
                                                </div>
                                            </div>
                                        )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            
                            {/* Render files */}
                            {filesWithHtml.map((file, index) => {
                            return (
                                <div 
                                    key={file.id || index}
                                    className="file flex flex-row-center flex-space-between"
                                    style={{
                                        // padding: '12px 16px',
                                        border: '3px solid #2b2b2b',
                                        // borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => handleViewFile(file)}
                                >
                                    <div className="flex flex-column wdth-100">
                                        {file.is_processing ? (
                                            <div style={{ padding: '12px' }}>
                                                <div className="shimmer" style={{ height: '110px' }}></div>
                                            </div>
                                        ) : (
                                            // <img src={IconFile} alt="File" width="50" className='mrgnt-5 mrgnb-20' />
                                            // <div className='flex flex-row flex-row-center flex-horizontal-center wdth-100'>
                                            <div className='markdown-html-container' style={{
                                                opacity: file.use ? 1 : 0.2,
                                                transition: 'opacity 0.3s'
                                            }}>
                                                <div style={{
                                                    border: '1px solid #dedcd126',
                                                    fontSize: '10px',
                                                    // maxWidth: '150px',
                                                    margin: 'auto',
                                                    borderRadius: '8px 8px 0 0',
                                                    transitionDuration: '0.3s',
                                                    overflow: 'hidden',
                                                    // transform: 'scale(0.5)',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                {file.htmlContent ? (
                                                    <div className='markdown-html thumbnail' dangerouslySetInnerHTML={{ __html: file.htmlContent }} />
                                                ) : (
                                                    <div style={{ color: '#6b7280' }}>No preview available</div>
                                                )}
                                            </div>
                                            </div>
                                        )}
                                        <div className='flex flex-column gap-5 padl-15 padr-15 padb-10'>
                                            <div className='flex flex-row-center flex-space-between'>
                                                <p className='text--micro'>{file.name} {file.use ? '' : '(AI cannot use)'}</p>
                                                <p className='text--nano opacity-5'>{formatFileSize(file.size)} • {getFileType(file.name)}</p>
                                            </div>
                                            <div className='flex flex-row-center flex-space-between'>
                                                <p className='text--micro opacity-5'>{getTimeAgo(new Date(file.uploaded_at))}</p>
                                                <div style={{ position: 'relative' }}>
                                                    <img 
                                                        src={IconMore} 
                                                        alt="More Options" 
                                                        height="22" 
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => toggleDropdown(index, e)}
                                                    />
                                                    {openDropdownIndex === index && (
                                                        <div 
                                                            className="dropdown-menu"
                                                            style={{
                                                                position: 'absolute',
                                                                right: '0',
                                                                top: '100%',
                                                                marginTop: '4px',
                                                                backgroundColor: '#222',
                                                                border: '1px solid #3b3b3b',
                                                                borderRadius: '4px',
                                                                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                                                zIndex: 1000,
                                                                minWidth: '150px'
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div 
                                                                className="dropdown-item"
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '12px',
                                                                    borderBottom: '1px solid #3b3b3b'
                                                                }}
                                                                onClick={() => handleRenameFile(file)}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            >
                                                                Rename
                                                            </div>
                                                            <div 
                                                                className="dropdown-item"
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '12px',
                                                                    borderBottom: '1px solid #3b3b3b'
                                                                }}
                                                                onClick={() => handleToggleVisibility(file.id, file.name, file.use)}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            >
                                                                {file.use ? 'Make Invisible' : 'Make Visible'}
                                                            </div>
                                                            <div 
                                                                className="dropdown-item"
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '12px',
                                                                    color: '#ff6b6b'
                                                                }}
                                                                onClick={() => handleDeleteFile(file.id, file.name)}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            >
                                                                Delete
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
        </>
    );
});

FilesView.displayName = 'FilesView';

export default FilesView;
