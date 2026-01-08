import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { apiFetch } from '../utils/api.js';
import { convertMarkdownToHtml, DEFAULT_AI_MODEL } from '../utils/utils.js';
import { useWebSocket } from '../utils/websocket-context.jsx';
import IconAdd from '../assets/add.svg';
import IconSend from '../assets/arrow-up.svg';
import LogoIcon from '../assets/logo-icon.svg';
import IconTick from '../assets/checkmark.svg';
import IconDismiss from '../assets/dismiss.svg';
import IconFile from '../assets/sheet.svg';
import IconHand from '../assets/hand.svg';
import Loader from '../assets/loader-mini.gif';

const Assistant = forwardRef(({ documentId, onToolsRequested, selectedCells = new Set(), sheetName = '', getSheetData, droppedFiles, selectedModel = DEFAULT_AI_MODEL, onModelChange }, ref) => {
    const { sendMessage: sendWebSocketMessage, isConnected: wsConnected } = useWebSocket();
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [conversationId, setConversationId] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const bodyRef = useRef(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const selectedCellsRef = useRef(selectedCells);

    // Update ref synchronously during render to avoid being one step behind
    selectedCellsRef.current = selectedCells;

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

    // Blur textarea when clicking outside of it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (textareaRef.current && !textareaRef.current.contains(event.target)) {
                textareaRef.current.blur();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

            try {
                const response = await apiFetch(`/api/documents/${documentId}/assistant/ask`, {
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
            setMessages(prev => [...prev, { 
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
            
            setMessages(prev => [...prev, ...toolMessages]);
            
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

    const newChat = () => {
        setConversationId(null);
        setMessages([]);
        setAttachments([]);
        setInputValue('');
    };

    const sendMessage = async () => {
        const message = inputValue.trim();
        if (!message || isProcessing) return;

        // Add user message to the list (with attachment info if present)
        let userMessageContent = message;
        if (attachments.length > 0) {
            const fileList = attachments.map(f => f.name).join(', ');
            userMessageContent = `${message}\n\n📎 Attached: ${fileList}`;
        }
        setMessages(prev => [...prev, { type: 'user', content: userMessageContent }]);
        setInputValue('');
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

            const response = await apiFetch(`/api/documents/${documentId}/assistant/ask`, {
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
            setMessages(prev => [...prev, { 
                type: 'error', 
                content: 'Failed to send message. Please try again.' 
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e) => {
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

    // Move formatArgs outside renderMessage for reuse
    const formatArgs = (args) => {
        if (typeof args === 'object' && args !== null) {
            return JSON.stringify(args, null, 2); // Pretty-print JSON
        }
        return args;
    };

    // Update renderMessage to use formatArgs consistently
    const renderMessage = (msg, index) => {
        if (msg.type === 'tool_call') {
            // Render tool call as a special message
            const toolDisplayName = msg.toolName.replace('tool_', '').replace(/_/g, ' ');
            const args = formatArgs(msg.arguments);

            // Determine which icon to show based on status
            let statusIcon = Loader;
            let iconOpacity = 0.5;
            
            if (msg.status === 'completed') {
                statusIcon = IconTick;
                iconOpacity = 1;
            } else if (msg.status === 'failed' || msg.status === 'error') {
                statusIcon = IconDismiss;
                iconOpacity = 1;
            }
            
            return (
                <div key={index} className="message message-tool text--micro">
                    <p style={{padding: '6px 0', }}>
                        {/* <span style={{marginRight: '6px'}}>🔧</span> */}
                        <img src={statusIcon} alt="Status Icon" height="12" style={{marginRight: '6px', opacity: iconOpacity}} />
                        <strong>{toolDisplayName}</strong>
                        {/* {args && <span style={{opacity: 0.7}}> ({args})</span>} */}
                        {msg.status === 'pending' && <span style={{marginLeft: '6px', opacity: 0.5}}>...</span>}
                    </p>
                </div>
            );
        }

        return (
            <div 
                key={index} 
                className={`message message-${msg.type} text--micro`}
            >
                {msg.type === 'assistant' ? (
                    <p dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(msg.content) }} />
                ) : msg.type === 'error' ? (
                    <p style={{color: 'var(--error-color)'}}>{msg.content}</p>
                ) : (
                    <p>{msg.content}</p>
                )}
            </div>
        );
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
                    
                    <textarea 
                        ref={textareaRef}
                        className={`flex-expanded input-empty`}
                        id="assistant-input"
                        onKeyDown={handleKeyDown}
                        rows="2"
                        placeholder="Type your message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        disabled={isProcessing}
                    />
                    <div className="flex flex-row-center flex-space-between">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
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
                                <option value="openai/gpt-5">GPT-5</option>
                                <option value="openai/gpt-5-mini">GPT-5 Mini</option>
                                <option value="openai/gpt-5-nano">GPT-5 Nano</option>
                                <option value="gemini/gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                                <option value="gemini/gemini-2.5-flash">Gemini 2.5 Flash</option>
                                {/* <option value="lm_studio/lmstudio-community/functiongemma-270m-it-GGUF">Local FunctionGemma 270M</option> */}
                                {/* <option value="lm_studio/openai/gpt-oss-20b">Local GPT-OSS 20B</option> */}
                                {/* <option value="lm_studio/mradermacher/Hammer2.1-3b-GGUF">Local Hammer2.1-3B</option> */}
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
