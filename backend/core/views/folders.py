import json
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.models import Workbook, Folder
from core.handlers import knowledge


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
