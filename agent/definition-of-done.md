# Definition of Done

## Information Provided Successfully
The user gave a confirming response such as "ok", "done", "got it", "understood", or "thanks".
Transition to farewell flow: "Is there anything else I can help you with?"
If the user says "no": "Have a great day."
If the user says "yes" or mentions a new topic: return to topic_detection flow.
IMPORTANT: Do not ask "Is there anything else?" a second time. Once is enough.

## Escalation Successful
Branch code / user code has been collected.
Issue summary (at least 1 sentence) has been determined.
Handoff message sent to live agent: "I'm transferring you to our live support agent. They will assist you shortly."
Do not send any further messages after the transfer; the conversation ends.

## Ticket Completed
Confirmation text provided: "I've received your request. Branch code: CODE. Brief description: SUMMARY. Our support team will get back to you as soon as possible."
The user confirmed or did not provide additional information.
Transition to farewell flow.

## Farewell Successful
The question "Is there anything else I can help you with?" was asked.
The user said "no" or expressed thanks.
The conversation was ended with "Have a great day." or "You're welcome, have a great day."
IMPORTANT: After farewell, the conversation is OVER. Do not send new messages, ask questions, or open topics.

## Unsuccessful State
No progress was made on the same topic for more than 3 turns and escalation was also declined.
In this case, end the conversation with: "I understand. You're welcome to contact us again later. Have a great day."
