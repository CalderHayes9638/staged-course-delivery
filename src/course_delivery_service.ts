import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai.ts";
import { buildEducatorReport, decideCourseDelivery, type DeliveryDecision } from "./course_policy.ts";

const FLAG_KEY = "guided-course-delivery";
const decisions: DeliveryDecision[] = [];

const deliveryBody = z.object({
  learnerId: z.string().min(1),
  courseId: z.string().min(1),
  dueAt: z.string().datetime(),
  submittedAt: z.string().datetime().optional(),
}).strict();

const rolloutQuery = z.object({
  percentage: z.coerce.number().int().min(0).max(100),
  requestId: z.string().min(8),
}).strict();

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function clientStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof InfraiError && error.status >= 400 && error.status < 500) return error.status;
  return 502;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://service.local");
    if (request.method === "POST" && request.url === "/deliveries/decide") {
      const body = deliveryBody.parse(await readJson(request));
      const enabled = await infrai.flags.is_enabled(FLAG_KEY);
      const decision = decideCourseDelivery({
        learnerId: body.learnerId,
        courseId: body.courseId,
        dueAt: new Date(body.dueAt),
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : undefined,
      }, enabled, new Date());
      decisions.push(decision);
      send(response, 200, decision);
      return;
    }

    if (request.method === "GET" && request.url === "/educators/report") {
      send(response, 200, buildEducatorReport(decisions));
      return;
    }

    if (request.method === "GET" && url.pathname === "/internal/release-step") {
      const query = rolloutQuery.parse(Object.fromEntries(url.searchParams));
      await infrai.flags.rollout(FLAG_KEY, query.percentage, query.requestId);
      send(response, 200, { key: FLAG_KEY, percentage: query.percentage, applied: true });
      return;
    }

    send(response, 404, { message: "Route not found" });
  } catch (error) {
    send(response, clientStatus(error), {
      message: error instanceof Error ? error.message : "Request could not be processed",
    });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Course delivery service listening on http://localhost:${port}`));
