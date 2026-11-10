import { infrai } from "../src/infrai.ts";

const FLAG_KEY = "guided-course-delivery";
const serviceUrl = process.env.PUBLIC_SERVICE_URL;
if (!serviceUrl) throw new Error("Set PUBLIC_SERVICE_URL to the deployed service origin");

await infrai.flags.set(
  { key: FLAG_KEY, type: "boolean", default_value: false, enabled: true },
  "guided-course-delivery-create-v1",
);

const steps = [
  { percentage: 25, cron_expr: "0 14 1 10 *" },
  { percentage: 50, cron_expr: "0 14 3 10 *" },
  { percentage: 100, cron_expr: "0 14 7 10 *" },
];

for (const step of steps) {
  const requestId = `guided-course-delivery-${step.percentage}-v1`;
  const task = new URL("/internal/release-step", serviceUrl);
  task.searchParams.set("percentage", String(step.percentage));
  task.searchParams.set("requestId", requestId);
  const result = await infrai.cron.create(
    { cron_expr: step.cron_expr, task: task.toString() },
    requestId,
  );
  console.log({ percentage: step.percentage, jobId: result.job_id });
}
