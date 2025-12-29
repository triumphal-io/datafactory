import csv
import os
import threading
from django.conf import settings
from core.models import File


def csv_to_markdown(file_path):
    """
    Convert CSV file to markdown table format.
    
    Args:
        file_path: Path to the CSV file
        
    Returns:
        Markdown formatted string representation of the CSV
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.reader(csvfile)
            rows = list(reader)
            
            if not rows:
                return "Empty CSV file"
            
            # Build markdown table
            markdown_lines = []
            
            # Header row
            if len(rows) > 0:
                header = rows[0]
                markdown_lines.append('| ' + ' | '.join(header) + ' |')
                markdown_lines.append('| ' + ' | '.join(['---'] * len(header)) + ' |')
            
            # Data rows
            for row in rows[1:]:
                # Pad row if it has fewer columns than header
                if len(row) < len(header):
                    row = row + [''] * (len(header) - len(row))
                # Truncate if it has more columns
                elif len(row) > len(header):
                    row = row[:len(header)]
                markdown_lines.append('| ' + ' | '.join(row) + ' |')
            
            return '\n'.join(markdown_lines)
            
    except Exception as e:
        return f"Error extracting CSV: {str(e)}"


def extract_file_content(file_instance):
    """
    Extract content from a file based on its type.
    
    Args:
        file_instance: File model instance
        
    Returns:
        Extracted content as markdown string
    """
    file_path = file_instance.file.path
    file_extension = os.path.splitext(file_instance.filename)[1].lower()
    
    if file_extension == '.csv':
        return csv_to_markdown(file_path)
    else:
        return f"Unsupported file type: {file_extension}"


def process_pending_files():
    """
    Background task to process all files with is_processing=True.
    Extracts content and marks files as processed.
    """
    print("=" * 50)
    print("STARTING BACKGROUND FILE PROCESSING")
    print("=" * 50)
    
    try:
        # Get all files that need processing
        pending_files = File.objects.filter(is_processing=True)
        print(f"Found {pending_files.count()} files to process")
        
        for file_instance in pending_files:
            print(f"\nProcessing: {file_instance.filename}")
            try:                
                # Extract content
                content = extract_file_content(file_instance)
                
                # Update database
                file_instance.extracted_content = content
                file_instance.is_processing = False
                file_instance.save()
                
                print(f"✓ Successfully processed: {file_instance.filename}")
                
            except Exception as e:
                print(f"✗ Error processing file {file_instance.filename}: {str(e)}")
                import traceback
                traceback.print_exc()
                # Mark as not processing even if there's an error
                file_instance.is_processing = False
                file_instance.extracted_content = f"Error during processing: {str(e)}"
                file_instance.save()
        
        print(f"\n{'=' * 50}")
        print(f"COMPLETED: Processed {pending_files.count()} files")
        print("=" * 50)
        
    except Exception as e:
        print(f"✗ CRITICAL ERROR in background processing: {str(e)}")
        import traceback
        traceback.print_exc()


def start_background_processing():
    """
    Start background file processing in a separate thread.
    """
    print("🚀 Initiating background file processing thread...")
    try:
        thread = threading.Thread(target=process_pending_files, daemon=True)
        thread.start()
        print("✓ Background file processing thread started successfully")
    except Exception as e:
        print(f"✗ Failed to start background thread: {str(e)}")
        import traceback
        traceback.print_exc()
