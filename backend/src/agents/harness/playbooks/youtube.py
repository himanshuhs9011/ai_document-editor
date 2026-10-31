"""Long-form YouTube scripts built for retention, without bait."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

YOUTUBE = Playbook(
    id="youtube",
    name="YouTube videos",
    group="Screen",
    summary="Video scripts with a real hook, open loops that pay off, and B-roll notes, plus honest titles.",
    formats=(
        Format("video", "Long-form video script",
               "Title options and thumbnail text; the hook (first 15 seconds); the setup (why this matters, what the viewer "
               "gets); the body in chapters, each with an open loop closed later; the payoff; a closing that points to one "
               "next video or action."),
        Format("tutorial", "Tutorial",
               "Hook showing the finished result; what you need; steps, each with what to say and what is on screen; "
               "common mistakes; recap of the result."),
        Format("essay", "Video essay",
               "A question or tension in the cold open; the argument in chapters, each built on a specific example; a "
               "turn that complicates the argument; the conclusion; the closing image."),
    ),
    fields=(
        Field("topic", "Topic", "What the video is about and the promise to the viewer", required=True),
        Field("research", "Research and key points", "Facts, examples and sources you want covered", kind="long"),
        Field("audience", "Viewer", "e.g. beginner home cooks, students preparing for the GRE"),
        Field("length", "Length", kind="choice", options=("Under 5 minutes", "8 to 12 minutes", "15 to 25 minutes")),
    ),
    specialists=(
        Specialist("hook", "Hook writer", "The first fifteen seconds",
                   "Open on the most interesting moment, result or question, never 'Hey guys, welcome back'. State what the "
                   "viewer will get and why it is worth their time within 15 seconds. No promise the video does not keep."),
        Specialist("retention", "Retention editor", "Open loops and pattern interrupts",
                   "Plant a question early and answer it late. Change something every 60 to 90 seconds: a new example, a "
                   "visual, a shift in tone. Cut anything the viewer can skip."),
        Specialist("script", "Script writer", "Spoken words and what is on screen",
                   "Write for the ear: short sentences, contractions, one idea per sentence. Mark visuals inline as "
                   "[B-ROLL: ...] and [ON SCREEN: ...]. Facts only from the research."),
        Specialist("packaging", "Title and thumbnail strategist", "Packaging that is accurate and specific",
                   "Five title options under 60 characters, each specific and true to the video. Thumbnail text under four "
                   "words, different from the title."),
    ),
    reviewers=(
        Reviewer("retention", "Retention reviewer", "Where viewers would leave",
                 "A slow or generic intro; stretches over 90 seconds with no change; loops opened and never closed; a "
                 "payoff that does not match the hook."),
        Reviewer("accuracy", "Accuracy reviewer", "Claims the research supports",
                 "Facts, numbers or claims not in the research or sources; misleading titles; overstated results."),
    ),
    style="Conversational, energetic, specific. The creator's voice, not a narrator's.",
)
