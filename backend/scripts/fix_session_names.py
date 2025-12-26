"""
Update session names for sessions that don't have proper names
"""
import asyncio
import aiosqlite

DB_PATH = "data/sessions.db"

async def fix_session_names():
    """Fix session names that are NULL or empty"""
    async with aiosqlite.connect(DB_PATH) as db:
        # Find sessions with NULL or empty names
        cursor = await db.execute("""
            SELECT id, name, created_at FROM sessions 
            WHERE name IS NULL OR name = '' OR name LIKE 'Session 20%'
        """)
        rows = await cursor.fetchall()
        
        print(f"Found {len(rows)} sessions with missing/default names")
        
        if len(rows) == 0:
            print("✅ All sessions have proper names!")
            return
        
        # Update each session with a proper name
        for row in rows:
            session_id, old_name, created_at = row
            # Create a name based on creation date
            new_name = f"Session {created_at[:16].replace('T', ' ')}" if created_at else "Unnamed Session"
            
            await db.execute("""
                UPDATE sessions SET name = ? WHERE id = ?
            """, (new_name, session_id))
            
            print(f"  Updated: {session_id[:8]}... | Old: '{old_name}' -> New: '{new_name}'")
        
        await db.commit()
        print(f"\n✅ Updated {len(rows)} session names!")
        
        # Show final count
        cursor = await db.execute("SELECT COUNT(*) FROM sessions")
        total = await cursor.fetchone()
        print(f"📊 Total sessions: {total[0]}")

if __name__ == "__main__":
    print("=" * 60)
    print("Session Name Fixer")
    print("=" * 60)
    print()
    
    asyncio.run(fix_session_names())
    
    print()
    print("=" * 60)
    print("Done! Restart your backend server to see the changes.")
    print("=" * 60)
