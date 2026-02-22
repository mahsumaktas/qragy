const { createConversationState, transition, STATES } = require("../../src/services/statemachine.js");

describe("State Machine", () => {
  it("should start in welcome state", () => {
    const state = createConversationState();
    expect(state.current).toBe(STATES.WELCOME);
    expect(state.turnCount).toBe(0);
  });

  it("welcome → topic_detection on topic message", () => {
    const state = createConversationState();
    const next = transition(state, { hasTopic: true, topicId: "yazici-sorunu" });
    expect(next.current).toBe(STATES.TOPIC_DETECTION);
  });

  it("welcome → welcome on first greeting, then topic_detection on second", () => {
    let state = createConversationState();
    state = transition(state, { isGreeting: true });
    expect(state.current).toBe(STATES.WELCOME);
    state = transition(state, { isGreeting: true });
    expect(state.current).toBe(STATES.TOPIC_DETECTION);
  });

  it("topic_detection → topic_guided_support on topic confirmed", () => {
    let state = createConversationState();
    state = transition(state, { hasTopic: true, topicId: "yazici" });
    state = transition(state, { topicConfirmed: true, topicId: "yazici" });
    expect(state.current).toBe(STATES.TOPIC_GUIDED_SUPPORT);
  });

  it("topic_detection → fallback_ticket_collect after 2 turns no topic", () => {
    let state = createConversationState();
    state = { ...state, current: STATES.TOPIC_DETECTION, turnsInState: 0 };
    state = transition(state, { hasTopic: false });
    state = transition(state, { hasTopic: false });
    expect(state.current).toBe(STATES.FALLBACK_TICKET_COLLECT);
  });

  it("topic_guided_support → farewell on farewell", () => {
    let state = { ...createConversationState(), current: STATES.TOPIC_GUIDED_SUPPORT };
    const next = transition(state, { isFarewell: true });
    expect(next.current).toBe(STATES.FAREWELL);
    expect(next.farewellOffered).toBe(true);
  });

  it("topic_guided_support → escalation_handoff on request", () => {
    let state = { ...createConversationState(), current: STATES.TOPIC_GUIDED_SUPPORT };
    const next = transition(state, { escalationRequested: true });
    expect(next.current).toBe(STATES.ESCALATION_HANDOFF);
    expect(next.escalationTriggered).toBe(true);
  });

  it("topic_guided_support → topic_detection on topic drift", () => {
    let state = { ...createConversationState(), current: STATES.TOPIC_GUIDED_SUPPORT, currentTopic: "yazici" };
    const next = transition(state, { hasTopic: true, topicId: "baglanti" });
    expect(next.current).toBe(STATES.TOPIC_DETECTION);
    expect(next.topicHistory).toHaveLength(1);
    expect(next.topicHistory[0].topicId).toBe("yazici");
  });

  it("farewell → closed_followup on new message", () => {
    let state = { ...createConversationState(), current: STATES.FAREWELL, farewellOffered: true };
    const next = transition(state, { hasMessage: true });
    expect(next.current).toBe(STATES.CLOSED_FOLLOWUP);
  });

  it("closed_followup → topic_detection on new topic", () => {
    let state = { ...createConversationState(), current: STATES.CLOSED_FOLLOWUP };
    const next = transition(state, { hasTopic: true, topicId: "rapor" });
    expect(next.current).toBe(STATES.TOPIC_DETECTION);
  });

  it("info_collection → escalation_handoff after 5 turns", () => {
    let state = { ...createConversationState(), current: STATES.INFO_COLLECTION, turnsInState: 4 };
    const next = transition(state, { infoComplete: false });
    expect(next.current).toBe(STATES.ESCALATION_HANDOFF);
  });

  it("info_collection → escalation_handoff on info complete", () => {
    let state = { ...createConversationState(), current: STATES.INFO_COLLECTION };
    const next = transition(state, { infoComplete: true });
    expect(next.current).toBe(STATES.ESCALATION_HANDOFF);
    expect(next.escalationReason).toBe("info_collected");
  });

  it("should detect loop: same state 4+ turns", () => {
    let state = { ...createConversationState(), current: STATES.TOPIC_GUIDED_SUPPORT, turnsInState: 3 };
    const next = transition(state, {});
    expect(next.loopDetected).toBe(true);
  });

  it("loop should not trigger on farewell or escalation request", () => {
    let state = { ...createConversationState(), current: STATES.TOPIC_GUIDED_SUPPORT, turnsInState: 5 };
    const next = transition(state, { isFarewell: true });
    expect(next.loopDetected).toBe(false);
  });

  it("escalation_handoff → farewell on handoff complete", () => {
    let state = { ...createConversationState(), current: STATES.ESCALATION_HANDOFF };
    const next = transition(state, { handoffComplete: true });
    expect(next.current).toBe(STATES.FAREWELL);
    expect(next.handedOff).toBe(true);
  });

  it("fallback_ticket_collect → escalation on info complete", () => {
    let state = { ...createConversationState(), current: STATES.FALLBACK_TICKET_COLLECT };
    const next = transition(state, { infoComplete: true });
    expect(next.current).toBe(STATES.ESCALATION_HANDOFF);
  });
});
