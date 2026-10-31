"""Medical writing for clinicians and patients. Grounded in the clinician's own input; never prescribes."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

MEDICAL = Playbook(
    id="medical",
    name="Medical",
    group="Professional",
    summary="Patient leaflets, clinical summaries and referral letters, checked for safety and privacy.",
    notice="For a qualified clinician to review before use. It is not medical advice and does not replace clinical judgement.",
    formats=(
        Format("leaflet", "Patient information leaflet",
               "What the condition or procedure is; why it matters to the reader; what to expect; what you can do; "
               "medicines in plain terms (only those given); when to seek help urgently; where to get more help."),
        Format("summary", "Clinical or discharge summary",
               "Patient identifier placeholder; presenting complaint; history; examination and investigations; "
               "diagnosis or problems list; treatment given; medicines on discharge; follow-up plan; safety-net advice."),
        Format("referral", "Referral letter",
               "Recipient and urgency; reason for referral in one sentence; relevant history; current medicines and "
               "allergies; investigations so far; the specific question for the specialist."),
        Format("soap", "SOAP note", "Subjective; Objective; Assessment; Plan."),
        Format("article", "Health article for the public",
               "A plain question the reader has; the answer up front; the evidence in plain terms; what it means for them; "
               "red flags; sources."),
    ),
    fields=(
        Field("audience", "Reader", kind="choice", options=("Patients and families", "Clinicians"), required=True),
        Field("topic", "Condition or topic", "e.g. type 2 diabetes after diagnosis", required=True),
        Field("clinical", "Clinical details", "De-identified history, findings, medicines with doses as prescribed",
              kind="long"),
        Field("reading", "Reading level", kind="choice", options=("Simple (age 11 to 13)", "General adult", "Specialist")),
    ),
    specialists=(
        Specialist("clinical", "Clinical summarizer", "Problem-oriented summaries a colleague can act on",
                   "Lead with what changes management. Use the problem list structure, standard abbreviations expanded on "
                   "first use, times and units for every finding (mmol/L, mg, bpm). Separate what was observed from what was "
                   "inferred."),
        Specialist("medicines", "Medicines specialist", "Medicines, doses and interactions, exactly as given",
                   "Write medicines with name, dose, route, frequency and duration only as provided in the clinical details or "
                   "sources. A dose you were not given is written [verify dose with prescriber]. Note allergies and any "
                   "interaction the sources mention; never add one from memory."),
        Specialist("patient", "Patient-education writer", "Plain words people remember and act on",
                   "Second person, short sentences, one idea per paragraph, everyday words with the medical term in brackets "
                   "once. Concrete actions ('check your feet every evening'). Always a 'Get help urgently if' list of red flags "
                   "from the sources or clinical details."),
        Specialist("terms", "Medical terminology specialist", "Correct terms, coding language and definitions",
                   "Use current accepted terminology, define every term a non-specialist would not know, keep units SI unless "
                   "the details use another system."),
    ),
    reviewers=(
        Reviewer("safety", "Clinical safety reviewer", "Doses, red flags and overclaiming",
                 "Any dose, frequency or drug not present in the input or sources; missing red-flag symptoms; advice that "
                 "could delay urgent care; overclaiming certainty or cure; reading level above what was asked."),
        Reviewer("privacy", "Privacy reviewer", "Identifiers that should not be in the document",
                 "Names, dates of birth, addresses, phone numbers, hospital or record numbers, or rare details that identify "
                 "a patient. Each must become a placeholder such as [Patient ID]."),
    ),
    style="Calm, exact and kind. Numbers with units. For patients: plain words and actions. For clinicians: concise and "
          "structured.",
    safety="Never invent doses, drugs, studies, statistics or guidelines. Never diagnose or prescribe beyond the clinical "
           "details given. Every dose and every clinical claim comes from the "
           "input or the sources, otherwise mark it [verify with clinician]. Remove patient identifiers. Patient-facing text "
           "always tells the reader to contact their own clinician about their care.",
)
