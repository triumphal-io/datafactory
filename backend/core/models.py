from django.db import models
import uuid

class Document(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE)

    name = models.CharField(max_length=255)
    data = models.JSONField()
    created_at = models.DateTimeField('Created at', auto_now_add=True)
    last_modified = models.DateTimeField('Last modified', auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "Documents"

class Sheet(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='sheets')

    name = models.CharField(max_length=255)
    data = models.JSONField(default={"columns":[],"rows":[]})
    created_at = models.DateTimeField('Created at', auto_now_add=True)
    last_modified = models.DateTimeField('Last modified', auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "Sheets"

class File(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='files')
    
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
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='conversations')

    conversations = models.JSONField(default=list)  # Stores conversation history as array of message objects
    title = models.CharField(max_length=255, default='New Conversation')
    started_at = models.DateTimeField('Started at', auto_now_add=True)
    last_interaction = models.DateTimeField('Last interaction', auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        verbose_name_plural = "Conversations"