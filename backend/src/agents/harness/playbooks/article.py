"""Features, essays and long-form articles for print and online publications."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

ARTICLE = Playbook(
    id="article",
    name="Articles and features",
    group="Media",
    summary="Magazine features, profiles, essays and reviews with a real angle, a scene and a reason to read on.",
    formats=(
        Format("feature", "Feature",
               "A scene or anecdote lede; the nut graf that says what the story is about and why now; sections that move "
               "the story forward, each opening on a concrete detail; a kicker that returns to the opening image."),
        Format("profile", "Profile",
               "Open on the person doing something characteristic; the tension in their story; their history where it "
               "explains the present; what others say (only provided quotes); close on a telling detail."),
        Format("essay", "Personal or critical essay",
               "A specific moment or question; the turn where the writer's thinking changes; the idea developed through "
               "examples; an ending that leaves the reader with something to carry."),
        Format("review", "Review",
               "The verdict early; what the work is in one sentence; what works and what does not, with specific moments; "
               "who it is for."),
        Format("blog", "Long-form blog post",
               "A headline that promises something specific; an opening that names the reader's problem; sections with "
               "useful headings; examples; a practical close."),
    ),
    fields=(
        Field("angle", "Angle", "The one thing this piece says that others have not", required=True),
        Field("material", "Reporting and material", "Interviews, observations, facts, your notes", kind="long"),
        Field("publication", "Publication and reader", "e.g. a Sunday magazine, a design blog for small studios"),
        Field("length", "Length", kind="choice", options=("Short (600 to 900 words)", "Medium (1,200 to 1,800 words)",
                                                         "Long (2,500 words or more)")),
    ),
    specialists=(
        Specialist("architect", "Feature architect", "Structure, nut graf and momentum",
                   "Every section earns the next: end sections on an open question or a new fact. The nut graf lands by "
                   "the fourth paragraph."),
        Specialist("lede", "Lede and kicker writer", "First and last lines people remember",
                   "Open on a specific, observed moment, never a definition, a statistic dump or a question. The kicker "
                   "echoes the lede with a changed meaning."),
        Specialist("narrative", "Narrative writer", "Scenes, detail and voice",
                   "Show through concrete detail (what was on the desk, what they said next). Vary sentence length. "
                   "Use quotes only from the material, and only the lines that reveal character."),
        Specialist("explainer", "Service writer", "Practical sections readers use",
                   "Headings that say what the reader gets, steps in order, examples from the material, no filler intros."),
    ),
    reviewers=(
        Reviewer("story", "Story editor", "Does the angle hold all the way through",
                 "A missing or late nut graf; sections that wander from the angle; a flat ending; claims about people "
                 "without material to support them."),
        Reviewer("line", "Line editor", "Clichés, padding and rhythm",
                 "Clichés and stock phrases; sentences that say nothing; repeated words; paragraphs that could be cut; "
                 "monotonous sentence length."),
    ),
    style="Magazine prose: concrete, rhythmic, confident. The writer's voice, not a brochure's.",
    safety="Never invent quotes, people or events. Material you do not have becomes [TODO: ...].",
)
