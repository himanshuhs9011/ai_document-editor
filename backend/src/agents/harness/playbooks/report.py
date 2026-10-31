"""Business and status reports: decision first, evidence second, every number traced."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

REPORT = Playbook(
    id="report",
    name="Reports",
    group="Professional",
    summary="Business, status and incident reports that lead with the decision and back every number.",
    formats=(
        Format("business", "Business report",
               "Executive summary (the decision or answer first); background; findings, one section per question; "
               "options with trade-offs; recommendation with owner, timeline and cost; appendix of data."),
        Format("status", "Status update",
               "Overall status in one line; what was done; what is next; risks and blockers with owners; decisions needed."),
        Format("incident", "Incident report",
               "Summary; impact (who, what, how long); timeline with times; root cause; what fixed it; actions to prevent "
               "a repeat, each with an owner and date."),
        Format("proposal", "Proposal",
               "The problem in the client's words; proposed approach; scope and deliverables; timeline; cost; why us; "
               "next step."),
    ),
    fields=(
        Field("audience", "Who reads it", "e.g. leadership team, client, board", required=True),
        Field("decision", "Decision or question it must answer", "e.g. should we expand to Pune in Q3?"),
        Field("data", "Facts and figures", "Numbers, dates and findings you have; nothing is invented", kind="long"),
    ),
    specialists=(
        Specialist("summary", "Executive summary writer", "The answer in the first three sentences",
                   "Bottom line up front: the conclusion, the one number that justifies it, and the decision asked for. "
                   "Under 150 words. No background in the summary."),
        Specialist("analyst", "Data analyst", "Numbers turned into findings",
                   "Use only figures from the facts or sources. Show comparisons (period on period, against target) and say "
                   "what each means in one sentence. Put three or more related figures in a Markdown table. Never round in a "
                   "way that changes the story."),
        Specialist("findings", "Findings writer", "Clear sections, one question each",
                   "Each section opens with its finding as a full-sentence heading, then the evidence, then the implication."),
        Specialist("recommendations", "Recommendations strategist", "Actions someone can own",
                   "Each recommendation: the action, the owner (role), the date, the expected effect and the cost or effort. "
                   "Rank them. Say what happens if nothing is done."),
    ),
    reviewers=(
        Reviewer("evidence", "Evidence checker", "Every claim traced to the data",
                 "Numbers or claims not present in the facts or sources; conclusions stronger than the evidence; "
                 "percentages without a base."),
        Reviewer("executive", "Executive reader", "Would a busy reader get it in thirty seconds",
                 "Is the decision clear from the first paragraph; jargon; sections that could be cut; recommendations "
                 "without owners or dates."),
    ),
    style="Direct and businesslike. Headings that state findings. Short paragraphs. Tables for comparisons.",
)
