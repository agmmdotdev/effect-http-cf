import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
type Env = {
  // Add your bindings here, e.g. Workers KV, D1, Workers AI, etc.
  CHECKOUT_WORKFLOW: Workflow;
};

// User-defined params passed to your workflow
type Params = {
  email: string;
  metadata: Record<string, string>;
};

export class CheckoutWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Can access bindings on `this.env`
    // Can access params on `event.payload`
    console.log("event", event);

    console.log("[STEP] Starting: my first step");
    const files = await step.do("my first step", async () => {
      // Fetch a list of files from $SOME_SERVICE
      const result = {
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
      console.log("[STEP] Result for: my first step", result);
      return result;
    });
    console.log("[STEP] Finished: my first step", files);

    console.log("[STEP] Starting: some other step");
    const apiResponse = await step.do("some other step", async () => {
      let resp = await fetch("https://api.cloudflare.com/client/v4/ips");
      const result = await resp.json<any>();
      console.log("[STEP] Result for: some other step", result);
      return result;
    });
    console.log("[STEP] Finished: some other step", apiResponse);

    console.log("[STEP] Sleeping: wait on something (5 seconds)");
    await step.sleep("wait on something", "5 seconds");
    console.log("[STEP] Finished sleeping: wait on something");

    console.log(
      "[STEP] Starting: make a call to write that could maybe, just might, fail"
    );
    await step.do(
      "make a call to write that could maybe, just might, fail",
      // Define a retry strategy
      {
        retries: {
          limit: 5,
          delay: "5 second",
          backoff: "exponential",
        },
        timeout: "15 minutes",
      },
      async () => {
        // Do stuff here, with access to the state from our previous steps
        console.log(
          "[STEP] Inside: make a call to write that could maybe, just might, fail"
        );
        if (Math.random() > 0.5) {
          console.log("[STEP] Error: API call to $STORAGE_SYSTEM failed");
          throw new Error("API call to $STORAGE_SYSTEM failed");
        }
        console.log("[STEP] Success: API call to $STORAGE_SYSTEM succeeded");
      }
    );
    console.log(
      "[STEP] Finished: make a call to write that could maybe, just might, fail"
    );
  }
}
