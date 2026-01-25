import json
import os
import re
import uuid as uuid_lib
from urllib import response
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import IsAuthenticated, AllowAny
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.conf import settings
from core.handlers import ai
from core.handlers.extraction import start_background_processing
from core.handlers import knowledge
from core.models import Workbook, Sheet, File, Folder, Conversation, BackgroundJob, MCPServer, ProviderCredential


@api_view(['GET', 'POST', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_workbooks(request, action):
    """
    Handle workbook operations (list, create, get details).
    A Workbook contains Sheets (spreadsheet tabs) and Resources (uploaded files/folders).
    """
    response = {'status': 'error'}

    if action == "list":
        workbooks = Workbook.objects.all()
        response['workbooks'] = []
        for workbook in workbooks:
            response['workbooks'].append({
                'id': str(workbook.uuid),
                'name': workbook.name,
                'uuid': str(workbook.uuid),
                'selected_model': workbook.selected_model,
                'created_at': workbook.created_at.isoformat(),
                'last_modified': workbook.last_modified.isoformat(),
                'user': workbook.user.username if workbook.user else 'Anonymous'
            })
        response['status'] = 'success'
    elif action == "create":
        # Create a new workbook with a default sheet (Sheet 1)
        from django.contrib.auth.models import User
        
        # Get or create a default user (you may want to use actual authenticated user)
        user = User.objects.get(username='rohanashik')

        # Create the workbook
        workbook = Workbook.objects.create(
            user=user,
            name='Untitled Workbook',
            data={}
        )

        # Create a default sheet for the workbook
        sheet = Sheet.objects.create(
            workbook=workbook,
            name='Sheet 1',
            data={'columns': [], 'rows': []}
        )

        response = {
            'status': 'success',
            'workbook_id': str(workbook.uuid),
            'sheet_id': str(sheet.uuid),
            'name': workbook.name
        }
        return Response(response)
    elif action == "mentions":
        # Get mention suggestions for a specific workbook
        try:
            workbook_id = request.GET.get('workbook_id')
            if not workbook_id:
                return JsonResponse(
                    {'status': 'error', 'message': 'workbook_id parameter required'},
                    status=400
                )
            
            workbook = Workbook.objects.filter(uuid=workbook_id).first()
            if not workbook:
                return JsonResponse(
                    {'status': 'error', 'message': 'Workbook not found'},
                    status=404
                )

            suggestions = []

            # Get files
            files = File.objects.filter(workbook=workbook)
            for file in files:
                suggestions.append({
                    'id': f'file:{file.uuid}',
                    'display': f'📄 {file.filename}',
                    'category': 'FILES',
                    'type': 'file',
                    'name': file.filename
                })
            
            # Get folders
            folders = Folder.objects.filter(workbook=workbook)
            for folder in folders:
                suggestions.append({
                    'id': f'folder:{folder.uuid}',
                    'display': f'📁 {folder.name}',
                    'category': 'FOLDERS',
                    'type': 'folder',
                    'name': folder.name
                })
            
            # Get sheets and columns
            sheets = Sheet.objects.filter(workbook=workbook)
            for sheet in sheets:
                suggestions.append({
                    'id': f'sheet:{sheet.uuid}',
                    'display': f'📊 {sheet.name}',
                    'category': 'SHEETS',
                    'type': 'sheet',
                    'name': sheet.name
                })
                
                # Add columns from sheet data
                if sheet.data and 'columns' in sheet.data:
                    for column in sheet.data['columns']:
                        # Normalize column definitions.
                        # Columns may be plain strings ("Name") or structured dicts
                        # (e.g. {"title": "Requirement No.", "prompt": ...}).
                        column_name = column

                        if isinstance(column, dict):
                            column_name = (
                                column.get('title')
                                or column.get('name')
                                or column.get('column')
                                or str(column)
                            )
                        elif isinstance(column, str) and column.strip().startswith('{'):
                            try:
                                import ast
                                column_dict = ast.literal_eval(column)
                                if isinstance(column_dict, dict):
                                    column_name = (
                                        column_dict.get('title')
                                        or column_dict.get('name')
                                        or column_dict.get('column')
                                        or column
                                    )
                            except (ValueError, SyntaxError):
                                # If parsing fails, use the original column
                                column_name = column
                        
                        suggestions.append({
                            'id': f'column:{sheet.uuid}:{column}',
                            'display': f'📋 {sheet.name}:{column_name}',
                            'category': 'COLUMNS',
                            'type': 'column',
                            'name': f'{sheet.name}:{column_name}',
                            'sheetName': sheet.name,
                            'columnName': column_name
                        })
            
            return JsonResponse({
                'status': 'success',
                'suggestions': suggestions
            })
        except Exception as e:
            return JsonResponse(
                {'status': 'error', 'message': str(e)},
                status=500
            )
    else:
        workbook = Workbook.objects.filter(uuid=action).first()
        if not workbook:
            return JsonResponse(
                {'status': 'error', 'message': 'Workbook not found'},
                status=404
            )

        # Handle PATCH request to update workbook
        if request.method == 'PATCH':
            try:
                body = json.loads(request.body)
                name = body.get('name')
                selected_model = body.get('selected_model')

                if name is not None:
                    workbook.name = name
                if selected_model is not None:
                    workbook.selected_model = selected_model
                workbook.save()

                return JsonResponse({
                    'status': 'success',
                    'message': 'Workbook updated successfully',
                    'last_modified': workbook.last_modified.isoformat()
                })
            except Exception as e:
                return JsonResponse(
                    {'status': 'error', 'message': str(e)},
                    status=500
                )

        # Handle GET request to retrieve workbook details
        response = {
            'status': 'success',
            'id': str(workbook.uuid),
            'name': workbook.name,
            'selected_model': workbook.selected_model,
            'created_at': workbook.created_at.isoformat(),
            'last_modified': workbook.last_modified.isoformat()
        }

        sheets = Sheet.objects.filter(workbook=workbook)
        response['sheets'] = []
        for sheet in sheets:
            response['sheets'].append({
                'id': str(sheet.uuid),
                'name': sheet.name,
                'last_modified': sheet.last_modified.isoformat()
            })
        files = File.objects.filter(workbook=workbook)
        response['files'] = []
        for file in files:
            response['files'].append({
                'id': str(file.uuid),
                'file': str(file.file),
                'uploaded_at': file.uploaded_at.isoformat(),
                'use': file.use
            })
        conversations = Conversation.objects.filter(workbook=workbook)
        response['conversations'] = []
        for conv in conversations:
            response['conversations'].append({
                'id': str(conv.uuid),
                'title': conv.title,
                'started_at': conv.started_at.isoformat(),
                'last_interaction': conv.last_interaction.isoformat()
            })
    return Response(response)


@api_view(['PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_update_workbook(request, did):
    """Update workbook properties like name"""
    try:
        workbook = Workbook.objects.filter(uuid=did).first()
        if not workbook:
            return JsonResponse(
                {'status': 'error', 'message': 'Workbook not found'},
                status=404
            )

        body = json.loads(request.body)
        name = body.get('name')

        if name is not None:
            workbook.name = name
            workbook.save()

        return JsonResponse({
            'status': 'success',
            'message': 'Workbook updated successfully',
            'last_modified': workbook.last_modified.isoformat()
        })
    except Exception as e:
        return JsonResponse(
            {'status': 'error', 'message': str(e)},
            status=500
        )


@api_view(['GET', 'POST', 'DELETE', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_folders(request, did, action):
    """Handle folder operations within a workbook"""
    response = {'status': 'error'}
    
    # Handle folder-specific operations (DELETE/PATCH) when action is a UUID
    if request.method in ['DELETE', 'PATCH']:
        try:
            folder_id = action
            folder = Folder.objects.filter(uuid=folder_id, workbook__uuid=did).first()
            if not folder:
                return JsonResponse(
                    {'status': 'error', 'message': 'Folder not found'},
                    status=404
                )
            
            if request.method == 'DELETE':
                # Delete all files in the folder
                for file in folder.files.all():
                    # Delete from ChromaDB
                    try:
                        knowledge.delete_file_chunks(str(file.uuid))
                    except Exception as e:
                        print(f"Error deleting file chunks: {e}")
                    
                    # Delete physical file
                    if file.file:
                        file.file.delete(save=False)
                    
                    # Delete database record
                    file.delete()
                
                # Delete folder chunks from ChromaDB
                try:
                    knowledge.delete_folder_chunks(folder.name, folder.workbook.user.id)
                except Exception as e:
                    print(f"Error deleting folder chunks: {e}")
                
                folder.delete()
                return JsonResponse({
                    'status': 'success',
                    'message': 'Folder and all files deleted successfully'
                })
            
            elif request.method == 'PATCH':
                try:
                    body = json.loads(request.body)
                except json.JSONDecodeError:
                    return JsonResponse(
                        {'status': 'error', 'message': 'Invalid JSON'},
                        status=400
                    )
                
                # Handle folder rename
                if 'name' in body:
                    old_name = folder.name
                    new_name = body['name']
                    
                    # Update ChromaDB metadata if name changed
                    if old_name != new_name:
                        try:
                            knowledge.update_folder_metadata(old_name, new_name, folder.workbook.user.id)
                        except Exception as e:
                            print(f"Error updating folder metadata: {e}")
                    
                    folder.name = new_name
                
                if 'in_use' in body:
                    folder.in_use = body['in_use']
                folder.save()
                
                return JsonResponse({
                    'status': 'success',
                    'message': 'Folder updated successfully'
                })
        except Exception as e:
            return JsonResponse(
                {'status': 'error', 'message': str(e)},
                status=500
            )
    
    if action == "list":
        workbook = Workbook.objects.filter(uuid=did).first()
        if not workbook:
            return JsonResponse(
                {'status': 'error', 'message': 'Workbook not found'},
                status=404
            )

        folders = Folder.objects.filter(workbook=workbook)
        response['folders'] = []
        for folder in folders:
            file_count = folder.files.count()
            # Get the most recent file upload time in this folder
            latest_file = folder.files.order_by('-uploaded_at').first()
            last_uploaded = latest_file.uploaded_at if latest_file else folder.created_at
            
            response['folders'].append({
                'id': str(folder.uuid),
                'name': folder.name,
                'in_use': folder.in_use,
                'file_count': file_count,
                'created_at': folder.created_at.isoformat(),
                'last_uploaded': last_uploaded.isoformat()
            })
        response['status'] = 'success'
        return JsonResponse(response)
    
    elif action == "create":
        try:
            body = json.loads(request.body)
            name = body.get('name', 'New Folder')

            workbook = Workbook.objects.filter(uuid=did).first()
            if not workbook:
                return JsonResponse(
                    {'status': 'error', 'message': 'Workbook not found'},
                    status=404
                )

            folder = Folder.objects.create(
                workbook=workbook,
                name=name,
                in_use=True
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Folder created successfully',
                'folder': {
                    'id': str(folder.uuid),
                    'name': folder.name,
                    'in_use': folder.in_use,
                    'file_count': 0,
                    'created_at': folder.created_at.isoformat()
                }
            })
        except Exception as e:
            return JsonResponse(
                {'status': 'error', 'message': str(e)},
                status=500
            )
    
    return JsonResponse(response)


@api_view(['GET', 'POST', 'DELETE', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_files(request, did, action):
    """
    Handle workbook Resources (uploaded files like CSV, XLSX, PDF, DOCX, etc.).
    Note: These are separate from Sheets (spreadsheet tabs in the workbook).
    Resources = user-uploaded files stored in folders for reference/RAG.
    """
    response = {'status': 'error'}
    
    # Handle file-specific operations (DELETE/PATCH) when action is a UUID
    if request.method in ['DELETE', 'PATCH']:
        try:
            file_id = action  # action is the file UUID in this case
            print(f"File operation: method={request.method}, file_id={file_id}, workbook={did}")
            file = File.objects.filter(uuid=file_id, workbook__uuid=did).first()
            if not file:
                print(f"File not found: file_id={file_id}, workbook={did}")
                return JsonResponse(
                    {'status': 'error', 'message': 'File not found'},
                    status=404
                )
            
            if request.method == 'DELETE':
                # Delete from ChromaDB
                try:
                    knowledge.delete_file_chunks(str(file.uuid))
                except Exception as e:
                    print(f"Error deleting file chunks: {e}")
                
                # Delete the physical file from storage
                if file.file:
                    file.file.delete(save=False)
                
                # Delete the database record
                file.delete()
                
                return JsonResponse({
                    'status': 'success',
                    'message': 'File deleted successfully'
                })
            
            elif request.method == 'PATCH':
                try:
                    if request.body:
                        body = json.loads(request.body.decode('utf-8') if isinstance(request.body, bytes) else request.body)
                    else:
                        body = {}
                except json.JSONDecodeError:
                    return JsonResponse(
                        {'status': 'error', 'message': 'Invalid JSON in request body'},
                        status=400
                    )
                
                # Handle file rename
                if 'filename' in body:
                    new_filename = body['filename']
                    
                    # Update ChromaDB metadata
                    try:
                        knowledge.update_file_metadata(str(file.uuid), new_filename)
                    except Exception as e:
                        print(f"Error updating file metadata: {e}")
                    
                    file.filename = new_filename
                
                # Handle visibility toggle
                if 'visible' in body:
                    visible = body.get('visible', True)
                    file.use = visible
                
                file.save()
                
                return JsonResponse({
                    'status': 'success',
                    'message': 'File updated successfully',
                    'visible': file.use
                })
        except Exception as e:
            print(f"Error in file operation: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse(
                {'status': 'error', 'message': str(e)},
                status=500
            )
    
    if action == "list":
        # Get folder_id from query params if provided
        folder_id = request.GET.get('folder_id', None)
        show_all = request.GET.get('all', 'false').lower() == 'true'
        
        if show_all:
            # Show all files for the workbook regardless of folder
            files = File.objects.filter(workbook__uuid=did)
        elif folder_id:
            # Filter files by folder - only show files in this folder
            files = File.objects.filter(workbook__uuid=did, folder__uuid=folder_id)
            # print(f"📂 Loading files for folder {folder_id}: {files.count()} files")
        else:
            # Get files not in any folder - exclude files that are in folders
            files = File.objects.filter(workbook__uuid=did, folder__isnull=True)
            # print(f"📁 Loading root files (no folder): {files.count()} files")
        
        response['files'] = []
        for file in files:
            response['files'].append({
                'id': str(file.uuid),
                'name': file.filename,
                'file': str(file.file),
                'content': file.extracted_content,
                'size': file.calculated_size,
                'uploaded_at': file.uploaded_at.isoformat(),
                'is_processing': file.is_processing,
                'use': file.use,
                'folder_id': str(file.folder.uuid) if file.folder else None
            })
        response['status'] = 'success'
    elif action == "upload":
        uploaded_files = request.FILES.getlist('files')
        folder_id = request.POST.get('folder_id', None)
        print( uploaded_files)
        if not uploaded_files:
            return JsonResponse({'status': 'error', 'message': 'No files uploaded'}, status=400)

        workbook = Workbook.objects.filter(uuid=did).first()
        if not workbook:
            return JsonResponse({'status': 'error', 'message': 'Workbook not found'}, status=404)

        # Get folder if folder_id provided
        folder = None
        folder_name = None
        if folder_id:
            folder = Folder.objects.filter(uuid=folder_id, workbook=workbook).first()
            if folder:
                folder_name = folder.name
        
        # Validate file types (CSV, XLSX, PDF, DOCX, TXT, MD, and PPTX allowed)
        allowed_extensions = ['.csv', '.xlsx', '.xls', '.pdf', '.docx', '.doc', '.txt', '.md', '.pptx', '.ppt']
        for uploaded_file in uploaded_files:
            file_ext = os.path.splitext(uploaded_file.name)[1].lower()
            if file_ext not in allowed_extensions:
                return JsonResponse({
                    'status': 'error', 
                    'message': f'Invalid file type: {uploaded_file.name}. Only CSV, XLSX, XLS, PDF, DOCX, DOC, TXT, MD, PPTX, and PPT files are allowed.'
                }, status=400)
        
        uploaded_file_ids = []
        for uploaded_file in uploaded_files:
            # Get original filename and extension
            original_name = uploaded_file.name
            name_parts = os.path.splitext(original_name)
            base_name = name_parts[0]
            extension = name_parts[1]
            
            # Sanitize filename to only contain a-z, A-Z, 0-9, -, _
            sanitized_name = re.sub(r'[^a-zA-Z0-9\-_]', '', base_name)
            if not sanitized_name:
                sanitized_name = 'file'
            
            # Generate UUID and create new filename
            file_uuid = uuid_lib.uuid4()
            new_filename = f"{sanitized_name}-{file_uuid}{extension}"
            
            # Create file instance with folder assignment
            file_instance = File.objects.create(
                workbook=workbook,
                folder=folder,
                filename=original_name,
                calculated_size=uploaded_file.size,
                extracted_content="",  # Will be populated by background processing
                is_processing=True
            )
            
            # Save file with new name
            file_instance.file.save(new_filename, uploaded_file, save=True)
            
            uploaded_file_ids.append({
                'id': str(file_instance.uuid),
                'original_name': original_name,
                'stored_name': new_filename
            })
        
        response = {
            'status': 'success',
            'uploaded_files': uploaded_file_ids,
            'count': len(uploaded_file_ids)
        }
        
        # Start background processing of uploaded files
        print(f"Triggering background processing for {len(uploaded_file_ids)} uploaded file(s)...")
        start_background_processing()
        
    return JsonResponse(response)



@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_assistant(request, did, action):
    """
    Handle AI assistant messages with conversation persistence and tool support.
    
    Tools available:
    - Sheet tools: Manipulate spreadsheet tabs (add/delete rows/columns, populate cells)
    - File tools: Query uploaded Resources (RAG-based search in CSV/XLSX/PDF/DOCX files)
    - Web tools: Search and scrape web content
    
    POST data:
        - message: User message text (for user_message type)
        - message_type: 'user_message' or 'tool_result'
        - conversation_id: UUID of existing conversation (optional for first message)
        - tool_results: Array of {id, name, result} for tool_result type
        - attachment_*: File attachments (multiple files supported via FormData)
        - sheet_data: Current spreadsheet sheet data (JSON string when sent via FormData)
        - selected_range: Selected cell range
    """
    try:
        # Check if this is FormData (with attachments) or JSON request
        content_type = request.content_type
        is_form_data = 'multipart/form-data' in content_type if content_type else False
        
        # Parse request data based on content type
        if is_form_data:
            message = request.POST.get('message', '')
            message_type = request.POST.get('message_type', 'user_message')
            conversation_id = request.POST.get('conversation_id')
            tool_results = json.loads(request.POST.get('tool_results', '[]'))
            sheet_data = json.loads(request.POST.get('sheet_data', 'null'))
            sheet_name = request.POST.get('sheet_name', '')
            sheet_id = request.POST.get('sheet_id', '')
            selected_range = request.POST.get('selected_range')
            model = request.POST.get('model', settings.DEFAULT_AI_MODEL)
        else:
            body = json.loads(request.body) if request.body else {}
            message = body.get('message', '')
            message_type = body.get('message_type', 'user_message')
            conversation_id = body.get('conversation_id')
            tool_results = body.get('tool_results', [])
            sheet_data = body.get('sheet_data')
            sheet_name = body.get('sheet_name', '')
            sheet_id = body.get('sheet_id', '')
            selected_range = body.get('selected_range')
            model = body.get('model', settings.DEFAULT_AI_MODEL)
        
        # Handle file attachments if present
        uploaded_file_ids = []
        attachment_info = []
        if is_form_data and request.FILES:
            workbook = Workbook.objects.filter(uuid=did).first()
            if not workbook:
                return JsonResponse({'status': 'error', 'message': 'Workbook not found'}, status=404)
            
            # Process all attached files
            for field_name, uploaded_file in request.FILES.items():
                if field_name.startswith('attachment_'):
                    # Get original filename and extension
                    original_name = uploaded_file.name
                    name_parts = os.path.splitext(original_name)
                    base_name = name_parts[0]
                    extension = name_parts[1]
                    
                    # Sanitize filename to only contain a-z, A-Z, 0-9, -, _
                    sanitized_name = re.sub(r'[^a-zA-Z0-9\-_]', '', base_name)
                    if not sanitized_name:
                        sanitized_name = 'file'
                    
                    # Generate UUID and create new filename
                    file_uuid = uuid_lib.uuid4()
                    new_filename = f"{sanitized_name}-{file_uuid}{extension}"
                    
                    # Create file instance
                    file_instance = File.objects.create(
                        workbook=workbook,
                        filename=original_name,
                        calculated_size=uploaded_file.size,
                        extracted_content="",  # Will be populated by background processing
                        is_processing=True
                    )
                    
                    # Save file with new name
                    file_instance.file.save(new_filename, uploaded_file, save=True)
                    
                    uploaded_file_ids.append(str(file_instance.uuid))
                    attachment_info.append({
                        'id': str(file_instance.uuid),
                        'name': original_name,
                        'size': uploaded_file.size
                    })
            
            # Start background processing of uploaded files
            if uploaded_file_ids:
                print(f"Triggering background processing for {len(uploaded_file_ids)} attached file(s)...")
                start_background_processing()
        
        # Build sheet context if data provided
        sheet_context = None
        if sheet_data:
            sheet_context = {}
            sheet_context['data'] = sheet_data
            if sheet_name:
                sheet_context['name'] = sheet_name
            if sheet_id:
                sheet_context['uuid'] = sheet_id
        
        # Prepend metadata to user message (context before message)
        if message:
            metadata_parts = []
            
            # Add attachment info first if files were uploaded
            if attachment_info:
                attachment_text = "[User attached files: " + ", ".join([f"{att['name']} (ID: {att['id']})" for att in attachment_info]) + "]"
                metadata_parts.append(attachment_text)
            
            # Add active page/sheet info
            if sheet_name:
                metadata_parts.append(f"[Selected sheet: {sheet_name} (ID: {sheet_id})]")
            else:
                # When no sheet is selected, user is on Resource Files
                metadata_parts.append("[Active page: Resource Files]")
            
            # Add selected cells info
            if selected_range:
                metadata_parts.append(f"[Selected cells: {selected_range}]")
            
            # Combine metadata with message
            if metadata_parts:
                message = "\n".join(metadata_parts) + "\n\n" + message
        
        print(f"Assistant {action}: type={message_type}, conv_id={conversation_id}, attachments={len(uploaded_file_ids)}")
        
        # Get or create conversation
        if conversation_id:
            conversation = Conversation.objects.filter(uuid=conversation_id).first()
            if not conversation:
                return JsonResponse({'status': 'error', 'message': 'Conversation not found'}, status=404)
        else:
            # Create new conversation for this workbook
            workbook = Workbook.objects.filter(uuid=did).first()
            if not workbook:
                return JsonResponse({'status': 'error', 'message': 'Workbook not found'}, status=404)

            conversation = Conversation.objects.create(
                workbook=workbook,
                title=message[:50] if message else 'New Conversation',
                conversations=[]
            )
        
        # Handle different message types
        if message_type == 'user_message':
            # User sent a new message
            # Only include sheet tools if user is actually viewing a sheet
            include_sheet_tools = sheet_context is not None
            
            result = ai.assistant(
                message=message,
                conversation_obj=conversation,
                include_sheet_tools=include_sheet_tools,
                workbook_id=did,
                sheet_context=sheet_context,
                model=model
            )
        elif message_type == 'tool_result':
            # Frontend executed tools and is sending results back
            # Add tool results to conversation
            conversations = conversation.conversations
            for tool_result in tool_results:
                conversations.append({
                    "tool_call_id": tool_result['id'],
                    "role": "tool",
                    "name": tool_result['name'],
                    "content": tool_result['result']
                })
            conversation.conversations = conversations
            conversation.save()
            
            # Continue conversation to get AI's final response
            result = ai.assistant(
                message=None,
                conversation_obj=conversation,
                include_sheet_tools=True,
                workbook_id=did,
                sheet_context=sheet_context,
                model=model
            )
        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid message_type'}, status=400)
        
        # Return the result from assistant
        # Handle both string (legacy) and dict (new tool-based) responses
        if isinstance(result, dict):
            return JsonResponse({
                'status': 'success',
                **result
            })
        else:
            # Legacy string response when sheet tools are disabled
            return JsonResponse({
                'status': 'success',
                'type': 'message',
                'content': result,
                'conversation_id': str(conversation.uuid)
            })
        
    except Exception as e:
        print(f"Error in api_assistant: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
       

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_enrich(request, action):
    """Legacy single cell enrichment endpoint - kept for backwards compatibility"""
    response = {'status': 'error'}
    body = json.loads(request.body)
    data = body.get('data', {})
    workbook_id = body.get('workbookId')
    model = body.get('model', settings.DEFAULT_AI_MODEL)
    print(data)
    response['result'] = ai.enrichment(data, workbook_id=workbook_id, model=model)
    response['status'] = 'success'
    return JsonResponse(response)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_bulk_enrich(request):
    """Bulk enrichment endpoint - accepts multiple cells and processes them with threading"""
    from core.handlers.enrich import enricher
    
    try:
        body = json.loads(request.body)
        cells_data = body.get('cells', [])
        workbook_id = body.get('workbookId')
        model = body.get('model', settings.DEFAULT_AI_MODEL)
        
        if not cells_data:
            return JsonResponse({'status': 'error', 'message': 'No cells provided'}, status=400)
        
        if not workbook_id:
            return JsonResponse({'status': 'error', 'message': 'Workbook ID required'}, status=400)
        
        # Start background enrichment processing
        enricher.start_bulk_enrichment(cells_data, workbook_id, model)
        
        return JsonResponse({
            'status': 'success',
            'message': f'{len(cells_data)} cells queued for enrichment'
        })
        
    except Exception as e:
        print(f"Error in bulk enrichment: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_cell_history(request, did, sheet_id):
    """
    Get enrichment history for a specific cell
    
    Query params:
        - row: Row index of the cell
        - column: Column index of the cell
    
    Returns most recent completed enrichment job with tool usage metadata
    """
    try:
        # Get query parameters
        row = request.GET.get('row')
        column = request.GET.get('column')
        
        if row is None or column is None:
            return JsonResponse({'status': 'error', 'message': 'Row and column parameters required'}, status=400)
        
        try:
            row = int(row)
            column = int(column)
        except ValueError:
            return JsonResponse({'status': 'error', 'message': 'Row and column must be integers'}, status=400)
        
        # Get the most recent completed enrichment job for this cell
        job = BackgroundJob.objects.filter(
            workbook__uuid=did,
            sheet_uuid=sheet_id,
            row=row,
            column=column,
            job_type='data_enrichment',
            status='completed'
        ).order_by('-completed_at').first()
        
        if not job:
            return JsonResponse({'status': 'success', 'data': None})
        
        # Return job metadata
        return JsonResponse({
            'status': 'success',
            'data': {
                'jobId': str(job.uuid),
                'value': job.result,
                'tools_used': job.tool_calls_used,
                'source_files': job.source_files,
                'model_used': job.model_used,
                'completed_at': job.completed_at.isoformat() if job.completed_at else None
            }
        })
        
    except Exception as e:
        print(f"Error fetching cell history: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@api_view(['GET', 'POST', 'DELETE', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_sheets(request, did, sheet_id):
    """
    Handle workbook Sheets (spreadsheet tabs) operations.
    Note: Sheets = spreadsheet tabs with columns/rows (like Excel sheets).
    These are different from uploaded sheet files (CSV/XLSX) in Resources.
    """
    
    if request.method == 'GET':
        if sheet_id == 'list':
            # Return list of sheets for the workbook
            sheets = Sheet.objects.filter(workbook__uuid=did)
            sheet_list = []
            for sheet in sheets:
                sheet_list.append({
                    'sheet_id': str(sheet.uuid),
                    'name': sheet.name,
                    'last_modified': sheet.last_modified.isoformat()
                })
            return JsonResponse({
                'status': 'success',
                'sheets': sheet_list
            })
        else:
        # Load sheet data from database
            if sheet_id == 'default-sheet':
                # Get the first sheet for the workbook
                sheet = Sheet.objects.filter(workbook__uuid=did).first()
            else:
                sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
            if not sheet:
                return JsonResponse(
                    {'status': 'error', 'message': 'Sheet not found'},
                    status=404
                )
            data = sheet.data if sheet.data else {'columns': [], 'rows': []}
            
            return JsonResponse({
                'status': 'success',
                'sheet_data': data,
                'last_modified': sheet.last_modified.isoformat(),
                'sheet_id': str(sheet.uuid),
                'name': sheet.name
            })
    elif request.method == 'POST':
        
        if sheet_id == 'new':
            # Create a new sheet
            workbook = Workbook.objects.filter(uuid=did).first()
            if not workbook:
                return JsonResponse(
                    {'status': 'error', 'message': 'Workbook not found'},
                    status=404
                )

            # Get existing sheets to determine the next sheet name
            existing_sheets = Sheet.objects.filter(workbook=workbook)
            sheet_numbers = []
            for s in existing_sheets:
                # Extract number from "Sheet X" format
                match = re.match(r'Sheet (\d+)', s.name)
                if match:
                    sheet_numbers.append(int(match.group(1)))
            
            # Find the next available number
            next_number = 1
            if sheet_numbers:
                next_number = max(sheet_numbers) + 1
            
            new_sheet_name = f'Sheet {next_number}'
            
            # Create the new sheet
            new_sheet = Sheet.objects.create(
                workbook=workbook,
                name=new_sheet_name,
                data={'columns': [], 'rows': []}
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Sheet created successfully',
                'sheet': {
                    'id': str(new_sheet.uuid),
                    'name': new_sheet.name,
                    'last_modified': new_sheet.last_modified.isoformat()
                }
            })
        else:
            body = json.loads(request.body)
            sheet_data = body.get('sheet_data', {'columns': [], 'rows': []})

            if sheet_id == 'default-sheet':
                # Get the first sheet for the workbook
                sheet = Sheet.objects.filter(workbook__uuid=did).first()
            else:
                sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
            if sheet:
                sheet.data = sheet_data
                sheet.save()
                return JsonResponse({
                    'status': 'success',
                    'message': 'Sheet saved successfully',
                    'sheet_id': str(sheet.uuid),
                    'last_modified': sheet.last_modified.isoformat()
                })
            else:
                # return error if sheet not found
                return JsonResponse(
                    {'status': 'error', 'message': 'Sheet not found'},
                    status=404
                )
    elif request.method == 'DELETE':
        # Delete a sheet
        if sheet_id == 'default-sheet':
            return JsonResponse(
                {'status': 'error', 'message': 'Cannot delete default sheet'},
                status=400
            )
        
        sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
        if not sheet:
            return JsonResponse(
                {'status': 'error', 'message': 'Sheet not found'},
                status=404
            )
        
        # Check if this is the last sheet in the workbook
        sheet_count = Sheet.objects.filter(workbook__uuid=did).count()
        if sheet_count <= 1:
            return JsonResponse(
                {'status': 'error', 'message': 'Cannot delete the last sheet in the workbook'},
                status=400
            )
        
        sheet.delete()
        return JsonResponse({
            'status': 'success',
            'message': 'Sheet deleted successfully'
        })
    elif request.method == 'PATCH':
        # Update sheet metadata (e.g., name)
        sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
        if not sheet:
            return JsonResponse(
                {'status': 'error', 'message': 'Sheet not found'},
                status=404
            )
        
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {'status': 'error', 'message': 'Invalid JSON'},
                status=400
            )
        
        # Update sheet name if provided
        if 'name' in body:
            new_name = body['name'].strip()
            if not new_name:
                return JsonResponse(
                    {'status': 'error', 'message': 'Sheet name cannot be empty'},
                    status=400
                )
            sheet.name = new_name
            sheet.save()
        
        return JsonResponse({
            'status': 'success',
            'message': 'Sheet updated successfully',
            'sheet': {
                'id': str(sheet.uuid),
                'name': sheet.name,
                'last_modified': sheet.last_modified.isoformat()
            }
        })
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'}, status=400)
    
@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_test(request, action):
    """A simple test API endpoint for admin actions"""
    response = {'status': 'error'}
    if action == "ping":
        response['status'] = 'success'
        response['message'] = 'pong'
        
        channel_layer = get_channel_layer()
        group_id = f"g-6e87f113-82e4-4799-80af-114ba26ab8b7"
        
        async_to_sync(channel_layer.group_send)(
            group_id,
            {
                'type': 'new_message',
                'message': "pinggginggg"
            }
        )
    elif action == "test-ai":
        # Simple AI test
        result = ai.test_ai()
        print(result)
        response['status'] = 'success'
        # response['message'] = result
        
               
    else:
        response['message'] = 'Unknown action'
    return JsonResponse(response)


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


@api_view(['GET', 'POST', 'PATCH', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_provider_credentials(request, action):
    """Manage per-user LLM provider API keys and enable/disable flags."""
    response = {'status': 'error'}

    # Get current user (hardcoded for now)
    from django.contrib.auth.models import User
    user = User.objects.filter(username='rohanashik').first()
    if not user:
        response['message'] = 'User not found'
        return JsonResponse(response, status=404)

    PROVIDERS = {
        'openai': 'OpenAI',
        'gemini': 'Gemini',
        'anthropic': 'Claude',
    }

    def serialize_provider(provider_key, cred: ProviderCredential | None):
        has_key = bool(cred and (cred.api_key or '').strip())
        enabled = bool(cred and cred.enabled and has_key)
        return {
            'provider': provider_key,
            'display_name': PROVIDERS[provider_key],
            'enabled': enabled,
            'has_key': has_key,
            'last4': (cred.api_key_last4 if cred else '') or '',
            'updated_at': cred.last_modified.isoformat() if cred else None,
        }

    if action == 'list':
        creds = ProviderCredential.objects.filter(user=user)
        cred_map = {c.provider: c for c in creds}

        response['providers'] = [serialize_provider(p, cred_map.get(p)) for p in PROVIDERS.keys()]
        response['status'] = 'success'
        return JsonResponse(response)

    if action == 'models':
        # Define supported models per provider
        SUPPORTED_MODELS = {
            'openai': [
                {'id': 'openai/gpt-5', 'name': 'GPT-5'},
                {'id': 'openai/gpt-5-mini', 'name': 'GPT-5 Mini'},
                {'id': 'openai/gpt-5-nano', 'name': 'GPT-5 Nano'},
            ],
            'gemini': [
                {'id': 'gemini/gemini-3-pro-preview', 'name': 'Gemini 3 Pro Preview'},
                {'id': 'gemini/gemini-2.5-flash', 'name': 'Gemini 2.5 Flash'},
                {'id': 'gemini/gemini-3-flash-preview', 'name': 'Gemini 3 Flash Preview'},
                {'id': 'gemini/gemini-2.5-flash-lite', 'name': 'Gemini 2.5 Flash Lite'},
            ],
            'anthropic': [
                {'id': 'anthropic/claude-3-opus-20240229', 'name': 'Claude 3 Opus'},
                {'id': 'anthropic/claude-3-sonnet-20240229', 'name': 'Claude 3 Sonnet'},
                {'id': 'anthropic/claude-3-haiku-20240307', 'name': 'Claude 3 Haiku'},
            ]
        }

        creds = ProviderCredential.objects.filter(user=user)
        cred_map = {c.provider: c for c in creds}

        available_models = []
        for provider_key, models in SUPPORTED_MODELS.items():
            cred = cred_map.get(provider_key)
            # Check if provider has key AND is enabled
            if cred and cred.api_key and cred.enabled:
                available_models.extend(models)
        
        response['status'] = 'success'
        response['models'] = available_models
        return JsonResponse(response)

    if action == 'set-key':
        if request.method not in ('POST', 'PATCH'):
            return JsonResponse({'status': 'error', 'message': 'Invalid method'}, status=405)

        data = json.loads(request.body) if request.body else {}
        provider = (data.get('provider') or '').lower().strip()
        api_key = (data.get('api_key') or '').strip()

        if provider not in PROVIDERS:
            return JsonResponse({'status': 'error', 'message': 'Unknown provider'}, status=400)

        if not api_key:
            return JsonResponse({'status': 'error', 'message': 'API key is required'}, status=400)

        cred, _ = ProviderCredential.objects.get_or_create(user=user, provider=provider)
        cred.api_key = api_key
        cred.api_key_last4 = api_key[-4:] if len(api_key) >= 4 else api_key

        # If caller didn't specify enabled, default to enabled once key is set
        enabled = data.get('enabled')
        if enabled is None:
            cred.enabled = True
        else:
            cred.enabled = bool(enabled)
        cred.save()

        response['status'] = 'success'
        response['provider'] = serialize_provider(provider, cred)
        return JsonResponse(response)

    if action == 'toggle':
        if request.method not in ('PATCH', 'POST'):
            return JsonResponse({'status': 'error', 'message': 'Invalid method'}, status=405)

        data = json.loads(request.body) if request.body else {}
        provider = (data.get('provider') or '').lower().strip()
        enabled = data.get('enabled')

        if provider not in PROVIDERS:
            return JsonResponse({'status': 'error', 'message': 'Unknown provider'}, status=400)
        if enabled is None:
            return JsonResponse({'status': 'error', 'message': 'Missing enabled flag'}, status=400)

        cred, _ = ProviderCredential.objects.get_or_create(user=user, provider=provider)
        has_key = bool((cred.api_key or '').strip())
        if bool(enabled) and not has_key:
            return JsonResponse({'status': 'error', 'message': 'Cannot enable provider without an API key'}, status=400)

        cred.enabled = bool(enabled) if has_key else False
        cred.save()

        response['status'] = 'success'
        response['provider'] = serialize_provider(provider, cred)
        return JsonResponse(response)

    if action == 'clear':
        if request.method != 'DELETE':
            return JsonResponse({'status': 'error', 'message': 'Invalid method'}, status=405)

        provider = (request.GET.get('provider') or '').lower().strip()
        if provider not in PROVIDERS:
            return JsonResponse({'status': 'error', 'message': 'Unknown provider'}, status=400)

        cred = ProviderCredential.objects.filter(user=user, provider=provider).first()
        if cred:
            cred.api_key = ''
            cred.api_key_last4 = ''
            cred.enabled = False
            cred.save()

        response['status'] = 'success'
        response['provider'] = serialize_provider(provider, cred)
        return JsonResponse(response)

    return JsonResponse({'status': 'error', 'message': 'Unknown action'}, status=400)

