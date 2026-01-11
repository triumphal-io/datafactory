import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

const WebSocketContext = createContext(null);

// Global map to store WebSocket connections per workbook
const wsConnections = new Map();
const connectingDocs = new Set();

export function WebSocketProvider({ children }) {
    const { workbookId } = useParams();
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!workbookId) return;

        // Check if we already have a WebSocket for this workbook
        if (wsConnections.has(workbookId)) {
            const existingWs = wsConnections.get(workbookId);
            if (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING) {
                wsRef.current = existingWs;
                setIsConnected(existingWs.readyState === WebSocket.OPEN);
                console.log('Using existing WebSocket connection');
                return;
            } else {
                // Clean up dead connection
                wsConnections.delete(workbookId);
            }
        }

        // Check if another component is already connecting
        if (connectingDocs.has(workbookId)) {
            console.log('WebSocket connection already in progress');
            // Wait for the other connection to complete
            const checkInterval = setInterval(() => {
                if (wsConnections.has(workbookId)) {
                    const existingWs = wsConnections.get(workbookId);
                    if (existingWs.readyState === WebSocket.OPEN) {
                        wsRef.current = existingWs;
                        setIsConnected(true);
                        clearInterval(checkInterval);
                    }
                }
            }, 50);
            
            return () => clearInterval(checkInterval);
        }

        // Mark this workbook as connecting
        connectingDocs.add(workbookId);

        // Determine WebSocket protocol based on current protocol
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const backendHost = 'localhost:50';
        const wsUrl = `${wsProtocol}//${backendHost}/ws/workbook/${workbookId}/`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        
        const ws = new WebSocket(wsUrl);
        
        // Store in global map immediately
        wsConnections.set(workbookId, ws);
        wsRef.current = ws;
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            setIsConnected(true);
            connectingDocs.delete(workbookId);
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
            wsConnections.delete(workbookId);
            connectingDocs.delete(workbookId);
        };
        
        ws.onclose = () => {
            setIsConnected(false);
            wsConnections.delete(workbookId);
            connectingDocs.delete(workbookId);
        };
        
        return () => {
            // Don't close immediately - other components might be using it
            // Only cleanup when page unloads
        };
    }, [workbookId]);

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
