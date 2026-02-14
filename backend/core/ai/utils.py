"""AI utility functions including web search, URL scraping, and LiteLLM client helpers."""
import os
from pathlib import Path

from ddgs import DDGS
from dotenv import load_dotenv
from django.apps import apps
from django.conf import settings

# Load environment variables from root folder
env_path = Path(__file__).resolve().parents[3] / '.env'
load_dotenv(dotenv_path=env_path)

# os.environ['LITELLM_LOG'] = 'DEBUG'

# Conversation length limits to prevent token overflow and control costs
MAX_CONVERSATION_MESSAGES = 30  # Maximum messages to keep (excluding system message)
# This allows for ~10-15 conversation turns while staying within token limits
# and keeping API costs reasonable

# Tool calling limits to prevent runaway costs and infinite loops
MAX_TOOL_ITERATIONS =  10 # Maximum number of tool calling cycles per request
# Prevents AI from calling tools indefinitely (e.g., querying 1000 files in a loop)
MAX_TOOLS_PER_TURN = 15  # Maximum number of tools that can be called in one iteration
# Prevents excessive parallel tool calls that could cause rate limits or high costs

AI_MAX_TOKENS = 2048  # Max tokens for AI responses (adjust based on model capabilities)

# Reusable DDGS client to avoid creating new HTTP sessions per search
_ddgs_client = DDGS()


def _get_provider_from_model(model: str | None) -> str | None:
    if not model:
        return None
    model_lower = model.lower().strip()
    if '/' in model_lower:
        return model_lower.split('/', 1)[0]
    if 'claude' in model_lower or 'anthropic' in model_lower:
        return 'anthropic'
    if 'gemini' in model_lower:
        return 'gemini'
    if model_lower.startswith('gpt') or 'openai' in model_lower:
        return 'openai'
    return None


def _get_provider_access(workbook_id: str | None, model: str | None):
    """Return (provider, api_key, error_reason).

    error_reason is one of: None | 'missing' | 'disabled'
    """
    provider = _get_provider_from_model(model)
    if provider not in {'openai', 'gemini', 'anthropic'}:
        return provider, None, None

    try:
        ProviderCredential = apps.get_model('core', 'ProviderCredential')
        Workbook = apps.get_model('core', 'Workbook')

        user = None
        if workbook_id:
            workbook = Workbook.objects.filter(uuid=workbook_id).select_related('user').first()
            user = workbook.user if workbook else None

        if user is None:
            # Fallback to default user in non-workbook contexts
            from django.contrib.auth.models import User
            user = User.objects.filter(username='rohanashik').first()

        if user is None:
            return provider, None, 'missing'

        cred = ProviderCredential.objects.filter(user=user, provider=provider).first()
        api_key = (cred.api_key or '').strip() if cred else ''
        if not api_key:
            return provider, None, 'missing'
        if not cred.enabled:
            return provider, None, 'disabled'
        return provider, api_key, None
    except Exception:
        # Credentials must come from DB.
        return provider, None, 'missing'

def trim_conversation(conversation, max_messages=MAX_CONVERSATION_MESSAGES):
    """
    Trim conversation history to stay within token limits and control costs.

    Keeps the most recent messages while always preserving the system message.
    This prevents context window overflow and excessive API costs.

    Args:
        conversation (list): List of message dicts with 'role' and 'content'
        max_messages (int): Maximum number of messages to keep (excluding system message)

    Returns:
        list: Trimmed conversation with system message + recent messages
    """
    if not conversation:
        return conversation

    # Find and preserve system message(s) at the start
    system_messages = []
    other_messages = []

    for msg in conversation:
        if msg.get('role') == 'system':
            system_messages.append(msg)
        else:
            other_messages.append(msg)

    # If total non-system messages exceed limit, keep only the most recent ones
    if len(other_messages) > max_messages:
        print(f"Trimming conversation: {len(other_messages)} messages -> {max_messages} messages")
        other_messages = other_messages[-max_messages:]

    # Return system messages + trimmed conversation
    return system_messages + other_messages


def ai_filter_result(raw_result, prompt, source_type="data", model=settings.DEFAULT_AI_MODEL, return_full_context=False, workbook_id=None):
    """
    Filter raw tool results using a secondary AI call based on the main AI's objective.

    This is a reusable function for all tools that need AI-based result filtering.
    It takes raw data and extracts only the information relevant to the prompt.

    Args:
        raw_result (str): Raw data from the tool (file results, webpage content, etc.)
        prompt (str): Main AI's objective - what specific information to extract
        source_type (str, optional): Description of data source (e.g., "file query results", "webpage content")
        model (str, optional): AI model to use for filtering. Defaults to settings.DEFAULT_AI_MODEL for speed/cost
        return_full_context (bool, optional): If True, returns explanation of page content when info not found. Defaults to False.

    Returns:
        str: AI-filtered summary (~25 words, focused on the prompt objective)
    """
    # Import here to avoid circular import - assistant() is in ai.py which imports from this module
    from .ai import assistant

    if return_full_context:
        # For web scraping, provide explanatory context about what the page contains
        filter_prompt = f"""You are a webpage analysis assistant. The main AI scraped a webpage and received:

{raw_result}

The main AI's objective was: {prompt}

Your task:
1. FIRST, try to extract the specific information requested. If found, provide it clearly (max 25 words).
2. IF the information is NOT on this page, provide an EXPLANATORY response about what this page actually contains/discusses instead. Describe the page's main topics and content in 1-2 sentences.

Format your response as:
- If found: "[The answer]: [extracted value]"
- If not found: "Page does not contain this info. This page discusses: [what it actually covers]"

Your response:"""
    else:
        # Original behavior for file queries
        filter_prompt = f"""You are a data extraction assistant. The main AI retrieved {source_type} and received:

{raw_result}

The main AI's objective was: {prompt}

Your task: Extract ONLY the specific information the main AI needs. Remove irrelevant data and present the answer in a clear, concise sentence (around 25 words max). If the data doesn't contain what was requested, say "Information not found."

Your response:"""

    # Call secondary AI (no conversation persistence, no recursive tools)
    filtered_result = assistant(
        message=filter_prompt,
        conversation_obj=None,
        include_sheet_tools=False,
        workbook_id=workbook_id,
        model=model
    )

    return filtered_result.strip()
