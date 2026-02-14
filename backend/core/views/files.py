"""API views for file upload, download, processing, and management within workbooks."""
import json
import os
import re
import uuid as uuid_lib
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.models import Workbook, File, Folder
from core.ai import knowledge
from core.ai.extraction import start_background_processing


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
