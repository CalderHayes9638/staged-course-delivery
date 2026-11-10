import assert from "node:assert/strict";
import test from "node:test";
import { buildEducatorReport, decideCourseDelivery } from "../src/course_policy.ts";

test("guided delivery blocks a missed deadline and reports it to the educator", () => {
  const decision = decideCourseDelivery({
    learnerId: "learner-17",
    courseId: "geometry-101",
    dueAt: new Date("2026-10-01T12:00:00Z"),
  }, true, new Date("2026-10-02T09:00:00Z"));

  assert.deepEqual(decision, {
    learnerId: "learner-17",
    courseId: "geometry-101",
    experience: "guided",
    deadline: "missed",
    canOpenNextLesson: false,
  });
  assert.deepEqual(buildEducatorReport([decision]), {
    learners: 1,
    guided: 1,
    deadlinesMet: 0,
    deadlinesMissed: 1,
    readyForNextLesson: 0,
  });
});
