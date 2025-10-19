import { Console, Effect, Either, pipe, Schema as S } from "effect";
import { HttpApp, HttpRouter, HttpServerResponse } from "@effect/platform";
export { CheckoutWorkflow } from "./workflow/test";
import { env } from "cloudflare:workers";
import { WebSdk } from "@effect/opentelemetry";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { JsonConsoleSpanExporter } from "./telemetry/JsonConsoleSpanExporter";

const WebSdkLive = WebSdk.layer(() => ({
  resource: { serviceName: "medusa-effect-hono" },
  // Export span data to the console as structured JSON
  spanProcessor: new SimpleSpanProcessor(new JsonConsoleSpanExporter()),
}));
// Minimal bindings interface to keep env strongly typed without using any/unknown
interface Env {}

// Define Effect Http routes
const router = HttpRouter.empty;

// Convert router to an HttpApp and then to a Web Fetch handler
class CloudflareWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudflareWorkflowError";
  }
}

const app = router.pipe(
  HttpRouter.get(
    "/",
    HttpServerResponse.text("Hello World").pipe(Effect.withSpan("GET /"))
  ),
  HttpRouter.get(
    "/todo/:id",
    Effect.gen(function* () {
      const { id } = yield* HttpRouter.schemaPathParams(
        S.Struct({ id: S.NumberFromString })
      );
      return yield* HttpServerResponse.text(`Todo ${id}`);
    }).pipe(Effect.withSpan("GET /todo/:id"))
  ),
  HttpRouter.get(
    "/workflow",
    Effect.gen(function* () {
      yield* Effect.log("Creating workflow");
      if (Math.random() > 0.5) {
        return yield* Effect.fail(new Error("Error creating workflow"));
      }
      const workflow =
        yield *
        Effect.tryPromise(async () => {
          return env.CHECKOUT_WORKFLOW.create();
        }).pipe(
          Effect.map((workflow) => Either.right(`Workflow ${workflow.id}`)),
          Effect.tapError((e) =>
            Console.log(`Error creatingworkflow: ${e.toString()}`)
          ),
          Effect.catchAll((e) =>
            Effect.gen(function* () {
              yield* Console.log(`Error creating workflow: ${e.toString()}`);
              return Either.left(new CloudflareWorkflowError(e.toString()));
            })
          )
        );
      return yield* Either.match(workflow, {
        onRight: (value) => HttpServerResponse.text(value),
        onLeft: (error) =>
          HttpServerResponse.json({ error: error.toString() }, { status: 500 }),
      });
    }).pipe(
      Effect.tapError((e) =>
        Console.log(`Error creating workflow: ${e.toString()}`)
      ),
      Effect.catchAll((e) => {
        return HttpServerResponse.json(
          { error: e.toString() },
          { status: 500 }
        );
      }),
      Effect.withSpan("GET /workflow")
    )
  ),
  HttpRouter.all("*", HttpServerResponse.empty({ status: 404 })),
  HttpRouter.catchAll((e) => {
    console.log(e);
    return HttpServerResponse.empty({ status: 400 });
  })
);

const { handler } = HttpApp.toWebHandlerLayer(app, WebSdkLive);

export default {
  async fetch(request: Request) {
    return await handler(request);
  },
};
