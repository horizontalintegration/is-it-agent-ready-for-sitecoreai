import type { AssistDemo } from "@/lib/rule-engine/test-fixture";
import type { Demo } from "./client";

/** Answers AI Assist requests from the demo fixture (`?demo=1`): no network, no paid calls. */
export function demoAnswers(d: AssistDemo): Demo {
  return {
    assist(req) {
      switch (req.kind) {
        case "alt": {
          const alt = d.alt[req.image.src] ?? "A photo that illustrates the article";
          return { kind: "alt", alt, sawImage: true, overLimit: false };
        }
        case "faq-answers":
          return {
            kind: "faq-answers",
            answers: req.pairs.map((p) => {
              const answer = d.faqAnswers[p.id] ?? p.answer;
              return { id: p.id, answer, inRange: answer.length >= 40 && answer.length <= 300 };
            }),
          };
        case "question-headings":
          return { kind: "question-headings", headings: d.headings.filter((h) => req.headings.includes(h.before)) };
        case "summary":
          return { kind: "summary", summary: d.summary };
      }
    },
    meta(field, key) {
      if (field === "metaDescription" && d.bulkMeta[key]) return d.bulkMeta[key];
      return d.meta[field];
    },
  };
}
