import chromadb
from chromadb.utils import embedding_functions
import pandas as pd
import os
from pathlib import Path
from django.conf import settings

# Initialize ChromaDB client with persistent storage
CHROMA_DB_PATH = os.path.join(settings.BASE_DIR, 'storage', 'chromadb')
Path(CHROMA_DB_PATH).mkdir(parents=True, exist_ok=True)
chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

# Initialize OpenAI embedding function
openai_ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.getenv("OPENAI_API_KEY"),
    model_name="text-embedding-3-small"
)


def get_or_create_collection(collection_name="file_chunks"):
    """
    Get or create a ChromaDB collection for storing file chunks.
    Uses OpenAI's text-embedding-3-small model for embeddings.
    
    Args:
        collection_name (str): Name of the collection
        
    Returns:
        Collection: ChromaDB collection instance
    """
    try:
        collection = chroma_client.get_collection(
            name=collection_name,
            embedding_function=openai_ef
        )
    except ValueError as e:
        # If collection exists with different embedding function, delete and recreate
        if "already exists" in str(e).lower():
            print(f"⚠ Collection exists with different embedding function. Recreating with OpenAI embeddings...")
            try:
                chroma_client.delete_collection(name=collection_name)
            except:
                pass
            collection = chroma_client.create_collection(
                name=collection_name,
                embedding_function=openai_ef,
                metadata={"description": "File chunks for RAG", "embedding_model": "text-embedding-3-small"}
            )
        else:
            raise
    except Exception:
        # Collection doesn't exist, create it
        collection = chroma_client.create_collection(
            name=collection_name,
            embedding_function=openai_ef,
            metadata={"description": "File chunks for RAG", "embedding_model": "text-embedding-3-small"}
        )
    return collection


def index_csv_file(file_path, file_id, filename, user_id, folder_name=None):
    """
    Index a CSV file by creating chunks for each row and storing in ChromaDB.
    
    Args:
        file_path (str): Path to the CSV file
        file_id (str): UUID of the file in database
        filename (str): Original filename
        user_id (int): ID of the user who uploaded the file
        folder_name (str, optional): Name of the folder containing the file
        
    Returns:
        int: Number of chunks created
    """
    try:
        # Read CSV file
        df = pd.read_csv(file_path)
        
        chunks = []
        metadatas = []
        ids = []
        
        for idx, row in df.iterrows():
            # Create text chunk for this row
            chunk = f"Record {idx + 1}: "
            for col in df.columns:
                if pd.notna(row[col]):
                    chunk += f"{col} is {row[col]}. "
            
            chunks.append(chunk)
            
            # Create metadata for this chunk
            metadata = {
                'row_id': int(idx),
                'source': filename,
                'file_id': str(file_id),
                'user_id': str(user_id),
                'file_type': 'csv'
            }
            
            # Add folder name if provided
            if folder_name:
                metadata['folder_name'] = folder_name
            
            # Add first 3 columns as metadata for better filtering
            for col_idx, col in enumerate(df.columns[:3]):
                if pd.notna(row[col]):
                    metadata[col] = str(row[col])
            
            metadatas.append(metadata)
            ids.append(f"{file_id}_row_{idx}")
        
        # Store in ChromaDB
        collection = get_or_create_collection()
        if chunks:
            collection.add(
                documents=chunks,
                metadatas=metadatas,
                ids=ids
            )
        
        print(f"✓ Indexed {len(chunks)} chunks from CSV file: {filename}")
        return len(chunks)
        
    except Exception as e:
        print(f"✗ Error indexing CSV file {filename}: {str(e)}")
        raise


