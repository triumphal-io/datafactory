"""
Background enrichment processor for handling bulk cell enrichment with threading
"""
import threading
import time
from queue import Queue
from datetime import datetime
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.conf import settings
from ..models import BackgroundJob, Workbook
from . import ai


class EnrichmentProcessor:
    """Handles bulk enrichment processing with concurrent threading"""
    
    def __init__(self, max_concurrent=4):
        """
        Initialize the enrichment processor
        
        Args:
            max_concurrent (int): Maximum number of cells to process concurrently (3-5 recommended)
        """
        self.max_concurrent = max_concurrent
        self.channel_layer = get_channel_layer()
    
    def start_bulk_enrichment(self, cells_data, workbook_id, model=settings.DEFAULT_AI_MODEL):
        """
        Start bulk enrichment process for multiple cells
        
        Args:
            cells_data (list): List of cell data objects to enrich
            workbook_id (str): UUID of the workbook
            model (str): AI model to use for enrichment
        """
        print(f"Starting bulk enrichment for {len(cells_data)} cells")
        
        # Create background jobs for all cells
        try:
            workbook = Workbook.objects.get(uuid=workbook_id)
        except Workbook.DoesNotExist:
            print(f"Workbook {workbook_id} not found")
            return

        # Clean up old completed jobs (older than 10 minutes)
        self._cleanup_old_jobs(workbook)

        jobs = []
        for cell_data in cells_data:
            job = BackgroundJob.objects.create(
                workbook=workbook,
                job_type='data_enrichment',
                status='queued',
                cell_data=cell_data,
                sheet_uuid=cell_data.get('sheet_uuid'),
                row=cell_data.get('position', {}).get('Row'),
                column=cell_data.get('position', {}).get('Column')
            )
            jobs.append(job)
            
            # Send WebSocket notification that cell is queued
            self._send_websocket_update(
                workbook_id,
                'enrichment_status',
                {
                    'row': cell_data['position']['Row'],
                    'column': cell_data['position']['Column'],
                    'status': 'queued',
                    'jobId': str(job.uuid)
                }
            )
        
        # Start processing thread
        thread = threading.Thread(
            target=self._process_jobs,
            args=(jobs, workbook_id, model),
            daemon=True
        )
        thread.start()
    
    def _process_jobs(self, jobs, workbook_id, model=settings.DEFAULT_AI_MODEL):
        """
        Process jobs with concurrent threading using a work queue
        
        Args:
            jobs (list): List of BackgroundJob objects
            workbook_id (str): UUID of the workbook
            model (str): AI model to use for enrichment
        """
        print(f"Processing {len(jobs)} jobs with max {self.max_concurrent} concurrent threads")
        
        # Create a thread-safe queue and add all jobs to it
        job_queue = Queue()
        for job in jobs:
            job_queue.put(job)
        
        # Worker function that continuously processes jobs from the queue
        def worker():
            while True:
                try:
                    # Get a job from the queue (non-blocking with timeout)
                    job = job_queue.get(block=False)
                except:
                    # Queue is empty, worker is done
                    break
                
                try:
                    # Process the job
                    self._process_single_job(job, workbook_id, model)
                finally:
                    # Mark the job as done in the queue
                    job_queue.task_done()
        
        # Start worker threads (max_concurrent workers)
        threads = []
        for i in range(min(self.max_concurrent, len(jobs))):
            thread = threading.Thread(target=worker, daemon=True)
            threads.append(thread)
            thread.start()
        
        # Wait for all jobs to be processed
        job_queue.join()
        
        # Wait for all worker threads to finish
        for thread in threads:
            thread.join()
        
        print(f"All {len(jobs)} jobs completed")
    
    def _process_single_job(self, job, workbook_id, model=settings.DEFAULT_AI_MODEL):
        """
        Process a single enrichment job
        
        Args:
            job (BackgroundJob): The job to process
            workbook_id (str): UUID of the workbook
            model (str): AI model to use for enrichment
        """
        cell_data = job.cell_data
        position = cell_data['position']
        
        try:
            # Update job status to generating
            job.status = 'generating'
            job.started_at = timezone.now()
            job.save()
            
            # Send WebSocket update
            self._send_websocket_update(
                workbook_id,
                'enrichment_status',
                {
                    'row': position['Row'],
                    'column': position['Column'],
                    'status': 'generating',
                    'jobId': str(job.uuid)
                }
            )
            
            print(f"Processing enrichment for cell [{position['Row']}, {position['Column']}] with model {model}")
            
            # Call the enrichment AI function with metadata tracking
            enrichment_result = ai.enrichment(cell_data, workbook_id=workbook_id, model=model, return_metadata=True)
            
            # Build cell value with metadata structure
            if isinstance(enrichment_result, dict):
                value = enrichment_result.get('value', '')
                tools_used = enrichment_result.get('tools_used', [])
                source_files = enrichment_result.get('source_files', [])
                source_links = enrichment_result.get('source_links', [])
                
                # Create cell value with metadata using new format
                cell_value = {
                    "value": value,
                    "meta": {
                        "model_used": model,
                        "process": tools_used,  # Already in correct format: [{"tool": "...", "args": {...}}]
                        "sources": {
                            "files": source_files,
                            "links": source_links
                        }
                    }
                }
            else:
                # Fallback for simple string results
                value = enrichment_result
                cell_value = {"value": value, "meta": None}
            
            # Update job status to completed (no need to store metadata in job)
            job.status = 'completed'
            job.completed_at = timezone.now()
            job.result = value  # Store simple value for backward compatibility
            job.model_used = model
            job.save()
            
            # Send WebSocket update with complete cell structure
            self._send_websocket_update(
                workbook_id,
                'enrichment_complete',
                {
                    'row': position['Row'],
                    'column': position['Column'],
                    'status': 'completed',
                    'cellValue': cell_value,  # Send complete cell structure
                    'jobId': str(job.uuid)
                }
            )
            
            print(f"Completed enrichment for cell [{position['Row']}, {position['Column']}]: {value}")
            
        except Exception as e:
            print(f"Error processing enrichment job {job.uuid}: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # Update job status to failed
            job.status = 'failed'
            job.completed_at = timezone.now()
            job.error_message = str(e)
            job.save()
            
            # Send WebSocket error update
            self._send_websocket_update(
                workbook_id,
                'enrichment_error',
                {
                    'row': position['Row'],
                    'column': position['Column'],
                    'status': 'error',
                    'error': str(e),
                    'jobId': str(job.uuid)
                }
            )
    
    def _send_websocket_update(self, workbook_id, message_type, data):
        """
        Send WebSocket update to frontend
        
        Args:
            workbook_id (str): UUID of the workbook
            message_type (str): Type of message
            data (dict): Message data
        """
        if not self.channel_layer:
            print("Channel layer not available")
            return
        
        group_id = f"g-{workbook_id}"
        
        try:
            async_to_sync(self.channel_layer.group_send)(
                group_id,
                {
                    'type': 'enrichment_update',
                    'message_type': message_type,
                    'data': data
                }
            )
        except Exception as e:
            print(f"Error sending WebSocket update: {str(e)}")
    
    def _cleanup_old_jobs(self, workbook):
        """
        Clean up completed/failed jobs older than 10 minutes

        Args:
            workbook (Workbook): The workbook to clean up jobs for
        """
        from datetime import timedelta

        # Calculate cutoff time (10 minutes ago)
        cutoff_time = timezone.now() - timedelta(minutes=10)

        # Delete completed or failed jobs older than 10 minutes
        old_jobs = BackgroundJob.objects.filter(
            workbook=workbook,
            job_type='data_enrichment',
            status__in=['completed', 'failed'],
            completed_at__lt=cutoff_time
        )

        deleted_count = old_jobs.count()
        if deleted_count > 0:
            old_jobs.delete()
            print(f"Cleaned up {deleted_count} old enrichment jobs for workbook {workbook.uuid}")

 
# Global instance
enricher = EnrichmentProcessor(max_concurrent=10)
 