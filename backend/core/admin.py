from django.contrib import admin
from .models import Document, Sheet, File, Conversation


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'uuid', 'created_at', 'last_modified')
    # list_filter = ('user', 'created_at', 'last_modified')
    search_fields = ('name', 'uuid', 'user__username', 'user__email')
    readonly_fields = ('uuid', 'created_at', 'last_modified')
    date_hierarchy = 'created_at'


@admin.register(Sheet)
class SheetAdmin(admin.ModelAdmin):
    list_display = ('name', 'document', 'uuid', 'created_at', 'last_modified')
    # list_filter = ('document', 'created_at', 'last_modified')
    search_fields = ('name', 'uuid', 'document__name')
    readonly_fields = ('uuid', 'created_at', 'last_modified')
    date_hierarchy = 'created_at'


@admin.register(File)
class FileAdmin(admin.ModelAdmin):
    list_display = ('file', 'document', 'use', 'uuid', 'uploaded_at')
    # list_filter = ('use', 'document', 'uploaded_at')
    search_fields = ('file', 'uuid', 'document__name', 'extracted_content')
    readonly_fields = ('uuid', 'uploaded_at')
    date_hierarchy = 'uploaded_at'


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('title', 'document', 'uuid', 'started_at', 'last_interaction')
    # list_filter = ('document', 'started_at', 'last_interaction')
    search_fields = ('title', 'uuid', 'document__name')
    readonly_fields = ('uuid', 'started_at', 'last_interaction')
    date_hierarchy = 'started_at'
