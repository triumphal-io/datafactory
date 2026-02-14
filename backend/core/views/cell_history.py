"""API views for retrieving cell processing history from background jobs."""
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.models import BackgroundJob


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
