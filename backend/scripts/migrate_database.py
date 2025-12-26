#!/usr/bin/env python3
"""
Database migration script to add missing columns to existing database
"""

import asyncio
import aiosqlite
import os
from pathlib import Path

async def migrate_database():
    """Migrate the existing database to add missing columns"""
    
    print("🔧 Database Migration Script")
    print("=" * 50)
    
    db_path = "data/sessions.db"
    
    if not os.path.exists(db_path):
        print(f"❌ Database {db_path} does not exist!")
        return False
    
    print(f"📋 Migrating database: {db_path}")
    
    try:
        async with aiosqlite.connect(db_path) as db:
            print("🔗 Connected to database")
            
            # Check current schema
            cursor = await db.execute("PRAGMA table_info(sessions)")
            columns = await cursor.fetchall()
            column_names = [col[1] for col in columns]
            
            print(f"📊 Current sessions table columns: {column_names}")
            
            # Add missing columns if they don't exist
            missing_columns = []
            
            if 'name' not in column_names:
                missing_columns.append(('name', 'TEXT'))
            
            if 'updated_at' not in column_names:
                missing_columns.append(('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'))
            
            if missing_columns:
                print(f"➕ Adding missing columns: {[col[0] for col in missing_columns]}")
                
                for col_name, col_type in missing_columns:
                    try:
                        await db.execute(f"ALTER TABLE sessions ADD COLUMN {col_name} {col_type}")
                        print(f"✅ Added column: {col_name}")
                    except Exception as e:
                        print(f"⚠️ Column {col_name} might already exist: {e}")
                
                await db.commit()
                print("💾 Changes committed")
            else:
                print("✅ All columns already exist")
            
            # Check messages table schema
            cursor = await db.execute("PRAGMA table_info(messages)")
            msg_columns = await cursor.fetchall()
            msg_column_names = [col[1] for col in msg_columns]
            
            print(f"📊 Current messages table columns: {msg_column_names}")
            
            # Check if messages table has the correct id type
            if 'id' in msg_column_names:
                # Check if id is TEXT (UUID) or INTEGER (autoincrement)
                cursor = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'")
                table_sql = await cursor.fetchone()
                if table_sql:
                    sql_text = table_sql[0]
                    print(f"📋 Messages table SQL: {sql_text}")
                    
                    # If id is INTEGER PRIMARY KEY AUTOINCREMENT, we need to recreate the table
                    if "INTEGER PRIMARY KEY AUTOINCREMENT" in sql_text:
                        print("🔄 Recreating messages table with TEXT id...")
                        
                        # Backup existing messages
                        cursor = await db.execute("SELECT * FROM messages")
                        existing_messages = await cursor.fetchall()
                        
                        # Drop and recreate messages table
                        await db.execute("DROP TABLE IF EXISTS messages_backup")
                        await db.execute("CREATE TABLE messages_backup AS SELECT * FROM messages")
                        await db.execute("DROP TABLE messages")
                        
                        # Create new messages table with TEXT id
                        await db.execute("""
                            CREATE TABLE messages (
                                id TEXT PRIMARY KEY,
                                session_id TEXT,
                                role TEXT,
                                content TEXT,
                                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                metadata TEXT,
                                FOREIGN KEY (session_id) REFERENCES sessions (id)
                            )
                        """)
                        
                        print("✅ Messages table recreated with TEXT id")
                        print("⚠️ Previous messages were backed up to messages_backup table")
            
            # Verify final schema
            cursor = await db.execute("PRAGMA table_info(sessions)")
            final_columns = await cursor.fetchall()
            final_column_names = [col[1] for col in final_columns]
            
            print(f"✅ Final sessions table columns: {final_column_names}")
            
            # Update any existing sessions to have names
            cursor = await db.execute("SELECT COUNT(*) FROM sessions WHERE name IS NULL OR name = ''")
            unnamed_count = (await cursor.fetchone())[0]
            
            if unnamed_count > 0:
                print(f"🏷️ Updating {unnamed_count} sessions without names...")
                await db.execute("""
                    UPDATE sessions 
                    SET name = 'Session ' || substr(created_at, 1, 16)
                    WHERE name IS NULL OR name = ''
                """)
                await db.commit()
                print("✅ Session names updated")
            
            print("🎉 Database migration completed successfully!")
            return True
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    asyncio.run(migrate_database())
