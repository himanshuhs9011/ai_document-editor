"""News writing: facts first, every fact attributed, no invented quotes."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

NEWS = Playbook(
    id="news",
    name="News",
    group="Media",
    summary="Hard news, explainers and press releases written to newsroom standards, with every fact attributed.",
    formats=(
        Format("story", "News story",
               "Headline and deck; lede with who, what, when, where in under 35 words; nut graf (why it matters); "
               "supporting facts in descending importance with attribution; quotes; context and background; what happens next."),
        Format("explainer", "Explainer",
               "Headline that asks or answers the reader's question; the short answer; the background in plain terms; "
               "what is known and what is not; what to watch for."),
        Format("release", "Press release",
               "Dateline and headline; lede with the announcement; supporting detail; one quote per spokesperson (only "
               "quotes provided); boilerplate about the organisation; media contact."),
        Format("oped", "Opinion piece",
               "A clear argument in the first paragraph; three supporting points with evidence; the strongest counter-argument "
               "answered; a closing that returns to the argument."),
    ),
    fields=(
        Field("event", "What happened", "The facts, with dates, places and numbers", kind="long", required=True),
        Field("sources", "Sources and quotes", "Who said what, word for word, and documents you have", kind="long"),
        Field("outlet", "Outlet and reader", "e.g. city daily, trade newsletter for pharmacists"),
    ),
    specialists=(
        Specialist("reporter", "News writer", "Inverted pyramid and tight ledes",
                   "Lede under 35 words with the most important new fact. Attribute with 'said', placed after the name. "
                   "Numbers as given. One idea per paragraph, paragraphs of one to three sentences. No adjectives of opinion."),
        Specialist("explainer", "Explainer writer", "Complex topics made plain",
                   "Answer first, then build understanding step by step. Define terms in passing. Separate what is confirmed "
                   "from what is claimed."),
        Specialist("headline", "Headline and deck editor", "Accurate headlines people click",
                   "Headline: present tense, active verb, under 70 characters, no question unless it is an explainer, nothing "
                   "the story does not support. Deck: one sentence adding the second most important fact."),
        Specialist("columnist", "Opinion writer", "An argument with evidence",
                   "First person allowed. State the claim plainly, support it with the provided facts, concede the best "
                   "opposing point and answer it."),
    ),
    reviewers=(
        Reviewer("facts", "Fact and attribution checker", "Every fact sourced, no invented quotes",
                 "Quotes that do not appear word for word in the provided sources (must be removed); facts with no "
                 "attribution; numbers that differ from the input; names or titles not given."),
        Reviewer("standards", "Standards editor", "Fairness and neutral language",
                 "Loaded or emotive words in news copy; one side presented without the other where the facts involve a "
                 "dispute; missing right of reply; speculation presented as fact."),
    ),
    style="Newsroom style: short paragraphs, active voice, past tense for events, plain words, no hype.",
    safety="Never invent quotes, sources, names, numbers or events. If a needed fact is missing, write [TODO: confirm ...].",
)
