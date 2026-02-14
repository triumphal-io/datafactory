import { useState, useCallback, useRef } from 'react';
import IconFileAttach from '../../assets/file-attach.svg';

/**
 * Drag-and-drop file upload wrapper. Shows an overlay when files are dragged over.
 *
 * @param {Object} props
 * @param {function} props.onFilesDropped - Callback with an array of dropped File objects
 * @param {React.ReactNode} props.children - Content to render inside the upload area
 */
const FileUpload = ({ onFilesDropped, children }) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDraggingOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDraggingOver(false);
        }
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        dragCounterRef.current = 0;

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await onFilesDropped(files);
        }
    }, [onFilesDropped]);

    return (
        <div
            className="sheet-content flex-expanded scroll-x scroll-y thin-scroll"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{ position: 'relative' }}
        >
            {children}

            {isDraggingOver && (
                <div className="drop-overlay">
                    <div className="flex flex-column gap-15">
                        <img src={IconFileAttach} alt="File Icon" height="80" />
                        <p className="text-mega">Drop files here to upload to Resources</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileUpload;
