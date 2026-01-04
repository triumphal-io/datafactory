import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import IconAdd from '../assets/add-circle.svg';
import IconFile from '../assets/file.svg';
import IconLoader from '../assets/loader.gif';
import IconMore from '../assets/more.svg';
import { apiFetch } from '../utils/api';
import { showToast, getTimeAgo, convertMarkdownToHtml } from '../utils/utils';

const FilesView = forwardRef(({ documentId, onSavingChange, onLastSavedChange, onNavigationChange }, ref) => {
    // State management
    const [projectFiles, setProjectFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [openDropdownIndex, setOpenDropdownIndex] = useState(null);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        uploadFiles: uploadFiles,
        loadProjectFiles: loadProjectFiles
    }));

    // Load project files from backend
    const loadProjectFiles = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await apiFetch(`/api/documents/${documentId}/files/list`);
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    setProjectFiles(data.files || []);
                }
            }
        } catch (error) {
            console.error('Error loading project files:', error);
            showToast('Failed to load files', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [documentId]);

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
    }, [documentId, loadProjectFiles]);

    // Handle add files
    const handleAddFiles = useCallback(() => {
        // Create a file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.csv,.xlsx,.xls';
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

    // Set navigation state for project view
    useEffect(() => {
        if (onNavigationChange) {
            onNavigationChange(
                <div className="flex flex-row-center">
                    <div 
                        onClick={handleAddFiles}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                    >
                        <img src={IconAdd} alt="Add Icon" height="16" />
                        <p className="text--micro">Add Files</p>
                    </div>
                </div>
            );
        }

        return () => {
            if (onNavigationChange) {
                onNavigationChange(null);
            }
        };
    }, [onNavigationChange, handleAddFiles]);

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
        <div className="sheet-content flex-expanded scroll-x scroll-y thin-scroll">
            <div className="flex flex-column" style={{ padding: '20px' }}>
                
                {projectFiles.length === 0 ? (
                    <div className="flex flex-column flex-center" style={{ padding: '40px' }}>
                        <p style={{ color: '#6b7280' }}>No project files yet</p>
                    </div>
                ) : (
                    <div className="grid-flexible gap-10">
                        {projectFiles.map((file, index) => {
                            const formatFileSize = (bytes) => {
                                if (bytes < 1024) return `${bytes} B`;
                                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                                if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                                return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
                            };

                            const getFileType = (filename) => {
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
                            };

                            return (
                                <div 
                                    key={index}
                                    className="file flex flex-row-center flex-space-between"
                                    style={{
                                        // padding: '12px 16px',
                                        border: '3px solid #2b2b2b',
                                        // borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div className="flex flex-column wdth-100">
                                        {file.is_processing ? (
                                            <div style={{ padding: '12px' }}>
                                                <div className="shimmer" style={{ height: '180px' }}></div>
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
                                                {<div className='markdown-html thumbnail' dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(file.content) }} />
                                                 || (<div style={{ color: '#6b7280' }}>No preview available</div>)}
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
    );
});

FilesView.displayName = 'FilesView';

export default FilesView;
