"""Social media posts written to each platform's conventions."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

SOCIAL = Playbook(
    id="social",
    name="Social media",
    group="Media",
    summary="Posts, threads and captions shaped for each platform, with a first line that earns attention honestly.",
    formats=(
        Format("linkedin", "LinkedIn post",
               "A first line that works alone above the 'see more' cut; a short story or insight in short paragraphs; "
               "one takeaway; one question or call to action; up to three hashtags."),
        Format("thread", "X / Twitter thread",
               "Post 1 states the payoff; each post one idea under 280 characters, numbered 1/, 2/; the last post sums up "
               "and gives the call to action."),
        Format("instagram", "Instagram caption and carousel",
               "Slide-by-slide text for a carousel (one idea per slide, under 25 words); then the caption: hook line, "
               "value, call to action, up to five relevant hashtags."),
        Format("newsletter", "Newsletter issue",
               "Subject line and preview text; a personal opening; the main piece; two or three short items; one call to "
               "action."),
    ),
    fields=(
        Field("message", "What you want to say", "The point, the news or the story", kind="long", required=True),
        Field("audience", "Audience", "e.g. founders of small agencies, first-year nursing students"),
        Field("goal", "Goal", kind="choice", options=("Start a conversation", "Get clicks to a link", "Build trust",
                                                     "Announce something")),
        Field("voice", "Voice", "e.g. dry and direct, warm and encouraging"),
    ),
    specialists=(
        Specialist("platform", "Platform strategist", "Each network's length, format and habits",
                   "Respect the platform: line breaks for LinkedIn, numbered posts for threads, slide text for carousels. "
                   "Hashtags only where the platform uses them, and never more than the format allows."),
        Specialist("hook", "Hook writer", "First lines that are specific, not clickbait",
                   "Lead with the most specific, surprising true thing in the message. A number, a concrete moment or a "
                   "clear claim beats a question. Never promise what the post does not deliver."),
        Specialist("writer", "Post writer", "Value in few words",
                   "Short sentences, one idea per line or post, the reader's words not the company's. No corporate filler."),
        Specialist("cta", "Call-to-action writer", "One clear next step",
                   "One action, tied to the goal, in plain words. No 'Thoughts?' unless the goal is a conversation."),
    ),
    reviewers=(
        Reviewer("audience", "Audience editor", "Would the target reader stop scrolling",
                 "A first line that is generic; jargon; posts over the platform's length; more than one call to action."),
        Reviewer("brand", "Brand safety reviewer", "Claims and tone that could backfire",
                 "Unsupported claims; engagement bait ('comment YES'); sensitive topics handled carelessly; anything that "
                 "reads as a different voice than requested."),
    ),
    style="Human, specific and brief. Write for one reader. No emoji unless the voice asks for them.",
    max_sections=6,
)