def index_xlsx_file(file_path, file_id, filename, user_id, folder_name=None):
    """
    Index an XLSX file by creating chunks for each row across all sheets.
    
    Args:
        file_path (str): Path to the XLSX file
        file_id (str): UUID of the file in database
        filename (str): Original filename
        user_id (int): ID of the user who uploaded the file
        folder_name (str, optional): Name of the folder containing the file
        
    Returns:
        int: Number of chunks created
    """
    try:
        # Read all sheets from XLSX file
        xlsx_file = pd.ExcelFile(file_path)
        
        total_chunks = 0
        all_chunks = []
        all_metadatas = []
        all_ids = []
        
        for sheet_name in xlsx_file.sheet_names:
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            
            for idx, row in df.iterrows():
                # Create text chunk for this row
                chunk = f"Record {idx + 1}"
                if len(xlsx_file.sheet_names) > 1:
                    chunk += f" (Sheet: {sheet_name})"
                chunk += ": "
                
                for col in df.columns:
                    if pd.notna(row[col]):
                        chunk += f"{col} is {row[col]}. "
                
                all_chunks.append(chunk)
                
                # Create metadata for this chunk
                metadata = {
                    'row_id': int(idx),
                    'source': filename,
                    'sheet_name': sheet_name,
                    'file_id': str(file_id),
                    'user_id': str(user_id),
                    'file_type': 'xlsx'
                }
                
                # Add folder name if provided
                if folder_name:
                    metadata['folder_name'] = folder_name
                
                # Add first 3 columns as metadata for better filtering
                for col_idx, col in enumerate(df.columns[:3]):
                    if pd.notna(row[col]):
                        metadata[col] = str(row[col])
                
                all_metadatas.append(metadata)
                all_ids.append(f"{file_id}_sheet_{sheet_name}_row_{idx}")
                total_chunks += 1
        
        # Store all chunks in ChromaDB
        collection = get_or_create_collection()
        if all_chunks:
            collection.add(
                documents=all_chunks,
                metadatas=all_metadatas,
                ids=all_ids
            )
        
        print(f"✓ Indexed {total_chunks} chunks from XLSX file: {filename}")
        return total_chunks
        
    except Exception as e:
        print(f"✗ Error indexing XLSX file {filename}: {str(e)}")
        raise


def index_file(file_path, file_id, filename, user_id, folder_name=None):
    """
    Index a file in ChromaDB based on its type.
    
    Args:
        file_path (str): Path to the file
        file_id (str): UUID of the file in database
        filename (str): Original filename
        user_id (int): ID of the user who uploaded the file
        folder_name (str, optional): Name of the folder containing the file
        
    Returns:
        int: Number of chunks created
    """
    file_extension = os.path.splitext(filename)[1].lower()
    
    if file_extension == '.csv':
        return index_csv_file(file_path, file_id, filename, user_id, folder_name)
    elif file_extension in ['.xlsx', '.xls']:
        return index_xlsx_file(file_path, file_id, filename, user_id, folder_name)
    else:
        raise ValueError(f"Unsupported file type for indexing: {file_extension}")


def query_rag(query, filename=None, user_id=None, n_results=5, search_type='query'):
    """
    Query the RAG system to retrieve relevant chunks.
    
    Args:
        query (str): The search query
        filename (str, optional): Filter by specific filename
        user_id (int, optional): Filter by user ID to isolate user data
        n_results (int): Number of results to return (default: 5, ignored for identifier search)
        search_type (str): Type of search - 'identifier' for exact text matching (IDs, codes) - returns only top 1,
                          'query' for semantic search (default: 'query') - returns n_results
        
    Returns:
        dict: Query results with documents, metadatas, and distances (distances only for 'query' type)
    """
    try:
        collection = get_or_create_collection()
        
        # Build where clause for filtering with proper ChromaDB syntax
        where_clause = None
        conditions = []
        
        if user_id is not None:
            conditions.append({'user_id': str(user_id)})
        if filename is not None:
            conditions.append({'source': filename})
        
        # ChromaDB requires $and operator for multiple conditions
        if len(conditions) == 1:
            where_clause = conditions[0]
        elif len(conditions) > 1:
            where_clause = {'$and': conditions}
        
        # Use different search methods based on search_type
        if search_type == 'identifier':
            # Use ChromaDB's native text search for exact matching
            # Build combined where clause that includes document text matching
            where_document_clause = {"$contains": query}
            
            # Use get() for text-based filtering
            results = collection.get(
                where=where_clause,
                where_document=where_document_clause,
                limit=1  # Only return top 1 result for identifiers
            )
            
            # Format results to match expected output structure
            # Note: get() doesn't return distances, only query() does
            return {
                'documents': results['documents'] if results['documents'] else [],
                'metadatas': results['metadatas'] if results['metadatas'] else [],
                'distances': []  # No distances for text-based search
            }
        else:
            # Use semantic search for 'query' type
            results = collection.query(
                query_texts=[query],
                n_results=n_results,
                where=where_clause
            )
            
            # Extract and format results
            return {
                'documents': results['documents'][0] if results['documents'] else [],
                'metadatas': results['metadatas'][0] if results['metadatas'] else [],
                'distances': results['distances'][0] if results['distances'] else []
            }
        
    except Exception as e:
        print(f"✗ Error querying RAG: {str(e)}")
        return {
            'documents': [],
            'metadatas': [],
            'distances': [],
            'error': str(e)
        }


