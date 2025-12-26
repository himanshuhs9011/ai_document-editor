import sqlite3

# Connect to database
conn = sqlite3.connect('documents.db')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

print("Tables in database:", [table[0] for table in tables])

# Check if documents table exists and show some data
if ('documents',) in tables:
    cursor.execute("SELECT COUNT(*) FROM documents")
    doc_count = cursor.fetchone()[0]
    print(f"Documents count: {doc_count}")
    
    if doc_count > 0:
        cursor.execute("SELECT id, filename, file_type FROM documents LIMIT 5")
        docs = cursor.fetchall()
        print("Recent documents:")
        for doc in docs:
            print(f"  - {doc[0]}: {doc[1]} ({doc[2]})")

conn.close()
