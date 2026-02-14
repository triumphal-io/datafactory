import json
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.models import ProviderCredential


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
