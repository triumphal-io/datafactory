import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { apiFetch } from '../utils/api.js';
import { convertMarkdownToHtml } from '../utils/utils.js';
import IconAdd from '../assets/add.svg';
import IconSend from '../assets/arrow-up.svg';
import LogoIcon from '../assets/logo-icon.svg';

const Assistant = forwardRef(({ documentId, onToolsRequested }, ref) => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [conversationId, setConversationId] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const bodyRef = useRef(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (bodyRef.current) {
            requestAnimationFrame(() => {
                bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
            });
        }
    }, [messages]);

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
            <div className="assistant-body scroll-y thin-scroll" ref={bodyRef}>
                
                <div className="spacer"></div>

                {messages.map(renderMessage)}
            </div>
            <div className="assistant-footer">
                <div className="assistant-input-pad">
                    <textarea 
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
