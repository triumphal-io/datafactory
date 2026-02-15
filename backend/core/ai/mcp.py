"""
MCP (Model Context Protocol) Integration

This module handles integration with remote MCP servers for extending
AI assistant capabilities through external tools.

MCP servers are configured in the database (MCPServer model) and managed
through the Settings UI. All MCP servers are user-defined.

Usage:
    # MCP servers are loaded automatically from database
    tools = get_mcp_tools()
    result = await execute_mcp_tool("mcp_your_server_action", {"param": "..."})
"""

import json
import asyncio
import httpx
import uuid
from pathlib import Path
from typing import Dict, List, Any, Optional
from django.conf import settings
from httpx_sse import aconnect_sse
from asgiref.sync import sync_to_async


class RemoteMCPServer:
    """
    Remote MCP Server - Connects to MCP servers via JSON-RPC 2.0 over SSE protocol.
    
    This class handles communication with remote MCP servers that follow
    the Model Context Protocol specification using JSON-RPC 2.0 format.
    Supports both SSE (Server-Sent Events) and regular HTTP endpoints.
    
    Configuration is loaded from the database (MCPServer model).
    """
    
    def __init__(self, name: str, url: str, enabled: bool = True, description: str = "", headers: Optional[Dict[str, str]] = None, tools: Optional[List[Dict[str, Any]]] = None, db_id: Optional[int] = None):
        """
        Initialize remote MCP server.
        
        Args:
            name (str): Unique identifier for this MCP server
            url (str): Base URL for the MCP server API
            enabled (bool): Whether this server is currently enabled
            description (str): Human-readable description of the server
            headers (Dict, optional): Custom headers for API requests (e.g., authentication)
            tools (List[Dict], optional): Cached tools from database
            db_id (int, optional): Database ID of the MCPServer model
        """
        self.name = name
        self.url = url.rstrip('/')
        self.enabled = enabled
        self.description = description
        self.headers = headers or {}
        self._tools_cache = tools
        self._db_id = db_id
        self._session_id = None
        self._request_id = 0
    
    def _parse_sse_response(self, sse_text: str) -> Dict[str, Any]:
        """
        Parse Server-Sent Events (SSE) response to extract JSON-RPC message.
        
        Args:
            sse_text (str): Raw SSE formatted text
            
        Returns:
            Dict: Parsed JSON-RPC message
        """
        lines = sse_text.strip().split('\n')
        current_event = None
        data_parts = []
        
        for line in lines:
            if line.startswith('event: '):
                # Process previous event if it was a 'message' event
                if current_event == 'message' and data_parts:
                    full_data = ''.join(data_parts)
                    try:
                        return json.loads(full_data)
                    except json.JSONDecodeError as e:
                        print(f"MCP Debug: Failed to parse SSE data: {e}")
                        print(f"MCP Debug: SSE data was: {full_data}")
                
                # Start new event
                current_event = line[7:].strip()
                data_parts = []
            elif line.startswith('data: '):
                data_parts.append(line[6:])
        
        # Process last event
        if current_event == 'message' and data_parts:
            full_data = ''.join(data_parts)
            try:
                return json.loads(full_data)
            except json.JSONDecodeError:
                pass
        
        return {}
    
    def _get_next_request_id(self) -> int:
        """Get next request ID for JSON-RPC."""
        self._request_id += 1
        return self._request_id
    
    async def _initialize_session(self) -> bool:
        """
        Initialize MCP session using JSON-RPC 2.0 protocol.
        
        Returns:
            bool: True if session initialized successfully
        """
        if self._session_id:
            return True
            
        try:
            async with httpx.AsyncClient() as client:
                # First request: initialize (NO session ID)
                init_headers = {
                    **self.headers,
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream"
                }
                
                init_request = {
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {
                            "name": "DataFactory",
                            "version": "1.0.0"
                        }
                    },
                    "id": self._get_next_request_id()
                }
                
                response = await client.post(
                    self.url,
                    json=init_request,
                    headers=init_headers,
                    timeout=30.0
                )
                response.raise_for_status()
                
                # Parse response based on content type
                content_type = response.headers.get('content-type', '')
                if 'text/event-stream' in content_type:
                    # Handle SSE response - parse event stream
                    result = self._parse_sse_response(response.text)
                else:
                    result = response.json()
                
                if "error" in result:
                    print(f"MCP Error: Session initialization failed for {self.name}: {result['error']}")
                    return False
                
                # Extract session ID from response headers (case-insensitive)
                for header_name, header_value in response.headers.items():
                    if header_name.lower() == 'mcp-session-id':
                        self._session_id = header_value
                        break
                
                if not self._session_id:
                    self._session_id = str(uuid.uuid4())
                
                # Send initialized notification (WITH session ID)
                notify_headers = {
                    **self.headers,
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Mcp-Session-Id": self._session_id
                }
                
                initialized_request = {
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {}
                }
                
                await client.post(
                    self.url,
                    json=initialized_request,
                    headers=notify_headers,
                    timeout=30.0
                )
                
                return True
                
        except Exception as e:
            print(f"MCP Warning: Failed to initialize session for {self.name}: {e}")
            self._session_id = None
            return False
    
    @sync_to_async
    def _save_tools_to_db(self, tools: List[Dict[str, Any]]):
        """Save discovered tools to database asynchronously."""
        if not self._db_id:
            return
            
        try:
            from core.models import MCPServer
            MCPServer.objects.filter(id=self._db_id).update(tools=tools)
            print(f"MCP: Saved {len(tools)} tools to database for '{self.name}'")
        except Exception as e:
            print(f"MCP Error: Failed to save tools to DB for {self.name}: {e}")

    async def discover_tools(self) -> List[Dict[str, Any]]:
        """
        Discover available tools from the remote MCP server using JSON-RPC 2.0.
        
        Returns:
            List[Dict]: List of tool definitions in OpenAI function calling format
        """
        if self._tools_cache is not None:
            return self._tools_cache
        
        try:
            # Initialize session first
            if not await self._initialize_session():
                return []
            
            async with httpx.AsyncClient() as client:
                headers = {
                    **self.headers,
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Mcp-Session-Id": self._session_id
                }
                
                tools_request = {
                    "jsonrpc": "2.0",
                    "method": "tools/list",
                    "params": {},
                    "id": self._get_next_request_id()
                }
                
                response = await client.post(
                    self.url,
                    json=tools_request,
                    headers=headers,
                    timeout=30.0
                )
                response.raise_for_status()
                
                # Parse response based on content type
                content_type = response.headers.get('content-type', '')
                if 'text/event-stream' in content_type:
                    result = self._parse_sse_response(response.text)
                else:
                    result = response.json()
                
                if "error" in result:
                    print(f"MCP Error: Tool discovery failed for {self.name}: {result['error']}")
                    return []
                
                # Convert MCP tool format to OpenAI function calling format
                tools = []
                for tool in result.get('result', {}).get('tools', []):
                    tools.append({
                        "type": "function",
                        "function": {
                            "name": f"mcp_{self.name}_{tool.get('name')}",
                            "description": tool.get('description', ''),
                            "parameters": tool.get('inputSchema', {
                                "type": "object",
                                "properties": {},
                                "required": []
                            })
                        }
                    })
                
                self._tools_cache = tools
                
                # Save tools to database for future faster loading
                await self._save_tools_to_db(tools)
                
                return tools
        
        except Exception as e:
            print(f"MCP Warning: Failed to discover tools from {self.name}: {e}")
            return []
    
    def get_tools(self) -> List[Dict[str, Any]]:
        """
        Get cached tools (synchronous wrapper for discover_tools).
        
        Returns:
            List[Dict]: Cached tool definitions or empty list
        """
        if self._tools_cache is None:
            # Need to discover tools first - try to discover synchronously
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                self._tools_cache = loop.run_until_complete(self.discover_tools())
                loop.close()
            except Exception as e:
                print(f"MCP Warning: Failed to discover tools synchronously from {self.name}: {e}")
                return []
        return self._tools_cache
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """
        Execute a tool on the remote MCP server using JSON-RPC 2.0.
        
        Args:
            tool_name (str): Name of the tool (format: mcp_{server}_{action})
            arguments (Dict): Tool arguments
            
        Returns:
            Any: Tool execution result
        """
        # Extract the actual tool name (remove mcp_{server}_ prefix)
        parts = tool_name.split('_')
        if len(parts) >= 3 and parts[0] == 'mcp' and parts[1] == self.name:
            actual_tool_name = '_'.join(parts[2:])
        else:
            actual_tool_name = tool_name
        
        try:
            # Ensure session is initialized
            if not await self._initialize_session():
                return f"Error: Failed to initialize session for {self.name}"
            
            async with httpx.AsyncClient() as client:
                headers = {
                    **self.headers,
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Mcp-Session-Id": self._session_id
                }
                
                tool_request = {
                    "jsonrpc": "2.0",
                    "method": "tools/call",
                    "params": {
                        "name": actual_tool_name,
                        "arguments": arguments
                    },
                    "id": self._get_next_request_id()
                }
                
                response = await client.post(
                    self.url,
                    json=tool_request,
                    headers=headers,
                    timeout=60.0
                )
                response.raise_for_status()
                
                # Parse response based on content type
                content_type = response.headers.get('content-type', '')
                if 'text/event-stream' in content_type:
                    result = self._parse_sse_response(response.text)
                else:
                    result = response.json()
                
                if "error" in result:
                    return f"Error executing {tool_name}: {result['error'].get('message', str(result['error']))}"
                
                # Extract content from result
                tool_result = result.get('result', {})
                output = None
                
                if 'content' in tool_result:
                    content = tool_result['content']
                    if isinstance(content, list) and len(content) > 0:
                        # Get text from first content item
                        first_item = content[0]
                        if isinstance(first_item, dict) and 'text' in first_item:
                            output = first_item['text']
                        else:
                            output = str(first_item)
                    else:
                        output = str(content)
                else:
                    output = str(tool_result)
                
                # Print MCP tool output before sending to AI
                print(f"\n{'='*80}")
                print(f"MCP Tool Output: {tool_name}")
                print(f"{'='*80}")
                print(output)
                print(f"{'='*80}\n")
                
                return output

        
        except Exception as e:
            return f"Error executing {tool_name} on {self.name}: {str(e)}"
    
    def is_enabled(self) -> bool:
        """Check if this MCP server is enabled."""
        return self.enabled
    
    def enable(self):
        """Enable this MCP server."""
        self.enabled = True
    
    def disable(self):
        """Disable this MCP server."""
        self.enabled = False


