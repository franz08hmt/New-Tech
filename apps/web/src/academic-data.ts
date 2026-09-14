import {
  BeakerIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  ComputerDesktopIcon,
  VariableIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

export type CourseTone = "slate" | "sage" | "sand" | "navy" | "rose";

export interface CourseTopic {
  title: string;
  summary: string;
}

export interface CourseAssessment {
  method: string;
  weight: string;
  description: string;
}

export interface Course {
  slug: string;
  name: string;
  code: string;
  detail: string;
  progress: number;
  tone: CourseTone;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  cover: string;
  coverAlt: string;
  outline: CourseTopic[];
  outcomes: string[];
  assessment: CourseAssessment[];
}

// These fixtures are explicitly labelled as examples in the interface.
// Covers live in apps/web/public/img so the interface still renders offline;
// see img/CREDITS.md for the source of each photograph.
export const courses: Course[] = [
  {
    slug: "cs-201",
    name: "Computer Science",
    code: "CS 201",
    detail: "Algorithms & software engineering",
    progress: 62,
    tone: "slate",
    icon: ComputerDesktopIcon,
    cover: "/img/course-cs.webp",
    coverAlt: "Source code on a dark editor screen",
    outline: [
      {
        title: "Data structures and algorithmic reasoning",
        summary:
          "Compare common structures, trace algorithms, and explain time and space trade-offs.",
      },
      {
        title: "Software design and testing",
        summary:
          "Break a problem into typed modules, define interfaces, and verify behaviour with focused tests.",
      },
      {
        title: "Delivery and responsible engineering",
        summary:
          "Use version control, review changes, and communicate technical evidence clearly.",
      },
    ],
    outcomes: [
      "Explain why one algorithm or data structure suits a stated constraint.",
      "Build and test a small modular software feature from a written requirement.",
      "Review code and present evidence for correctness, accessibility, and maintainability.",
    ],
    assessment: [
      {
        method: "Guided exercises",
        weight: "30%",
        description:
          "Short implementation and reasoning tasks completed across the course.",
      },
      {
        method: "Applied project",
        weight: "40%",
        description:
          "A working feature supported by tests and a concise engineering record.",
      },
      {
        method: "Explanation and review",
        weight: "30%",
        description:
          "A code walkthrough and responses to questions about design choices.",
      },
    ],
  },
  {
    slug: "ma-210",
    name: "Mathematics",
    code: "MA 210",
    detail: "Linear algebra & proof technique",
    progress: 45,
    tone: "sage",
    icon: VariableIcon,
    cover: "/img/course-math.webp",
    coverAlt: "A system of linear equations written on paper",
    outline: [
      {
        title: "Vectors and matrices",
        summary:
          "Represent quantities, perform matrix operations, and interpret geometric meaning.",
      },
      {
        title: "Linear systems and transformations",
        summary:
          "Model and solve systems while connecting algebraic and visual representations.",
      },
      {
        title: "Proof and problem-solving technique",
        summary:
          "Construct clear arguments, test assumptions, and communicate each reasoning step.",
      },
    ],
    outcomes: [
      "Solve and interpret a linear system using an appropriate method.",
      "Connect matrix operations with transformations and practical models.",
      "Write a structured mathematical argument and check its assumptions.",
    ],
    assessment: [
      {
        method: "Problem sets",
        weight: "35%",
        description:
          "Regular exercises that show working, not only final answers.",
      },
      {
        method: "Concept checks",
        weight: "25%",
        description:
          "Brief checks of definitions, interpretation, and common misconceptions.",
      },
      {
        method: "Applied investigation",
        weight: "40%",
        description:
          "A small model supported by calculations and an explanation of limitations.",
      },
    ],
  },
  {
    slug: "ec-102",
    name: "Economics",
    code: "EC 102",
    detail: "Principles of microeconomics",
    progress: 38,
    tone: "sand",
    icon: ChartBarIcon,
    cover: "/img/course-econ.webp",
    coverAlt: "Fruit and vegetable stall at a covered market",
    outline: [
      {
        title: "Scarcity, choice, and incentives",
        summary:
          "Examine how constraints and incentives shape decisions by people and organisations.",
      },
      {
        title: "Supply, demand, and elasticity",
        summary:
          "Use simple models to explain price, quantity, and responses to changing conditions.",
      },
      {
        title: "Markets and policy trade-offs",
        summary:
          "Compare market structures and evaluate intended and unintended policy effects.",
      },
    ],
    outcomes: [
      "Apply a basic economic model to a clearly defined scenario.",
      "Interpret how incentives and elasticity affect a decision.",
      "Compare policy options while stating assumptions and trade-offs.",
    ],
    assessment: [
      {
        method: "Scenario analyses",
        weight: "30%",
        description:
          "Short written applications of concepts to fictional market situations.",
      },
      {
        method: "Model interpretation",
        weight: "30%",
        description:
          "Charts and calculations accompanied by a plain-language explanation.",
      },
      {
        method: "Policy brief",
        weight: "40%",
        description:
          "A balanced recommendation that identifies evidence needs and uncertainty.",
      },
    ],
  },
  {
    slug: "bi-150",
    name: "Biology",
    code: "BI 150",
    detail: "Cells, genetics & lab method",
    progress: 29,
    tone: "navy",
    icon: BeakerIcon,
    cover: "/img/course-bio.webp",
    coverAlt: "Fluorescent microscopy image of stained cells",
    outline: [
      {
        title: "Cell structures and systems",
        summary:
          "Relate major cell structures to the processes that keep organisms functioning.",
      },
      {
        title: "Genetics and inheritance",
        summary:
          "Trace how information is stored, expressed, and passed between generations.",
      },
      {
        title: "Experimental method and evidence",
        summary:
          "Form testable questions, record observations, and evaluate limitations in data.",
      },
    ],
    outcomes: [
      "Explain a biological process across more than one level of organisation.",
      "Use a simple inheritance model and distinguish prediction from observation.",
      "Design a safe investigation and evaluate the quality of its evidence.",
    ],
    assessment: [
      {
        method: "Laboratory records",
        weight: "30%",
        description:
          "Structured observations, methods, and reflections from guided activities.",
      },
      {
        method: "Concept tasks",
        weight: "30%",
        description:
          "Diagrams and explanations connecting mechanisms to observed outcomes.",
      },
      {
        method: "Investigation report",
        weight: "40%",
        description:
          "A small evidence-based investigation with limitations stated clearly.",
      },
    ],
  },
  {
    slug: "hi-204",
    name: "History",
    code: "HI 204",
    detail: "Ideas that shaped our world",
    progress: 54,
    tone: "sage",
    icon: BuildingLibraryIcon,
    cover: "/img/course-hist.webp",
    coverAlt: "Stone domes and minarets of a historic monument",
    outline: [
      {
        title: "Evidence and source evaluation",
        summary:
          "Question origin, purpose, perspective, and gaps before using a source as evidence.",
      },
      {
        title: "Context, cause, and consequence",
        summary:
          "Build explanations that distinguish background conditions from immediate causes.",
      },
      {
        title: "Change, continuity, and interpretation",
        summary:
          "Compare interpretations and trace what changes, what persists, and for whom.",
      },
    ],
    outcomes: [
      "Evaluate a source's usefulness and limitations for a stated question.",
      "Construct an evidence-based explanation of cause and consequence.",
      "Compare interpretations without presenting uncertainty as settled fact.",
    ],
    assessment: [
      {
        method: "Source analyses",
        weight: "35%",
        description:
          "Short evaluations of fictionalised source sets and their limitations.",
      },
      {
        method: "Seminar contribution",
        weight: "25%",
        description:
          "Prepared discussion that listens to and responds to alternative readings.",
      },
      {
        method: "Evidence-based essay",
        weight: "40%",
        description:
          "A structured argument with transparent reasoning and acknowledged uncertainty.",
      },
    ],
  },
  {
    slug: "lt-101",
    name: "Literature",
    code: "LT 101",
    detail: "Reading, writing & critical thinking",
    progress: 76,
    tone: "navy",
    icon: BookOpenIcon,
    cover: "/img/course-lit.webp",
    coverAlt: "Wall of old hardback books on wooden shelves",
    outline: [
      {
        title: "Close reading and textual evidence",
        summary:
          "Notice patterns in language and support interpretations with precise textual details.",
      },
      {
        title: "Genre, voice, and context",
        summary:
          "Explore how form, viewpoint, and context shape a reader's understanding.",
      },
      {
        title: "Argument, drafting, and revision",
        summary:
          "Develop a defensible reading, organise evidence, and revise for clarity and purpose.",
      },
    ],
    outcomes: [
      "Make an interpretive claim and support it with relevant textual evidence.",
      "Compare how genre and narrative choices influence meaning.",
      "Revise analytical writing in response to focused feedback.",
    ],
    assessment: [
      {
        method: "Reading annotations",
        weight: "25%",
        description:
          "Concise notes that identify patterns, questions, and possible interpretations.",
      },
      {
        method: "Discussion and reflection",
        weight: "25%",
        description:
          "Evidence-led discussion followed by reflection on how an interpretation changed.",
      },
      {
        method: "Analytical portfolio",
        weight: "50%",
        description:
          "A revised collection of short analyses with a rationale for key edits.",
      },
    ],
  },
];

export function findCourseBySlug(slug: string): Course | undefined {
  return courses.find((course) => course.slug === slug);
}
export const exams = [
  {
    name: "Computer Science",
    topic: "Algorithms midterm",
    date: "2026-09-21",
    time: "09:00",
    room: "Room A201",
  },
  {
    name: "Economics",
    topic: "Microeconomics quiz",
    date: "2026-09-24",
    time: "13:30",
    room: "Room B102",
  },
  {
    name: "Literature",
    topic: "Essay presentation",
    date: "2026-09-28",
    time: "10:00",
    room: "Room C301",
  },
];
export const research = [
  {
    status: "To explore",
    title: "Document-grounded AI",
    detail: "Read about retrieval and citations",
    owner: "Thắng",
    tone: "sand",
  },
  {
    status: "In progress",
    title: "ExaMate workspace",
    detail: "Build an accessible academic dashboard",
    owner: "Tài",
    tone: "rose",
  },
  {
    status: "To review",
    title: "Architecture review",
    detail: "Trace a request from UI to database",
    owner: "Tài & Thắng",
    tone: "sage",
  },
];
