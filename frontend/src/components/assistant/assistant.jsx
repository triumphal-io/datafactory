import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { apiFetch } from '../../utils/api.js';
import { DEFAULT_AI_MODEL } from '../../utils/utils.js';
import { useWebSocket } from '../../utils/websocket-context.jsx';
import AssistantMessage from './message.jsx';
import AssistantToolStep from './tool-step.jsx';
import IconAdd from '../../assets/add.svg';
import IconSend from '../../assets/arrow-up.svg';
import LogoIcon from '../../assets/logo-icon.svg';
import IconDismiss from '../../assets/dismiss.svg';
import IconFile from '../../assets/sheet.svg';
import IconHand from '../../assets/hand.svg';

// Temporarily disable column mentions.
// (Keeps other mention categories like files/folders/sheets.)
const ENABLE_COLUMN_MENTIONS = false;

const Assistant = forwardRef(({ workbookId, onToolsRequested, selectedCells = new Set(), sheetName = '', sheetId = '', getSheetData, droppedFiles, selectedModel = DEFAULT_AI_MODEL, onModelChange }, ref) => {
    const { sendMessage: sendWebSocketMessage, isConnected: wsConnected } = useWebSocket();
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [conversationId, setConversationId] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [mentionSuggestions, setMentionSuggestions] = useState([]);
    const [showMentions, setShowMentions] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
    const [mentionStartPos, setMentionStartPos] = useState(null);
    const [mentionEndPos, setMentionEndPos] = useState(null);
    const [mentions, setMentions] = useState([]);
    const [availableModels, setAvailableModels] = useState([]);
    const bodyRef = useRef(null);
    const editableRef = useRef(null);
    const fileInputRef = useRef(null);
    const mentionDropdownRef = useRef(null);
    const selectedCellsRef = useRef(selectedCells);
    const isComposingRef = useRef(false);

    // Update ref synchronously during render to avoid being one step behind
    selectedCellsRef.current = selectedCells;

    // Fetch available models
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await apiFetch('/api/provider-credentials/models', { method: 'GET' });
                const data = await response.json();
                if (data.status === 'success') {
                    setAvailableModels(data.models || []);
                }
            } catch (error) {
                console.error('Error fetching models:', error);
            }
        };
        fetchModels();
    }, []);

    // Fetch mention suggestions when document loads or sheet data changes
    useEffect(() => {
        const fetchMentions = async () => {
            try {
                const response = await apiFetch(`/api/workbooks/mentions?workbook_id=${workbookId}`, { 
                    method: 'GET' 
                });
                const data = await response.json();
                
                if (data.status === 'success') {
                    const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
                    const filtered = ENABLE_COLUMN_MENTIONS
                        ? suggestions
                        : suggestions.filter(s => s?.category !== 'COLUMNS' && s?.type !== 'column');
                    setMentionSuggestions(filtered);
                } else {
                    console.error('Error fetching mentions:', data.message);
                }
            } catch (error) {
                console.error('Error fetching mention suggestions:', error);
            }
        };
        
        if (workbookId) {
            fetchMentions();
        }
    }, [workbookId]);

    // Handle dropped files from parent component
    useEffect(() => {
        if (droppedFiles && droppedFiles.length > 0) {
            setAttachments(prev => [...prev, ...droppedFiles]);
        }
    }, [droppedFiles]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (bodyRef.current) {
            requestAnimationFrame(() => {
                bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
            });
        }
    }, [messages]);

    // Blur editable div when clicking outside of it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (editableRef.current && !editableRef.current.contains(event.target)) {
                editableRef.current.blur();
            }
            
            // Close mentions dropdown when clicking outside
            if (showMentions && 
                mentionDropdownRef.current && 
                !mentionDropdownRef.current.contains(event.target) &&
                editableRef.current && 
                !editableRef.current.contains(event.target)) {
                setShowMentions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMentions]);

    // Scroll selected mention into view when navigating with keyboard
    useEffect(() => {
        if (showMentions && mentionDropdownRef.current) {
            const selectedItem = mentionDropdownRef.current.querySelector(`[data-mention-index="${selectedMentionIndex}"]`);
            if (selectedItem) {
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [selectedMentionIndex, showMentions]);

    // Expose method to send tool results back
    useImperativeHandle(ref, () => ({
        sendToolResults: async (toolResults, conversationIdOverride) => {
            const convId = conversationIdOverride || conversationId;
            if (!convId) {
                console.error('No conversation ID available');
                return;
            }

            setIsProcessing(true);

            // Mark all pending tools as completed immediately
            // toolResults uses 'id' field (from executeTools), but we may also get 'tool_call_id' from backend
            const toolIds = toolResults.map(tr => tr.tool_call_id || tr.id);
            console.log('Tool IDs to mark completed:', toolIds);
            setMessages(prev => prev.map(msg => {
                if (msg.type === 'tool_call' && toolIds.includes(msg.id) && msg.status === 'pending') {
                    console.log(`Marking tool ${msg.id} as completed`);
                    return { ...msg, status: 'completed' };
                }
                return msg;
            }));

            // Add working message to show the assistant is processing tool results
            setMessages(prev => [...prev, { type: 'working' }]);

            try {
                const response = await apiFetch(`/api/workbooks/${workbookId}/assistant/ask`, {
                    method: 'POST',
                    body: JSON.stringify({
                        message_type: 'tool_result',
                        conversation_id: convId,
                        tool_results: toolResults,
                        model: selectedModel
                    })
                });

                const data = await response.json();
                console.log("Tool result response:", data);

                if (data.status === 'success') {
                    handleAssistantResponse(data);
                } else {
                    // Mark tools as failed if the response wasn't successful
                    setMessages(prev => prev.map(msg => {
                        if (msg.type === 'tool_call' && toolIds.includes(msg.id)) {
                            return { ...msg, status: 'error' };
                        }
                        return msg;
                    }));
                }
            } catch (error) {
                console.error('Error sending tool results:', error);
                // Mark all tools as failed on error
                setMessages(prev => prev.map(msg => {
                    if (msg.type === 'tool_call' && toolIds.includes(msg.id)) {
                        return { ...msg, status: 'error' };
                    }
                    return msg;
                }));
            } finally {
                setIsProcessing(false);
            }
        }
    }));

    const handleAssistantResponse = (data) => {
        if (data.type === 'message') {
            // Regular text message from assistant
            setMessages(prev => [...prev.filter(m => m.type !== 'working'), { 
                type: 'assistant', 
                content: data.content 
            }]);
        } else if (data.type === 'tool_call') {
            // Tool execution needed
            // Add pending tool messages
            const toolMessages = data.tools.map(tool => ({
                type: 'tool_call',
                toolName: tool.name,
                arguments: tool.arguments,
                id: tool.id,
                status: 'pending'
            }));
            
            setMessages(prev => [...prev.filter(m => m.type !== 'working'), ...toolMessages]);
            
            // Update conversation ID if provided
            if (data.conversation_id) {
                setConversationId(data.conversation_id);
            }
            
            // Notify parent to execute tools
            if (onToolsRequested) {
                onToolsRequested(data.tools, data.conversation_id);
            }
        } else if (data.type === 'tool_result') {
            // Update the status of the tool message to 'completed'
            setMessages(prev => prev.map(msg => {
                if (msg.type === 'tool_call' && msg.id === data.tool_id) {
                    return { ...msg, status: 'completed' };
                }
                return msg;
            }));
        }
    };

    const getPlainTextFromEditable = () => {
        if (!editableRef.current) return '';
        
        let text = '';
        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList.contains('mention-tag')) {
                    const mentionName = node.getAttribute('data-mention-name');
                    text += '@' + mentionName;
                } else {
                    node.childNodes.forEach(processNode);
                }
            }
        };
        
        editableRef.current.childNodes.forEach(processNode);
        return text;
    };

    const newChat = () => {
        setConversationId(null);
        setMessages([]);
        setAttachments([]);
        setInputValue('');
        if (editableRef.current) {
            editableRef.current.innerHTML = '';
        }
        setMentions([]);
    };

    const sendMessage = async () => {
        const message = getPlainTextFromEditable().trim();
        if (!message || isProcessing) return;

        // Add user message to the list (with attachment info if present)
        let userMessageContent = message;
        if (attachments.length > 0) {
            const fileList = attachments.map(f => f.name).join(', ');
            userMessageContent = `${message}\n\n📎 Attached: ${fileList}`;
        }
        setMessages(prev => [...prev, { type: 'user', content: userMessageContent }, { type: 'working' }]);
        setInputValue('');
        if (editableRef.current) {
            editableRef.current.innerHTML = '';
        }
        setMentions([]);
        setIsProcessing(true);

        try {
            // Get current sheet data if available
            const sheetData = getSheetData ? getSheetData() : null;
            
            // Format selected cells for context - use ref to get latest value
            let selectedRange = '';
            const currentSelectedCells = selectedCellsRef.current;
            if (currentSelectedCells && currentSelectedCells.size > 0) {
                const cellArray = Array.from(currentSelectedCells);
                // Convert "row-col" format to Excel notation (e.g., "0-1" -> "B1")
                const excelCells = cellArray.map(cell => {
                    const [row, col] = cell.split('-').map(Number);
                    // Convert column number to letter (0=A, 1=B, etc.)
                    const colLetter = String.fromCharCode(65 + col);
                    // Row numbers match UI display: row 0 shows as 1, row 3 shows as 4
                    return `${colLetter}${row + 1}`;
                });
                selectedRange = excelCells.join(', ');
            }
            
            // Always use FormData to unify the request handling
            const formData = new FormData();
            formData.append('message', message);
            formData.append('message_type', 'user_message');
            if (conversationId) {
                formData.append('conversation_id', conversationId);
            }
            if (sheetData) {
                formData.append('sheet_data', JSON.stringify(sheetData));
            }
            if (sheetName) {
                formData.append('sheet_name', sheetName);
            }
            if (sheetId) {
                formData.append('sheet_id', sheetId);
            }
            if (selectedRange) {
                formData.append('selected_range', selectedRange);
            }
            if (selectedModel) {
                formData.append('model', selectedModel);
            }
            
            // Append all attachments if present
            if (attachments.length > 0) {
                attachments.forEach((file, index) => {
                    formData.append(`attachment_${index}`, file);
                });
            }

            const response = await apiFetch(`/api/workbooks/${workbookId}/assistant/ask`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            console.log("Server response:", data);

            if (data.status === 'success') {
                // Update conversation ID if this is a new conversation
                if (data.conversation_id && !conversationId) {
                    setConversationId(data.conversation_id);
                }
                
                handleAssistantResponse(data);
                
                // Clear attachments after successful send
                setAttachments([]);
            } else {
                throw new Error(data.message || 'Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev.filter(m => m.type !== 'working'), { 
                type: 'error', 
                content: 'Failed to send message. Please try again.' 
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e) => {
        // Handle mentions dropdown navigation
        if (showMentions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const filtered = getFilteredMentions();
                setSelectedMentionIndex((prev) => (prev + 1) % filtered.length);
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const filtered = getFilteredMentions();
                setSelectedMentionIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
                return;
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const filtered = getFilteredMentions();
                if (filtered.length > 0) {
                    insertMention(filtered[selectedMentionIndex]);
                }
                return;
            } else if (e.key === 'Escape') {
                setShowMentions(false);
                return;
            }
        }
        
        // Handle backspace to delete entire mention at once
        if (e.key === 'Backspace') {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (range.collapsed) {
                    // Check if cursor is right after a mention tag
                    const container = range.startContainer;
                    const offset = range.startOffset;
                    
                    // If we're in a text node
                    if (container.nodeType === Node.TEXT_NODE) {
                        const previousSibling = container.previousSibling;
                        // If at the start of a text node and previous sibling is a mention
                        if (offset === 0 && previousSibling && previousSibling.classList?.contains('mention-tag')) {
                            e.preventDefault();
                            previousSibling.remove();
                            
                            // Manually update input value and check for empty
                            if (editableRef.current) {
                                const text = editableRef.current.textContent;
                                setInputValue(text);
                                if (text === '' && editableRef.current.innerHTML !== '') {
                                    editableRef.current.innerHTML = '';
                                }
                            }
                            return;
                        }
                    }
                    // If we're directly in the editable div
                    else if (container === editableRef.current) {
                        if (offset > 0) {
                            const previousNode = container.childNodes[offset - 1];
                            if (previousNode && previousNode.classList?.contains('mention-tag')) {
                                e.preventDefault();
                                previousNode.remove();

                                // Manually update input value and check for empty
                                if (editableRef.current) {
                                    const text = editableRef.current.textContent;
                                    setInputValue(text);
                                    if (text === '' && editableRef.current.innerHTML !== '') {
                                        editableRef.current.innerHTML = '';
                                    }
                                }
                                return;
                            }
                        }
                    }
                }
            }
        }
        
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Shift+Enter: allow default behavior (new line)
                return;
            } else {
                // Enter alone: send message
                e.preventDefault();
                sendMessage();
            }
        }
    };

    const handlePaste = (e) => {
        // Prevent default paste behavior
        e.preventDefault();
        
        // Get plain text from clipboard
        const text = e.clipboardData.getData('text/plain');
        
        // Insert plain text at cursor position
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            
            // Insert text node
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            
            // Move cursor to end of inserted text
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        // Trigger input event to update state
        handleInput({ target: e.target });
    };

    const handleInput = (e) => {
        if (isComposingRef.current) return;
        
        const text = e.target.textContent;
        setInputValue(text);

        // Ensure the element is empty for CSS :empty selector to work
        if (text === '' && e.target.innerHTML !== '') {
            e.target.innerHTML = '';
        }
        
        // Check if user is typing @ for mentions
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.startContainer;
            
            if (container.nodeType === Node.TEXT_NODE) {
                const textBeforeCursor = container.textContent.substring(0, range.startOffset);
                const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                
                if (lastAtIndex !== -1) {
                    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
                    if (charBeforeAt === ' ' || charBeforeAt === '\n' || lastAtIndex === 0) {
                        const searchText = textBeforeCursor.substring(lastAtIndex + 1);
                        if (!searchText.includes(' ') && !searchText.includes('\n')) {
                            setMentionSearch(searchText);
                            setMentionStartPos(lastAtIndex);
                            setShowMentions(true);
                            setSelectedMentionIndex(0);
                            updateMentionPosition(e.target);
                            return;
                        }
                    }
                }
            }
        }
        
        setShowMentions(false);
    };

    const updateMentionPosition = (element) => {
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const top = rect.top - 10;
        const left = rect.left + 10;
        
        setMentionPosition({ top, left });
    };

    const getCategoryLabel = (category) => {
        // Convert plural category to singular lowercase (e.g., FILES -> file)
        return category.toLowerCase().replace(/s$/, '');
    };

    const getFilteredMentions = () => {
        if (!mentionSearch) return mentionSuggestions;
        
        const search = mentionSearch.toLowerCase();
        return mentionSuggestions.filter(s => 
            s.display?.toLowerCase().includes(search) ||
            s.name.toLowerCase().includes(search)
        );
    };

    const insertMention = (mention) => {
        if (!ENABLE_COLUMN_MENTIONS && (mention?.category === 'COLUMNS' || mention?.type === 'column')) {
            setShowMentions(false);
            setMentionSearch('');
            setMentionStartPos(null);
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount || !editableRef.current) return;
        
        const range = selection.getRangeAt(0);
        let container = range.startContainer;
        
        // Find the text node containing the @ symbol
        while (container && container.nodeType !== Node.TEXT_NODE) {
            container = container.firstChild;
        }
        
        if (container && container.nodeType === Node.TEXT_NODE && mentionStartPos !== null) {
            const text = container.textContent;
            
            // Get text before the @, and text after the current cursor (which includes what the user typed after @)
            const beforeAt = text.substring(0, mentionStartPos);
            const afterMention = text.substring(range.startOffset);
            
            // Create mention tag element
            const mentionTag = document.createElement('span');
            mentionTag.className = 'mention-tag';
            mentionTag.contentEditable = 'false';
            mentionTag.setAttribute('data-mention-id', mention.id);
            mentionTag.setAttribute('data-mention-name', mention.name);
            mentionTag.setAttribute('data-mention-category', mention.category);
            const categoryPrefix = getCategoryLabel(mention.category);
            mentionTag.textContent = `@${categoryPrefix}:${mention.name}`;
            
            // Create a space after the mention
            const spaceNode = document.createTextNode(' ');
            
            // Create new text nodes (before @ and after the typed mention search)
            const parent = container.parentNode;
            
            if (beforeAt) {
                const beforeNode = document.createTextNode(beforeAt);
                parent.insertBefore(beforeNode, container);
            }
            
            parent.insertBefore(mentionTag, container);
            parent.insertBefore(spaceNode, container);
            
            if (afterMention) {
                const afterNode = document.createTextNode(afterMention);
                parent.insertBefore(afterNode, container);
            }
            
            // Remove the original text node that contained everything
            parent.removeChild(container);
            
            // Set cursor after the space
            const newRange = document.createRange();
            newRange.setStartAfter(spaceNode);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            
            // Update state
            setMentions(prev => [...prev, mention]);
        }
        
        setShowMentions(false);
        setMentionSearch('');
        setMentionStartPos(null);
        editableRef.current.focus();
    };

    const handleMentionClick = (mention) => {
        insertMention(mention);
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            setAttachments(prev => [...prev, ...files]);
        }
        // Reset the input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const getFileTypeLabel = (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const typeMap = {
            'pdf': 'PDF',
            'doc': 'Word',
            'docx': 'Word',
            'xls': 'Excel',
            'xlsx': 'Excel',
            'csv': 'CSV',
            'txt': 'Text',
            'png': 'Image',
            'jpg': 'Image',
            'jpeg': 'Image',
            'gif': 'Image',
            'svg': 'Image'
        };
        return typeMap[ext] || ext.toUpperCase();
    };

    // Helper function to convert column index to Excel-style letter
    const getColumnLetter = (index) => {
        let letter = '';
        let num = index;
        while (num >= 0) {
            letter = String.fromCharCode(65 + (num % 26)) + letter;
            num = Math.floor(num / 26) - 1;
        }
        return letter;
    };

    // Format selected cells into readable ranges
    const formatCellSelection = () => {
        // Use ref to get the most current selection
        const currentSelectedCells = selectedCellsRef.current;
        if (!currentSelectedCells || currentSelectedCells.size === 0) {
            return 'None';
        }

        // Parse cells from "rowIndex-colIndex" format
        const cellsArray = Array.from(currentSelectedCells).map(key => {
            const [row, col] = key.split('-').map(Number);
            return { row, col, key };
        });

        // Find bounding box for rectangular range detection
        const minRow = Math.min(...cellsArray.map(c => c.row));
        const maxRow = Math.max(...cellsArray.map(c => c.row));
        const minCol = Math.min(...cellsArray.map(c => c.col));
        const maxCol = Math.max(...cellsArray.map(c => c.col));

        // Check if all cells form a complete rectangle
        const expectedCells = (maxRow - minRow + 1) * (maxCol - minCol + 1);
        if (currentSelectedCells.size === expectedCells) {
            // Verify it's actually a complete rectangle
            let isRectangle = true;
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    if (!currentSelectedCells.has(`${r}-${c}`)) {
                        isRectangle = false;
                        break;
                    }
                }
                if (!isRectangle) break;
            }

            if (isRectangle) {
                const startCell = `${getColumnLetter(minCol)}${minRow + 1}`;
                const endCell = `${getColumnLetter(maxCol)}${maxRow + 1}`;
                const prefix = sheetName ? `${sheetName}: ` : '';
                return prefix + (startCell === endCell ? startCell : `${startCell}-${endCell}`);
            }
        }

        // If not a rectangle, group into ranges intelligently
        const processed = new Set();
        const ranges = [];

        cellsArray.sort((a, b) => a.row === b.row ? a.col - b.col : a.row - b.row);

        for (const cell of cellsArray) {
            if (processed.has(cell.key)) continue;

            // Try to find a rectangular range starting from this cell
            let rangeMinRow = cell.row, rangeMaxRow = cell.row;
            let rangeMinCol = cell.col, rangeMaxCol = cell.col;

            // Expand horizontally first
            while (currentSelectedCells.has(`${rangeMinRow}-${rangeMaxCol + 1}`) && !processed.has(`${rangeMinRow}-${rangeMaxCol + 1}`)) {
                rangeMaxCol++;
            }

            // Try to expand vertically while maintaining width
            let canExpandDown = true;
            while (canExpandDown) {
                for (let c = rangeMinCol; c <= rangeMaxCol; c++) {
                    if (!currentSelectedCells.has(`${rangeMaxRow + 1}-${c}`) || processed.has(`${rangeMaxRow + 1}-${c}`)) {
                        canExpandDown = false;
                        break;
                    }
                }
                if (canExpandDown) rangeMaxRow++;
            }

            // Mark all cells in this range as processed
            for (let r = rangeMinRow; r <= rangeMaxRow; r++) {
                for (let c = rangeMinCol; c <= rangeMaxCol; c++) {
                    processed.add(`${r}-${c}`);
                }
            }

            // Format the range
            const startCell = `${getColumnLetter(rangeMinCol)}${rangeMinRow + 1}`;
            const endCell = `${getColumnLetter(rangeMaxCol)}${rangeMaxRow + 1}`;
            ranges.push(startCell === endCell ? startCell : `${startCell}-${endCell}`);
        }

        const prefix = sheetName ? `${sheetName}: ` : '';
        return prefix + ranges.join(', ');
    };

    const renderMessage = (msg, index) => {
        if (msg.type === 'working' || msg.type === 'tool_call') {
            return <AssistantToolStep key={index} msg={msg} index={index} />;
        }
        return <AssistantMessage key={index} msg={msg} index={index} />;
    };

    return (
        <div className="assistant">
            <div className="assistant-head">
                <div className="flex flex-row-center flex-space-between gap-10">
                    <div className="flex flex-row-center gap-10">
                        <img 
                            src={LogoIcon} 
                            alt="Assistant Logo" 
                            height="14" 
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                                const testMessage = {
                                    type: 'test_message',
                                    content: 'Hello from Assistant Logo!',
                                    timestamp: new Date().toISOString(),
                                    clientId: Date.now()
                                };
                                console.log('Sending test message via WebSocket:', testMessage);
                                if (sendWebSocketMessage) {
                                    sendWebSocketMessage(testMessage);
                                }
                            }}
                        />
                        <h2>Assistant</h2>
                    </div>
                    <img 
                        src={IconAdd} 
                        alt="New Chat" 
                        height="18" 
                        style={{ cursor: 'pointer' }}
                        onClick={newChat}
                        title="New Chat"
                    />
                </div>
            </div>
            <div className="assistant-body scroll-y thin-scroll" ref={bodyRef} onMouseDown={(e) => e.stopPropagation()}>
                {messages.length === 0 ? (
                    <div className="flex-expanded flex-column align-center flex-row-center flex-horizontal-center opacity-5 gap-15">
                        <img src={IconHand} alt="Assistant Hand" height="60" />
                        <p className="text--mega">Ask, Analyze, Act</p>
                        <p className="text--micro wdth-80">Go beyond chat. Unlock insights, analyze trends, and automate tasks directly within your spreadsheet.</p>
                        <p className="text--micro text__italic">AI Responses may be inaccurate.</p>
                    </div>
                ) : (
                    <>
                        <div className="spacer"></div>
                        {messages.map(renderMessage)}
                    </>
                )}
            </div>
            <div className="assistant-footer">
                <div className="assistant-input-pad">
                    {/* Combined Selection and Attachments Display */}
                    {(selectedCells.size > 0 || attachments.length > 0) && (
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                            marginBottom: '10px'
                        }}>
                            {selectedCells && selectedCells.size > 0 && (
                                <div style={{
                                    border: '1px solid #aaa',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    width: 'fit-content',
                                }} className='text--nano opacity-5' key={selectedCells.size}>
                                    {formatCellSelection()}
                                </div>
                            )}
                            
                            {attachments.map((file, index) => (
                                <div key={index} style={{
                                    border: '1px solid #aaaaaa70',
                                    borderRadius: '4px',
                                    padding: '1px 6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    width: 'fit-content',
                                }}>
                                    <img src={IconFile} alt="File Icon" height="10" style={{ flexShrink: 0 }} />
                                    <p className='text--nano opacity-5' style={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '200px'
                                    }}>{file.name}</p>
                                    <img 
                                        src={IconDismiss} 
                                        alt="Remove" 
                                        height="10" 
                                        style={{ cursor: 'pointer', opacity: 0.5, flexShrink: 0 }}
                                        onClick={() => removeAttachment(index)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div style={{ position: 'relative' }}>
                        <div
                            ref={editableRef}
                            className='input-empty text--white text--micro editable-input'
                            contentEditable
                            role="textbox"
                            aria-multiline="true"
                            data-placeholder='How can I help you today?'
                            onInput={handleInput}
                            onPaste={handlePaste}
                            onKeyDown={handleKeyDown}
                            onCompositionStart={() => isComposingRef.current = true}
                            onCompositionEnd={() => {
                                isComposingRef.current = false;
                                handleInput({ target: editableRef.current });
                            }}
                            style={{
                                minHeight: '60px',
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                fontFamily: 'inherit',
                                lineHeight: '1.5',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                position: 'relative',
                                backgroundColor: 'transparent',
                                zIndex: 1,
                                whiteSpace: 'pre-wrap',
                                wordWrap: 'break-word',
                            }}
                        />
                        
                        {/* Custom Mentions Dropdown */}
                        {showMentions && (() => {
                            const filtered = getFilteredMentions();
                            
                            return filtered.length > 0 ? (
                                <div 
                                    ref={mentionDropdownRef}
                                    className="mentions-dropdown"
                                    style={{
                                        position: 'fixed',
                                        bottom: `calc(100vh - ${mentionPosition.top}px)`,
                                        left: `${mentionPosition.left}px`,
                                        backgroundColor: '#2B2B2B',
                                        border: '1px solid #464646',
                                        borderRadius: '4px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                        zIndex: 1000,
                                        width: '300px',
                                    }}
                                >
                                    {filtered.map((item, index) => {
                                        const isSelected = index === selectedMentionIndex;
                                        const categoryLabel = item.category.slice(0, -1); // Remove 'S' from plural
                                        
                                        return (
                                            <div
                                                key={item.id}
                                                className="mention-item"
                                                data-mention-index={index}
                                                onClick={() => handleMentionClick(item)}
                                                onMouseDown={(e) => e.preventDefault()}
                                                style={{
                                                    display: 'flex',
                                                    // justifyContent: 'space-between',
                                                    // alignItems: 'center',
                                                    padding: '6px 10px',
                                                    cursor: 'pointer',
                                                    backgroundColor: isSelected ? '#3a3a3a' : 'transparent',
                                                    fontSize: '11px',
                                                    gap: '10px',
                                                }}
                                                onMouseEnter={() => setSelectedMentionIndex(index)}
                                            >
                                                <span style={{ 
                                                    color: '#888', 
                                                    fontSize: '11px',
                                                    textTransform: 'uppercase',
                                                    fontWeight: '500',
                                                    flexShrink: 0,
                                                }}>{categoryLabel}</span>
                                                <span style={{ 
                                                    color: '#fff',
                                                    flex: 1,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>{item.name}</span>
                                                
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null;
                        })()}
                    </div>
                    <div className="flex flex-row-center flex-space-between">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".csv,.xlsx,.xls,.pdf,.docx,.doc"
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />
                        <div className='flex flex-row-center gap-5'>

                            <img 
                                src={IconAdd} 
                                alt="Add Icon" 
                                height="18" 
                                style={{ cursor: 'pointer' }}
                                onClick={() => fileInputRef.current?.click()}
                                />
                            <select 
                                className='input-empty text--white text--micro pointer'
                                value={selectedModel}
                                onChange={(e) => onModelChange && onModelChange(e.target.value)}>
                                {availableModels.map((model) => (
                                    <option key={model.id} value={model.id}>{model.name}</option>
                                ))}
                            </select>
                        </div>
                        <img 
                            src={IconSend} 
                            alt="Send Icon" 
                            height="20" 
                            onClick={sendMessage}
                            style={{ opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

Assistant.displayName = 'Assistant';

export default Assistant;
