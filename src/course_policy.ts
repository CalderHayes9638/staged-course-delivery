export type DeliveryInput = {
  learnerId: string;
  courseId: string;
  dueAt: Date;
  submittedAt?: Date;
};

export type DeliveryDecision = {
  learnerId: string;
  courseId: string;
  experience: "classic" | "guided";
  deadline: "open" | "met" | "missed";
  canOpenNextLesson: boolean;
};

export function decideCourseDelivery(
  input: DeliveryInput,
  guidedDeliveryEnabled: boolean,
  now: Date,
): DeliveryDecision {
  const deadline = input.submittedAt
    ? input.submittedAt <= input.dueAt ? "met" : "missed"
    : now <= input.dueAt ? "open" : "missed";

  return {
    learnerId: input.learnerId,
    courseId: input.courseId,
    experience: guidedDeliveryEnabled ? "guided" : "classic",
    deadline,
    canOpenNextLesson: !guidedDeliveryEnabled || deadline !== "missed",
  };
}

export function buildEducatorReport(decisions: DeliveryDecision[]) {
  return {
    learners: decisions.length,
    guided: decisions.filter((item) => item.experience === "guided").length,
    deadlinesMet: decisions.filter((item) => item.deadline === "met").length,
    deadlinesMissed: decisions.filter((item) => item.deadline === "missed").length,
    readyForNextLesson: decisions.filter((item) => item.canOpenNextLesson).length,
  };
}