def load_mcp_config() -> Dict[str, Any]:
    """
    Load MCP server configuration from JSON file (legacy fallback only).
    
    This is kept for backward compatibility but is no longer the primary
    configuration method. Use the database-backed Settings UI instead.
    
    Returns:
        Dict: Configuration with 'servers' list
    """
    config_path = getattr(settings, 'MCP_CONFIG_PATH', None)
    
    if config_path is None:
        # Default to mcp_servers.json in backend directory
        config_path = Path(settings.BASE_DIR) / 'mcp_servers.json'
    else:
        config_path = Path(config_path)
    
    if not config_path.exists():
        print(f"MCP: No JSON config file found (using database configuration)")
        return {"servers": []}
    
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        print(f"MCP: Loaded legacy configuration from {config_path}")
        return config
    except Exception as e:
        print(f"MCP Error: Failed to load JSON configuration: {e}")
        return {"servers": []}


class MCPManager:
    """
    Manages multiple MCP servers and provides a unified interface for tools.
    
    This class handles:
    - Registering multiple remote MCP servers
    - Aggregating tools from all enabled servers
    - Routing tool execution to the appropriate server
    - Configuration and lifecycle management
    """
    
    def __init__(self):
        """Initialize MCP manager with empty server list."""
        self.servers: Dict[str, RemoteMCPServer] = {}
    
    def add_server(self, server: RemoteMCPServer):
        """
        Add an MCP server to the manager.
        
        Args:
            server (RemoteMCPServer): MCP server instance to add
        """
        self.servers[server.name] = server
        print(f"MCP: Registered server '{server.name}' (enabled={server.is_enabled()})")
    
    def remove_server(self, name: str):
        """
        Remove an MCP server from the manager.
        
        Args:
            name (str): Name of the server to remove
        """
        if name in self.servers:
            del self.servers[name]
            print(f"MCP: Removed server '{name}'")
    
    def get_server(self, name: str) -> Optional[RemoteMCPServer]:
        """
        Get a specific MCP server by name.
        
        Args:
            name (str): Server name
            
        Returns:
            Optional[RemoteMCPServer]: Server instance or None if not found
        """
        return self.servers.get(name)
    
    def get_all_tools(self) -> List[Dict[str, Any]]:
        """
        Get all tools from all enabled MCP servers.
        
        Returns:
            List[Dict]: Combined list of tool definitions from all servers
        """
        all_tools = []
        
        for server in self.servers.values():
            if server.is_enabled():
                tools = server.get_tools()
                all_tools.extend(tools)
                print(f"MCP: Loaded {len(tools)} tool(s) from '{server.name}'")
        
        return all_tools
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """
        Execute an MCP tool by routing to the appropriate server.
        
        Args:
            tool_name (str): Name of the tool to execute
            arguments (Dict): Tool arguments
            
        Returns:
            Any: Tool execution result
            
        Raises:
            ValueError: If tool is not found in any server
        """
        # Extract server name from tool name (format: mcp_{server}_{action})
        parts = tool_name.split('_')
        if len(parts) < 2 or parts[0] != 'mcp':
            raise ValueError(f"Invalid MCP tool name format: {tool_name}")
        
        server_name = parts[1]
        
        if server_name not in self.servers:
            raise ValueError(f"MCP server not found: {server_name}")
        
        server = self.servers[server_name]
        
        if not server.is_enabled():
            raise ValueError(f"MCP server is disabled: {server_name}")
        
        return await server.execute_tool(tool_name, arguments)
    
    def list_servers(self) -> List[Dict[str, Any]]:
        """
        List all registered MCP servers with their status.
        
        Returns:
            List[Dict]: Server information
        """
        return [
            {
                "name": server.name,
                "enabled": server.is_enabled(),
                "tools": len(server.get_tools()),
                "description": server.description
            }
            for server in self.servers.values()
        ]


