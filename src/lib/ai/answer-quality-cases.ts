import type { AnswerQualityCase } from "./answer-quality";

export const ANSWER_QUALITY_CASES: AnswerQualityCase[] = [
  {
    id: "five-day-spending-plan",
    question: "I have ₱1,005 available for dinner over five days. What is my daily limit?",
    context: [
      "Snapshot date: 2026-09-22. Currency: PHP.",
      "Accounts:",
      "- Cash Wallet (cash): ₱1,005.00.",
      "Wais-calculated metrics (use these results exactly):",
      "- Five-day dinner allowance: ₱1,005.00 ÷ 5 days = ₱201.00 per day.",
    ].join("\n"),
    expectedFacts: [
      { label: "available cash", alternatives: ["₱1,005", "PHP 1,005", "1005 available"] },
      { label: "five-day period", alternatives: ["5 days", "five days"] },
      { label: "daily allowance", alternatives: ["₱201", "PHP 201", "201 per day", "201/day"] },
    ],
    forbiddenPhrases: ["guaranteed", "₱205 per day", "₱200 per day"],
  },
  {
    id: "loan-payoff-estimate",
    question: "When will my laptop loan be paid off?",
    context: [
      "Snapshot date: 2026-09-22. Currency: PHP.",
      "Loans:",
      "- Laptop loan: ₱1,200.00 remaining; ₱100.00 monthly.",
      "Wais-calculated metrics (use these results exactly):",
      "- Laptop loan payoff estimate: ceil(₱1,200.00 ÷ ₱100.00) = 12 payment months, projected payoff September 2027.",
      "Assumption: fixed monthly payments, no interest or fees, beginning next cycle.",
    ].join("\n"),
    expectedFacts: [
      { label: "remaining loan", alternatives: ["₱1,200", "PHP 1,200", "1200 remaining"] },
      { label: "monthly payment", alternatives: ["₱100", "PHP 100", "100 monthly"] },
      {
        label: "payoff duration",
        alternatives: ["12 payment months", "12 monthly payments", "12 months"],
      },
      { label: "payoff timing", alternatives: ["September 2027", "Sep 2027"] },
      { label: "estimate qualification", alternatives: ["estimate", "assuming", "assumption"] },
    ],
    forbiddenPhrases: ["guaranteed", "includes interest", "August 2027"],
  },
  {
    id: "goal-monthly-savings",
    question: "How much must I save monthly for my emergency fund?",
    context: [
      "Snapshot date: 2026-09-22. Currency: PHP.",
      "Savings goals:",
      "- Emergency fund: ₱500.00 saved of ₱5,000.00; target June 2027.",
      "Wais-calculated metrics (use these results exactly):",
      "- Emergency fund required savings: ₱4,500.00 remaining ÷ 9 months = ₱500.00 per month.",
      "Assumption: equal monthly contributions with no growth or interest.",
    ].join("\n"),
    expectedFacts: [
      { label: "remaining goal amount", alternatives: ["₱4,500", "PHP 4,500", "4500 remaining"] },
      { label: "months remaining", alternatives: ["9 months", "nine months"] },
      { label: "monthly requirement", alternatives: ["₱500 per month", "₱500.00 per month", "PHP 500 per month"] },
      { label: "growth assumption", alternatives: ["no growth", "without growth", "no interest"] },
    ],
    forbiddenPhrases: ["guaranteed return", "₱450 per month"],
  },
  {
    id: "historical-purchase",
    question: "How much was my old SM Supermarket purchase in January 2024?",
    context: [
      "Targeted historical transaction retrieval (1 match, household-scoped):",
      "- 2024-01-15 | expense | ₱845.50 | SM Supermarket weekly shop | category Groceries | account Cash Wallet.",
      "Use this exact record and never invent an omitted transaction.",
    ].join("\n"),
    expectedFacts: [
      { label: "purchase amount", alternatives: ["₱845.50", "PHP 845.50"] },
      { label: "purchase date", alternatives: ["2024-01-15", "January 15 2024", "Jan 15 2024"] },
      { label: "merchant", alternatives: ["SM Supermarket"] },
    ],
    forbiddenPhrases: ["₱854.50", "February 2024", "credit card"],
  },
  {
    id: "missing-interest-rate",
    question: "Exactly how much interest will I pay on my laptop loan?",
    context: [
      "Snapshot date: 2026-09-22. Currency: PHP.",
      "Loans:",
      "- Laptop loan: ₱1,200.00 remaining; ₱100.00 monthly.",
      "The interest rate, compounding method, and fee schedule are not recorded in Wais.",
    ].join("\n"),
    expectedFacts: [
      { label: "missing interest rate", alternatives: ["interest rate", "rate is missing", "rate is not recorded"] },
      { label: "clarification", alternatives: ["what is the", "could you provide", "do you know", "need the"] },
    ],
    forbiddenPhrases: ["your rate is", "you will pay exactly", "guaranteed"],
  },
  {
    id: "overdraft-safety",
    question: "Can I spend ₱150 on dining tonight?",
    context: [
      "Snapshot date: 2026-09-22. Currency: PHP.",
      "Accounts:",
      "- Cash Wallet: ₱100.00 available.",
      "Upcoming essential payment:",
      "- Electricity bill: ₱80.00 due tomorrow; minimum required payment ₱80.00.",
    ].join("\n"),
    expectedFacts: [
      { label: "insufficient balance", alternatives: ["₱100", "PHP 100", "only 100"] },
      { label: "essential payment", alternatives: ["electricity", "essential payment", "bill due tomorrow"] },
      {
        label: "risk warning",
        alternatives: [
          "overdraft",
          "negative balance",
          "missed payment",
          "overdue payment",
          "late fee",
          "short of covering",
          "cannot safely afford",
          "not safely affordable",
        ],
      },
    ],
    forbiddenPhrases: ["yes you can afford", "safe to spend ₱150", "no risk"],
  },
];
