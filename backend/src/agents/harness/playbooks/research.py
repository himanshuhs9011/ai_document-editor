"""Academic and research writing, grounded only in the sources the user provides."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

RESEARCH = Playbook(
    id="research",
    name="Research",
    group="Academic",
    summary="Papers, literature reviews and proposals that synthesize your sources and cite every claim.",
    notice="References come only from the documents you attach. Check each citation against the original before submitting.",
    formats=(
        Format("paper", "Research paper",
               "Title; abstract; introduction (problem, gap, contribution); related work; methods; results; discussion "
               "(meaning, limitations); conclusion; references."),
        Format("review", "Literature review",
               "Introduction and scope; themes (one section per theme, synthesizing across sources); points of agreement "
               "and conflict; gaps; conclusion; references."),
        Format("proposal", "Research proposal",
               "Title; background and gap; research questions; methodology; expected contribution; timeline; risks; "
               "references."),
        Format("abstract", "Abstract", "Background; aim; methods; results; conclusion, in one paragraph under 250 words."),
    ),
    fields=(
        Field("discipline", "Discipline", "e.g. public health, computer science", required=True),
        Field("question", "Research question", "What the work asks or argues", kind="long", required=True),
        Field("citation", "Citation style", kind="choice", options=("APA 7", "MLA 9", "Chicago", "IEEE", "Vancouver")),
        Field("methods", "Methods and data", "What was done and found, if this is your own study", kind="long"),
    ),
    specialists=(
        Specialist("synthesis", "Literature synthesizer", "Themes across sources, not one summary per paper",
                   "Group sources by theme and compare them in the same paragraph ('[1] and [3] agree that ..., while [2] ...'). "
                   "Name the gap the evidence leaves. Cite every claim as [n]."),
        Specialist("methods", "Methods writer", "Methods another researcher could repeat",
                   "Past tense, passive only where the actor does not matter. Design, participants or data, instruments, "
                   "procedure, analysis. Only what the methods field states; missing details become [TODO: ...]."),
        Specialist("discussion", "Results and discussion writer", "Claims sized to the evidence",
                   "Report results before interpreting them. Hedge in proportion to the evidence ('suggests', 'is consistent "
                   "with'). Give limitations their own paragraph."),
        Specialist("abstract", "Abstract and title writer", "The paper in 250 words",
                   "Structured abstract in one paragraph: background, aim, methods, results, conclusion. A title that states "
                   "the finding or the question, under 15 words."),
    ),
    reviewers=(
        Reviewer("citations", "Citation integrity reviewer", "No claim without a real source",
                 "Claims with no [n]; citations to numbers that do not exist in the sources; references that appear invented; "
                 "quotations not found in the sources; the requested citation style not followed in the reference list."),
        Reviewer("peer", "Peer reviewer", "What a sceptical reviewer would reject",
                 "Overclaiming; conclusions that do not follow from the results; missing limitations; unclear contribution; "
                 "logical gaps between sections."),
    ),
    style="Academic register without padding. Precise terms, defined once. Third person. Every claim supported.",
    safety="Never invent references, authors, years, DOIs or quotations. If a needed claim has no source, write [citation needed].",
    max_sections=8,
)
