"""The desktop app's SQLite storage runs the same query modules as Postgres and returns the same shapes."""
import asyncio
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from src.db import database, documents, messages, sessions


class SQLiteStorage(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        asyncio.run(database.connect(f"sqlite:///{Path(self.folder.name) / 'nested' / 'app.db'}"))

    def tearDown(self):
        asyncio.run(database.close())
        self.folder.cleanup()

    def test_translation(self):
        query, params = database.translate(
            "SELECT left(text, $2) FROM documents WHERE id = ANY($1::text[]) AND updated_at < now()", (["a", "b"], 5))
        self.assertEqual(query, "SELECT substr(text, 1, ?2) FROM documents WHERE id IN (SELECT value FROM json_each(?1))"
                                f" AND updated_at < {database.SQLITE_NOW}")
        self.assertEqual(params, ['["a", "b"]', 5])

    def test_sessions_messages_and_documents(self):
        async def scenario():
            first = await sessions.create("First", "user-1")
            second = await sessions.create("Second", "user-1")
            await sessions.create("Someone else's", "user-2")
            self.assertIsInstance(first["created_at"], str)
            self.assertTrue(first["created_at"].endswith("+00:00"), first["created_at"])
            self.assertEqual(first["metadata"], {})

            await messages.add(first["id"], "user", "hello")
            await messages.add(first["id"], "assistant", "hi there")
            history = await messages.list_for_session(first["id"])
            self.assertEqual([m["content"] for m in history], ["hello", "hi there"])
            listed = await sessions.list_for_user("user-1")
            self.assertEqual([s["name"] for s in listed], ["First", "Second"], "a new message moves its session first")

            await documents.insert("doc-1", "user-1", "brief.docx", "docx", 2, "Budget is 42.", "<p>Budget is 42.</p>",
                                   {"source": "upload"})
            await sessions.attach_document(first["id"], "doc-1")
            stored = await documents.get("doc-1")
            self.assertEqual(stored["metadata"], {"source": "upload"})
            self.assertEqual(stored["content"], "<p>Budget is 42.</p>")
            await documents.update_content("doc-1", "Budget is 43.", "<p>Budget is 43.</p>")
            self.assertEqual((await documents.index_state("doc-1"))["text"], "Budget is 43.")
            self.assertEqual(await documents.owner("doc-1"), "user-1")
            self.assertEqual(await documents.owned_ids("user-1", ["doc-1", "missing"], 10), ["doc-1"])
            self.assertEqual(await documents.owned_ids("user-2", ["doc-1"], 10), [])
            self.assertEqual(await documents.owned_ids("user-1", None, 10), ["doc-1"])
            self.assertEqual((await documents.excerpts(["doc-1"], 6))[0]["excerpt"], "Budget")
            self.assertEqual((await documents.texts(["doc-1"], 100))[0]["text"], "Budget is 43.")
            self.assertEqual((await documents.list_for_user("user-1"))[0]["characters"], 13)

            await sessions.rename(second["id"], "Renamed")
            self.assertEqual((await sessions.get_owned(second["id"], "user-1"))["name"], "Renamed")
            self.assertIsNone(await sessions.get_owned(second["id"], "user-2"))

            await sessions.delete(first["id"])
            self.assertEqual(await messages.list_for_session(first["id"]), [], "messages go with their session")
            self.assertIsNone(await documents.get("doc-1"), "an unshared document goes with its session")
            self.assertEqual([s["name"] for s in await sessions.list_for_user("user-1")], ["Renamed"])
        asyncio.run(scenario())

    def test_timestamps_have_milliseconds(self):
        async def scenario():
            session = await sessions.create("Order", "u")
            for index in range(5):
                await messages.add(session["id"], "user", str(index))
            history = await messages.list_for_session(session["id"])
            self.assertEqual([m["content"] for m in history], ["0", "1", "2", "3", "4"])
            self.assertIsInstance(datetime.fromisoformat(history[0]["timestamp"]), datetime)
        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