# Per-user MCP manager instances
# Each user gets their own manager with their configured MCP servers
_mcp_managers: Dict[int, MCPManager] = {}


def get_mcp_manager(user=None) -> MCPManager:
    """
    Get the MCP manager instance for a specific user.
    
    Initializes a new manager on first call for each user and loads their MCP servers from database.
    Falls back to JSON configuration for backward compatibility.
    
    Args:
        user: Django User object. If None, returns empty manager.
    
    Returns:
        MCPManager: User-specific MCP manager instance
    """
    global _mcp_managers
    
    # Return empty manager if no user provided
    if user is None:
        return MCPManager()
    
    # Get or create manager for this user
    if user.id not in _mcp_managers:
        _mcp_managers[user.id] = MCPManager() 
        _load_mcp_servers_from_db(user)
    
    return _mcp_managers[user.id]


def reload_mcp_manager(user):
    """
    Reload the MCP manager for a specific user with updated configuration from database.
    Call this after adding/removing/updating MCP servers.
    
    Args:
        user: Django User object
    """
    global _mcp_managers
    
    if user is None:
        print("MCP Warning: Cannot reload manager without user context")
        return
    
    _mcp_managers[user.id] = MCPManager()
    _load_mcp_servers_from_db(user)
    print(f"MCP: Manager reloaded for user {user.username}")


