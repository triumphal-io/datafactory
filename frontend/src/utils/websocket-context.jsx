import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

const WebSocketContext = createContext(null);

// Global map to store WebSocket connections per document
const wsConnections = new Map();
const connectingDocs = new Set();

export function WebSocketProvider({ children }) {
    const { documentId } = useParams();
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!documentId) return;

        // Check if we already have a WebSocket for this document
        if (wsConnections.has(documentId)) {
            const existingWs = wsConnections.get(documentId);
            if (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING) {
                wsRef.current = existingWs;
                setIsConnected(existingWs.readyState === WebSocket.OPEN);
                console.log('Using existing WebSocket connection');
                return;
            } else {
                // Clean up dead connection
                wsConnections.delete(documentId);
            }
        }

        // Check if another component is already connecting
        if (connectingDocs.has(documentId)) {
            console.log('WebSocket connection already in progress');
            // Wait for the other connection to complete
            const checkInterval = setInterval(() => {
                if (wsConnections.has(documentId)) {
                    const existingWs = wsConnections.get(documentId);
                    if (existingWs.readyState === WebSocket.OPEN) {
                        wsRef.current = existingWs;
                        setIsConnected(true);
                        clearInterval(checkInterval);
                    }
                }
            }, 50);
            
            return () => clearInterval(checkInterval);
        }

        // Mark this document as connecting
        connectingDocs.add(documentId);

        // Determine WebSocket protocol based on current protocol
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const backendHost = 'localhost:50';
        const wsUrl = `${wsProtocol}//${backendHost}/ws/document/${documentId}/`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        
        const ws = new WebSocket(wsUrl);
        
        // Store in global map immediately
        wsConnections.set(documentId, ws);
        wsRef.current = ws;
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            setIsConnected(true);
            connectingDocs.delete(documentId);
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);
            // Dispatch custom event for components to listen
            window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }));
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setIsConnected(false);
            wsConnections.delete(documentId);
            connectingDocs.delete(documentId);
        };
        
        ws.onclose = () => {
            setIsConnected(false);
            wsConnections.delete(documentId);
            connectingDocs.delete(documentId);
        };
        
        return () => {
            // Don't close immediately - other components might be using it
            // Only cleanup when page unloads
        };
    }, [documentId]);

    const sendMessage = (message) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('Sending WebSocket message:', message);
            wsRef.current.send(JSON.stringify({ message }));
            return true;
        } else {
            console.warn('WebSocket is not connected');
            return false;
        }
    };

    return (
        <WebSocketContext.Provider value={{ sendMessage, isConnected }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
}
