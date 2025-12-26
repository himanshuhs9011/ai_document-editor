"""
Clean up old sessions without user_id (created before authentication was added)
This will mark them as belonging to an "admin" user or delete them.
"""
import asyncio
import aiosqlite
import uuid
from datetime import datetime

DB_PATH = "data/sessions.db"

async def cleanup_sessions():
    """Clean up sessions without user_id"""
    async with aiosqlite.connect(DB_PATH) as db:
        # First, check how many sessions exist without user_id
        cursor = await db.execute("""
            SELECT COUNT(*) FROM sessions WHERE user_id IS NULL OR user_id = ''
        """)
        count = await cursor.fetchone()
        orphaned_count = count[0] if count else 0
        
        print(f"Found {orphaned_count} sessions without user_id")
        
        if orphaned_count == 0:
            print("No orphaned sessions to clean up!")
            return
        
        # Show user options
        print("\nWhat would you like to do?")
        print("1. Delete all orphaned sessions")
        print("2. Assign them to an 'admin' user")
        print("3. Cancel")
        
        choice = input("\nEnter choice (1-3): ").strip()
        
        if choice == "1":
            # Delete orphaned sessions
            await db.execute("""
                DELETE FROM sessions WHERE user_id IS NULL OR user_id = ''
            """)
            await db.commit()
            print(f"✅ Deleted {orphaned_count} orphaned sessions")
            
        elif choice == "2":
            # Create admin user if doesn't exist
            admin_id = str(uuid.uuid4())
            admin_email = "admin@localhost"
            admin_username = "admin"
            
            # Check if admin user exists
            cursor = await db.execute("""
                SELECT id FROM users WHERE email = ?
            """, (admin_email,))
            existing_admin = await cursor.fetchone()
            
            if existing_admin:
                admin_id = existing_admin[0]
                print(f"Found existing admin user: {admin_id}")
            else:
                # Create admin user (with a placeholder password hash)
                import bcrypt
                password_hash = bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                
                await db.execute("""
                    INSERT INTO users (id, email, username, password_hash, full_name, created_at, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (admin_id, admin_email, admin_username, password_hash, "Administrator", 
                      datetime.utcnow().isoformat(), 1))
                
                print(f"Created admin user: {admin_username} / admin123")
            
            # Assign orphaned sessions to admin
            await db.execute("""
                UPDATE sessions 
                SET user_id = ? 
                WHERE user_id IS NULL OR user_id = ''
            """, (admin_id,))
            
            await db.commit()
            print(f"✅ Assigned {orphaned_count} sessions to admin user")
            print(f"   Admin login: {admin_email} / admin123")
            
        else:
            print("Cancelled")
            return
        
        # Show final stats
        cursor = await db.execute("SELECT COUNT(*) FROM sessions")
        total = await cursor.fetchone()
        cursor = await db.execute("SELECT COUNT(*) FROM users")
        users = await cursor.fetchone()
        
        print(f"\n📊 Database stats:")
        print(f"   Total sessions: {total[0] if total else 0}")
        print(f"   Total users: {users[0] if users else 0}")

if __name__ == "__main__":
    print("=" * 60)
    print("Session Cleanup Tool")
    print("=" * 60)
    print("\nThis will clean up sessions created before authentication was added.")
    print("These sessions have no user_id and cannot be accessed by any user.\n")
    
    asyncio.run(cleanup_sessions())
    
    print("\n" + "=" * 60)
    print("Cleanup complete!")
    print("=" * 60)
