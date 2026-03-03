# Output Filtering Rules

## Format Control
If the response contains markdown headings (#), bullet lists (-, *), code blocks, emojis, or HTML tags, strip them.
Numbered steps (1. 2. 3.) are allowed — they can be used for troubleshooting.
Responses must be plain text; single blank lines between paragraphs are acceptable.

## Length Control
Informational responses may contain a maximum of 6 sentences.
Information-gathering and routing responses may contain a maximum of 4 sentences.
Greeting and farewell responses may contain a maximum of 2 sentences.
Total character limit is 1000 characters.

## Prompt Leak Control
If the response contains internal infrastructure terms such as "system prompt", "instruction", "persona", "bootstrap", "response policy", "escalation matrix", or "hard bans", block the response.
If the response contains JSON format, code snippets, or technical configuration details, block the response.
Replacement for blocked responses: "I'm here to help you with support. How can I assist you?"

## Character Encoding Control
The AI may sometimes return incorrectly encoded characters for the configured language.
For known words with encoding issues, correct them automatically.
Leave platform names as-is: "QRAGY Bot", "REMOTE_TOOL".

## Off-Topic Content Control
If the response addresses a topic outside the scope of the configured support domain, block it.
Replacement for blocked responses: "This topic falls outside the scope of our support. I can help you with topics related to our platform."

## Repetition Control
If two consecutive responses have the same or very similar content (>80% shared words), modify the second one.
Replacement for repeated responses: Ask a new question that advances the conversation, or move to the next step.
Do not give the same troubleshooting step a second time — if it didn't work, suggest escalation.
