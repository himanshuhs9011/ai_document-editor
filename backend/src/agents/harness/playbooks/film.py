"""Film and TV writing that avoids the predictable: specific people, causal plots, subtext."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

CLICHES = (
    "opening on a character waking up or an alarm clock; weather that mirrors the mood; a mirror scene where a character "
    "studies their face; the chosen one or a prophecy; the wise mentor who dies to motivate the hero; a villain explaining "
    "the plan; 'we're not so different, you and I'; 'it was all a dream'; a character saying exactly what they feel "
    "('I'm so angry right now'); exposition between people who both already know it ('As you know, ...'); the slow clap; "
    "a last-second rescue by someone not set up earlier; generic names chosen by reflex (Sarah, Alex, Jake, Dr. Smith); "
    "a twist that contradicts earlier scenes instead of recontextualizing them; scenes that end because the conversation "
    "ran out rather than because something changed"
)

FILM = Playbook(
    id="film",
    name="Film and TV",
    group="Screen",
    summary="Loglines, treatments and screenplay pages with specific characters and turns nobody saw coming but everyone believes.",
    formats=(
        Format("short", "Short film screenplay",
               "Logline; characters (want, need, contradiction); then the script in scenes. Each scene a section titled by "
               "its slugline, in screenplay format: INT./EXT. LOCATION - TIME, action in present tense, CHARACTER names in "
               "capitals before dialogue."),
        Format("treatment", "Feature treatment",
               "Logline; the world and its rule; the protagonist's want and wound; act one (the change that forces a "
               "choice); act two (escalation, the midpoint reversal, the lowest point); act three (the choice that costs "
               "something); the final image."),
        Format("scene", "Single scene",
               "Who wants what in this scene; the obstacle; the scene in screenplay format; the value that turns from "
               "start to end."),
        Format("episode", "TV episode outline",
               "Logline; teaser; act breaks (each ending on a turn); A, B and C stories and where they cross; the tag."),
    ),
    fields=(
        Field("idea", "The idea", "What happens to whom, and what is at stake", kind="long", required=True),
        Field("genre", "Genre and tone", "e.g. dark comedy, grounded thriller"),
        Field("characters", "Characters", "Names, ages, what they want, what they hide", kind="long"),
        Field("world", "Setting", "Where and when, as specifically as you can"),
    ),
    specialists=(
        Specialist("premise", "Premise developer", "Loglines with irony and stakes",
                   "Logline in one sentence: a specific protagonist, the inciting event, the goal, the opposition and what "
                   "they lose if they fail, with an ironic edge (the person least suited to the task). Test: could this "
                   "story only happen to this character?"),
        Specialist("structure", "Structure architect", "Causal plotting, not formula",
                   "Every beat connects to the next with 'but' or 'therefore', never 'and then'. Each act ends on a choice, "
                   "not an accident. Use a familiar structure only where it serves the story; break it on purpose."),
        Specialist("characters", "Character designer", "People with contradictions",
                   "Give each major character a concrete want, a hidden need, a contradiction (a pacifist who keeps a gun) "
                   "and a specific way of talking. Name them for their world and background, never by reflex."),
        Specialist("scenes", "Scene writer", "Screenplay pages that move",
                   "Screenplay format. Action lines under four lines, present tense, only what the camera sees and hears. "
                   "Enter late, leave early. Every scene turns a value (safe to unsafe, trust to doubt)."),
        Specialist("dialogue", "Dialogue writer", "Subtext over statement",
                   "Characters talk around what they want. Nobody explains their feelings or the plot to someone who already "
                   "knows it. Interruptions, deflection and silence carry meaning. Each voice distinct enough to cover the names."),
    ),
    reviewers=(
        Reviewer("originality", "Originality critic", "Flags the predictable and the generic",
                 f"Flag every instance of these clichés: {CLICHES}. Also flag any beat a seasoned viewer would predict two "
                 "scenes ahead, any character who could be swapped into another film unchanged, and any line of dialogue "
                 "that could appear in a trailer for a different movie. For each, propose a specific alternative that fits "
                 "this story's world and characters."),
        Reviewer("doctor", "Script doctor", "Format, pacing and scene purpose",
                 "Screenplay format errors; scenes that do not turn a value; action lines that direct the camera or describe "
                 "what cannot be filmed; act breaks without a choice; a climax the protagonist does not cause."),
    ),
    style="Lean and visual. Concrete images and sounds. Specific over familiar every time.",
    safety=f"Avoid these by default: {CLICHES}.",
)
