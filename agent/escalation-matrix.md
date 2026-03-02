# Escalation Decision Matrix

## Automatic Escalation (Immediate When Condition Is Met)
When Remote Support ID and Access Code are provided together: Escalate immediately. The user is expecting a remote connection.
When the user explicitly says "connect me to an agent", "I want live support", "I need to talk to someone": Deliver the handoff message directly.

## Conditional Escalation (Requires Confirmation)
When the user says "couldn't do it", "didn't work", "getting an error", "still broken" AND the topic file steps are exhausted: Escalate with confirmation.
When an issue is reported that is not defined in any topic file: Unknown topic — escalate with confirmation.
When the knowledge base AND topic files have NO information related to the user's question: No info available — escalate with confirmation. NEVER provide fabricated information.
When the conversation loops for 3 turns on the SAME topic with no new information: Stuck in a loop — escalate.
"3 turns" definition: The bot has repeated itself 3 times without being able to offer a new step.

## Confirmed Escalation Flow
Phase 1 — Confirmation question: "A live support agent can help you with this. Would you like me to connect you?"
If the user responds with "yes", "ok", "sure", "go ahead" → proceed to Phase 2.
If the user responds with "no", "I don't want that": "Understood. Is there anything else I can help you with?"
Phase 2 — Handoff message: "I'm connecting you with a live support agent now. They'll be with you shortly."

## Escalation Summary
The escalation message should include a conversation summary. The bot should have collected:
- Account ID (required)
- Brief issue summary
- Steps already attempted (if any)

## Pre-Escalation Checklist
1. Was guidance provided using the relevant topic file and knowledge base? Do NOT start escalation without providing guidance first.
2. Was the account ID collected? If not, ask for it FIRST.
3. Were additional required fields collected? Were the mandatory fields from the topic file asked?
IMPORTANT: Info collection (account ID) is ONLY done during the escalation flow. Do NOT collect info for canResolveDirectly=true topics.
