import json
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.models import MCPServer


@api_view(['GET', 'POST', 'PATCH', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_mcp_servers(request, action):
    """
    Handle MCP server management (list, create, update, delete).
    Users can add/remove/enable/disable external API-based MCP servers.
    """
    response = {'status': 'error'}

    # Get current user (hardcoded for now)
    from django.contrib.auth.models import User
    user = User.objects.filter(username='rohanashik').first()
    if not user:
        response['message'] = 'User not found'
        return JsonResponse(response, status=404)

    if action == "list":
        # Get all MCP servers for the user
        servers = MCPServer.objects.filter(user=user)
        response['servers'] = []
        for server in servers:
            response['servers'].append({
                'id': str(server.uuid),
                'name': server.name,
                'display_name': server.display_name,
                'url': server.url,
                'description': server.description,
                'enabled': server.enabled,
                'config': server.config,
                'tools': server.tools if server.tools else [],
                'tools_count': len(server.tools) if server.tools else 0,
                'created_at': server.created_at.isoformat(),
                'last_modified': server.last_modified.isoformat(),
            })
        response['status'] = 'success'
    
    elif action == "create":
        # Create a new MCP server
        data = json.loads(request.body)
        
        # Validate required fields
        required_fields = ['name', 'display_name', 'url']
        for field in required_fields:
            if field not in data:
                response['message'] = f'Missing required field: {field}'
                return JsonResponse(response, status=400)
        
        # Check if name already exists for this user
        if MCPServer.objects.filter(user=user, name=data['name']).exists():
            response['message'] = 'MCP server with this name already exists'
            return JsonResponse(response, status=400)
        
        # Create the server
        server = MCPServer.objects.create(
            user=user,
            name=data['name'],
            display_name=data['display_name'],
            url=data['url'],
            description=data.get('description', ''),
            enabled=data.get('enabled', True),
            config=data.get('config', {})
        )
        
        # Reload MCP manager with new servers
        from core.handlers import mcp
        mcp.reload_mcp_manager()

        # Force tool discovery to populate DB and get count
        tools_count = 0
        try:
            manager = mcp.get_mcp_manager()
            srv = manager.get_server(data['name'])
            if srv and srv.is_enabled():
                print(f"MCP: Triggering background tool discovery for {data['name']}")
                
                # Run discovery in background thread to avoid blocking response
                import threading
                def discover_tools_bg():
                    try:
                        srv.get_tools()
                        print(f"MCP: Background discovery finished for {data['name']}")
                    except Exception as e:
                        print(f"MCP Warning: Background tool discovery failed: {e}")
                
                threading.Thread(target=discover_tools_bg).start()
                
        except Exception as e:
            print(f"MCP Warning: Initial tool discovery failed: {e}")

        response['status'] = 'success'
        response['server'] = {
            'id': str(server.uuid),
            'name': server.name,
            'display_name': server.display_name,
            'url': server.url,
            'description': server.description,
            'enabled': server.enabled,
            'config': server.config,
            'tools': server.tools if server.tools else [],
            'tools_count': tools_count,
        }
    
    elif action == "update":
        # Update an existing MCP server
        data = json.loads(request.body)
        
        if 'id' not in data:
            response['message'] = 'Missing server ID'
            return JsonResponse(response, status=400)
        
        try:
            server = MCPServer.objects.get(uuid=data['id'], user=user)
        except MCPServer.DoesNotExist:
            response['message'] = 'MCP server not found'
            return JsonResponse(response, status=404)
        
        # Update fields
        if 'display_name' in data:
            server.display_name = data['display_name']
        if 'url' in data:
            server.url = data['url']
        if 'description' in data:
            server.description = data['description']
        if 'enabled' in data:
            server.enabled = data['enabled']
        if 'config' in data:
            server.config = data['config']
        
        server.save()
        
        # Reload MCP manager with updated servers
        from core.handlers import mcp
        mcp.reload_mcp_manager()
        
        # Refresh tools if enabled (force rediscovery)
        tools_count = len(server.tools) if server.tools else 0
        if server.enabled:
            try:
                manager = mcp.get_mcp_manager()
                srv = manager.get_server(server.name)
                if srv:
                    # Force refresh of tools
                    srv._tools_cache = None
                    
                    # Run discovery in background thread
                    import threading
                    def update_tools_bg():
                        try:
                            print(f"MCP: Starting background tool update for {server.name}")
                            srv.get_tools()
                            print(f"MCP: Background tool update finished for {server.name}")
                        except Exception as e:
                            print(f"MCP Warning: Background tool update failed: {e}")
                    
                    threading.Thread(target=update_tools_bg).start()
                    
            except Exception as e:
                print(f"MCP Warning: Tool update failed: {e}")
        
        response['status'] = 'success'
        response['server'] = {
            'id': str(server.uuid),
            'name': server.name,
            'display_name': server.display_name,
            'url': server.url,
            'description': server.description,
            'enabled': server.enabled,
            'config': server.config,
            'tools': server.tools if server.tools else [],
            'tools_count': tools_count,
        }
        
        # Manager already reloaded above
    
    elif action == "delete":
        # Delete an MCP server
        server_id = request.GET.get('id')
        
        if not server_id:
            response['message'] = 'Missing server ID'
            return JsonResponse(response, status=400)
        
        try:
            server = MCPServer.objects.get(uuid=server_id, user=user)
            server.delete()
            response['status'] = 'success'
            
            # Reload MCP manager after deletion
            from core.handlers import mcp
            mcp.reload_mcp_manager()
        except MCPServer.DoesNotExist:
            response['message'] = 'MCP server not found'
            return JsonResponse(response, status=404)
    
    else:
        response['message'] = 'Unknown action'
        return JsonResponse(response, status=400)
    
    return JsonResponse(response)