def delete_file_chunks(file_id):
    """
    Delete all chunks associated with a specific file.
    
    Args:
        file_id (str): UUID of the file to delete chunks for
    """
    try:
        collection = get_or_create_collection()
        
        # Delete all chunks with this file_id
        collection.delete(
            where={"file_id": str(file_id)}
        )
        
        print(f"✓ Deleted chunks for file: {file_id}")
        
    except Exception as e:
        print(f"✗ Error deleting file chunks: {str(e)}")


def get_user_files(user_id):
    """
    Get list of unique filenames for a specific user.
    
    Args:
        user_id (int): User ID
        
    Returns:
        list: List of unique filenames
    """
    try:
        collection = get_or_create_collection()
        
        # Get all chunks for this user
        results = collection.get(
            where={"user_id": str(user_id)},
            include=["metadatas"]
        )
        
        # Extract unique filenames
        filenames = set()
        if results and results.get('metadatas'):
            for metadata in results['metadatas']:
                if 'source' in metadata:
                    filenames.add(metadata['source'])
        
        return sorted(list(filenames))
        
    except Exception as e:
        print(f"✗ Error getting user files: {str(e)}")
        return []


def update_file_metadata(file_id, new_filename):
    """
    Update the filename in metadata for all chunks of a file.
    
    Args:
        file_id (str): UUID of the file
        new_filename (str): New filename to set
    """
    try:
        collection = get_or_create_collection()
        
        # Get all chunks for this file
        results = collection.get(
            where={"file_id": str(file_id)},
            include=["metadatas"]
        )
        
        if results and results.get('ids'):
            # Update each chunk's metadata
            for idx, chunk_id in enumerate(results['ids']):
                metadata = results['metadatas'][idx]
                metadata['source'] = new_filename
                
                # Update the chunk with new metadata
                collection.update(
                    ids=[chunk_id],
                    metadatas=[metadata]
                )
        
        print(f"✓ Updated filename metadata for file: {file_id}")
        
    except Exception as e:
        print(f"✗ Error updating file metadata: {str(e)}")
        raise


def update_folder_metadata(old_folder_name, new_folder_name, user_id):
    """
    Update the folder name in metadata for all chunks in a folder.
    
    Args:
        old_folder_name (str): Current folder name
        new_folder_name (str): New folder name
        user_id (int): User ID to scope the update
    """
    try:
        collection = get_or_create_collection()
        
        # Get all chunks for this folder
        results = collection.get(
            where={
                "$and": [
                    {"user_id": str(user_id)},
                    {"folder_name": old_folder_name}
                ]
            },
            include=["metadatas"]
        )
        
        if results and results.get('ids'):
            # Update each chunk's metadata
            for idx, chunk_id in enumerate(results['ids']):
                metadata = results['metadatas'][idx]
                metadata['folder_name'] = new_folder_name
                
                # Update the chunk with new metadata
                collection.update(
                    ids=[chunk_id],
                    metadatas=[metadata]
                )
        
        print(f"✓ Updated folder metadata from '{old_folder_name}' to '{new_folder_name}'")
        
    except Exception as e:
        print(f"✗ Error updating folder metadata: {str(e)}")
        raise


def delete_folder_chunks(folder_name, user_id):
    """
    Delete all chunks associated with files in a specific folder.
    
    Args:
        folder_name (str): Name of the folder
        user_id (int): User ID to scope the deletion
    """
    try:
        collection = get_or_create_collection()
        
        # Delete all chunks with this folder_name and user_id
        collection.delete(
            where={
                "$and": [
                    {"user_id": str(user_id)},
                    {"folder_name": folder_name}
                ]
            }
        )
        
        print(f"✓ Deleted chunks for folder: {folder_name}")
        
    except Exception as e:
        print(f"✗ Error deleting folder chunks: {str(e)}")
