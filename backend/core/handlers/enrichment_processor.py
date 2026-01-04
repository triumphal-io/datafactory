"""
Background enrichment processor for handling bulk cell enrichment with threading
"""
import threading
import time
from datetime import datetime
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from ..models import BackgroundJob, Document
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
    
    def start_bulk_enrichment(self, cells_data, document_id):
        """
        Start bulk enrichment process for multiple cells
        
        Args:
            cells_data (list): List of cell data objects to enrich
            document_id (str): UUID of the document
        """
        print(f"Starting bulk enrichment for {len(cells_data)} cells")
        
        # Create background jobs for all cells
        try:
            document = Document.objects.get(uuid=document_id)
        except Document.DoesNotExist:
            print(f"Document {document_id} not found")
            return
        
        jobs = []
        for cell_data in cells_data:
            job = BackgroundJob.objects.create(
                document=document,
                job_type='data_enrichment',
                status='queued',
                cell_data=cell_data
            )
            jobs.append(job)
            
            # Send WebSocket notification that cell is queued
            self._send_websocket_update(
                document_id,
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
            args=(jobs, document_id),
            daemon=True
        )
        thread.start()
    
    def _process_jobs(self, jobs, document_id):
        """
        Process jobs with concurrent threading
        
        Args:
            jobs (list): List of BackgroundJob objects
            document_id (str): UUID of the document
        """
        print(f"Processing {len(jobs)} jobs with max {self.max_concurrent} concurrent threads")
        
        # Split jobs into batches
        for i in range(0, len(jobs), self.max_concurrent):
            batch = jobs[i:i + self.max_concurrent]
            threads = []
            
            # Start threads for this batch
            for job in batch:
                thread = threading.Thread(
                    target=self._process_single_job,
                    args=(job, document_id),
                    daemon=True
                )
                threads.append(thread)
                thread.start()
            
            # Wait for all threads in this batch to complete
            for thread in threads:
                thread.join()
            
            print(f"Batch {i // self.max_concurrent + 1} completed")
    
    def _process_single_job(self, job, document_id):
        """
        Process a single enrichment job
        
        Args:
            job (BackgroundJob): The job to process
            document_id (str): UUID of the document
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
                document_id,
                'enrichment_status',
                {
                    'row': position['Row'],
                    'column': position['Column'],
                    'status': 'generating',
                    'jobId': str(job.uuid)
                }
            )
            
            print(f"Processing enrichment for cell [{position['Row']}, {position['Column']}]")
            
            # Call the enrichment AI function
            result = ai.enrichment(cell_data, document_id=document_id)
            
            # Update job status to completed
            job.status = 'completed'
            job.completed_at = timezone.now()
            job.result = result
            job.save()
            
            # Send WebSocket update with result
            self._send_websocket_update(
                document_id,
                'enrichment_complete',
                {
                    'row': position['Row'],
                    'column': position['Column'],
                    'status': 'completed',
                    'value': result,
                    'jobId': str(job.uuid)
                }
            )
            
            print(f"Completed enrichment for cell [{position['Row']}, {position['Column']}]: {result}")
            
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
                document_id,
                'enrichment_error',
                {
                    'row': position['Row'],
                    'column': position['Column'],
                    'status': 'error',
                    'error': str(e),
                    'jobId': str(job.uuid)
                }
            )
    
    def _send_websocket_update(self, document_id, message_type, data):
        """
        Send WebSocket update to frontend
        
        Args:
            document_id (str): UUID of the document
            message_type (str): Type of message
            data (dict): Message data
        """
        if not self.channel_layer:
            print("Channel layer not available")
            return
        
        group_id = f"g-{document_id}"
        
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


# Global instance
enrichment_processor = EnrichmentProcessor(max_concurrent=4)
