import json
from django.http import JsonResponse
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.ai import ai


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
    from core.ai.enrich import enricher
    
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
