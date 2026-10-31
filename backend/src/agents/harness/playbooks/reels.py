"""Short vertical video: Reels, Shorts and TikTok scripts with a shot list, timed to the second."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

TIRED_FORMATS = (
    "'POV:' framing used as filler; 'Wait for it'; 'Nobody: ... Me: ...'; 'Here's why' with no reason given; "
    "'Things that just make sense'; 'Tell me you're X without telling me'; a trending audio with no link to the idea; "
    "text that repeats exactly what is being said"
)

REELS = Playbook(
    id="reels",
    name="Reels and shorts",
    group="Screen",
    summary="15 to 60 second vertical videos: a hook in the first three seconds, a beat-by-beat shot list, captions.",
    formats=(
        Format("reel", "Reel or short script",
               "The hook (0 to 3 s): what is seen, said and written on screen; beats with timestamps, each a shot, the line "
               "and the on-screen text; the payoff; the loop back to the start if it fits; caption and hashtags."),
        Format("series", "Series of three",
               "The series idea in one line; three scripts that each stand alone and lead to the next, each with hook, "
               "timed beats and caption."),
    ),
    fields=(
        Field("idea", "Idea", "What the viewer learns, feels or sees", kind="long", required=True),
        Field("seconds", "Length", kind="choice", options=("15 seconds", "30 seconds", "60 seconds"), required=True),
        Field("style", "Style", kind="choice", options=("Talking to camera", "Voiceover with footage", "Skit",
                                                       "Text on screen only")),
        Field("cta", "Call to action", "e.g. follow for part two, link in bio"),
    ),
    specialists=(
        Specialist("hook", "Three-second hook writer", "Stops the scroll in three seconds",
                   "The hook is visual and verbal at once: an unexpected image, action or result in the first frame, and a "
                   "line that creates a question. No logos or greetings first."),
        Specialist("director", "Shot list director", "Beat-by-beat, timed to the second",
                   "Write a table: time, shot (framing and action), spoken line, on-screen text. A change every two to three "
                   "seconds. Total time must fit the length chosen."),
        Specialist("caption", "Caption and hashtag writer", "Captions that add, not repeat",
                   "A caption that adds context the video does not say, one call to action, three to five specific hashtags."),
    ),
    reviewers=(
        Reviewer("pacing", "Pacing reviewer", "Timing and momentum",
                 "Beats that run past the chosen length; any stretch over three seconds without change; a payoff that comes "
                 "too late; on-screen text too long to read in time."),
        Reviewer("freshness", "Trend critic", "Tired formats and borrowed ideas",
                 f"Flag these unless they are subverted in a way the script makes clear: {TIRED_FORMATS}. Propose a fresher "
                 "angle drawn from the idea itself."),
    ),
    style="Spoken, punchy, visual. Every word earns its second.",
    safety=f"Avoid by default: {TIRED_FORMATS}.",
    max_sections=4,
)
