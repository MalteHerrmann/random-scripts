import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";

async function main() {
  if (!process.env["TYPESAFE_API_KEY"]) {
    console.error("missing environment variable");
    process.exit(1);
  }

  const jevClient = new TypeSafeClient();
  const response = await jevClient.systemOne({
    // state: { document: "Hello, I want to complain about the functionality of this tool." },
    state: { document: "Hello, I want to suggest an addition to your system." },
    questions: {
      category: choice("What's the intention of this user message?", {
        billing: null,
        complains: null,
        "feature request": null,
        other: null,
      }),
      mindset: noul("Is the user in a positive or negative mindset?", {
        true: null,
        false: null
      })
    }
  })

  console.log("Chosen category:");
  console.log(response.answers.category.choice, " - ", response.answers.category.confidence);
  console.log(response.answers.mindset.type, " - ", response.answers.mindset.noul);
}

try {
  await main();
} catch (e) {
  console.error(e as string);
  process.exit(1);
}
