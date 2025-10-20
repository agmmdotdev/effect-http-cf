import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { Cause, Effect, Exit, Option } from "effect";
import { FetchHttpClient, HttpApi, HttpClient } from "@effect/platform";
type Env = {
  // Add your bindings here, e.g. Workers KV, D1, Workers AI, etc.
  CHECKOUT_WORKFLOW: Workflow;
};

// User-defined params passed to your workflow
type Params = {
  email: string;
  metadata: Record<string, string>;
};

type FileList = {
  files: ReadonlyArray<string>;
};

type CfIpsResponse = {
  result: {
    ipv4_cidrs: ReadonlyArray<string>;
    ipv6_cidrs: ReadonlyArray<string>;
  };
};

export class CheckoutWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Can access bindings on `this.env`
    // Can access params on `event.payload`
    const workflow = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "workflow.name": "checkout-workflow",
      });
      yield* Effect.log("Workflow started");
      yield* Effect.log(`Payload email=${event.payload.email}`);

      // Step 1: produce a file list
      yield* Effect.log("[STEP] Starting: my first step");
      const files = yield* Effect.tryPromise(() =>
        step.do("my first step", async (): Promise<FileList> => {
          const result: FileList = {
            files: [
              "doc_7392_rev3.pdf",
              "report_x29_final.pdf",
              "memo_2024_05_12.pdf",
              "file_089_update.pdf",
              "proj_alpha_v2.pdf",
              "data_analysis_q2.pdf",
              "notes_meeting_52.pdf",
              "summary_fy24_draft.pdf",
            ],
          };
          return result;
        })
      ).pipe(Effect.withSpan("STEP my first step"));
      yield* Effect.log(
        `[STEP] Finished: my first step - count=${files.files.length}`
      );

      // Step 2: call external API
      yield* Effect.log("[STEP] Starting: some other step");
      const step2 = yield* Effect.tryPromise(() =>
        step.do("some other step", async (): Promise<CfIpsResponse> => {
          const program = Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient;
            const response = yield* http.get(
              "https://api.cloudflare.com/client/v4/ips"
            );
            const result = yield* response.json;
            return result as CfIpsResponse;
          }).pipe(Effect.catchAll((e) => Effect.die(e.message)));
          const result = await Effect.runPromise(
            program.pipe(Effect.provide(FetchHttpClient.layer))
          );
          return result;
        })
      ).pipe(Effect.withSpan("STEP some other step"));
      yield* Effect.log(
        `[STEP] Finished: some other step - ipv4=${step2.result.ipv4_cidrs.length} ipv6=${step2.result.ipv6_cidrs.length}`
      );

      // Step 3: sleep
      yield* Effect.log("[STEP] Sleeping: wait on something (5 seconds)");
      yield* Effect.tryPromise(() =>
        step.sleep("wait on something", "5 seconds")
      ).pipe(Effect.withSpan("STEP sleep"));
      yield* Effect.log("[STEP] Finished sleeping: wait on something");

      // Step 4: a potentially failing step with retries
      yield* Effect.log(
        "[STEP] Starting: make a call to write that could maybe, just might, fail"
      );
      yield* Effect.tryPromise(() =>
        step.do(
          "make a call to write that could maybe, just might, fail",
          {
            retries: {
              limit: 5,
              delay: "5 second",
              backoff: "exponential",
            },
            timeout: "15 minutes",
          },
          async () => {
            const program = await Effect.runPromise(
              Effect.gen(function* () {
                if (Math.random() > 0.5) {
                  yield* Effect.log("API call to $STORAGE_SYSTEM failed");
                  return yield* Effect.die(
                    new Error("API call to $STORAGE_SYSTEM failed")
                  );
                }
                return "success";
              })
            );
            return program;
          }
        )
      ).pipe(Effect.withSpan("STEP maybe-fail"));
      yield* Effect.log(
        "[STEP] Finished: make a call to write that could maybe, just might, fail"
      );
    }).pipe(
      Effect.withSpan("CheckoutWorkflow.run"),
      Effect.catchAll((e) => Effect.logError(e.message))
    );

    // Ensure we wait for the Effect program to complete inside the workflow run
    await Effect.runPromise(workflow);
  }
}
