from django.contrib import admin
from .models import Workbook, Sheet, File, Folder, Conversation, BackgroundJob


@admin.register(Workbook)
class WorkbookAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'uuid', 'created_at', 'last_modified')
    # list_filter = ('user', 'created_at', 'last_modified')
    search_fields = ('name', 'uuid', 'user__username', 'user__email')
    readonly_fields = ('uuid', 'created_at', 'last_modified')
    date_hierarchy = 'created_at'


@admin.register(Sheet)
class SheetAdmin(admin.ModelAdmin):
    list_display = ('name', 'workbook', 'uuid', 'created_at', 'last_modified')
    # list_filter = ('workbook', 'created_at', 'last_modified')
    search_fields = ('name', 'uuid', 'workbook__name')
    readonly_fields = ('uuid', 'created_at', 'last_modified')
    date_hierarchy = 'created_at'


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'workbook', 'in_use', 'uuid', 'created_at')
    # list_filter = ('in_use', 'workbook', 'created_at')
    search_fields = ('name', 'uuid', 'workbook__name')
    readonly_fields = ('uuid', 'created_at')
    date_hierarchy = 'created_at'


@admin.register(File)
class FileAdmin(admin.ModelAdmin):
    list_display = ('file', 'workbook', 'folder', 'use', 'uuid', 'uploaded_at')
    # list_filter = ('use', 'folder', 'workbook', 'uploaded_at')
    search_fields = ('file', 'uuid', 'workbook__name', 'folder__name', 'extracted_content')
    readonly_fields = ('uuid', 'uploaded_at')
    date_hierarchy = 'uploaded_at'


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('title', 'workbook', 'uuid', 'started_at', 'last_interaction')
    # list_filter = ('workbook', 'started_at', 'last_interaction')
    search_fields = ('title', 'uuid', 'workbook__name')
    readonly_fields = ('uuid', 'started_at', 'last_interaction')
    date_hierarchy = 'started_at'

@admin.register(BackgroundJob)
class BackgroundJobAdmin(admin.ModelAdmin):
    list_display = ('job_type', 'status', 'workbook', 'uuid', 'created_at')
    # list_filter = ('job_type', 'status', 'created_at', 'last_updated')
    search_fields = ('uuid', 'workbook__name', 'cell_data')
    readonly_fields = ('uuid', 'created_at')
    date_hierarchy = 'created_at'