def _load_mcp_servers_from_db(user):
    """
    Load MCP servers from database for a specific user.
    Internal function used by get_mcp_manager() and reload_mcp_manager().
    
    Args:
        user: Django User object
    """
    global _mcp_managers
    
    if user is None:
        print("MCP Warning: Cannot load servers without user context")
        return
    
    try:
        # Import here to avoid circular dependency
        from core.models import MCPServer as MCPServerModel
        
        # Load MCP servers from database for this specific user
        db_servers = MCPServerModel.objects.filter(user=user)
        
        if not db_servers.exists():
            print(f"MCP: No MCP servers found in database for user {user.username}")
            return
        
        manager = _mcp_managers.get(user.id)
        if not manager:
            print(f"MCP Warning: Manager not found for user {user.username}")
            return
        
        for server_config in db_servers:
            try:
                name = server_config.name
                url = server_config.url
                enabled = server_config.enabled
                description = server_config.description
                headers = server_config.config.get('headers', {})
                tools = server_config.tools
                db_id = server_config.id
                
                # Create RemoteMCPServer instance for all user-defined servers
                server = RemoteMCPServer(
                    name=name,
                    url=url,
                    enabled=enabled,
                    description=description,
                    headers=headers,
                    tools=tools or None,  # Treat empty list as None to force discovery
                    db_id=db_id
                )
                
                # Tools will be discovered on first access (lazy loading)
                # This avoids async complexity during initialization
                
                manager.add_server(server)
                
            except Exception as e:
                print(f"MCP Error: Failed to initialize server {name}: {e}")
        
        print(f"MCP: Initialized {len(manager.servers)} server(s) from database for user {user.username}")
        
    except Exception as e:
        print(f"MCP Error: Failed to load servers from database for user {user.username}: {e}")


def _load_mcp_servers_from_json():
    """
    Load MCP servers from JSON configuration file (fallback/legacy).
    Internal function - DEPRECATED, kept for backward compatibility only.
    """
    # This function is no longer used but kept for potential legacy support
    pass
    


def get_mcp_tools(user=None) -> List[Dict[str, Any]]:
    """
    Get all MCP tools for inclusion in AI tool definitions.
    
    This is the main entry point for integrating MCP tools into the
    DataFactory assistant. Call this from ai.py to include MCP tools.
    
    Args:
        user: Django User object. If None, returns empty list.
    
    Returns:
        List[Dict]: All tools from all enabled MCP servers for this user
    """
    manager = get_mcp_manager(user)
    return manager.get_all_tools()


async def execute_mcp_tool(tool_name: str, arguments: Dict[str, Any], user=None) -> Any:
    """
    Execute an MCP tool.
    
    This is the main entry point for executing MCP tools from the assistant.
    
    Args:
        tool_name (str): Name of the MCP tool
        arguments (Dict): Tool arguments
        user: Django User object. If None, returns error.
        
    Returns:
        Any: Tool execution result
    """
    if user is None:
        return "Error: User context required for MCP tool execution"
    
    manager = get_mcp_manager(user)
    return await manager.execute_tool(tool_name, arguments)
