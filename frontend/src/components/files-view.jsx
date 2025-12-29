import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import IconAdd from '../assets/add-circle.svg';
import IconFile from '../assets/file.svg';
import IconLoader from '../assets/loader.gif';
import { apiFetch } from '../utils/api';
import { showToast } from '../utils/utils';
import { convertMarkdownToHtml } from '../utils/utils';

const FilesView = forwardRef(({ documentId, onSavingChange, onLastSavedChange, onNavigationChange }, ref) => {
    // State management
    const [projectFiles, setProjectFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        // Add methods here if needed
    }));

    // Load project files from backend
    const loadProjectFiles = useCallback(async () => {
        try {
            setIsLoading(true);
            const formData = new FormData();
            const response = await apiFetch(`/api/documents/${documentId}/files/list`, {
                method: 'POST',
                body: formData
            });
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
        try {
            showToast('Uploading...', 'info');
            
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
                    showToast('Uploaded', 'success');
                    // Refresh the files list
                    await loadProjectFiles();
                } else {
                    showToast('Upload failed', 'error');
                }
            } else {
                showToast('Upload failed', 'error');
            }
        } catch (error) {
            console.error('Error uploading files:', error);
            showToast('Upload failed', 'error');
        }
    }, [documentId, loadProjectFiles]);

    // Handle add files
    const handleAddFiles = useCallback(() => {
        // Create a file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                await uploadFiles(files);
            }
        };
        input.click();
    }, [uploadFiles]);

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
                <div className="flex flex-column flex-center" style={{ padding: '40px' }}>
                    <p style={{ color: '#6b7280' }}>Loading project files...</p>
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
                                    className="flex flex-row-center flex-space-between"
                                    style={{
                                        padding: '12px 16px',
                                        backgroundColor: '#2B2B2B',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div className="flex flex-column">
                                        {file.is_processing ? (
                                            <img src={IconLoader} alt="Processing" width="50" className='mrgnt-5 mrgnb-20' style={{padding: '31px 31px 31px 6px'}} />
                                        ) : (
                                            // <img src={IconFile} alt="File" width="50" className='mrgnt-5 mrgnb-20' />
                                            // <div className='flex flex-row flex-row-center flex-horizontal-center wdth-100'>
                                            <div style={{
                                                border: '2px solid #dedcd126',
                                                padding: '15px 15px 0 15px',
                                                maxWidth: '150px',
                                                maxHeight: '100px',
                                                fontSize: '10px',
                                                margin: '5px 0 12px 0',
                                                borderRadius: '8px 8px 0 0',
                                                transitionDuration: '0.3s',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                backgroundImage: 'linear-gradient(to bottom, #363636, #36363633)',
                                            }}>
                                                {<div className='markdown-html thumbnail' dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(file.content) }} />
                                                 || (<div style={{ color: '#6b7280' }}>No preview available</div>)}
                                            </div>
                                            // </div>
                                        )}
                                        <p style={{ color: '#fff' }}>{file.name}</p>
                                        <p style={{ color: '#6b7280', fontSize: '12px' }}>
                                            {formatFileSize(file.size)} • {getFileType(file.name)}
                                        </p>
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
