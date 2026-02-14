import { useState, useCallback } from 'react';
import IconFolder from '../../assets/folder.svg';
import IconMore from '../../assets/more.svg';
import { getTimeAgo } from '../../utils/utils';

const FileTree = ({
    folders,
    files,
    currentFolder,
    onOpenFolder,
    onRenameFolder,
    onDeleteFolder,
    onRenameFile,
    onDeleteFile,
    onViewFile,
    onToggleVisibility,
    formatFileSize,
    getFileType
}) => {
    const [openDropdownIndex, setOpenDropdownIndex] = useState(null);

    const toggleDropdown = useCallback((index, e) => {
        e.stopPropagation();
        setOpenDropdownIndex(openDropdownIndex === index ? null : index);
    }, [openDropdownIndex]);

    // Close dropdown when clicking outside
    const handleDropdownAction = useCallback((action) => {
        action();
        setOpenDropdownIndex(null);
    }, []);

    if (files.length === 0 && folders.length === 0) {
        return (
            <div className="flex flex-column flex-center" style={{ padding: '40px' }}>
                <p style={{ color: '#6b7280' }}>No resources yet</p>
            </div>
        );
    }

    return (
        <div className="grid-flexible gap-10">
            {/* Render folders first (only when not inside a folder) */}
            {!currentFolder && folders.map((folder, index) => (
                <div
                    key={`folder-${index}`}
                    className="file flex flex-row-center flex-space-between"
                    style={{
                        border: '3px solid #2b2b2b',
                        cursor: 'pointer',
                        position: 'relative'
                    }}
                    onClick={() => onOpenFolder(folder)}
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
                                                onClick={() => handleDropdownAction(() => onRenameFolder(folder))}
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
                                                onClick={() => handleDropdownAction(() => onDeleteFolder(folder.id, folder.name))}
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
            {files.map((file, index) => (
                <div
                    key={file.id || index}
                    className="file flex flex-row-center flex-space-between"
                    style={{
                        border: '3px solid #2b2b2b',
                        cursor: 'pointer'
                    }}
                    onClick={() => onViewFile(file)}
                >
                    <div className="flex flex-column wdth-100">
                        {file.is_processing ? (
                            <div style={{ padding: '12px' }}>
                                <div className="shimmer" style={{ height: '110px' }}></div>
                            </div>
                        ) : (
                            <div className='markdown-html-container' style={{
                                opacity: file.use ? 1 : 0.2,
                                transition: 'opacity 0.3s'
                            }}>
                                <div style={{
                                    border: '1px solid #dedcd126',
                                    fontSize: '10px',
                                    margin: 'auto',
                                    borderRadius: '8px 8px 0 0',
                                    transitionDuration: '0.3s',
                                    overflow: 'hidden',
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
                                                onClick={() => handleDropdownAction(() => onRenameFile(file))}
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
                                                onClick={() => handleDropdownAction(() => onToggleVisibility(file.id, file.name, file.use))}
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
                                                onClick={() => handleDropdownAction(() => onDeleteFile(file.id, file.name))}
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
        </div>
    );
};

export default FileTree;
