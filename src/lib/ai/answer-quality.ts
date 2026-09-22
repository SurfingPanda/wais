export interface ExpectedFactGroup {
  label: string;
  /** At least one phrase must appear in the answer. */
  alternatives: string[];
}

export interface AnswerQualityCase {
  id: string;
  question: string;
  context: string;
  expectedFacts: ExpectedFactGroup[];
  forbiddenPhrases: string[];
}

export interface AnswerQualityResult {
  passed: boolean;
  missingFacts: string[];
  forbiddenClaims: string[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toLocaleLowerCase()
    .replace(/[*_`#,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function evaluateAnswerQuality(
  testCase: AnswerQualityCase,
  answer: string,
): AnswerQualityResult {
  const normalizedAnswer = normalize(answer);
  const missingFacts = testCase.expectedFacts
    .filter(
      (fact) =>
        !fact.alternatives.some((alternative) => normalizedAnswer.includes(normalize(alternative))),
    )
    .map((fact) => fact.label);
  const forbiddenClaims = testCase.forbiddenPhrases.filter((phrase) =>
    normalizedAnswer.includes(normalize(phrase)),
  );

  return {
    passed: missingFacts.length === 0 && forbiddenClaims.length === 0,
    missingFacts,
    forbiddenClaims,
  };
}
