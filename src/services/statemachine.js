const STATES = {
  WELCOME: "welcome_or_greet",
  TOPIC_DETECTION: "topic_detection",
  TOPIC_GUIDED_SUPPORT: "topic_guided_support",
  INFO_COLLECTION: "info_collection",
  ESCALATION_HANDOFF: "escalation_handoff",
  FAREWELL: "farewell",
  FALLBACK_TICKET_COLLECT: "fallback_ticket_collect",
  CLOSED_FOLLOWUP: "closed_followup",
};

const MAX_GREETING_TURNS = 2;
const MAX_TOPIC_DETECTION_TURNS = 2;
const MAX_INFO_COLLECTION_TURNS = 5;
const LOOP_THRESHOLD = 4;

function createConversationState() {
  return {
    current: STATES.WELCOME,
    turnCount: 0,
    turnsInState: 0,
    currentTopic: null,
    topicConfidence: 0,
    collectedInfo: {},
    topicHistory: [],
    escalationTriggered: false,
    escalationReason: null,
    farewellOffered: false,
    handedOff: false,
    loopDetected: false,
    sentimentHistory: [],
  };
}

function transition(state, event) {
  const next = {
    ...state,
    turnCount: state.turnCount + 1,
    turnsInState: state.turnsInState + 1,
    loopDetected: false,
    topicHistory: [...(state.topicHistory || [])],
  };

  // Loop detection
  if (next.turnsInState >= LOOP_THRESHOLD && !event.isFarewell && !event.escalationRequested) {
    next.loopDetected = true;
  }

  switch (state.current) {
    case STATES.WELCOME:
      if (event.hasTopic) {
        next.current = STATES.TOPIC_DETECTION;
        next.turnsInState = 0;
      } else if (event.isGreeting && state.turnsInState < MAX_GREETING_TURNS - 1) {
        next.current = STATES.WELCOME;
      } else {
        next.current = STATES.TOPIC_DETECTION;
        next.turnsInState = 0;
      }
      break;

    case STATES.TOPIC_DETECTION:
      if (event.topicConfirmed || (event.hasTopic && event.topicId)) {
        next.current = STATES.TOPIC_GUIDED_SUPPORT;
        next.currentTopic = event.topicId;
        next.topicConfidence = event.topicConfidence || 0.9;
        next.turnsInState = 0;
      } else if (state.turnsInState >= MAX_TOPIC_DETECTION_TURNS - 1) {
        next.current = STATES.FALLBACK_TICKET_COLLECT;
        next.turnsInState = 0;
      }
      break;

    case STATES.TOPIC_GUIDED_SUPPORT:
      if (event.isFarewell) {
        next.current = STATES.FAREWELL;
        next.farewellOffered = true;
        next.turnsInState = 0;
      } else if (event.escalationRequested || next.loopDetected) {
        next.current = STATES.ESCALATION_HANDOFF;
        next.escalationTriggered = true;
        next.escalationReason = event.escalationReason || (next.loopDetected ? "loop_detected" : "user_request");
        next.turnsInState = 0;
      } else if (event.hasTopic && event.topicId && event.topicId !== state.currentTopic) {
        next.topicHistory = [
          ...next.topicHistory,
          { topicId: state.currentTopic, turnsSpent: state.turnsInState, timestamp: Date.now() },
        ];
        next.current = STATES.TOPIC_DETECTION;
        next.currentTopic = null;
        next.turnsInState = 0;
      } else if (event.needsInfoCollection) {
        next.current = STATES.INFO_COLLECTION;
        next.turnsInState = 0;
      }
      break;

    case STATES.INFO_COLLECTION:
      if (event.infoComplete) {
        next.current = STATES.ESCALATION_HANDOFF;
        next.escalationTriggered = true;
        next.escalationReason = "info_collected";
        next.turnsInState = 0;
      } else if (state.turnsInState >= MAX_INFO_COLLECTION_TURNS - 1) {
        next.current = STATES.ESCALATION_HANDOFF;
        next.escalationTriggered = true;
        next.escalationReason = "max_info_turns_exceeded";
        next.turnsInState = 0;
      }
      break;

    case STATES.ESCALATION_HANDOFF:
      if (event.handoffComplete) {
        next.current = STATES.FAREWELL;
        next.handedOff = true;
        next.farewellOffered = true;
        next.turnsInState = 0;
      }
      break;

    case STATES.FAREWELL:
      if (event.hasMessage) {
        next.current = STATES.CLOSED_FOLLOWUP;
        next.turnsInState = 0;
      }
      break;

    case STATES.CLOSED_FOLLOWUP:
      if (event.hasTopic) {
        next.current = STATES.TOPIC_DETECTION;
        next.turnsInState = 0;
        next.farewellOffered = false;
      }
      break;

    case STATES.FALLBACK_TICKET_COLLECT:
      if (event.infoComplete || event.escalationRequested) {
        next.current = STATES.ESCALATION_HANDOFF;
        next.escalationTriggered = true;
        next.escalationReason = event.escalationReason || "fallback_ticket";
        next.turnsInState = 0;
      }
      break;
  }

  return next;
}

module.exports = { STATES, createConversationState, transition, MAX_GREETING_TURNS, MAX_TOPIC_DETECTION_TURNS, MAX_INFO_COLLECTION_TURNS, LOOP_THRESHOLD };
