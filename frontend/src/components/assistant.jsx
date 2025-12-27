import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../utils/api.js';
import Showdown from 'showdown';
import IconAdd from '../assets/add.svg';
import IconSend from '../assets/arrow-up.svg';

export default function Assistant() {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const bodyRef = useRef(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (bodyRef.current) {
            requestAnimationFrame(() => {
                bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
            });
        }
    }, [messages]);

    const convertMarkdownToHtml = (text) => {
        Showdown.setFlavor('github');
        Showdown.extension('targetlink', function () {
            return [{
                type: 'html',
                regex: /(<a [^>]+?)(>.*<\/a>)/g,
                replace: '$1 target="_blank"$2'
            }];
        });
        const converter = new Showdown.Converter({
            extensions: ['targetlink']
        });
        return converter.makeHtml(text);
    };

    const sendMessage = async () => {
        const message = inputValue.trim();
        if (!message) return;

        // Add user message to the list
        setMessages(prev => [...prev, { type: 'user', content: message }]);
        setInputValue('');

        try {
            // Get CSRF token from cookie
            const csrfToken = document.cookie
                .split('; ')
                .find(row => row.startsWith('csrftoken='))
                ?.split('=')[1];

            const response = await fetch('/api/assistant/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    message: message,
                    csrfmiddlewaretoken: csrfToken || ''
                })
            });

            const data = await response.json();
            console.log("Server response:", data);

            if (data.status === 'success') {
                // Add assistant response to the list
                setMessages(prev => [...prev, { type: 'assistant', content: data.message }]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleKeyDown = (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="assistant">
            <div className="assistant-head"></div>
            <div className="assistant-body scroll-y thin-scroll" ref={bodyRef}>
                <div className="spacer"></div>

                {messages.map((msg, index) => (
                    <div 
                        key={index} 
                        className={`message message-${msg.type} text--micro`}
                    >
                        {msg.type === 'assistant' ? (
                            <p dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(msg.content) }} />
                        ) : (
                            <p>{msg.content}</p>
                        )}
                    </div>
                ))}
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
                    />
                    <div className="flex flex-row-center flex-space-between">
                        <img src={IconAdd} alt="Add Icon" height="20" />
                        <img src={IconSend} alt="Send Icon" height="20" onClick={sendMessage} />
                    </div>
                </div>
            </div>
        </div>
    );
}
