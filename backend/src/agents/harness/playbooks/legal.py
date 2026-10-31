"""Legal drafting: contracts, notices, memos and policies. Drafts for a lawyer to review, never legal advice."""
from ..playbook import Field, Format, Playbook, Reviewer, Specialist

LEGAL = Playbook(
    id="legal",
    name="Legal",
    group="Professional",
    summary="Contracts, notices, memos and policies drafted clause by clause, then checked for risk and gaps.",
    notice="A draft for a qualified lawyer in your jurisdiction to review. It is not legal advice.",
    formats=(
        Format("contract", "Contract or agreement",
               "Title and parties; recitals; definitions; operative clauses grouped by subject (scope, price and payment, "
               "term and termination, warranties, liability and indemnity, confidentiality, IP where relevant); "
               "general provisions (notices, assignment, severability, entire agreement, governing law, disputes); signature block."),
        Format("nda", "Non-disclosure agreement",
               "Parties; purpose; definition of confidential information and exclusions; obligations; permitted disclosures; "
               "term and survival; return or destruction; remedies; governing law; signatures."),
        Format("notice", "Legal notice or demand letter",
               "Sender and recipient details; date and reference; facts in numbered paragraphs; the legal basis; "
               "the specific demand with a deadline; consequences of non-compliance; reservation of rights; signature."),
        Format("memo", "Legal memo",
               "Question presented; short answer; facts; analysis issue by issue (rule, application, counter-arguments); "
               "conclusion and recommended next steps."),
        Format("policy", "Privacy policy or terms",
               "Who we are; what the policy covers; each data or rule topic as its own plain-language section; "
               "user rights and how to exercise them; changes; contact."),
    ),
    fields=(
        Field("jurisdiction", "Jurisdiction", "Country and state, e.g. India, Maharashtra", required=True),
        Field("parties", "Parties", "Names and roles, e.g. Acme Pvt Ltd (client) and R. Mehta (consultant)"),
        Field("terms", "Key terms and facts", "Price, dates, scope, what happened, what you want", kind="long", required=True),
        Field("stance", "Whose side", kind="choice", options=("Balanced", "Favour the first party", "Favour the second party")),
    ),
    specialists=(
        Specialist("clauses", "Clause drafter", "Operative clauses that say exactly who must do what, by when",
                   "Draft numbered clauses (1, 1.1, 1.1.1). Each obligation names the party, the act, the standard and the "
                   "deadline: 'The Consultant shall deliver ... by ...'. Use 'shall' only for obligations and 'may' for "
                   "permissions. Use defined terms exactly as defined, with capitals. One subject per clause; no undefined "
                   "pronouns. Put every unknown value in a [TODO: ...] placeholder."),
        Specialist("definitions", "Definitions specialist", "Defined terms and interpretation rules",
                   "Write the definitions clause in alphabetical order, each term in bold quotes with a precise meaning. "
                   "Define only terms used more than once. Add an interpretation clause (headings, singular and plural, "
                   "'including' means without limitation)."),
        Specialist("general", "General provisions specialist", "Governing law, disputes, notices and boilerplate",
                   "Draft governing law and dispute resolution for the stated jurisdiction (courts or arbitration seat as "
                   "placeholders unless given), notices with addresses as placeholders, assignment, severability, entire "
                   "agreement, amendment in writing, counterparts, force majeure where the deal needs it."),
        Specialist("plain", "Plain-language drafter", "Notices, policies and memos a non-lawyer can follow",
                   "Short sentences, numbered paragraphs, second person for policies, facts before argument in notices. "
                   "Keep legal precision: every right, deadline and consequence stated exactly."),
    ),
    reviewers=(
        Reviewer("risk", "Risk and liability reviewer", "Finds one-sided terms, gaps and ambiguity",
                 "Uncapped or missing limitation of liability; indemnities without scope; termination without notice or "
                 "consequences; obligations with no deadline or standard; terms used but never defined; clauses that "
                 "contradict each other; the stance asked for not reflected."),
        Reviewer("compliance", "Compliance checker", "Jurisdiction-specific requirements and invented law",
                 "Any statute, section number or case cited that did not come from the sources (must become [verify]); "
                 "requirements the stated jurisdiction usually imposes on this document type that are missing (flag them "
                 "for the lawyer, do not assert them as settled law); consumer or employment terms that may be unenforceable."),
    ),
    style="Formal legal register. Precise and unambiguous over elegant. Consistent defined terms. No adjectives that create "
          "obligations by accident ('promptly', 'reasonable') unless the standard is intended.",
    safety="Never present the draft as legal advice. Never invent statutes, section numbers, case names or citations: use "
           "only what the sources contain, otherwise write [verify: relevant law]. Party details you were not given stay as "
           "[TODO] placeholders.",
)
