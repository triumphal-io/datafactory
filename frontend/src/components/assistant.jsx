import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { apiFetch } from '../utils/api.js';
import { convertMarkdownToHtml } from '../utils/utils.js';
import IconAdd from '../assets/add.svg';
import IconSend from '../assets/arrow-up.svg';
import LogoIcon from '../assets/logo-icon.svg';

const Assistant = forwardRef(({ documentId, onToolsRequested, selectedCells = new Set(), sheetName = '' }, ref) => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [conversationId, setConversationId] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const bodyRef = useRef(null);
    const textareaRef = useRef(null);

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

            try {
                const response = await apiFetch(`/api/documents/${documentId}/assistant/ask`, {
                    method: 'POST',
                    body: JSON.stringify({
                        message_type: 'tool_result',
                        conversation_id: convId,
                        tool_results: toolResults
                    })
                });

                const data = await response.json();
                console.log("Tool result response:", data);

                if (data.status === 'success') {
                    handleAssistantResponse(data);
                }
            } catch (error) {
                console.error('Error sending tool results:', error);
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
        }
    };

    const sendMessage = async () => {
        const message = inputValue.trim();
        if (!message || isProcessing) return;

        // Add user message to the list
        setMessages(prev => [...prev, { type: 'user', content: message }]);
        setInputValue('');
        setIsProcessing(true);

        try {
            const response = await apiFetch(`/api/documents/${documentId}/assistant/ask`, {
                method: 'POST',
                body: JSON.stringify({
                    message: message,
                    message_type: 'user_message',
                    conversation_id: conversationId
                })
            });

            const data = await response.json();
            console.log("Server response:", data);

            if (data.status === 'success') {
                // Update conversation ID if this is a new conversation
                if (data.conversation_id && !conversationId) {
                    setConversationId(data.conversation_id);
                }
                
                handleAssistantResponse(data);
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
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
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
        if (!selectedCells || selectedCells.size === 0) {
            return 'None';
        }

        // Parse cells from "rowIndex-colIndex" format
        const cellsArray = Array.from(selectedCells).map(key => {
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
        if (selectedCells.size === expectedCells) {
            // Verify it's actually a complete rectangle
            let isRectangle = true;
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    if (!selectedCells.has(`${r}-${c}`)) {
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
            while (selectedCells.has(`${rangeMinRow}-${rangeMaxCol + 1}`) && !processed.has(`${rangeMinRow}-${rangeMaxCol + 1}`)) {
                rangeMaxCol++;
            }

            // Try to expand vertically while maintaining width
            let canExpandDown = true;
            while (canExpandDown) {
                for (let c = rangeMinCol; c <= rangeMaxCol; c++) {
                    if (!selectedCells.has(`${rangeMaxRow + 1}-${c}`) || processed.has(`${rangeMaxRow + 1}-${c}`)) {
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
        if (msg.type === 'tool_call') {
            // Render tool call as a special message
            const toolDisplayName = msg.toolName.replace('tool_', '').replace(/_/g, ' ');
            const args = Object.entries(msg.arguments || {})
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            
            return (
                <div key={index} className="message message-tool text--micro">
                    <p>
                        <span style={{marginRight: '6px'}}>🔧</span>
                        <strong>{toolDisplayName}</strong>
                        {args && <span style={{opacity: 0.7}}> ({args})</span>}
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
                <div className="flex flex-row-center gap-10">
                    <img src={LogoIcon} alt="Assistant Logo" height="14" />
                    <h2>Assistant</h2>
                </div>
            </div>
            <div className="assistant-body scroll-y thin-scroll" ref={bodyRef} onMouseDown={(e) => e.stopPropagation()}>
                
                <div className="spacer"></div>

                {messages.map(renderMessage)}
            </div>
            <div className="assistant-footer">
                <div className="assistant-input-pad">
                    {selectedCells && selectedCells.size > 0 && (
                        <p style={{
                            border: '1px solid #aaa',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            width: 'fit-content',
                        }} className='mrgnb-10 text--nano opacity-5'>{formatCellSelection()}</p>
                    )}
                    <textarea 
                        ref={textareaRef}
                        className={`flex-expanded input-empty`}
                        id="assistant-input"
                        onKeyDown={handleKeyDown}
                        rows="3"
                        placeholder="Type your message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        disabled={isProcessing}
                    />
                    <div className="flex flex-row-center flex-space-between">
                        <img src={IconAdd} alt="Add Icon" height="20" />
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
