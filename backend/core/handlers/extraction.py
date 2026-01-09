import csv
import os
import threading
from django.conf import settings
from core.models import File
from openpyxl import load_workbook


class FileExtractor:
    """
    A class to handle extraction and conversion of various file types to markdown format.
    Supports CSV, XLSX, and can be extended for PDF, PPT, images, etc.
    """
    
    def __init__(self, file_path, filename):
        """
        Initialize the FileExtractor.
        
        Args:
            file_path: Path to the file to extract
            filename: Original filename (used to determine file type)
        """
        self.file_path = file_path
        self.filename = filename
        self.file_extension = os.path.splitext(filename)[1].lower()
    
    def extract(self):
        """
        Main extraction method that routes to appropriate converter based on file type.
        
        Returns:
            Markdown formatted string representation of the file content
        """
        try:
            if self.file_extension == '.csv':
                return self.csv_to_md()
            elif self.file_extension in ['.xlsx', '.xls']:
                return self.xlsx_to_md()
            # Future file types can be added here:
            # elif self.file_extension == '.pdf':
            #     return self.pdf_to_md()
            # elif self.file_extension in ['.ppt', '.pptx']:
            #     return self.ppt_to_md()
            # elif self.file_extension in ['.png', '.jpg', '.jpeg']:
            #     return self.image_to_md()
            else:
                return f"Unsupported file type: {self.file_extension}"
        except Exception as e:
            return f"Error extracting {self.file_extension}: {str(e)}"
    
    def csv_to_md(self):
        """
        Convert CSV file to markdown table format.
        
        Returns:
            Markdown formatted string representation of the CSV
        """
        try:
            with open(self.file_path, 'r', encoding='utf-8') as csvfile:
                reader = csv.reader(csvfile)
                rows = list(reader)
                
                if not rows:
                    return "Empty CSV file"
                
                # Build markdown table
                markdown_lines = []
                
                # Header row
                if len(rows) > 0:
                    header = rows[0]
                    # Replace newlines with HTML line breaks to prevent table breaking
                    header = [cell.replace('\r\n', '<br>').replace('\n', '<br>').replace('\r', '<br>') for cell in header]
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
                    # Replace newlines with HTML line breaks to prevent table breaking
                    row = [cell.replace('\r\n', '<br>').replace('\n', '<br>').replace('\r', '<br>') for cell in row]
                    markdown_lines.append('| ' + ' | '.join(row) + ' |')
                
                return '\n'.join(markdown_lines)
                
        except Exception as e:
            raise Exception(f"CSV extraction failed: {str(e)}")
    
    def xlsx_to_md(self):
        """
        Convert XLSX file to markdown table format.
        Calculates all formulas and displays them as text.
        If there are multiple sheets, they are combined with sheet names as headings.
        
        Returns:
            Markdown formatted string representation of the XLSX
        """
        try:
            workbook = load_workbook(self.file_path, data_only=True)
            markdown_sections = []
            
            for sheet_name in workbook.sheetnames:
                sheet = workbook[sheet_name]
                
                # Add sheet name as heading for multiple sheets
                if len(workbook.sheetnames) > 1:
                    markdown_sections.append(f"## {sheet_name}\n")
                
                # Get all rows with data
                rows = []
                for row in sheet.iter_rows(values_only=True):
                    # Convert all cells to strings, handling None values and newlines
                    row_data = [str(cell).replace('\r\n', '<br>').replace('\n', '<br>').replace('\r', '<br>') if cell is not None else '' for cell in row]
                    # Skip completely empty rows
                    if any(cell for cell in row_data):
                        rows.append(row_data)
                
                if not rows:
                    markdown_sections.append("*Empty sheet*\n")
                    continue
                
                # Determine the maximum number of columns
                max_cols = max(len(row) for row in rows) if rows else 0
                
                # Normalize all rows to have the same number of columns
                for i in range(len(rows)):
                    if len(rows[i]) < max_cols:
                        rows[i] = rows[i] + [''] * (max_cols - len(rows[i]))
                
                # Build markdown table
                markdown_lines = []
                
                if rows:
                    # First row as header
                    header = rows[0]
                    # Escape pipe characters in cells
                    header = [cell.replace('|', '\\|') for cell in header]
                    markdown_lines.append('| ' + ' | '.join(header) + ' |')
                    markdown_lines.append('| ' + ' | '.join(['---'] * len(header)) + ' |')
                    
                    # Data rows
                    for row in rows[1:]:
                        # Escape pipe characters in cells
                        row = [cell.replace('|', '\\|') for cell in row]
                        markdown_lines.append('| ' + ' | '.join(row) + ' |')
                
                markdown_sections.append('\n'.join(markdown_lines))
            
            # Join all sections with double newlines
            return '\n\n'.join(markdown_sections)
            
        except Exception as e:
            raise Exception(f"XLSX extraction failed: {str(e)}")
    
    # Placeholder methods for future file type support
    # def pdf_to_md(self):
    #     """Convert PDF file to markdown format."""
    #     pass
    
    # def ppt_to_md(self):
    #     """Convert PowerPoint file to markdown format."""
    #     pass
    
    # def image_to_md(self):
    #     """Convert image file to markdown format (with OCR or description)."""
    #     pass


def extract_file_content(file_instance):
    """
    Extract content from a file based on its type using FileExtractor class.
    
    Args:
        file_instance: File model instance
        
    Returns:
        Extracted content as markdown string
    """
    extractor = FileExtractor(file_instance.file.path, file_instance.filename)
    return extractor.extract()


def process_pending_files():
    """
    Background task to process all files with is_processing=True.
    Extracts content, indexes in ChromaDB (for CSV/XLSX), and marks files as processed.
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
                # Extract content (keep for backward compatibility)
                content = extract_file_content(file_instance)
                
                # Update database with extracted content
                file_instance.extracted_content = content
                
                # Index file in ChromaDB for RAG (CSV and XLSX only)
                file_extension = os.path.splitext(file_instance.filename)[1].lower()
                if file_extension in ['.csv', '.xlsx', '.xls']:
                    try:
                        from core.handlers.knowledge import index_file, delete_file_chunks
                        
                        # Delete old chunks first (in case of re-indexing)
                        # This prevents duplicate ID errors
                        print(f"Removing old chunks for file: {file_instance.filename}")
                        delete_file_chunks(str(file_instance.uuid))
                        
                        # Index the file
                        user_id = file_instance.document.user.id
                        num_chunks = index_file(
                            file_path=file_instance.file.path,
                            file_id=str(file_instance.uuid),
                            filename=file_instance.filename,
                            user_id=user_id
                        )
                        print(f"✓ Indexed {num_chunks} chunks in ChromaDB")
                    except Exception as index_error:
                        print(f"✗ Error indexing in ChromaDB: {str(index_error)}")
                        # Don't fail the whole process if indexing fails
                
                # Mark as processed
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
