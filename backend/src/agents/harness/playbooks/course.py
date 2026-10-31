"""Course design: outcomes first, lessons that teach, assessments that measure the outcomes."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

COURSE = Playbook(
    id="course",
    name="Courses",
    group="Learning",
    summary="Course outlines, lessons and assessments designed backwards from what learners must be able to do.",
    formats=(
        Format("outline", "Course outline",
               "Course title and who it is for; prerequisites; learning outcomes; modules in order, each with its "
               "outcomes, lessons, activities and assessment; final project; time per module."),
        Format("lesson", "Single lesson",
               "Outcome; why it matters; explanation in small steps; a worked example; guided practice; independent "
               "practice; a check for understanding with answers; summary."),
        Format("workshop", "Workshop plan",
               "Goal; agenda with timings; each block's activity, materials and facilitator notes; how participants show "
               "what they learned; follow-up."),
        Format("assessment", "Quiz or assessment",
               "The outcomes assessed; questions mapped to each outcome; answer key with explanations; a rubric for open "
               "answers."),
    ),
    fields=(
        Field("subject", "Subject", "e.g. Excel for small business owners", required=True),
        Field("learners", "Learners", "Who they are, what they already know", required=True),
        Field("outcomes", "What they should be able to do", "By the end, learners can ...", kind="long"),
        Field("delivery", "Delivery", kind="choice", options=("Self-paced video", "Live online", "In person", "Text and exercises")),
    ),
    specialists=(
        Specialist("design", "Learning designer", "Measurable outcomes and backward design",
                   "Write outcomes with observable verbs at the right level of Bloom's taxonomy (identify, apply, analyse, "
                   "create), never 'understand' or 'know'. Plan assessment before content."),
        Specialist("modules", "Module architect", "Sequence and cognitive load",
                   "Order from simple to complex, each module building on the last. One new idea at a time. Space practice "
                   "and revisit earlier ideas."),
        Specialist("lessons", "Lesson writer", "Explanations, examples and practice",
                   "Explain in small steps, then a worked example, then practice the learner does. Use examples from the "
                   "learners' own world. Anticipate the common mistake and address it."),
        Specialist("assessment", "Assessment designer", "Questions that measure the outcome",
                   "Each question maps to one outcome. Multiple choice with plausible wrong answers based on real "
                   "misconceptions. Answer key with a one-line explanation. Rubrics with clear levels."),
    ),
    reviewers=(
        Reviewer("alignment", "Alignment reviewer", "Outcomes, teaching and assessment line up",
                 "Outcomes that are never taught or never assessed; questions that test something no lesson covered; "
                 "outcomes with vague verbs; activities with no purpose."),
        Reviewer("clarity", "Clarity and accessibility reviewer", "Every learner can follow it",
                 "Jargon used before it is explained; steps skipped; examples that assume background the learners lack; "
                 "activities that exclude some learners (needs sound, colour, fine motor skills) without an alternative."),
    ),
    style="Clear and encouraging. Second person in lessons. Concrete examples.",
    max_sections=8,
)
