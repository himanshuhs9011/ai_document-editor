"""Tests for the agent harness's parsing and the playbook catalogue. Run from backend/: python -m unittest discover -s tests"""
import unittest

from src.agents.harness.engine import parse_issues, parse_outline, tidy_section
from src.agents.harness.house_style import scan_stock_phrases
from src.agents.harness.playbooks import PLAYBOOKS
from src.text.markdown import strip_preamble

LEGAL = PLAYBOOKS["legal"]


class PlaybookCatalogue(unittest.TestCase):
    def test_every_playbook_is_complete(self):
        for playbook in PLAYBOOKS.values():
            with self.subTest(playbook=playbook.id):
                self.assertTrue(playbook.formats and playbook.specialists and playbook.reviewers)
                self.assertTrue(any(f.required for f in playbook.fields), "needs at least one required question")
                ids = [f.id for f in playbook.fields]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertEqual(len({s.id for s in playbook.specialists}), len(playbook.specialists))
                for f in playbook.fields:
                    self.assertEqual(f.kind == "choice", bool(f.options), f.id)

    def test_public_view_hides_prompts(self):
        for playbook in PLAYBOOKS.values():
            text = str(playbook.public())
            for specialist in playbook.specialists:
                self.assertNotIn(specialist.method, text)

    def test_professional_playbooks_carry_safety_rules(self):
        for playbook_id in ("legal", "medical", "research", "news"):
            self.assertIn("invent", PLAYBOOKS[playbook_id].safety.lower())
        self.assertTrue(PLAYBOOKS["legal"].notice and PLAYBOOKS["medical"].notice)


class PlannerOutput(unittest.TestCase):
    def test_unknown_specialist_falls_back_to_the_first(self):
        plan = parse_outline('{"title": "T", "sections": [{"title": "A", "brief": "b", "specialist": "astrologer"}]}', LEGAL, "x")
        self.assertEqual(plan["sections"][0]["specialist"], LEGAL.specialists[0].id)

    def test_text_around_json_and_bad_json(self):
        self.assertEqual(parse_outline('Sure! {"title": "T", "sections": [{"title": "A"}]} done', LEGAL, "x")["title"], "T")
        self.assertEqual(len(parse_outline("not json", LEGAL, "Fallback")["sections"]), 1)

    def test_section_count_capped(self):
        sections = ",".join(f'{{"title": "S{i}"}}' for i in range(20))
        self.assertEqual(len(parse_outline(f'{{"sections": [{sections}]}}', LEGAL, "x")["sections"]), LEGAL.max_sections)


class ReviewerOutput(unittest.TestCase):
    def test_issues_are_validated(self):
        raw = ('{"issues": [{"section": 2, "severity": "HIGH", "problem": "p", "fix": "f"}, '
               '{"section": 99, "severity": "weird", "problem": "q"}, {"section": 1, "problem": ""}]}')
        issues = parse_issues(raw, section_count=3, reviewer_id="risk")
        self.assertEqual([(i["section"], i["severity"]) for i in issues], [(2, "high"), (None, "medium")])

    def test_unparseable_reply_is_no_issues(self):
        self.assertEqual(parse_issues("I think it is fine", 3, "risk"), [])


class OutputCleanup(unittest.TestCase):
    def test_preambles_removed(self):
        for opener in ("Here is the section:", "Sure! Here is your draft:", "Certainly, here's the text:"):
            self.assertEqual(strip_preamble(f"{opener}\n# Title"), "# Title")
        self.assertEqual(strip_preamble("There is a meeting."), "There is a meeting.")

    def test_section_heading_kept_once(self):
        self.assertEqual(tidy_section("Okay!\n## Fees\n\nText", "Fees"), "## Fees\n\nText")
        self.assertEqual(tidy_section("Just text", "Fees"), "## Fees\n\nJust text")

    def test_stock_phrase_scan(self):
        found = scan_stock_phrases("We delve into a seamless, robust plan. Delve again.")
        self.assertIn({"phrase": "delve", "count": 2}, found)
        self.assertIn({"phrase": "seamless", "count": 1}, found)
        self.assertEqual(scan_stock_phrases("A plain, specific sentence."), [])


if __name__ == "__main__":
    unittest.main()
