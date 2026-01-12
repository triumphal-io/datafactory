from django.db import models
import uuid

class Workbook(models.Model):
    """
    Workbook model - represents a workbook containing sheets and resources (uploaded files).
    """
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE)

    name = models.CharField(max_length=255)
    data = models.JSONField()
    selected_model = models.CharField(max_length=100, default='gpt-5-nano')
    created_at = models.DateTimeField('Created at', auto_now_add=True)
    last_modified = models.DateTimeField('Last modified', auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Workbook"
        verbose_name_plural = "Workbooks"

class Sheet(models.Model):
    """
    Spreadsheet tab within a workbook (like Excel sheets).
    Contains editable grid data with columns and rows.
    """
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    workbook = models.ForeignKey(Workbook, on_delete=models.CASCADE, related_name='sheets')

    name = models.CharField(max_length=255)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField('Created at', auto_now_add=True)
    last_modified = models.DateTimeField('Last modified', auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "Sheets"

class Folder(models.Model):
    """
    Folder for organizing resources (uploaded files) within a workbook.
    Part of the Resources section, separate from Sheets.
    """
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    workbook = models.ForeignKey(Workbook, on_delete=models.CASCADE, related_name='folders')
    
    name = models.CharField(max_length=255)
    in_use = models.BooleanField(default=True)
    created_at = models.DateTimeField('Created at', auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "Folders"

class File(models.Model):
    """
    Uploaded resource file (CSV, XLSX, PDF, DOCX, etc.) in a workbook.
    Part of the Resources section, separate from Sheets (spreadsheet tabs).
    Content is extracted and indexed for RAG-based querying.
    """
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    workbook = models.ForeignKey(Workbook, on_delete=models.CASCADE, related_name='files')
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, related_name='files', null=True, blank=True)
    
    filename = models.CharField(max_length=255)
    calculated_size = models.BigIntegerField()
    extracted_content = models.TextField()
    file = models.FileField(upload_to='backend/storage/userdata/')
    is_processing = models.BooleanField(default=True)
    use = models.BooleanField(default=True)
    uploaded_at = models.DateTimeField('Uploaded at', auto_now_add=True)

    def __str__(self):
        return str(self.file)

    class Meta:
        verbose_name_plural = "Files"


class Conversation(models.Model):
    """
    AI assistant conversation history within a workbook.
    Stores multi-turn chat messages for context and persistence.
    """
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    workbook = models.ForeignKey(Workbook, on_delete=models.CASCADE, related_name='conversations')

    conversations = models.JSONField(default=list)  # Stores conversation history as array of message objects
    title = models.CharField(max_length=255, default='New Conversation')
    started_at = models.DateTimeField('Started at', auto_now_add=True)
    last_interaction = models.DateTimeField('Last interaction', auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        verbose_name_plural = "Conversations"


class BackgroundJob(models.Model):
    """
    Background processing jobs for workbooks (file processing, AI enrichment).
    Tracked for status updates via WebSocket and automatic cleanup.
    """
    JOB_TYPES = [
        ('file_processing', 'File Processing'),
        ('data_enrichment', 'Data Enrichment'),
    ]

    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('generating', 'Generating'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    workbook = models.ForeignKey(Workbook, on_delete=models.CASCADE, related_name='background_jobs')
    job_type = models.CharField(max_length=50, choices=JOB_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')
    created_at = models.DateTimeField('Created at', auto_now_add=True)
    started_at = models.DateTimeField('Started at', null=True, blank=True)
    completed_at = models.DateTimeField('Completed at', null=True, blank=True)
    cell_data = models.JSONField(default=dict)  # Cell data for enrichment jobs
    result = models.TextField(blank=True, null=True)  # Enrichment result
    error_message = models.TextField(blank=True, null=True)
    
    # Process transparency fields for enrichment tracking
    sheet_uuid = models.UUIDField(null=True, blank=True)  # Sheet where enrichment occurred
    row = models.IntegerField(null=True, blank=True)  # Row index of enriched cell
    column = models.IntegerField(null=True, blank=True)  # Column index of enriched cell
    tool_calls_used = models.JSONField(default=list, blank=True)  # Array of {name, args_summary, result_summary, timestamp}
    model_used = models.CharField(max_length=100, blank=True, null=True)  # AI model used for enrichment
    source_files = models.JSONField(default=list, blank=True)  # List of filenames queried during enrichment

    def __str__(self):
        return f"{self.get_job_type_display()} - {self.get_status_display()}"

    class Meta:
        verbose_name_plural = "Background Jobs"